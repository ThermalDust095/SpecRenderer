import "../shared/base.css";
import "./panel.css";
import type {
  BodyView,
  EndpointDetail,
  FieldView,
  HostToPanel,
  PanelToHost,
  ResponseView,
} from "../../shared/protocol";
import { h, icon, pathParts } from "../shared/dom";
import { connect } from "../shared/vscode";
import { highlightCurl, highlightJson } from "./highlight";

/**
 * Endpoint details as an API-docs page: reference on the left, sticky code
 * cards (cURL, request body, example response) on the right.
 */

const app = document.getElementById("app")!;
const vscode = connect<PanelToHost, HostToPanel>(onHostMessage);

let endpoint: EndpointDetail | undefined;
/** Response accordions that are open, for the current endpoint. */
let openResponses = new Set<string>();
/** Status shown in the example-response card. */
let exampleStatus: string | undefined;

app.append(h("div.placeholder", {}, "Select an endpoint in the Spec Renderer sidebar."));
vscode.post({ type: "ready" });

function onHostMessage(message: HostToPanel): void {
  if (message.type === "endpoint") {
    const isNew = endpoint?.id !== message.endpoint.id;
    endpoint = message.endpoint;
    if (isNew) {
      const first = endpoint.responses.find((r) => r.status.startsWith("2")) ?? endpoint.responses[0];
      openResponses = new Set(first ? [first.status] : []);
      exampleStatus = endpoint.responses.find((r) => r.example)?.status;
    }
    render(isNew);
  } else if (message.type === "copied") {
    const button = document.querySelector<HTMLButtonElement>(`[data-copy="${message.label}"]`);
    if (!button) return;
    button.classList.add("copied");
    button.replaceChildren(icon("check"));
    setTimeout(() => {
      button.classList.remove("copied");
      button.replaceChildren(icon("copy"));
    }, 1400);
  }
}

// ── Page ───────────────────────────────────────────────────────────────────

function render(scrollToTop: boolean): void {
  if (!endpoint) return;
  const e = endpoint;

  app.replaceChildren(
    h(
      "main.page",
      {},
      h(
        "header.head",
        {},
        h(
          "div.eyebrow",
          {},
          h("span.module-name", {}, e.module),
          e.deprecated ? h("span.tag.tag-warn", {}, "Deprecated") : null,
          ...e.auth.map((auth) => h("span.tag", { title: auth.name }, icon("lock"), auth.label)),
        ),
        h(`h1.title${e.deprecated ? ".deprecated" : ""}`, {}, e.title),
        e.description ? h("p.lead", {}, e.description) : null,
      ),
      h("aside.code-column", {}, requestCard(e), e.body?.example ? bodyCard(e.body) : null, responseCard(e)),
      h("div.docs", {}, ...parameterSections(e), e.body ? bodySection(e.body) : null, responsesSection(e.responses)),
    ),
  );
  if (scrollToTop) window.scrollTo(0, 0);
}

// ── Left column: reference ─────────────────────────────────────────────────

const LOCATIONS: Array<[string, string]> = [
  ["path", "Path Parameters"],
  ["query", "Query Parameters"],
  ["header", "Header Parameters"],
  ["cookie", "Cookie Parameters"],
];

function parameterSections(e: EndpointDetail): HTMLElement[] {
  return LOCATIONS.flatMap(([location, heading]) => {
    const fields = e.parameters.filter((p) => p.location === location);
    return fields.length ? [section(heading, fieldList(fields))] : [];
  });
}

function bodySection(body: BodyView): HTMLElement {
  return section(
    "Request Body",
    h(
      "div.section-meta",
      {},
      h("code.type-chip", {}, body.contentType),
      ...body.otherContentTypes.map((type) => h("code.type-chip.dim", {}, type)),
      body.required ? h("span.required", {}, "required") : h("span.optional", {}, "optional"),
    ),
    body.description ? h("p.field-description", {}, body.description) : null,
    body.fields.length ? fieldList(body.fields) : null,
  );
}

function responsesSection(responses: ResponseView[]): HTMLElement {
  if (!responses.length) {
    return section("Response", h("p.muted", {}, "No responses are documented."));
  }
  return section(
    "Response",
    h(
      "div.accordion",
      {},
      ...responses.map((response) => {
        const open = openResponses.has(response.status);
        const hasBody = response.fields.length > 0 || Boolean(response.contentType);
        return h(
          `div.accordion-item${open ? ".open" : ""}`,
          {},
          h(
            "button.accordion-head",
            {
              "aria-expanded": open ? "true" : "false",
              disabled: !hasBody,
              onclick: () => {
                if (open) openResponses.delete(response.status);
                else openResponses.add(response.status);
                render(false);
              },
            },
            statusPill(response.status),
            h("span.accordion-title", {}, response.description || statusText(response.status)),
            hasBody ? icon("chevron", `icon accordion-chevron${open ? " open" : ""}`) : null,
          ),
          open && hasBody
            ? h(
                "div.accordion-body",
                {},
                response.contentType ? h("div.section-meta", {}, h("code.type-chip", {}, response.contentType)) : null,
                response.fields.length ? fieldList(response.fields) : h("p.muted", {}, "No documented fields."),
              )
            : null,
        );
      }),
    ),
  );
}

function section(title: string, ...children: Array<Node | null>): HTMLElement {
  return h("section.section", {}, h("h2.section-title", {}, title), ...children);
}

function fieldList(fields: FieldView[]): HTMLElement {
  return h(
    "div.field-list",
    {},
    ...fields.map((field) =>
      h(
        "div.field",
        {},
        h(
          "div.field-head",
          {},
          h(`code.field-name${field.deprecated ? ".deprecated" : ""}`, {}, field.name),
          h("code.type-chip", {}, field.type),
          field.required ? h("span.required", {}, "required") : null,
          field.deprecated ? h("span.tag.tag-warn", {}, "deprecated") : null,
        ),
        field.description ? h("p.field-description", {}, field.description) : null,
        field.example
          ? h("div.field-example", {}, h("span.muted", {}, "Example:"), h("code.type-chip", {}, field.example))
          : null,
      ),
    ),
  );
}

// ── Right column: code cards ───────────────────────────────────────────────

function requestCard(e: EndpointDetail): HTMLElement {
  const method = e.method.toLowerCase();
  const lines = e.curl.split("\n");
  // `$` on the command, `>` on each continuation line, blank inside a multi-line body.
  const gutter = lines.map((_, i) => (i === 0 ? "$" : lines[i - 1].endsWith("\\") ? ">" : ""));
  return codeCard(
    h(
      "div.code-card-title",
      { title: e.baseUrl + e.path },
      h(`span.method-pill.m-${method}`, {}, e.method),
      h("code.card-path", {}, ...pathParts(e.path)),
    ),
    copyButton("curl", e.curl, "Copy cURL"),
    gutter,
    highlightCurl(e.curl),
  );
}

function bodyCard(body: BodyView): HTMLElement {
  const example = body.example!;
  return codeCard(
    h("div.code-card-title", {}, h("span.card-label", {}, "Request body"), h("code.card-path.dim", {}, body.contentType)),
    copyButton("body", example, "Copy request body"),
    lineNumbers(example),
    highlightJson(example),
  );
}

function responseCard(e: EndpointDetail): HTMLElement | null {
  const withExamples = e.responses.filter((r) => r.example);
  const selected = withExamples.find((r) => r.status === exampleStatus) ?? withExamples[0];
  if (!selected) return null;

  const title =
    withExamples.length > 1
      ? h(
          "label.status-select",
          {},
          statusPill(selected.status),
          h(
            "select",
            {
              "aria-label": "Example response",
              onchange: (event: Event) => {
                exampleStatus = (event.target as HTMLSelectElement).value;
                render(false);
              },
            },
            ...withExamples.map((r) =>
              h(
                "option",
                { value: r.status, selected: r === selected },
                r.description || statusText(r.status),
              ),
            ),
          ),
          icon("chevron", "icon select-chevron"),
        )
      : h(
          "div.code-card-title",
          {},
          statusPill(selected.status),
          h("span.card-label", {}, selected.description || statusText(selected.status)),
        );

  return codeCard(title, copyButton("response", selected.example!, "Copy example response"), lineNumbers(selected.example!), highlightJson(selected.example!));
}

function codeCard(title: Node, action: Node, gutter: string[], code: Node): HTMLElement {
  return h(
    "div.code-card",
    {},
    h("div.code-card-head", {}, title, action),
    h(
      "div.code-card-body",
      {},
      h("pre.gutter", { "aria-hidden": "true" }, gutter.join("\n")),
      h("pre.code", {}, code),
    ),
  );
}

function lineNumbers(text: string): string[] {
  return text.split("\n").map((_, i) => String(i + 1));
}

// ── Small pieces ───────────────────────────────────────────────────────────

function statusPill(status: string): HTMLElement {
  return h(`span.status-pill.${statusClass(status)}`, {}, status);
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
  );
}

function statusClass(status: string): string {
  if (status.startsWith("2")) return "s-ok";
  if (status.startsWith("3")) return "s-redirect";
  if (status.startsWith("4") || status.startsWith("5")) return "s-error";
  return "s-default";
}

function statusText(status: string): string {
  const known: Record<string, string> = {
    "200": "OK",
    "201": "Created",
    "202": "Accepted",
    "204": "No Content",
    "400": "Bad Request",
    "401": "Unauthorized",
    "403": "Forbidden",
    "404": "Not Found",
    "409": "Conflict",
    "422": "Validation Error",
    "500": "Server Error",
    default: "Default response",
  };
  return known[status] ?? "Response";
}
