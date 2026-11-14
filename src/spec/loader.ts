import type { NormalizedSpec } from "./model";
import { normalizeSpec } from "./normalize";
import { NotASpecError, parseDocument } from "./parser";

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

/** Well-known spec locations used by FastAPI, Spring, ASP.NET, Express, etc. */
const WELL_KNOWN_PATHS = [
  "openapi.json",
  "swagger.json",
  "openapi.yaml",
  "v3/api-docs",
  "v2/api-docs",
  "swagger/v1/swagger.json",
  "api-docs",
  "api-docs.json",
];

export interface LoadedSpec {
  spec: NormalizedSpec;
  /** Where the spec was actually found (may differ from the configured URL). */
  resolvedUrl: string;
  warning?: string;
}

type Fetch = typeof fetch;

/**
 * Downloads and parses a spec. If the URL points to a docs page (Swagger UI,
 * ReDoc, Scalar…) rather than the spec itself, the spec is discovered from the
 * page or from well-known paths.
 */
export async function loadSpec(url: string, fetchImpl: Fetch = fetch): Promise<LoadedSpec> {
  const target = validateUrl(url);
  const page = await download(target.toString(), fetchImpl);

  try {
    return await toLoadedSpec(page, target.toString());
  } catch (error) {
    if (!(error instanceof NotASpecError)) throw error;
  }

  for (const candidate of discoveryCandidates(target, page)) {
    let text: string;
    try {
      text = await download(candidate, fetchImpl);
    } catch {
      continue;
    }
    try {
      return await toLoadedSpec(text, candidate);
    } catch (error) {
      if (!(error instanceof NotASpecError)) throw error;
    }
  }

  throw new Error(
    "No OpenAPI or Swagger spec was found at this URL. Point it at the JSON/YAML spec, e.g. …/openapi.json.",
  );
}

async function toLoadedSpec(text: string, sourceUrl: string): Promise<LoadedSpec> {
  const { document, warning } = await parseDocument(text);
  return { spec: normalizeSpec(document, sourceUrl), resolvedUrl: sourceUrl, warning };
}

/** Spec URLs referenced by a docs page, then well-known paths. */
export function discoveryCandidates(target: URL, page: string): string[] {
  const referenced: string[] = [];
  const patterns = [
    /\burl\s*:\s*["']([^"']+\.(?:json|ya?ml)[^"']*)["']/gi, // Swagger UI config
    /\burl\s*:\s*["'](\/[^"']*(?:openapi|swagger|api-docs)[^"']*)["']/gi,
    /spec-url\s*=\s*["']([^"']+)["']/gi, // ReDoc
    /data-url\s*=\s*["']([^"']+)["']/gi, // Scalar
  ];
  for (const pattern of patterns) {
    for (const match of page.matchAll(pattern)) referenced.push(match[1]);
  }

  const directory = new URL("./", target);
  const root = new URL("/", target);
  const candidates = [
    ...referenced.map((reference) => new URL(reference, target)),
    ...WELL_KNOWN_PATHS.map((path) => new URL(path, directory)),
    ...WELL_KNOWN_PATHS.map((path) => new URL(path, root)),
  ].map(String);

  return [...new Set(candidates)].filter((candidate) => candidate !== target.toString());
}

function validateUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Enter a full URL, e.g. http://localhost:8000/openapi.json.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("The spec URL must start with http:// or https://.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Remove the username and password from the spec URL.");
  }
  return parsed;
}

async function download(url: string, fetchImpl: Fetch): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json, application/yaml, text/yaml, */*;q=0.8" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`The server responded with HTTP ${response.status}.`);
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      throw new Error("The spec is larger than 10 MB.");
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
      throw new Error("The spec is larger than 10 MB.");
    }
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The request timed out after 15 seconds.");
    }
    if (error instanceof TypeError) {
      throw new Error(`Could not reach ${new URL(url).host}. Is the server running?`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
