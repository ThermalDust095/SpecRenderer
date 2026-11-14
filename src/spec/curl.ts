import type { MediaType, NormalizedSpec, Operation, Parameter, RequestBody } from "./model";
import { exampleValue, isBinary, flatten } from "./sample";

/**
 * Builds a multi-line, copy-pasteable cURL command for an operation.
 * Required parameters (and optional ones with an explicit example) are
 * filled in; credentials are left as `<placeholders>`.
 */
export function buildCurl(spec: NormalizedSpec, operation: Operation): string {
  const query: string[] = [];
  const headers = new Map<string, string>();
  const cookies: string[] = [];
  const extra: string[][] = [];

  const accept = responseContentType(operation);
  if (accept) headers.set("Accept", accept);

  for (const parameter of operation.parameters) {
    if (parameter.in === "path" || !shouldInclude(parameter)) continue;
    const value = parameterValue(parameter);
    if (parameter.in === "query") query.push(`${encode(parameter.name)}=${encode(value)}`);
    if (parameter.in === "header") headers.set(parameter.name, value);
    if (parameter.in === "cookie") cookies.push(`${parameter.name}=${value}`);
  }

  for (const [schemeName] of Object.entries(operation.security[0] ?? {})) {
    const scheme = spec.securitySchemes[schemeName];
    if (!scheme) continue;
    if (scheme.type === "http" && scheme.scheme?.toLowerCase() === "basic") {
      extra.push(["-u", quote("<username>:<password>")]);
    } else if (scheme.type === "apiKey" && scheme.name) {
      if (scheme.in === "query") query.push(`${encode(scheme.name)}=<api-key>`);
      else if (scheme.in === "cookie") cookies.push(`${scheme.name}=<api-key>`);
      else headers.set(scheme.name, "<api-key>");
    } else if (scheme.type !== "mutualTLS") {
      headers.set("Authorization", "Bearer <token>");
    }
  }
  if (cookies.length) headers.set("Cookie", cookies.join("; "));

  const body = pickContent(operation.requestBody);
  const bodyArgs = body ? bodyArguments(body.contentType, body.mediaType) : [];
  if (body && body.contentType !== "multipart/form-data") {
    headers.set("Content-Type", body.contentType);
  }

  let url = `${spec.baseUrl}${operation.path.startsWith("/") ? "" : "/"}${operation.path}`;
  url = url.replace(/\{([^}]+)\}/g, (match, name: string) => {
    const parameter = operation.parameters.find((p) => p.in === "path" && p.name === name);
    return parameter ? encodeURIComponent(parameterValue(parameter)) : match;
  });
  if (query.length) url += `${url.includes("?") ? "&" : "?"}${query.join("&")}`;

  const lines = [`curl -X ${operation.method.toUpperCase()} ${quote(url)}`];
  for (const [name, value] of headers) lines.push(`-H ${quote(`${name}: ${value}`)}`);
  for (const [flag, value] of [...extra, ...bodyArgs]) lines.push(`${flag} ${value}`);
  return lines.join(" \\\n  ");
}

/** Chooses the content type to show: JSON when offered, otherwise the first. */
export function pickContent(
  requestBody: RequestBody | { content?: Record<string, MediaType> } | undefined,
): { contentType: string; mediaType: MediaType; others: string[] } | undefined {
  const entries = Object.entries(requestBody?.content ?? {});
  if (!entries.length) return undefined;
  const preferred = entries.find(([type]) => isJson(type)) ?? entries[0];
  return {
    contentType: preferred[0],
    mediaType: preferred[1] ?? {},
    others: entries.map(([type]) => type).filter((type) => type !== preferred[0]),
  };
}

export function isJson(contentType: string): boolean {
  return /\/json\b|\+json\b/i.test(contentType);
}

function bodyArguments(contentType: string, mediaType: MediaType): string[][] {
  const schema = mediaType.schema ? flatten(mediaType.schema) : undefined;

  if (contentType === "multipart/form-data") {
    const value = exampleValue(mediaType, "request");
    const fields = isRecord(value) ? value : {};
    return Object.entries(fields).map(([name, fieldValue]) => {
      const fieldSchema = schema?.properties?.[name];
      const text = isBinary(fieldSchema)
        ? `@/path/to/${name}`
        : typeof fieldValue === "string"
          ? fieldValue
          : JSON.stringify(fieldValue);
      return ["-F", quote(`${name}=${text}`)];
    });
  }

  if (isBinary(schema) || contentType === "application/octet-stream") {
    return [["--data-binary", quote("@/path/to/file")]];
  }

  const value = exampleValue(mediaType, "request", "value");
  if (contentType === "application/x-www-form-urlencoded" && isRecord(value)) {
    const form = Object.entries(value)
      .map(([name, field]) => `${encode(name)}=${encode(stringify(field))}`)
      .join("&");
    return [["--data-raw", quote(form)]];
  }
  if (isJson(contentType)) {
    return [["--data-raw", quote(JSON.stringify(value ?? {}, null, 2))]];
  }
  return [["--data-raw", quote(stringify(value ?? ""))]];
}

function responseContentType(operation: Operation): string | undefined {
  const statuses = Object.keys(operation.responses).sort((a, b) =>
    rank(a) === rank(b) ? a.localeCompare(b) : rank(a) - rank(b),
  );
  for (const status of statuses) {
    const content = pickContent(operation.responses[status]);
    if (content) return content.contentType;
  }
  return undefined;
}

/** 2xx first, then `default`, then everything else. */
function rank(status: string): number {
  if (status.startsWith("2")) return 0;
  if (status === "default") return 1;
  return 2;
}

function shouldInclude(parameter: Parameter): boolean {
  return (
    parameter.required === true ||
    parameter.example !== undefined ||
    Object.keys(parameter.examples ?? {}).length > 0 ||
    parameter.schema?.example !== undefined ||
    parameter.schema?.default !== undefined
  );
}

function parameterValue(parameter: Parameter): string {
  return stringify(exampleValue(parameter, "request", parameter.name) ?? parameter.name);
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(stringify).join(",");
  return typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
}

/** Percent-encodes everything except `<placeholder>` angle brackets. */
function encode(value: string): string {
  return encodeURIComponent(value).replace(/%3C/g, "<").replace(/%3E/g, ">");
}

/** POSIX single-quote escaping. */
function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
