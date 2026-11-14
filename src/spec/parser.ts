import SwaggerParser = require("@apidevtools/swagger-parser");
import type { OpenAPI } from "openapi-types";
import YAML from "yaml";

/** Thrown when the text is readable but is not an OpenAPI/Swagger document. */
export class NotASpecError extends Error {}

export interface ParsedDocument {
  document: Record<string, unknown>;
  /** Set when the document failed strict validation but could still be read. */
  warning?: string;
}

/**
 * Parses JSON or YAML text, checks that it is OpenAPI 3.x or Swagger 2.0,
 * and dereferences internal `$ref`s. Documents that fail strict validation
 * are still returned (with a warning) so that small spec mistakes don't hide
 * the whole API.
 */
export async function parseDocument(source: string): Promise<ParsedDocument> {
  const raw = parseText(source);
  detectFormat(raw);

  const options: SwaggerParser.Options = {
    resolve: { external: false, file: false, http: false },
    dereference: { circular: "ignore" },
  };

  try {
    const document = await SwaggerParser.validate(
      structuredClone(raw) as OpenAPI.Document,
      options,
    );
    return { document: document as unknown as Record<string, unknown> };
  } catch (validationError) {
    try {
      const document = await SwaggerParser.dereference(
        raw as OpenAPI.Document,
        options,
      );
      return {
        document: document as unknown as Record<string, unknown>,
        warning: `The spec has validation errors; showing it anyway. ${firstLine(validationError)}`,
      };
    } catch {
      throw new Error(`The spec could not be read. ${firstLine(validationError)}`);
    }
  }
}

export function detectFormat(
  document: Record<string, unknown>,
): { format: "OpenAPI" | "Swagger"; version: string } {
  if (typeof document.openapi === "string") {
    if (!/^3\.[01]\.\d+/.test(document.openapi)) {
      throw new Error(
        `OpenAPI ${document.openapi} is not supported. Use OpenAPI 3.0, 3.1 or Swagger 2.0.`,
      );
    }
    return { format: "OpenAPI", version: document.openapi };
  }
  if (document.swagger === "2.0") {
    return { format: "Swagger", version: "2.0" };
  }
  throw new NotASpecError(
    "The document is not an OpenAPI 3.x or Swagger 2.0 spec.",
  );
}

function parseText(source: string): Record<string, unknown> {
  const trimmed = source.trimStart();
  if (trimmed.startsWith("<")) {
    throw new NotASpecError("The URL returned an HTML page, not a spec.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    try {
      parsed = YAML.parse(source);
    } catch {
      throw new NotASpecError("The document is neither valid JSON nor YAML.");
    }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new NotASpecError("The document is not an OpenAPI or Swagger object.");
  }
  return parsed as Record<string, unknown>;
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0].trim();
}
