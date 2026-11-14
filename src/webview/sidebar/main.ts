import "../shared/base.css";
import "./sidebar.css";
import type { HostToSidebar, ModuleView, SidebarState, SidebarToHost } from "../../shared/protocol";
import { h, icon, pathParts } from "../shared/dom";
import { connect } from "../shared/vscode";

interface PersistedState {
  expanded: string[];
  filter: string;
}

const app = document.getElementById("app")!;
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
      h("div.api-title-row", {}, h("span.api-title", {}, api.title), api.version ? h("span.api-version", {}, `v${api.version}`) : null),
      h("div.api-meta", {}, `${api.format} · ${api.endpointCount} endpoint${api.endpointCount === 1 ? "" : "s"}`),
    ),
    h("div.filter", {}, icon("search", "icon filter-icon"), filterInput),
    state.warning ? h("div.warning", { title: state.warning }, icon("warning"), h("span", {}, state.warning)) : "",
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
            "aria-selected": active ? "true" : "false",
            className: active ? "active" : undefined,
            title: `${endpoint.method} ${endpoint.path}\n${endpoint.title}${endpoint.deprecated ? " (deprecated)" : ""}`,
            onclick: () => openEndpoint(key, endpoint.id),
          },
          h(`span.method-tag.m-${endpoint.method.toLowerCase()}`, {}, endpoint.method),
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
    h("span.count", {}, String(module.endpoints.length)),
    icon("chevron", `icon chevron${open ? " open" : ""}`),
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
