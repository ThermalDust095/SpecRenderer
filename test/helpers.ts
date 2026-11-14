import { normalizeSpec } from "../src/spec/normalize";
import { parseDocument } from "../src/spec/parser";
import type { NormalizedSpec, Operation } from "../src/spec/model";

export async function load(document: object, url = "http://127.0.0.1:8000/openapi.json"): Promise<NormalizedSpec> {
  const parsed = await parseDocument(JSON.stringify(document));
  return normalizeSpec(parsed.document, url);
}

export function find(spec: NormalizedSpec, method: string, path: string): Operation {
  const operation = spec.operations.find((op) => op.method === method && op.path === path);
  if (!operation) throw new Error(`No operation ${method} ${path}`);
  return operation;
}
