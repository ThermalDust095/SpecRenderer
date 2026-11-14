type Child = Node | string | null | undefined | false;
type Props = Record<string, string | number | boolean | EventListener | undefined>;

/**
 * Tiny element factory: `h("div.row.active", { title: "x" }, child, …)`.
 * Text is always set via text nodes, so spec content can't inject HTML.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  selector: K | `${K}.${string}`,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = selector.split(".");
  const element = document.createElement(tag as K);
  if (classes.length) element.className = classes.join(" ");
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (typeof value === "function") {
      element.addEventListener(key.replace(/^on/, "").toLowerCase(), value);
    } else if (key === "className") {
      element.className += ` ${value}`;
    } else {
      element.setAttribute(key, value === true ? "" : String(value));
    }
  }
  append(element, children);
  return element;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
}

/** Inline SVG icon from a path list (16×16 viewBox, stroked). */
export function icon(name: keyof typeof ICONS, className = "icon"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICONS[name]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

const ICONS = {
  chevron: ["M6 4l4 4-4 4"],
  search: ["M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11z", "M11 11l3.5 3.5"],
  copy: ["M5.5 5.5h7v8h-7z", "M3.5 10.5v-8h7"],
  check: ["M3 8.5l3 3 7-7"],
  lock: ["M4.5 7.5h7v6h-7z", "M6 7.5V5.5a2 2 0 0 1 4 0v2"],
  link: ["M7 9a3 3 0 0 0 4.2.3l2-2a3 3 0 0 0-4.2-4.2l-1 1", "M9 7a3 3 0 0 0-4.2-.3l-2 2a3 3 0 0 0 4.2 4.2l1-1"],
  spec: ["M4 1.5h5.5L12.5 4.5v10h-8.5z", "M9.5 1.5v3h3", "M6.5 8h4M6.5 10.5h4"],
  warning: ["M8 2l6.5 11.5h-13z", "M8 6.5v3.5", "M8 11.8v.2"],
} as const;

/** Splits a path into literal and `{param}` parts for highlighting. */
export function pathParts(path: string): Node[] {
  return path.split(/(\{[^}]+\})/).filter(Boolean).map((part) =>
    part.startsWith("{") ? h("span.path-param", {}, part) : document.createTextNode(part),
  );
}
