import * as vscode from "vscode";

export const SECTION = "specRenderer";
export const SPEC_URL_KEY = "specUrl";

export function getSpecUrl(): string {
  return vscode.workspace.getConfiguration(SECTION).get<string>(SPEC_URL_KEY, "").trim();
}

/** Saves to the workspace when one is open (specs are usually per project). */
export async function setSpecUrl(url: string): Promise<void> {
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  await vscode.workspace.getConfiguration(SECTION).update(SPEC_URL_KEY, url, target);
}

export function affectsSpecUrl(event: vscode.ConfigurationChangeEvent): boolean {
  return event.affectsConfiguration(`${SECTION}.${SPEC_URL_KEY}`);
}
