import * as vscode from "vscode";

/** HTML shell for a bundled webview script + stylesheet under `dist/webview`. */
export function webviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  bundle: "sidebar" | "panel",
  title: string,
): string {
  const asset = (file: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", file));
  const nonce = createNonce();
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${asset(`${bundle}.css`)}">
  <title>${title}</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${asset(`${bundle}.js`)}"></script>
</body>
</html>`;
}

export function webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist", "webview")],
  };
}

function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
