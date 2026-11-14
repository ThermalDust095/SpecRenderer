import * as vscode from "vscode";
import { affectsSpecUrl, getSpecUrl, setSpecUrl } from "./config";
import { SpecStore } from "./specStore";
import { EndpointPanel } from "./views/endpointPanel";
import { SIDEBAR_VIEW_ID, SidebarView } from "./views/sidebarView";

export function activate(context: vscode.ExtensionContext): void {
  const store = new SpecStore();
  const panel = new EndpointPanel(context.extensionUri);
  const sidebar = new SidebarView(context.extensionUri, store, panel);

  context.subscriptions.push(
    store,
    panel,
    vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_ID, sidebar),

    store.onDidChange(() => {
      sidebar.pushState();
      panel.update((id) => store.endpoint(id));
    }),
    panel.onDidClose(() => sidebar.pushState()),

    vscode.commands.registerCommand("specRenderer.refresh", () => store.refresh()),
    vscode.commands.registerCommand("specRenderer.collapseAll", () => sidebar.collapseAll()),
    vscode.commands.registerCommand("specRenderer.setSpecUrl", promptForSpecUrl),

    vscode.workspace.onDidChangeConfiguration((event) => {
      if (affectsSpecUrl(event)) void store.load(getSpecUrl());
    }),
  );

  void store.load(getSpecUrl());
}

export function deactivate(): void {}

async function promptForSpecUrl(): Promise<void> {
  const url = await vscode.window.showInputBox({
    title: "Spec Renderer: Set Spec URL",
    prompt: "OpenAPI / Swagger JSON or YAML URL, or a docs page like /docs",
    placeHolder: "http://localhost:8000/openapi.json",
    value: getSpecUrl(),
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value.trim()) return undefined;
      try {
        const { protocol } = new URL(value.trim());
        return protocol === "http:" || protocol === "https:" ? undefined : "Use an http:// or https:// URL.";
      } catch {
        return "Enter a full URL, including http:// or https://.";
      }
    },
  });
  if (url !== undefined) await setSpecUrl(url.trim());
}
