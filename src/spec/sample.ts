import type { Example, Schema } from "./model";

export type SampleMode = "request" | "response";

const MAX_DEPTH = 6;

/**
 * Returns the first explicit example on a parameter or media type, falling
 * back to a value generated from its schema.
 */
export function exampleValue(
  source: { example?: unknown; examples?: Record<string, Example>; schema?: Schema },
  mode: SampleMode,
  name = "value",
): unknown {
  if (source.example !== undefined) {
    return source.example;
  }
  const named = Object.values(source.examples ?? {}).find(
    (example) => example?.value !== undefined,
  );
  if (named) {
    return named.value;
  }
  return sampleFromSchema(source.schema, mode, name);
}

/** Builds a plausible value for a schema, preferring examples and defaults. */
export function sampleFromSchema(
  schema: Schema | undefined,
  mode: SampleMode,
  name = "value",
  depth = 0,
  seen: Set<Schema> = new Set(),
): unknown {
  if (!schema || depth > MAX_DEPTH || seen.has(schema) || schema.$ref) {
    return depth === 0 ? undefined : {};
  }
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if (schema.const !== undefined) return schema.const;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];

  seen = new Set(seen).add(schema);
  const resolved = flatten(schema);

  if (resolved.oneOf?.length || resolved.anyOf?.length) {
    const first = (resolved.oneOf ?? resolved.anyOf)![0];
    return sampleFromSchema(first, mode, name, depth + 1, seen);
  }

  const type = primaryType(resolved);
  if (type === "object" || resolved.properties) {
    const result: Record<string, unknown> = {};
    for (const [property, propertySchema] of Object.entries(resolved.properties ?? {})) {
      if (mode === "request" && propertySchema.readOnly) continue;
      if (mode === "response" && propertySchema.writeOnly) continue;
      result[property] = sampleFromSchema(propertySchema, mode, property, depth + 1, seen);
    }
    return result;
  }
  if (type === "array") {
    return [sampleFromSchema(resolved.items, mode, name, depth + 1, seen) ?? name];
  }
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return true;
  if (type === "null") return null;
  return sampleString(resolved, name);
}

/** True for file uploads: `format: binary` or a 3.1 `contentMediaType`. */
export function isBinary(schema: Schema | undefined): boolean {
  if (!schema) return false;
  if (schema.format === "binary" || schema.contentMediaType) return true;
  return schema.type === "array" && isBinary(schema.items);
}

/** Short human-readable type, e.g. `string(uuid)`, `array<integer>`, `file`. */
export function describeType(schema: Schema | undefined): string {
  if (!schema) return "any";
  if (isBinary(schema)) return schema.type === "array" ? "array<file>" : "file";
  const resolved = flatten(schema);
  const variants = resolved.oneOf ?? resolved.anyOf;
  if (variants?.length) {
    return [...new Set(variants.map(describeType))].join(" | ");
  }
  const type = primaryType(resolved);
  if (type === "array") return `array<${describeType(resolved.items)}>`;
  if (!type) return resolved.properties ? "object" : "any";
  const nullable =
    resolved.nullable || (Array.isArray(resolved.type) && resolved.type.includes("null"));
  return `${type}${resolved.format ? `(${resolved.format})` : ""}${nullable ? "?" : ""}`;
}

/** Merges `allOf` members into one schema so properties can be listed. */
export function flatten(schema: Schema): Schema {
  if (!schema.allOf?.length) return schema;
  const merged: Schema = { ...schema, allOf: undefined, properties: { ...schema.properties } };
  const required = new Set(schema.required ?? []);
  for (const part of schema.allOf) {
    const flat = flatten(part);
    merged.type ??= flat.type;
    merged.format ??= flat.format;
    merged.description ??= flat.description;
    Object.assign(merged.properties!, flat.properties);
    flat.required?.forEach((name) => required.add(name));
  }
  merged.required = [...required];
  return merged;
}

function primaryType(schema: Schema): string | undefined {
  if (Array.isArray(schema.type)) {
    return schema.type.find((type) => type !== "null") ?? schema.type[0];
  }
  return schema.type;
}

function sampleString(schema: Schema, name: string): string {
  switch (schema.format) {
    case "date-time":
      return "2026-01-01T00:00:00Z";
    case "date":
      return "2026-01-01";
    case "time":
      return "12:00:00";
    case "email":
      return "user@example.com";
    case "uuid":
      return "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    case "uri":
    case "url":
      return "https://example.com";
    case "ipv4":
      return "192.168.0.1";
    case "byte":
      return "U3BlYyBSZW5kZXJlcg==";
    case "password":
      return "********";
    default:
      return name;
  }
}
