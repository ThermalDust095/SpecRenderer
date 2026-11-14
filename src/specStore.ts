import * as vscode from "vscode";
import type { SidebarState } from "./shared/protocol";
import { buildCatalog, type Catalog } from "./spec/catalog";
import { buildEndpointDetail } from "./spec/details";
import { loadSpec } from "./spec/loader";
import type { NormalizedSpec } from "./spec/model";
import type { EndpointDetail } from "./shared/protocol";

/**
 * Owns the currently loaded spec. A failed refresh keeps the last good spec
 * and reports the error as a warning; a URL change starts from scratch.
 */
export class SpecStore implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;

  private url = "";
  private phase: SidebarState["phase"] = "unconfigured";
  private message?: string;
  private warning?: string;
  private spec?: NormalizedSpec;
  private catalog?: Catalog;
  private revision = 0;

  get specUrl(): string {
    return this.url;
  }

  async load(url: string): Promise<void> {
    if (url !== this.url) {
      this.url = url;
      this.spec = undefined;
      this.catalog = undefined;
    }
    const revision = ++this.revision;

    if (!url) {
      this.update("unconfigured");
      return;
    }

    this.update("loading");
    try {
      const loaded = await loadSpec(url);
      if (revision !== this.revision) return;
      this.spec = loaded.spec;
      this.catalog = buildCatalog(loaded.spec);
      const discovered = loaded.resolvedUrl !== url ? `Found spec at ${loaded.resolvedUrl}.` : undefined;
      this.update("ready", undefined, [loaded.warning, discovered].filter(Boolean).join(" ") || undefined);
    } catch (error) {
      if (revision !== this.revision) return;
      const reason = error instanceof Error ? error.message : String(error);
      if (this.spec) {
        this.update("ready", undefined, `Refresh failed; showing the last loaded spec. ${reason}`);
      } else {
        this.update("error", reason);
      }
    }
  }

  refresh(): Promise<void> {
    return this.load(this.url);
  }

  sidebarState(activeEndpointId?: string): SidebarState {
    return {
      phase: this.phase,
      specUrl: this.url,
      message: this.message,
      warning: this.warning,
      api: this.spec && {
        title: this.spec.title,
        version: this.spec.version,
        format: `${this.spec.format} ${this.spec.formatVersion}`,
        endpointCount: this.spec.operations.length,
      },
      modules: this.catalog?.modules ?? [],
      activeEndpointId,
    };
  }

  endpoint(id: string): EndpointDetail | undefined {
    const operation = this.catalog?.operations.get(id);
    return operation && this.spec ? buildEndpointDetail(this.spec, operation) : undefined;
  }

  dispose(): void {
    this.changed.dispose();
  }

  private update(phase: SidebarState["phase"], message?: string, warning?: string): void {
    this.phase = phase;
    this.message = message;
    this.warning = warning;
    this.changed.fire();
  }
}
