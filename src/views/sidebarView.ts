import * as vscode from "vscode";
import type { HostToSidebar, SidebarToHost } from "../shared/protocol";
import type { SpecStore } from "../specStore";
import type { EndpointPanel } from "./endpointPanel";
import { webviewHtml, webviewOptions } from "./webviewHtml";

export const SIDEBAR_VIEW_ID = "specRenderer.endpoints";

/** Activity Bar view: modules that expand into endpoints. */
export class SidebarView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: SpecStore,
    private readonly panel: EndpointPanel,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = webviewOptions(this.extensionUri);
    view.webview.html = webviewHtml(view.webview, this.extensionUri, "sidebar", "Spec Renderer");
    view.webview.onDidReceiveMessage((message: SidebarToHost) => this.onMessage(message));
    view.onDidDispose(() => (this.view = undefined));
  }

  pushState(): void {
    this.post({ type: "state", state: this.store.sidebarState(this.panel.currentId) });
  }

  collapseAll(): void {
    this.post({ type: "collapseAll" });
  }

  private onMessage(message: SidebarToHost): void {
    switch (message.type) {
      case "ready":
        this.pushState();
        break;
      case "open": {
        const endpoint = this.store.endpoint(message.id);
        if (endpoint) {
          this.panel.show(endpoint);
          this.pushState();
        }
        break;
      }
      case "setSpecUrl":
        void vscode.commands.executeCommand("specRenderer.setSpecUrl");
        break;
      case "refresh":
        void vscode.commands.executeCommand("specRenderer.refresh");
        break;
    }
  }

  private post(message: HostToSidebar): void {
    void this.view?.webview.postMessage(message);
  }
}
