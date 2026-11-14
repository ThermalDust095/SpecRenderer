import SwaggerParser = require("@apidevtools/swagger-parser");
import type { OpenAPI } from "openapi-types";

const httpMethods = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    variables?: Record<string, { default: string; enum?: string[] }>;
  }>;
  paths: Record<string, PathItem>;
  components?: {
    securitySchemes?: Record<string, unknown>;
  };
  security?: unknown[];
}

interface PathItem {
  parameters?: Parameter[];
  [method: string]: unknown;
}

interface Operation {
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  security?: unknown[];
}

interface Parameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  example?: unknown;
  examples?: Record<string, { value?: unknown }>;
  schema?: Schema;
}

interface RequestBody {
  required?: boolean;
  description?: string;
  content?: Record<string, MediaType>;
}

interface Response {
  description?: string;
  content?: Record<string, MediaType>;
}

interface MediaType {
  example?: unknown;
  examples?: Record<string, { value?: unknown }>;
  schema?: Schema;
}

interface Schema {
  type?: string;
  format?: string;
  default?: unknown;
  example?: unknown;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
}

export interface OperationView {
  id: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  parameters: Array<{
    name: string;
    location: string;
    required: boolean;
    description: string;
  }>;
  requestBody: string;
  securityRequired: boolean;
  curl: string;
}

export interface SpecView {
  title: string;
  version: string;
  openapiVersion: string;
  description: string;
  operations: OperationView[];
}

export class SpecSnapshot {
  private currentSpec: SpecView | null = null;

  get current(): SpecView | null {
    return this.currentSpec;
  }

  clear(): void {
    this.currentSpec = null;
  }

  async refresh(
    source: string,
    canCommit: () => boolean = () => true,
  ): Promise<SpecView | undefined> {
    const parsed = await parseOpenApiSpec(source);
    const nextSpec = toSpecView(parsed);
    if (!canCommit()) {
      return undefined;
    }
    this.currentSpec = nextSpec;
    return nextSpec;
  }
}

export async function parseOpenApiSpec(source: string): Promise<OpenApiSpec> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(source);
  } catch {
    const YAML = await import("yaml");
    parsed = YAML.parse(source);
  }

  if (!isRecord(parsed)) {
    throw new Error("The document must be an OpenAPI object.");
  }

  const version = parsed.openapi;
  if (typeof version !== "string" || !/^3\.(0|1)\.\d+$/.test(version)) {
    throw new Error("Only OpenAPI 3.0 and 3.1 documents are supported.");
  }

  if (
    !isRecord(parsed.info) ||
    typeof parsed.info.title !== "string" ||
    typeof parsed.info.version !== "string" ||
    !isRecord(parsed.paths)
  ) {
    throw new Error("The document must include info.title, info.version, and paths.");
  }

  const validated = await SwaggerParser.validate(parsed as OpenAPI.Document, {
    resolve: {
      external: false,
      file: false,
    },
    dereference: {
      circular: "ignore",
    },
    validate: {
      schema: true,
      spec: true,
    },
  });

  return validated as unknown as OpenApiSpec;
}

export function toSpecView(spec: OpenApiSpec): SpecView {
  const operations: OperationView[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!isRecord(pathItem)) {
      continue;
    }

    for (const method of httpMethods) {
      const operation = pathItem[method];
      if (!isRecord(operation)) {
        continue;
      }

      const typedOperation = operation as Operation;
      const parameters = mergeParameters(
        Array.isArray(pathItem.parameters) ? pathItem.parameters : [],
        Array.isArray(typedOperation.parameters) ? typedOperation.parameters : [],
      );
      const id =
        typeof typedOperation.operationId === "string"
          ? typedOperation.operationId
          : `${method.toUpperCase()} ${path}`;

      operations.push({
        id,
        method: method.toUpperCase(),
        path,
        summary:
          (typeof typedOperation.summary === "string" && typedOperation.summary) ||
          id,
        description:
          (typeof typedOperation.description === "string" &&
            typedOperation.description) ||
          "",
        parameters: parameters.map((parameter) => ({
          name: parameter.name,
          location: parameter.in,
          required: parameter.required === true,
          description: parameter.description ?? "",
        })),
        requestBody: describeRequestBody(typedOperation.requestBody),
        securityRequired:
          (typedOperation.security?.length ?? 0) > 0 ||
          (typedOperation.security === undefined &&
            (spec.security?.length ?? 0) > 0),
        curl: generateCurl(spec, path, method, parameters, typedOperation),
      });
    }
  }

  operations.sort((left, right) =>
    left.path === right.path
      ? left.method.localeCompare(right.method)
      : left.path.localeCompare(right.path),
  );

  return {
    title: spec.info.title,
    version: spec.info.version,
    openapiVersion: spec.openapi,
    description: spec.info.description ?? "",
    operations,
  };
}

function generateCurl(
  spec: OpenApiSpec,
  path: string,
  method: string,
  parameters: Parameter[],
  operation: Operation,
): string {
  const server = spec.servers?.[0];
  const baseUrl = server
    ? applyServerDefaults(server.url, server.variables)
    : "http://localhost";
  let endpoint = `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  endpoint = endpoint.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const parameter = parameters.find(
      (item) => item.in === "path" && item.name === name,
    );
    return encodeURIComponent(String(parameterValue(parameter)));
  });

  const query = new URLSearchParams();
  const headers = new Map<string, string>();
  const accept = firstResponseContentType(operation.responses);
  if (accept) {
    headers.set("Accept", accept);
  }

  for (const parameter of parameters) {
    const value = parameterValue(parameter);
    if (parameter.in === "query") {
      query.append(parameter.name, String(value));
    } else if (parameter.in === "header") {
      headers.set(parameter.name, String(value));
    } else if (parameter.in === "cookie") {
      const currentCookie = headers.get("Cookie");
      headers.set(
        "Cookie",
        currentCookie
          ? `${currentCookie}; ${parameter.name}=${String(value)}`
          : `${parameter.name}=${String(value)}`,
      );
    }
  }

  if (query.size > 0) {
    endpoint += `${endpoint.includes("?") ? "&" : "?"}${query.toString()}`;
  }

  const args = ["curl", "-X", method.toUpperCase(), shellQuote(endpoint)];
  for (const [name, value] of headers) {
    args.push("-H", shellQuote(`${name}: ${value}`));
  }

  const bodyContent = firstRequestBodyContent(operation.requestBody);
  if (bodyContent) {
    if (bodyContent.contentType === "multipart/form-data") {
      if (isRecord(bodyContent.value)) {
        for (const [name, value] of Object.entries(bodyContent.value)) {
          args.push("-F", shellQuote(`${name}=${String(value)}`));
        }
      }
    } else {
      const contentTypeHeaderIndex = args.findIndex(
        (argument, index) =>
          index > 0 &&
          args[index - 1] === "-H" &&
          argument.toLowerCase().startsWith("'content-type:"),
      );
      const contentTypeHeader = shellQuote(
        `Content-Type: ${bodyContent.contentType}`,
      );
      if (contentTypeHeaderIndex === -1) {
        args.push("-H", contentTypeHeader);
      } else {
        args[contentTypeHeaderIndex] = contentTypeHeader;
      }

      const body = serializeRequestBody(
        bodyContent.contentType,
        bodyContent.value,
      );
      args.push("--data-raw", shellQuote(body));
    }
  }

  return args.join(" ");
}

function firstRequestBodyContent(
  requestBody: RequestBody | undefined,
): { contentType: string; value: unknown } | undefined {
  const [contentType, mediaType] = Object.entries(requestBody?.content ?? {})[0] ?? [];
  if (!contentType || !mediaType) {
    return undefined;
  }

  const example = firstExample(mediaType);
  return {
    contentType,
    value: example.found ? example.value : sampleFromSchema(mediaType.schema),
  };
}

function firstResponseContentType(
  responses: Record<string, Response> | undefined,
): string | undefined {
  for (const response of Object.values(responses ?? {})) {
    const contentType = Object.keys(response.content ?? {})[0];
    if (contentType) {
      return contentType;
    }
  }
  return undefined;
}

function describeRequestBody(requestBody: RequestBody | undefined): string {
  const content = firstRequestBodyContent(requestBody);
  if (!content) {
    return requestBody?.description ?? "";
  }

  return `${content.contentType}\n${JSON.stringify(content.value, null, 2)}`;
}

function serializeRequestBody(contentType: string, value: unknown): string {
  if (/(^|\/)json(?:;|$)|\+json(?:;|$)/i.test(contentType)) {
    return JSON.stringify(value);
  }
  if (contentType === "application/x-www-form-urlencoded" && isRecord(value)) {
    const form = new URLSearchParams();
    for (const [name, fieldValue] of Object.entries(value)) {
      form.append(name, String(fieldValue));
    }
    return form.toString();
  }
  if (contentType.startsWith("text/")) {
    return typeof value === "string" ? value : String(value);
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function mergeParameters(
  pathParameters: Parameter[],
  operationParameters: Parameter[],
): Parameter[] {
  const merged = new Map<string, Parameter>();
  for (const parameter of [...pathParameters, ...operationParameters]) {
    if (
      isRecord(parameter) &&
      typeof parameter.name === "string" &&
      typeof parameter.in === "string"
    ) {
      merged.set(`${parameter.in}:${parameter.name}`, parameter);
    }
  }
  return [...merged.values()];
}

function parameterValue(parameter: Parameter | undefined): unknown {
  if (!parameter) {
    return "value";
  }

  const example = firstExample(parameter);
  if (example.found) {
    return example.value;
  }

  return sampleFromSchema(parameter.schema, parameter.name);
}

function firstExample(
  source: { example?: unknown; examples?: Record<string, { value?: unknown }> },
): { found: boolean; value?: unknown } {
  if (source.example !== undefined) {
    return { found: true, value: source.example };
  }
  const first = Object.values(source.examples ?? {}).find(
    (example) => example?.value !== undefined,
  );
  return first
    ? { found: true, value: first.value }
    : { found: false };
}

function sampleFromSchema(
  schema: Schema | undefined,
  name = "value",
  depth = 0,
): unknown {
  if (!schema) {
    return name;
  }
  if (depth >= 5) {
    return name;
  }
  if (schema.example !== undefined) {
    return schema.example;
  }
  if (schema.default !== undefined) {
    return schema.default;
  }
  if (schema.enum?.length) {
    return schema.enum[0];
  }
  if (schema.type === "object" || schema.properties) {
    const result: Record<string, unknown> = {};
    for (const [propertyName, propertySchema] of Object.entries(
      schema.properties ?? {},
    )) {
      result[propertyName] = sampleFromSchema(
        propertySchema,
        propertyName,
        depth + 1,
      );
    }
    return result;
  }
  if (schema.type === "array") {
    return [sampleFromSchema(schema.items, name, depth + 1)];
  }
  switch (schema.type) {
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    case "string":
      return schema.format === "date-time"
        ? "2026-01-01T00:00:00Z"
        : name;
    default:
      return name;
  }
}

function applyServerDefaults(
  url: string,
  variables: Record<string, { default?: string; enum?: string[] }> | undefined,
): string {
  return url.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const variable = variables?.[name];
    return encodeURIComponent(variable?.default ?? variable?.enum?.[0] ?? name);
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
