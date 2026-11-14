/**
 * Types shared by the spec pipeline:
 *   loader (raw text) → parser (validated document) → normalize (OpenAPI 3 shape)
 *   → catalog (modules + endpoints) → details (one endpoint, rendered on demand).
 */

export const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

/** A JSON Schema subset, as found in OpenAPI 3.0/3.1 and Swagger 2.0. */
export interface Schema {
  type?: string | string[];
  format?: string;
  title?: string;
  description?: string;
  default?: unknown;
  example?: unknown;
  examples?: unknown[];
  enum?: unknown[];
  const?: unknown;
  nullable?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  required?: string[];
  items?: Schema;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  contentMediaType?: string;
  contentEncoding?: string;
  $ref?: string;
}

export interface Example {
  value?: unknown;
}

export interface MediaType {
  schema?: Schema;
  example?: unknown;
  examples?: Record<string, Example>;
}

export interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  deprecated?: boolean;
  description?: string;
  schema?: Schema;
  example?: unknown;
  examples?: Record<string, Example>;
}

export interface RequestBody {
  required?: boolean;
  description?: string;
  content: Record<string, MediaType>;
}

export interface Response {
  description?: string;
  content?: Record<string, MediaType>;
}

export type SecurityRequirement = Record<string, string[]>;

export interface SecurityScheme {
  type: "apiKey" | "http" | "oauth2" | "openIdConnect" | "mutualTLS";
  name?: string;
  in?: "query" | "header" | "cookie";
  scheme?: string;
  description?: string;
}

export interface Operation {
  method: HttpMethod;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  deprecated?: boolean;
  tags: string[];
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
  /** Effective requirements: the operation's own, or the document default. */
  security: SecurityRequirement[];
}

/** Any supported spec, converted to a single OpenAPI 3-like shape. */
export interface NormalizedSpec {
  format: "OpenAPI" | "Swagger";
  formatVersion: string;
  title: string;
  version: string;
  description: string;
  /** Absolute base URL used for generated requests. */
  baseUrl: string;
  tags: Array<{ name: string; description?: string }>;
  securitySchemes: Record<string, SecurityScheme>;
  operations: Operation[];
}
