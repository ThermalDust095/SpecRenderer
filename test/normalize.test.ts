import assert from "node:assert/strict";
import test from "node:test";
import { openApi31, swagger2 } from "./fixtures";
import { find, load } from "./helpers";

test("OpenAPI without servers uses the spec URL's origin", async () => {
  const spec = await load(openApi31, "http://127.0.0.1:8000/openapi.json");
  assert.equal(spec.baseUrl, "http://127.0.0.1:8000");
  assert.equal(spec.format, "OpenAPI");
});

test("relative server URLs resolve against the spec URL", async () => {
  const spec = await load({ ...openApi31, servers: [{ url: "/api/v1" }] }, "https://host.test/docs/openapi.json");
  assert.equal(spec.baseUrl, "https://host.test/api/v1");
});

test("server variables use their defaults", async () => {
  const spec = await load({
    ...openApi31,
    servers: [{ url: "https://{region}.api.test", variables: { region: { default: "eu" } } }],
  });
  assert.equal(spec.baseUrl, "https://eu.api.test");
});

test("path-level parameters are merged into operations", async () => {
  const spec = await load(openApi31);
  const op = find(spec, "delete", "/items/{item_id}");
  assert.deepEqual(op.parameters.map((p) => p.name), ["item_id"]);
});

test("Swagger 2.0 converts host, body, formData, responses and security", async () => {
  const spec = await load(swagger2);
  assert.equal(spec.format, "Swagger");
  assert.equal(spec.baseUrl, "https://petstore.example.com/v2");

  const add = find(spec, "post", "/pet");
  assert.equal(add.requestBody?.content["application/json"].schema?.type, "object");
  assert.equal(add.responses["200"].content?.["application/json"].schema?.type, "object");
  assert.deepEqual(spec.securitySchemes.api_key, { type: "apiKey", name: "api_key", in: "header", description: undefined });

  const upload = find(spec, "post", "/pet/{petId}/uploadImage");
  const multipart = upload.requestBody?.content["multipart/form-data"];
  assert.equal(multipart?.schema?.properties?.file.format, "binary");
  assert.equal(upload.parameters[0].schema?.type, "integer");
});
