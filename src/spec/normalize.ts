import { detectFormat } from "./parser";
import {
  HTTP_METHODS,
  type MediaType,
  type NormalizedSpec,
  type Operation,
  type Parameter,
  type RequestBody,
  type Response,
  type Schema,
  type SecurityRequirement,
  type SecurityScheme,
} from "./model";

type Doc = Record<string, unknown>;

/**
 * Converts a dereferenced OpenAPI 3.x or Swagger 2.0 document into the
 * single shape the rest of the extension works with.
 *
 * @param sourceUrl URL the spec was loaded from; relative server URLs are
 *   resolved against it.
 */
export function normalizeSpec(document: Doc, sourceUrl: string): NormalizedSpec {
  const { format, version } = detectFormat(document);
  const info = asRecord(document.info);
  const base = {
    format,
    formatVersion: version,
    title: asString(info.title) || "Untitled API",
    version: asString(info.version),
    description: asString(info.description),
    tags: asArray(document.tags)
      .map(asRecord)
      .filter((tag) => typeof tag.name === "string")
      .map((tag) => ({
        name: tag.name as string,
        description: asString(tag.description) || undefined,
      })),
  };

  return format === "OpenAPI"
    ? { ...base, ...normalizeOpenApi3(document, sourceUrl) }
    : { ...base, ...normalizeSwagger2(document, sourceUrl) };
}

// ── OpenAPI 3.x ─────────────────────────────────────────────────────────────

function normalizeOpenApi3(document: Doc, sourceUrl: string) {
  const server = asRecord(asArray(document.servers)[0]);
  const serverUrl = applyServerVariables(
    asString(server.url) || "/",
    asRecord(server.variables),
  );
  const components = asRecord(document.components);
  const defaultSecurity = asArray(document.security) as SecurityRequirement[];
  const operations: Operation[] = [];

  for (const [path, pathItem, method, raw] of eachOperation(document)) {
    operations.push({
      ...commonOperationFields(path, method, raw),
      parameters: mergeParameters(
        asArray(pathItem.parameters),
        asArray(raw.parameters),
      ),
      requestBody: isRecord(raw.requestBody)
        ? (raw.requestBody as unknown as RequestBody)
        : undefined,
      responses: asRecord(raw.responses) as Record<string, Response>,
      security: Array.isArray(raw.security)
        ? (raw.security as SecurityRequirement[])
        : defaultSecurity,
    });
  }

  return {
    baseUrl: resolveUrl(serverUrl, sourceUrl),
    securitySchemes: asRecord(components.securitySchemes) as Record<
      string,
      SecurityScheme
    >,
    operations,
  };
}

function applyServerVariables(url: string, variables: Doc): string {
  return url.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const variable = asRecord(variables[name]);
    return asString(variable.default) || asString(asArray(variable.enum)[0]) || name;
  });
}

// ── Swagger 2.0 ─────────────────────────────────────────────────────────────

function normalizeSwagger2(document: Doc, sourceUrl: string) {
  const source = safeUrl(sourceUrl);
  const scheme =
    asString(asArray(document.schemes)[0]) ||
    source?.protocol.replace(":", "") ||
    "https";
  const host = asString(document.host);
  const basePath = asString(document.basePath) || "/";
  const baseUrl = host
    ? `${scheme}://${host}${basePath}`
    : resolveUrl(basePath, sourceUrl);

  const globalConsumes = asArray(document.consumes).map(String);
  const globalProduces = asArray(document.produces).map(String);
  const defaultSecurity = asArray(document.security) as SecurityRequirement[];
  const operations: Operation[] = [];

  for (const [path, pathItem, method, raw] of eachOperation(document)) {
    const consumes = Array.isArray(raw.consumes)
      ? raw.consumes.map(String)
      : globalConsumes;
    const produces = Array.isArray(raw.produces)
      ? raw.produces.map(String)
      : globalProduces;
    const allParameters = mergeRawParameters(
      asArray(pathItem.parameters),
      asArray(raw.parameters),
    );

    operations.push({
      ...commonOperationFields(path, method, raw),
      parameters: allParameters
        .filter((parameter) => ["path", "query", "header"].includes(asString(parameter.in)))
        .map(swaggerParameter),
      requestBody: swaggerRequestBody(allParameters, consumes),
      responses: swaggerResponses(asRecord(raw.responses), produces),
      security: Array.isArray(raw.security)
        ? (raw.security as SecurityRequirement[])
        : defaultSecurity,
    });
  }

  return {
    baseUrl: trimSlash(baseUrl),
    securitySchemes: swaggerSecuritySchemes(asRecord(document.securityDefinitions)),
    operations,
  };
}

function swaggerParameter(raw: Doc): Parameter {
  return {
    name: asString(raw.name),
    in: raw.in as Parameter["in"],
    required: raw.required === true,
    description: asString(raw.description) || undefined,
    schema: swaggerSchema(raw),
    example: raw["x-example"],
  };
}

/** Swagger 2 puts type information directly on non-body parameters. */
function swaggerSchema(raw: Doc): Schema {
  const schema: Schema = {};
  for (const key of ["format", "default", "enum", "description"] as const) {
    if (raw[key] !== undefined) {
      (schema as Record<string, unknown>)[key] = raw[key];
    }
  }
  if (raw.type === "file") {
    schema.type = "string";
    schema.format = "binary";
  } else if (typeof raw.type === "string") {
    schema.type = raw.type;
  }
  if (isRecord(raw.items)) {
    schema.items = swaggerSchema(raw.items);
  }
  return schema;
}

function swaggerRequestBody(
  parameters: Doc[],
  consumes: string[],
): RequestBody | undefined {
  const body = parameters.find((parameter) => parameter.in === "body");
  if (body) {
    const mediaType: MediaType = { schema: asRecord(body.schema) as Schema };
    const types = consumes.length ? consumes : ["application/json"];
    return {
      required: body.required === true,
      description: asString(body.description) || undefined,
      content: Object.fromEntries(types.map((type) => [type, mediaType])),
    };
  }

  const fields = parameters.filter((parameter) => parameter.in === "formData");
  if (fields.length === 0) {
    return undefined;
  }
  const hasFile = fields.some((field) => field.type === "file");
  const contentType =
    hasFile || consumes.includes("multipart/form-data")
      ? "multipart/form-data"
      : "application/x-www-form-urlencoded";
  const schema: Schema = {
    type: "object",
    properties: Object.fromEntries(
      fields.map((field) => [asString(field.name), swaggerSchema(field)]),
    ),
    required: fields
      .filter((field) => field.required === true)
      .map((field) => asString(field.name)),
  };
  return {
    required: schema.required!.length > 0,
    content: { [contentType]: { schema } },
  };
}

function swaggerResponses(
  responses: Doc,
  produces: string[],
): Record<string, Response> {
  const result: Record<string, Response> = {};
  for (const [status, value] of Object.entries(responses)) {
    const response = asRecord(value);
    const examples = asRecord(response.examples);
    const normalized: Response = { description: asString(response.description) };
    if (isRecord(response.schema)) {
      const contentType =
        produces[0] ?? Object.keys(examples)[0] ?? "application/json";
      normalized.content = {
        [contentType]: {
          schema: response.schema as Schema,
          example: examples[contentType],
        },
      };
    }
    result[status] = normalized;
  }
  return result;
}

function swaggerSecuritySchemes(definitions: Doc): Record<string, SecurityScheme> {
  const result: Record<string, SecurityScheme> = {};
  for (const [name, value] of Object.entries(definitions)) {
    const definition = asRecord(value);
    const description = asString(definition.description) || undefined;
    if (definition.type === "basic") {
      result[name] = { type: "http", scheme: "basic", description };
    } else if (definition.type === "apiKey") {
      result[name] = {
        type: "apiKey",
        name: asString(definition.name),
        in: definition.in as SecurityScheme["in"],
        description,
      };
    } else if (definition.type === "oauth2") {
      result[name] = { type: "oauth2", description };
    }
  }
  return result;
}

// ── Shared helpers ──────────────────────────────────────────────────────────

function* eachOperation(
  document: Doc,
): Generator<[string, Doc, (typeof HTTP_METHODS)[number], Doc]> {
  for (const [path, value] of Object.entries(asRecord(document.paths))) {
    const pathItem = asRecord(value);
    for (const method of HTTP_METHODS) {
      if (isRecord(pathItem[method])) {
        yield [path, pathItem, method, pathItem[method] as Doc];
      }
    }
  }
}

function commonOperationFields(
  path: string,
  method: (typeof HTTP_METHODS)[number],
  raw: Doc,
) {
  return {
    method,
    path,
    operationId: asString(raw.operationId) || undefined,
    summary: asString(raw.summary) || undefined,
    description: asString(raw.description) || undefined,
    deprecated: raw.deprecated === true,
    tags: asArray(raw.tags).filter((tag): tag is string => typeof tag === "string"),
  };
}

/** Operation-level parameters override path-level ones with the same name+location. */
function mergeRawParameters(pathLevel: unknown[], operationLevel: unknown[]): Doc[] {
  const merged = new Map<string, Doc>();
  for (const value of [...pathLevel, ...operationLevel]) {
    const parameter = asRecord(value);
    if (typeof parameter.name === "string" && typeof parameter.in === "string") {
      merged.set(`${parameter.in}:${parameter.name}`, parameter);
    }
  }
  return [...merged.values()];
}

function mergeParameters(pathLevel: unknown[], operationLevel: unknown[]): Parameter[] {
  return mergeRawParameters(pathLevel, operationLevel) as unknown as Parameter[];
}

function resolveUrl(url: string, sourceUrl: string): string {
  try {
    return trimSlash(new URL(url, sourceUrl).toString());
  } catch {
    return trimSlash(url);
  }
}

function safeUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Doc {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Doc {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
