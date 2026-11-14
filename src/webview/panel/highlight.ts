import { h } from "../shared/dom";

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
const CURL_TOKEN = /('(?:[^']|'\\'')*')|(^|\s)(-{1,2}[A-Za-z][\w-]*)|(\\$)|^(curl)\b/gm;

/** Highlights JSON (or leaves plain text untouched if it isn't JSON-like). */
export function highlightJson(source: string): DocumentFragment {
  return tokenize(source, JSON_TOKEN, (match) => {
    if (match[1]) return h(`span.${match[2] ? "tok-key" : "tok-string"}`, {}, match[1]);
    if (match[3]) return h("span.tok-literal", {}, match[3]);
    return h("span.tok-number", {}, match[4]);
  }, (match) => (match[1] && match[2] ? match[2] : ""));
}

export function highlightCurl(source: string): DocumentFragment {
  return tokenize(source, CURL_TOKEN, (match) => {
    if (match[1]) return h("span.tok-string", {}, match[1]);
    if (match[3]) return h("span.tok-flag", {}, match[3]);
    if (match[4]) return h("span.tok-muted", {}, match[4]);
    return h("span.tok-keyword", {}, match[5]);
  }, () => "", (match) => match[2] ?? "");
}

/**
 * Walks regex matches, emitting plain text between them.
 * `suffix` / `prefix` return parts of the match that stay unstyled.
 */
function tokenize(
  source: string,
  pattern: RegExp,
  style: (match: RegExpExecArray) => Node,
  suffix: (match: RegExpExecArray) => string,
  prefix: (match: RegExpExecArray) => string = () => "",
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  let last = 0;
  pattern.lastIndex = 0;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    if (match[0].length === 0) {
      pattern.lastIndex++;
      continue;
    }
    fragment.append(source.slice(last, match.index), prefix(match), style(match), suffix(match));
    last = match.index + match[0].length;
  }
  fragment.append(source.slice(last));
  return fragment;
}
