/** FastAPI-style OpenAPI 3.1 document (no tags, no servers). */
export const openApi31 = {
  openapi: "3.1.0",
  info: { title: "Test API", version: "0.1.0" },
  paths: {
    "/items": {
      get: {
        summary: "List Items",
        operationId: "list_items",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 10 } },
          { name: "q", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Successful Response",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Item" } },
              },
            },
          },
        },
      },
      post: {
        summary: "Create Item",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Item" } } },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/items/{item_id}": {
      parameters: [{ name: "item_id", in: "path", required: true, schema: { type: "integer", example: 42 } }],
      delete: { summary: "Delete Item", responses: { "204": { description: "Deleted" } } },
    },
    "/login": {
      post: {
        summary: "URL-encoded form",
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                required: ["username", "password"],
                properties: { username: { type: "string" }, password: { type: "string", format: "password" } },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
    "/upload": {
      post: {
        summary: "Multipart file upload",
        security: [{ bearer: [] }],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary" },
                  description: { type: "string", default: "" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
  },
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    schemas: {
      Item: {
        type: "object",
        required: ["name"],
        properties: {
          id: { type: "integer", readOnly: true },
          name: { type: "string", example: "Widget" },
          price: { anyOf: [{ type: "number" }, { type: "null" }] },
        },
      },
    },
  },
};

/** Swagger 2.0 document with tags, body, formData and an API key. */
export const swagger2 = {
  swagger: "2.0",
  info: { title: "Petstore", version: "1.0.0" },
  host: "petstore.example.com",
  basePath: "/v2",
  schemes: ["https"],
  consumes: ["application/json"],
  produces: ["application/json"],
  tags: [{ name: "pet", description: "Pets" }, { name: "store" }],
  securityDefinitions: { api_key: { type: "apiKey", name: "api_key", in: "header" } },
  paths: {
    "/pet": {
      post: {
        tags: ["pet"],
        summary: "Add a pet",
        parameters: [
          { in: "body", name: "body", required: true, schema: { $ref: "#/definitions/Pet" } },
        ],
        responses: { "200": { description: "OK", schema: { $ref: "#/definitions/Pet" } } },
        security: [{ api_key: [] }],
      },
    },
    "/pet/{petId}/uploadImage": {
      post: {
        tags: ["pet"],
        summary: "Upload an image",
        consumes: ["multipart/form-data"],
        parameters: [
          { name: "petId", in: "path", required: true, type: "integer", format: "int64" },
          { name: "file", in: "formData", required: false, type: "file" },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/store/inventory": {
      get: {
        tags: ["store"],
        summary: "Inventory",
        parameters: [{ name: "status", in: "query", type: "string", enum: ["available", "sold"], required: true }],
        responses: { "200": { description: "OK" } },
      },
    },
  },
  definitions: {
    Pet: {
      type: "object",
      required: ["name"],
      properties: { id: { type: "integer", format: "int64" }, name: { type: "string", example: "doggie" } },
    },
  },
};
