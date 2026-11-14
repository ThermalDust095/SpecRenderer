import * as vscode from "vscode";
import { SpecSnapshot, type SpecView } from "./openapi";

const SPEC_URL_SETTING = "apiExplorer.specUrl";
const MAX_SPEC_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

interface ViewState {
  configured: boolean;
  refreshing: boolean;
  status: string;
  spec: SpecView | null;
  updatedAt?: string;
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ApiExplorerViewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("apiExplorer.specs", provider),
    vscode.commands.registerCommand("apiExplorer.refresh", () =>
      provider.refresh(),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SPEC_URL_SETTING)) {
        void provider.configurationChanged();
      }
    }),
  );
}

export function deactivate(): void {}

class ApiExplorerViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private currentUrl = "";
  private readonly snapshot = new SpecSnapshot();
  private status = "Set apiExplorer.specUrl to load an OpenAPI document.";
  private refreshing = false;
  private updatedAt?: string;
  private refreshTask?: Promise<void>;
  private revision = 0;

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [],
    };
    webviewView.webview.html = getWebviewHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message: unknown) =>
      this.handleMessage(message),
    );
    void this.configurationChanged();
  }

  async configurationChanged(): Promise<void> {
    const url = getConfiguredUrl();
    if (url !== this.currentUrl) {
      this.currentUrl = url;
      this.revision += 1;
      this.snapshot.clear();
      this.refreshing = false;
      this.updatedAt = undefined;
      this.status = url
        ? "Loading OpenAPI document..."
        : "Set apiExplorer.specUrl to load an OpenAPI document.";
      this.postState();
      if (url) {
        const inFlight = this.refreshTask;
        if (inFlight) {
          await inFlight;
        }
        if (getConfiguredUrl() !== url || this.currentUrl !== url) {
          return;
        }
        await this.refresh();
      }
    } else {
      this.postState();
    }
  }

  async refresh(): Promise<void> {
    if (this.refreshTask) {
      return this.refreshTask;
    }

    this.refreshTask = this.refreshConfiguredSpec();
    try {
      await this.refreshTask;
    } finally {
      this.refreshTask = undefined;
    }
  }

  private async refreshConfiguredSpec(): Promise<void> {
    const url = getConfiguredUrl();
    if (!url) {
      this.currentUrl = "";
      this.snapshot.clear();
      this.updatedAt = undefined;
      this.status = "Set apiExplorer.specUrl to load an OpenAPI document.";
      this.postState();
      return;
    }

    if (url !== this.currentUrl) {
      this.currentUrl = url;
      this.revision += 1;
      this.snapshot.clear();
      this.updatedAt = undefined;
    }
    const revision = this.revision;

    this.refreshing = true;
    this.status = this.snapshot.current
      ? "Refreshing OpenAPI document..."
      : "Loading OpenAPI document...";
    this.postState();

    try {
      const source = await fetchSpec(url);
      const nextSpec = await this.snapshot.refresh(source, () =>
        this.isCurrentRequest(url, revision),
      );
      if (!this.isCurrentRequest(url, revision)) {
        return;
      }
      if (!nextSpec) {
        return;
      }

      this.updatedAt = new Date().toLocaleTimeString();
      this.status = `Updated at ${this.updatedAt}`;
    } catch (error: unknown) {
      if (!this.isCurrentRequest(url, revision)) {
        return;
      }
      const reason = error instanceof Error ? error.message : String(error);
      this.status = this.snapshot.current
        ? `Refresh failed; showing the last valid spec. ${reason}`
        : `Could not load the OpenAPI spec. ${reason}`;
    } finally {
      if (this.isCurrentRequest(url, revision)) {
        this.refreshing = false;
        this.postState();
      }
    }
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isRecord(message) || typeof message.type !== "string") {
      return;
    }

    switch (message.type) {
      case "ready":
        this.postState();
        break;
      case "refresh":
        await this.refresh();
        break;
      case "openSettings":
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          SPEC_URL_SETTING,
        );
        break;
      case "copyCurl":
        if (typeof message.command === "string") {
          try {
            await vscode.env.clipboard.writeText(message.command);
            this.view?.webview.postMessage({ type: "copyResult" });
          } catch (error: unknown) {
            const reason =
              error instanceof Error ? error.message : String(error);
            this.view?.webview.postMessage({
              type: "copyError",
              message: `Could not copy cURL command. ${reason}`,
            });
          }
        }
        break;
    }
  }

  private postState(): void {
    const state: ViewState = {
      configured: Boolean(getConfiguredUrl()),
      refreshing: this.refreshing,
      status: this.status,
      spec: this.snapshot.current,
      updatedAt: this.updatedAt,
    };
    void this.view?.webview.postMessage({ type: "state", state });
  }

  private isCurrentRequest(url: string, revision: number): boolean {
    return revision === this.revision && url === getConfiguredUrl();
  }
}

async function fetchSpec(url: string): Promise<string> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Enter a valid HTTP or HTTPS URL in apiExplorer.specUrl.");
  }

  if (
    (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error(
      "The spec URL must use HTTP or HTTPS and must not contain credentials.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, application/yaml, text/yaml, */*",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`The server returned HTTP ${response.status}.`);
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_SPEC_BYTES) {
      throw new Error("The spec exceeds the 5 MB size limit.");
    }

    const source = await response.text();
    if (Buffer.byteLength(source, "utf8") > MAX_SPEC_BYTES) {
      throw new Error("The spec exceeds the 5 MB size limit.");
    }
    return source;
  } finally {
    clearTimeout(timeout);
  }
}

function getConfiguredUrl(): string {
  return vscode.workspace
    .getConfiguration()
    .get<string>(SPEC_URL_SETTING, "")
    .trim();
}

function getWebviewHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  const csp = [
    "default-src 'none'",
    `style-src 'unsafe-inline' ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>API Explorer</title>
  <style>
    :root { color-scheme: light dark; }
    body { padding: 0 14px 18px; color: var(--vscode-foreground); font: var(--vscode-font-weight) var(--vscode-font-size)/1.5 var(--vscode-font-family); }
    button, input { font: inherit; }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 2px; padding: 5px 9px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .header { position: sticky; top: 0; z-index: 1; background: var(--vscode-sideBar-background); padding: 10px 0; border-bottom: 1px solid var(--vscode-panel-border); }
    h1 { font-size: 1.15em; margin: 0; overflow-wrap: anywhere; }
    .meta, .status, .muted { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
    .status { padding: 8px 0; overflow-wrap: anywhere; }
    .status.error { color: var(--vscode-errorForeground); }
    .intro { margin: 12px 0; }
    .intro button { margin-top: 8px; }
    .search { box-sizing: border-box; width: 100%; margin: 10px 0; padding: 5px 7px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); }
    .operation { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 8px; align-items: start; width: 100%; text-align: left; margin: 4px 0; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); }
    .method { font-size: 0.78em; font-weight: 700; }
    .method.get { color: #4fc1ff; } .method.post { color: #89d185; } .method.put { color: #cca700; } .method.delete { color: #f48771; } .method.patch { color: #c586c0; }
    .operation-text { min-width: 0; }
    .path { font-family: var(--vscode-editor-font-family); overflow-wrap: anywhere; }
    .summary { display: block; color: var(--vscode-descriptionForeground); font-size: 0.88em; overflow-wrap: anywhere; }
    .details { margin: 4px 0 12px; padding: 8px; border-left: 2px solid var(--vscode-focusBorder); background: var(--vscode-editor-background); }
    .details h3 { margin: 4px 0; font-size: 1em; }
    .details p { margin: 4px 0 10px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .path-group { margin: 18px 0 6px; font-size: 1em; font-family: var(--vscode-editor-font-family); overflow-wrap: anywhere; }
    .param { padding: 5px 0; border-bottom: 1px solid var(--vscode-panel-border); }
    .param-name { font-family: var(--vscode-editor-font-family); }
    pre { overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; padding: 8px; background: var(--vscode-textCodeBlock-background); }
    .copy { margin: 4px 0; }
  </style>
</head>
<body>
  <header class="header">
    <h1 id="title">API Explorer</h1>
    <div id="version" class="meta"></div>
  </header>
  <div id="status" class="status" role="status" aria-live="polite"></div>
  <main id="main"></main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const title = document.getElementById("title");
    const version = document.getElementById("version");
    const status = document.getElementById("status");
    const main = document.getElementById("main");
    let operations = [];

    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function render(state) {
      status.textContent = state.status || "";
      status.className = "status" + (state.status && /failed|could not/i.test(state.status) ? " error" : "");
      if (state.refreshing) status.textContent = "Refreshing OpenAPI document...";
      main.replaceChildren();

      if (!state.configured) {
        title.textContent = "API Explorer";
        version.textContent = "";
        const intro = element("section", "intro");
        intro.append(element("p", "", "Set apiExplorer.specUrl to an OpenAPI 3.0 or 3.1 JSON/YAML URL to browse it here."));
        const settingsButton = element("button", "", "Open Settings");
        settingsButton.addEventListener("click", () => vscode.postMessage({ type: "openSettings" }));
        intro.append(settingsButton);
        main.append(intro);
        return;
      }

      if (!state.spec) {
        return;
      }

      title.textContent = state.spec.title;
      version.textContent = "OpenAPI " + state.spec.openapiVersion + " · API " + state.spec.version;

      if (state.spec.description) {
        main.append(element("p", "muted", state.spec.description));
      }
      const search = element("input", "search");
      search.type = "search";
      search.placeholder = "Filter operations";
      search.setAttribute("aria-label", "Filter operations");
      main.append(search);
      const list = element("div", "operations");
      main.append(list);

      function renderOperations() {
        list.replaceChildren();
        let currentPath = "";
        const query = search.value.toLowerCase();
        const filtered = operations.filter((operation) =>
          (operation.method + " " + operation.path + " " + operation.summary + " " + operation.description).toLowerCase().includes(query)
        );
        if (filtered.length === 0) {
          list.append(element("p", "muted", "No operations match."));
          return;
        }

        for (const operation of filtered) {
          if (operation.path !== currentPath) {
            currentPath = operation.path;
            list.append(element("h2", "path-group", currentPath));
          }
          const button = element("button", "operation");
          button.type = "button";
          button.setAttribute("aria-expanded", "false");
          const method = element("span", "method " + operation.method.toLowerCase(), operation.method);
          const text = element("span", "operation-text");
          text.append(element("span", "summary", operation.summary));
          button.append(method, text);

          const detail = element("section", "details");
          detail.hidden = true;
          detail.append(element("h3", "", operation.summary));
          if (operation.description) detail.append(element("p", "", operation.description));
          if (operation.securityRequired) detail.append(element("p", "muted", "This operation declares security requirements. Add credentials to the generated cURL command manually."));

          if (operation.parameters.length) {
            detail.append(element("h3", "", "Parameters"));
            for (const parameter of operation.parameters) {
              const row = element("div", "param");
              row.append(element("span", "param-name", parameter.name));
              row.append(element("span", "muted", " · " + parameter.location + (parameter.required ? " · required" : " · optional")));
              if (parameter.description) row.append(element("p", "muted", parameter.description));
              detail.append(row);
            }
          }
          if (operation.requestBody) {
            detail.append(element("h3", "", "Request body"));
            detail.append(element("pre", "", operation.requestBody));
          }
          detail.append(element("h3", "", "cURL"));
          detail.append(element("pre", "", operation.curl));
          const copy = element("button", "copy", "Copy cURL");
          copy.type = "button";
          copy.addEventListener("click", () => vscode.postMessage({ type: "copyCurl", command: operation.curl }));
          detail.append(copy);
          button.addEventListener("click", () => {
            detail.hidden = !detail.hidden;
            button.setAttribute("aria-expanded", String(!detail.hidden));
          });
          list.append(button, detail);
        }
      }

      operations = state.spec.operations;
      search.addEventListener("input", renderOperations);
      renderOperations();
    }

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type === "state") render(message.state);
      if (message.type === "copyResult") {
        status.textContent = "cURL copied to clipboard.";
        status.className = "status";
      }
      if (message.type === "copyError") {
        status.textContent = message.message;
        status.className = "status error";
      }
    });
    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}

function getNonce(): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
