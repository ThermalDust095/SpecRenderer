import "../shared/base.css";
import "./sidebar.css";
import type { HostToSidebar, ModuleView, SidebarState, SidebarToHost } from "../../shared/protocol";
import { h, icon, pathParts } from "../shared/dom";
import { connect } from "../shared/vscode";

/** Compact method labels, as in API docs navigation. */
const SHORT_METHOD: Record<string, string> = { DELETE: "DEL", OPTIONS: "OPT" };

interface PersistedState {
  expanded: string[];
  filter: string;
}

const app = document.getElementById("app")!;
// No Cut/Copy/Paste menu on empty space; endpoint rows add their own items.
document.body.dataset.vscodeContext = JSON.stringify({ preventDefaultContextMenuItems: true });
let state: SidebarState | undefined;
let focusKey: string | undefined;

const vscode = connect<SidebarToHost, HostToSidebar, PersistedState>(onHostMessage);
const persisted: PersistedState = vscode.getState() ?? { expanded: [], filter: "" };
const expanded = new Set(persisted.expanded);

const filterInput = h("input.filter-input", {
  type: "text",
  placeholder: "Filter endpoints",
  "aria-label": "Filter endpoints",
  spellcheck: "false",
  value: persisted.filter,
});
filterInput.value = persisted.filter;
filterInput.addEventListener("input", () => {
  persist();
  renderTree();
});
filterInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusRow(rows()[0]);
  } else if (event.key === "Escape" && filterInput.value) {
    filterInput.value = "";
    persist();
    renderTree();
  }
});

const tree = h("div.tree", { role: "tree", "aria-label": "Endpoints" });
tree.addEventListener("keydown", onTreeKeydown);

vscode.post({ type: "ready" });

function onHostMessage(message: HostToSidebar): void {
  if (message.type === "state") {
    const firstReady = message.state.phase === "ready" && state?.phase !== "ready";
    state = message.state;
    // Small specs open fully expanded the first time; bigger ones start collapsed.
    if (firstReady && expanded.size === 0 && state.modules.length <= 3) {
      state.modules.forEach((module) => expanded.add(module.name));
    }
    render();
  } else if (message.type === "collapseAll") {
    expanded.clear();
    persist();
    renderTree();
  }
}

function persist(): void {
  vscode.setState({ expanded: [...expanded], filter: filterInput.value });
}

// ── Rendering ──────────────────────────────────────────────────────────────

function render(): void {
  if (!state) return;
  const loadingBar = state.phase === "loading" ? h("div.progress", { role: "progressbar" }) : null;

  if (state.phase === "unconfigured") {
    app.replaceChildren(
      emptyState(
        "Connect an API spec",
        "Paste the URL of an OpenAPI 3.x or Swagger 2.0 spec (JSON or YAML). Docs pages like /docs work too.",
        h("button.btn", { onclick: () => vscode.post({ type: "setSpecUrl" }) }, icon("link"), "Set Spec URL"),
      ),
    );
    return;
  }

  if (state.phase === "error" || (state.phase === "loading" && !state.api)) {
    const isError = state.phase === "error";
    app.replaceChildren(
      loadingBar ?? "",
      emptyState(
        isError ? "Couldn't load the spec" : "Loading spec…",
        isError ? state.message ?? "" : state.specUrl,
        isError
          ? h(
              "div.actions",
              {},
              h("button.btn", { onclick: () => vscode.post({ type: "refresh" }) }, "Retry"),
              h("button.btn.secondary", { onclick: () => vscode.post({ type: "setSpecUrl" }) }, "Change URL"),
            )
          : null,
        isError,
      ),
    );
    return;
  }

  const api = state.api!;
  app.replaceChildren(
    loadingBar ?? "",
    h(
      "header.api-header",
      { title: state.specUrl },
      logo(),
      h("span.api-title", {}, api.title),
      api.version ? h("span.api-version", {}, `v${api.version}`) : null,
    ),
    h("div.filter", {}, icon("search", "icon filter-icon"), filterInput),
    state.warning ? h("div.warning", { title: state.warning }, icon("warning"), h("span", {}, state.warning)) : "",
    h(
      "div.section-label",
      {},
      h("span", {}, "Endpoints"),
      h("span.section-meta", {}, `${api.format} · ${api.endpointCount}`),
    ),
    tree,
  );
  renderTree();
}

function renderTree(): void {
  if (!state) return;
  const query = filterInput.value.trim().toLowerCase();
  const visible = query ? filterModules(state.modules, query) : state.modules;
  tree.replaceChildren();

  if (visible.length === 0) {
    tree.append(h("div.no-results", {}, query ? `No endpoints match “${filterInput.value.trim()}”` : "This spec has no endpoints."));
    return;
  }

  for (const module of visible) {
    const open = query.length > 0 || expanded.has(module.name);
    tree.append(moduleRow(module, open));
    if (!open) continue;
    const group = h("div.group", { role: "group" });
    for (const endpoint of module.endpoints) {
      const key = `${module.name}\u0000${endpoint.id}`;
      const active = endpoint.id === state.activeEndpointId;
      group.append(
        h(
          "div.row.endpoint",
          {
            role: "treeitem",
            tabindex: "-1",
            "data-key": key,
            "data-id": endpoint.id,
            // Read by VS Code for the right-click menu (webview/context in package.json).
            "data-vscode-context": JSON.stringify({
              webviewSection: "endpoint",
              endpointId: endpoint.id,
              preventDefaultContextMenuItems: true,
            }),
            "aria-selected": active ? "true" : "false",
            className: active ? "active" : undefined,
            title: `${endpoint.method} ${endpoint.path}\n${endpoint.title}${endpoint.deprecated ? " (deprecated)" : ""}`,
            onclick: () => openEndpoint(key, endpoint.id),
          },
          h(`span.method-tag.m-${endpoint.method.toLowerCase()}`, {}, SHORT_METHOD[endpoint.method] ?? endpoint.method),
          h(`span.label.path${endpoint.deprecated ? ".deprecated" : ""}`, {}, ...pathParts(endpoint.path)),
          endpoint.deprecated ? h("span.deprecated-tag", {}, "deprecated") : null,
        ),
      );
    }
    tree.append(group);
  }
  restoreFocus();
}

function moduleRow(module: ModuleView, open: boolean): HTMLElement {
  const key = `module\u0000${module.name}`;
  return h(
    "div.row.module",
    {
      role: "treeitem",
      tabindex: "-1",
      "data-key": key,
      "data-module": module.name,
      "aria-expanded": open ? "true" : "false",
      title: module.description ?? module.name,
      onclick: () => toggle(module.name, key),
    },
    h("span.label", {}, module.name),
    icon("chevron", `icon chevron${open ? " open" : ""}`),
    h("span.count", {}, String(module.endpoints.length)),
  );
}

function filterModules(modules: ModuleView[], query: string): ModuleView[] {
  return modules
    .map((module) => {
      const moduleMatches = module.name.toLowerCase().includes(query);
      const endpoints = moduleMatches
        ? module.endpoints
        : module.endpoints.filter((endpoint) =>
            `${endpoint.method} ${endpoint.path} ${endpoint.title}`.toLowerCase().includes(query),
          );
      return { ...module, endpoints };
    })
    .filter((module) => module.endpoints.length > 0);
}

/** The Spec Renderer brace mark, drawn inline so it can use a gradient. */
function logo(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "logo");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    '<defs><linearGradient id="sr-logo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6ee7b0"/><stop offset="1" stop-color="#5b8cff"/></linearGradient></defs>' +
    '<g fill="none" stroke="url(#sr-logo)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M7 3.5C5.3 3.5 4.5 4.3 4.5 6v3.2c0 1.2-.6 2-1.8 2.3 1.2.3 1.8 1.1 1.8 2.3V18c0 1.7.8 2.5 2.5 2.5"/>' +
    '<path d="M17 3.5c1.7 0 2.5.8 2.5 2.5v3.2c0 1.2.6 2 1.8 2.3-1.2.3-1.8 1.1-1.8 2.3V18c0 1.7-.8 2.5-2.5 2.5"/>' +
    '<path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></g>';
  return svg;
}

function emptyState(title: string, body: string, action: Node | null, isError = false): HTMLElement {
  return h(
    "div.empty",
    {},
    icon(isError ? "warning" : "spec", `icon empty-icon${isError ? " error" : ""}`),
    h("div.empty-title", {}, title),
    body ? h("div.empty-body", {}, body) : null,
    action,
  );
}

// ── Interaction ────────────────────────────────────────────────────────────

function toggle(name: string, key: string): void {
  if (filterInput.value.trim()) return;
  if (expanded.has(name)) expanded.delete(name);
  else expanded.add(name);
  focusKey = key;
  persist();
  renderTree();
}

function openEndpoint(key: string, id: string): void {
  focusKey = key;
  vscode.post({ type: "open", id });
}

function rows(): HTMLElement[] {
  return [...tree.querySelectorAll<HTMLElement>(".row")];
}

function focusRow(row: HTMLElement | undefined): void {
  if (!row) return;
  rows().forEach((other) => (other.tabIndex = -1));
  row.tabIndex = 0;
  row.focus();
  focusKey = row.dataset.key;
}

function restoreFocus(): void {
  const all = rows();
  const target = all.find((row) => row.dataset.key === focusKey) ?? all[0];
  if (target) target.tabIndex = 0;
  if (target && focusKey && document.activeElement !== filterInput && target.dataset.key === focusKey) {
    target.focus({ preventScroll: true });
  }
}

function onTreeKeydown(event: KeyboardEvent): void {
  const all = rows();
  const current = event.target as HTMLElement;
  const index = all.indexOf(current);
  if (index < 0) return;
  const isModule = current.classList.contains("module");
  const isOpen = current.getAttribute("aria-expanded") === "true";

  switch (event.key) {
    case "ArrowDown":
      focusRow(all[index + 1]);
      break;
    case "ArrowUp":
      if (index === 0) filterInput.focus();
      else focusRow(all[index - 1]);
      break;
    case "Home":
      focusRow(all[0]);
      break;
    case "End":
      focusRow(all[all.length - 1]);
      break;
    case "ArrowRight":
      if (isModule && !isOpen) current.click();
      else if (isModule) focusRow(all[index + 1]);
      break;
    case "ArrowLeft":
      if (isModule && isOpen) current.click();
      else if (!isModule) {
        const parent = all.slice(0, index).reverse().find((row) => row.classList.contains("module"));
        focusRow(parent);
      }
      break;
    case "Enter":
    case " ":
      current.click();
      break;
    default:
      return;
  }
  event.preventDefault();
}
