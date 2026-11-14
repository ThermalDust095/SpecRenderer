import * as vscode from "vscode";
import { getOpenEndpointIn } from "../config";
import type { EndpointDetail, HostToPanel, PanelToHost } from "../shared/protocol";
import { webviewHtml, webviewOptions } from "./webviewHtml";

/**
 * A single editor tab that shows one endpoint at a time. Opening another
 * endpoint replaces the content instead of creating a new tab.
 */
export class EndpointPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private current?: EndpointDetail;
  private readonly onDidCloseEmitter = new vscode.EventEmitter<void>();
  /** Fires when the user closes the tab, so the sidebar can clear its highlight. */
  readonly onDidClose = this.onDidCloseEmitter.event;

  constructor(private readonly extensionUri: vscode.Uri) {}

  get currentId(): string | undefined {
    return this.panel ? this.current?.id : undefined;
  }

  show(endpoint: EndpointDetail): void {
    this.current = endpoint;
    if (!this.panel) {
      this.panel = this.createPanel();
    } else if (!this.panel.visible) {
      this.panel.reveal(undefined, true);
    }
    this.panel.title = `${endpoint.method} ${endpoint.path}`;
    this.post({ type: "endpoint", endpoint });
  }

  /** Re-renders the open endpoint after the spec reloads, if it still exists. */
  update(lookup: (id: string) => EndpointDetail | undefined): void {
    const next = this.current && lookup(this.current.id);
    if (this.panel && next) this.show(next);
  }

  dispose(): void {
    this.panel?.dispose();
    this.onDidCloseEmitter.dispose();
  }

  private createPanel(): vscode.WebviewPanel {
    const column =
      getOpenEndpointIn() === "beside" && vscode.window.activeTextEditor
        ? vscode.ViewColumn.Beside
        : vscode.ViewColumn.Active;
    const panel = vscode.window.createWebviewPanel(
      "specRenderer.endpoint",
      "Endpoint",
      { viewColumn: column, preserveFocus: true },
      webviewOptions(this.extensionUri),
    );
    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, "media", "tab-icon.svg");
    panel.webview.html = webviewHtml(panel.webview, this.extensionUri, "panel", "Endpoint");
    panel.webview.onDidReceiveMessage((message: PanelToHost) => this.onMessage(message));
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.current = undefined;
      this.onDidCloseEmitter.fire();
    });
    return panel;
  }

  private async onMessage(message: PanelToHost): Promise<void> {
    if (message.type === "ready" && this.current) {
      this.post({ type: "endpoint", endpoint: this.current });
    } else if (message.type === "copy") {
      await vscode.env.clipboard.writeText(message.text);
      this.post({ type: "copied", label: message.label });
    }
  }

  private post(message: HostToPanel): void {
    void this.panel?.webview.postMessage(message);
  }
}
