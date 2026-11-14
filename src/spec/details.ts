import type { AuthView, BodyView, EndpointDetail, FieldView, ResponseView } from "../shared/protocol";
import { endpointId } from "./catalog";
import { buildCurl, isJson, pickContent } from "./curl";
import type { MediaType, NormalizedSpec, Operation, Response, Schema } from "./model";
import { describeType, exampleValue, flatten } from "./sample";

/** Everything the endpoint panel shows for one operation. */
export function buildEndpointDetail(spec: NormalizedSpec, operation: Operation): EndpointDetail {
  return {
    id: endpointId(operation),
    method: operation.method.toUpperCase(),
    path: operation.path,
    baseUrl: spec.baseUrl,
    title: operation.summary || operation.path,
    operationId: operation.operationId,
    description: operation.description,
    deprecated: operation.deprecated === true,
    tags: operation.tags,
    auth: describeAuth(spec, operation),
    parameters: operation.parameters.map((parameter) => ({
      name: parameter.name,
      location: parameter.in,
      type: describeType(parameter.schema),
      required: parameter.required === true,
      deprecated: parameter.deprecated,
      description: parameter.description ?? parameter.schema?.description,
    })),
    body: describeBody(operation),
    responses: Object.entries(operation.responses).map(([status, response]) =>
      describeResponse(status, response),
    ),
    curl: buildCurl(spec, operation),
  };
}

function describeBody(operation: Operation): BodyView | undefined {
  const content = pickContent(operation.requestBody);
  if (!content) return undefined;
  return {
    contentType: content.contentType,
    otherContentTypes: content.others,
    required: operation.requestBody?.required === true,
    description: operation.requestBody?.description,
    example: formatExample(content.contentType, content.mediaType, "request"),
    fields: describeFields(content.mediaType.schema, "request"),
  };
}

function describeResponse(status: string, response: Response): ResponseView {
  const content = pickContent(response);
  return {
    status,
    description: response.description ?? "",
    contentType: content?.contentType,
    example: content ? formatExample(content.contentType, content.mediaType, "response") : undefined,
    fields: describeFields(content?.mediaType.schema, "response"),
  };
}

function describeFields(schema: Schema | undefined, mode: "request" | "response"): FieldView[] {
  if (!schema) return [];
  const flat = flatten(schema.type === "array" && schema.items ? schema.items : schema);
  const required = new Set(flat.required ?? []);
  return Object.entries(flat.properties ?? {})
    .filter(([, property]) => !(mode === "request" ? property.readOnly : property.writeOnly))
    .map(([name, property]) => ({
      name,
      type: describeType(property),
      required: required.has(name),
      deprecated: property.deprecated,
      description: property.description ?? property.title,
    }));
}

function formatExample(
  contentType: string,
  mediaType: MediaType,
  mode: "request" | "response",
): string | undefined {
  const value = exampleValue(mediaType, mode);
  if (value === undefined) return undefined;
  if (typeof value === "string" && !isJson(contentType)) return value;
  return JSON.stringify(value, null, 2);
}

function describeAuth(spec: NormalizedSpec, operation: Operation): AuthView[] {
  return Object.keys(operation.security[0] ?? {}).map((name) => {
    const scheme = spec.securitySchemes[name];
    let label = "Auth";
    if (scheme?.type === "http") label = scheme.scheme?.toLowerCase() === "basic" ? "Basic" : "Bearer";
    else if (scheme?.type === "apiKey") label = `API key · ${scheme.in ?? "header"}`;
    else if (scheme?.type === "oauth2") label = "OAuth 2";
    else if (scheme?.type === "openIdConnect") label = "OpenID Connect";
    return { name, label };
  });
}
