/**
 * Data and messages exchanged between the extension host and the webviews.
 * Imported by both sides, so it must stay free of `vscode` and Node imports.
 */

export interface EndpointSummary {
  id: string;
  method: string;
  path: string;
  title: string;
  deprecated: boolean;
}

export interface ModuleView {
  name: string;
  description?: string;
  endpoints: EndpointSummary[];
}

export interface SidebarState {
  phase: "unconfigured" | "loading" | "ready" | "error";
  specUrl: string;
  message?: string;
  /** Non-fatal problem shown above the endpoint list, e.g. a failed refresh. */
  warning?: string;
  api?: {
    title: string;
    version: string;
    format: string;
    endpointCount: number;
  };
  modules: ModuleView[];
  activeEndpointId?: string;
}

export interface FieldView {
  name: string;
  type: string;
  required: boolean;
  deprecated?: boolean;
  description?: string;
  /** Parameter location (path, query, header, cookie) when this is a parameter. */
  location?: string;
  /** Explicit example, default or first enum value, formatted as JSON. */
  example?: string;
}

export interface BodyView {
  contentType: string;
  otherContentTypes: string[];
  required: boolean;
  description?: string;
  example?: string;
  fields: FieldView[];
}

export interface ResponseView {
  status: string;
  description: string;
  contentType?: string;
  example?: string;
  fields: FieldView[];
}

export interface AuthView {
  name: string;
  label: string;
}

export interface EndpointDetail {
  id: string;
  method: string;
  path: string;
  baseUrl: string;
  /** Module (tag or first path segment) the endpoint is listed under. */
  module: string;
  title: string;
  operationId?: string;
  description?: string;
  deprecated: boolean;
  tags: string[];
  auth: AuthView[];
  parameters: FieldView[];
  body?: BodyView;
  responses: ResponseView[];
  curl: string;
}

export type SidebarToHost =
  | { type: "ready" }
  | { type: "open"; id: string }
  | { type: "setSpecUrl" }
  | { type: "refresh" };

export type HostToSidebar =
  | { type: "state"; state: SidebarState }
  | { type: "collapseAll" };

export type PanelToHost =
  | { type: "ready" }
  | { type: "copy"; text: string; label: string };

export type HostToPanel =
  | { type: "endpoint"; endpoint: EndpointDetail }
  | { type: "copied"; label: string };
