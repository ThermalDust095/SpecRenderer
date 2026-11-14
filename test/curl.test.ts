import assert from "node:assert/strict";
import test from "node:test";
import { buildCurl } from "../src/spec/curl";
import { openApi31, swagger2 } from "./fixtures";
import { find, load } from "./helpers";

test("GET includes Accept and only query params with values", async () => {
  const spec = await load(openApi31);
  assert.equal(
    buildCurl(spec, find(spec, "get", "/items")),
    "curl -X GET 'http://127.0.0.1:8000/items?limit=10' \\\n  -H 'Accept: application/json'",
  );
});

test("path parameters use examples", async () => {
  const spec = await load(openApi31);
  assert.equal(
    buildCurl(spec, find(spec, "delete", "/items/{item_id}")),
    "curl -X DELETE 'http://127.0.0.1:8000/items/42'",
  );
});

test("JSON bodies are pretty-printed and skip readOnly fields", async () => {
  const spec = await load(openApi31);
  const curl = buildCurl(spec, find(spec, "post", "/items"));
  assert.match(curl, /-H 'Content-Type: application\/json'/);
  assert.match(curl, /--data-raw '\{\n  "name": "Widget",\n  "price": 0\n\}'/);
  assert.doesNotMatch(curl, /"id"/);
});

test("multipart binary fields become @file uploads and bearer auth is added", async () => {
  const spec = await load(openApi31);
  const curl = buildCurl(spec, find(spec, "post", "/upload"));
  assert.match(curl, /-H 'Authorization: Bearer <token>'/);
  assert.match(curl, /-F 'file=@\/path\/to\/file'/);
  assert.match(curl, /-F 'description='/);
  assert.doesNotMatch(curl, /Content-Type/);
});

test("URL-encoded forms are encoded", async () => {
  const spec = await load(openApi31);
  assert.match(buildCurl(spec, find(spec, "post", "/login")), /--data-raw 'username=username&password=\*\*\*\*\*\*\*\*'/);
});

test("Swagger 2 API keys and enum query params", async () => {
  const spec = await load(swagger2);
  assert.match(buildCurl(spec, find(spec, "post", "/pet")), /-H 'api_key: <api-key>'/);
  assert.match(buildCurl(spec, find(spec, "get", "/store/inventory")), /inventory\?status=available'/);
});

test("single quotes in values are shell-escaped", async () => {
  const spec = await load({
    openapi: "3.0.3",
    info: { title: "Q", version: "1" },
    servers: [{ url: "https://q.test" }],
    paths: {
      "/q": {
        post: {
          requestBody: { content: { "text/plain": { example: "it's" } } },
          responses: { "200": { description: "OK" } },
        },
      },
    },
  });
  assert.match(buildCurl(spec, find(spec, "post", "/q")), /--data-raw 'it'\\''s'/);
});
