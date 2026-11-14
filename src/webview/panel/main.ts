import "../shared/base.css";
import "./panel.css";
import type {
  EndpointDetail,
  FieldView,
  HostToPanel,
  PanelToHost,
  ResponseView,
} from "../../shared/protocol";
import { h, icon, pathParts } from "../shared/dom";
import { connect } from "../shared/vscode";
import { highlightCurl, highlightJson } from "./highlight";

type Tab = "params" | "body" | "responses";

interface PersistedState {
  tab: Tab;
}

const app = document.getElementById("app")!;
const vscode = connect<PanelToHost, HostToPanel, PersistedState>(onHostMessage);
let endpoint: EndpointDetail | undefined;
let tab: Tab = vscode.getState()?.tab ?? "params";
let responseStatus: string | undefined;

app.append(h("div.placeholder", {}, "Select an endpoint in the Spec Renderer sidebar."));
vscode.post({ type: "ready" });

function onHostMessage(message: HostToPanel): void {
  if (message.type === "endpoint") {
    const sameEndpoint = endpoint?.id === message.endpoint.id;
    endpoint = message.endpoint;
    if (!sameEndpoint) responseStatus = undefined;
    render(!sameEndpoint);
  } else if (message.type === "copied") {
    const button = document.querySelector<HTMLButtonElement>(`[data-copy="${message.label}"]`);
    if (!button) return;
    button.classList.add("copied");
    button.replaceChildren(icon("check"), "Copied");
    setTimeout(() => {
      button.classList.remove("copied");
      button.replaceChildren(icon("copy"), "Copy");
    }, 1400);
  }
}

// ── Layout ─────────────────────────────────────────────────────────────────

function render(scrollToTop: boolean): void {
  if (!endpoint) return;
  const e = endpoint;
  const method = e.method.toLowerCase();
  const available = availableTabs(e);
  if (!available.includes(tab) || (scrollToTop && isEmptyTab(e, tab))) {
    tab = available.find((id) => !isEmptyTab(e, id)) ?? available[0];
  }

  app.replaceChildren(
    h(
      "main.page",
      {},
      h(
        "header.hero",
        {},
        h(
          "div.badges",
          {},
          ...e.tags.map((tag) => h("span.chip", {}, tag)),
          e.deprecated ? h("span.chip.chip-warn", {}, "Deprecated") : null,
          ...e.auth.map((auth) => h("span.chip", { title: auth.name }, icon("lock"), auth.label)),
        ),
        h(`h1.title${e.deprecated ? ".deprecated" : ""}`, {}, e.title),
        e.operationId ? h("div.operation-id", {}, e.operationId) : null,
        h(
          `div.url-bar.m-${method}`,
          {},
          h(`span.method-pill.m-${method}`, {}, e.method),
          h("code.url", {}, h("span.base-url", {}, e.baseUrl), ...pathParts(e.path)),
          copyButton("url", e.baseUrl + e.path, "Copy URL"),
        ),
        e.description ? h("p.description", {}, e.description) : null,
      ),
      section(
        "cURL",
        copyButton("curl", e.curl, "Copy cURL"),
        h("pre.code.curl", {}, highlightCurl(e.curl)),
      ),
      tabs(e, available),
      h("div.tab-body", { role: "tabpanel" }, tabContent(e)),
    ),
  );
  if (scrollToTop) window.scrollTo(0, 0);
}

function availableTabs(e: EndpointDetail): Tab[] {
  const result: Tab[] = ["params"];
  if (e.body) result.push("body");
  result.push("responses");
  return result;
}

/** A tab with nothing to show; skipped when a new endpoint opens. */
function isEmptyTab(e: EndpointDetail, id: Tab): boolean {
  if (id === "params") return e.parameters.length === 0;
  if (id === "body") return !e.body;
  return e.responses.length === 0;
}

function tabs(e: EndpointDetail, available: Tab[]): HTMLElement {
  const labels: Record<Tab, [string, number | undefined]> = {
    params: ["Params", e.parameters.length],
    body: ["Body", undefined],
    responses: ["Responses", e.responses.length],
  };
  return h(
    "nav.tabs",
    { role: "tablist" },
    ...available.map((id) =>
      h(
        `button.tab${id === tab ? ".selected" : ""}`,
        {
          role: "tab",
          "aria-selected": id === tab ? "true" : "false",
          onclick: () => {
            tab = id;
            vscode.setState({ tab });
            render(false);
          },
        },
        labels[id][0],
        labels[id][1] ? h("span.tab-count", {}, String(labels[id][1])) : null,
      ),
    ),
  );
}

function tabContent(e: EndpointDetail): Node {
  if (tab === "body" && e.body) return bodyTab(e.body);
  if (tab === "responses") return responsesTab(e.responses);
  return e.parameters.length
    ? fieldTable(e.parameters, true)
    : h("div.empty-note", {}, "This endpoint takes no parameters.");
}

// ── Tabs ───────────────────────────────────────────────────────────────────

function bodyTab(body: NonNullable<EndpointDetail["body"]>): Node {
  return h(
    "div.stack",
    {},
    h(
      "div.content-meta",
      {},
      h("span.chip.chip-mono", {}, body.contentType),
      ...body.otherContentTypes.map((type) => h("span.chip.chip-mono.chip-dim", {}, type)),
      h("span.muted", {}, body.required ? "Required" : "Optional"),
    ),
    body.description ? h("p.description", {}, body.description) : null,
    body.example ? exampleBlock(body.example) : null,
    body.fields.length ? h("div.subheading", {}, "Fields") : null,
    body.fields.length ? fieldTable(body.fields, false) : null,
  );
}

function responsesTab(responses: ResponseView[]): Node {
  if (!responses.length) return h("div.empty-note", {}, "No responses are documented.");
  const selected = responses.find((r) => r.status === responseStatus) ?? responses[0];
  return h(
    "div.stack",
    {},
    h(
      "div.status-list",
      { role: "tablist" },
      ...responses.map((response) =>
        h(
          `button.status.${statusClass(response.status)}${response === selected ? ".selected" : ""}`,
          {
            title: response.description,
            onclick: () => {
              responseStatus = response.status;
              render(false);
            },
          },
          response.status,
        ),
      ),
    ),
    h(
      "div.response-head",
      {},
      h("span.response-description", {}, selected.description || "No description."),
      selected.contentType ? h("span.chip.chip-mono", {}, selected.contentType) : null,
    ),
    selected.example ? exampleBlock(selected.example) : null,
    selected.fields.length ? h("div.subheading", {}, "Fields") : null,
    selected.fields.length ? fieldTable(selected.fields, false) : null,
  );
}

// ── Building blocks ────────────────────────────────────────────────────────

function section(title: string, action: Node, ...children: Node[]): HTMLElement {
  return h(
    "section.card",
    {},
    h("div.card-head", {}, h("span.card-title", {}, title), action),
    ...children,
  );
}

function exampleBlock(example: string): HTMLElement {
  return h(
    "div.example",
    {},
    h("div.example-head", {}, h("span.muted", {}, "Example"), copyButton(`example-${example.length}`, example, "Copy example")),
    h("pre.code", {}, highlightJson(example)),
  );
}

function fieldTable(fields: FieldView[], showLocation: boolean): HTMLElement {
  return h(
    "div.fields",
    { role: "table" },
    ...fields.map((field) =>
      h(
        "div.field",
        { role: "row" },
        h(
          "div.field-main",
          {},
          h(`code.field-name${field.deprecated ? ".deprecated" : ""}`, {}, field.name),
          field.required ? h("span.required", { title: "Required" }, "required") : null,
          h("span.field-type", {}, field.type),
          showLocation && field.location ? h("span.chip.chip-small", {}, field.location) : null,
        ),
        field.description ? h("div.field-description", {}, field.description) : null,
      ),
    ),
  );
}

function copyButton(id: string, text: string, label: string): HTMLButtonElement {
  return h(
    "button.icon-btn.copy",
    {
      "data-copy": id,
      title: label,
      "aria-label": label,
      onclick: () => vscode.post({ type: "copy", text, label: id }),
    },
    icon("copy"),
    "Copy",
  );
}

function statusClass(status: string): string {
  if (status.startsWith("2")) return "s-ok";
  if (status.startsWith("3")) return "s-redirect";
  if (status.startsWith("4")) return "s-client";
  if (status.startsWith("5")) return "s-server";
  return "s-default";
}
