import assert from "node:assert/strict";
import test from "node:test";
import { parseOpenApiSpec, SpecSnapshot, toSpecView } from "../src/openapi";

const validSpec = {
  openapi: "3.0.3",
  info: {
    title: "Pets",
    version: "1.0.0",
  },
  servers: [{ url: "https://api.example.test/v1" }],
  paths: {
    "/pets/{petId}": {
      parameters: [
        {
          name: "petId",
          in: "path",
          required: true,
          schema: { type: "integer", example: 42 },
        },
      ],
      get: {
        summary: "Read a pet",
        responses: {
          "200": {
            description: "A pet",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
    "/pets": {
      post: {
        summary: "Create a pet",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Milo" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
        },
      },
    },
  },
};

test("parses and validates OpenAPI 3.x JSON and YAML", async () => {
  const json = await parseOpenApiSpec(JSON.stringify(validSpec));
  assert.equal(json.info.title, "Pets");

  const yaml = await parseOpenApiSpec(
    `openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
paths: {}
`,
  );
  assert.equal(yaml.openapi, "3.1.0");
});

test("rejects malformed or unsupported OpenAPI documents", async () => {
  await assert.rejects(() => parseOpenApiSpec("<html>not a spec</html>"));
  await assert.rejects(() =>
    parseOpenApiSpec(
      JSON.stringify({
        openapi: "2.0",
        info: { title: "Wrong", version: "1" },
        paths: {},
      }),
    ),
    /Only OpenAPI 3\.0 and 3\.1/,
  );
  await assert.rejects(() =>
    parseOpenApiSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Invalid", version: "1.0.0" },
        paths: { broken: "not a path item" },
      }),
    ),
  );
});

test("keeps the last valid spec when a refresh document is invalid", async () => {
  const snapshot = new SpecSnapshot();
  const initial = await snapshot.refresh(JSON.stringify(validSpec));
  assert.ok(initial);

  await assert.rejects(() => snapshot.refresh("<html>temporary error</html>"));
  assert.equal(snapshot.current, initial);

  const staleResult = await snapshot.refresh(JSON.stringify(validSpec), () => false);
  assert.equal(staleResult, undefined);
  assert.equal(snapshot.current, initial);
});

test("creates operation details and cURL with path values and body examples", async () => {
  const spec = await parseOpenApiSpec(JSON.stringify(validSpec));
  const view = toSpecView(spec);

  assert.equal(view.title, "Pets");
  assert.equal(view.operations.length, 2);

  const readPet = view.operations.find((operation) => operation.method === "GET");
  assert.ok(readPet);
  assert.match(readPet.curl, /https:\/\/api\.example\.test\/v1\/pets\/42/);
  assert.match(readPet.curl, /-H 'Accept: application\/json'/);

  const createPet = view.operations.find((operation) => operation.method === "POST");
  assert.ok(createPet);
  assert.match(createPet.curl, /--data-raw '\{"name":"Milo"\}'/);
  assert.match(createPet.curl, /Content-Type: application\/json/);
  assert.match(createPet.requestBody, /"name": "Milo"/);
});

test("generates cURL bodies for text and URL-encoded operations", async () => {
  const spec = await parseOpenApiSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Forms", version: "1.0.0" },
      paths: {
        "/text": {
          post: {
            requestBody: {
              content: {
                "text/plain": {
                  example: "it's ready",
                },
              },
            },
            responses: { "204": { description: "Done" } },
          },
        },
        "/form": {
          post: {
            requestBody: {
              content: {
                "application/x-www-form-urlencoded": {
                  schema: {
                    type: "object",
                    properties: {
                      name: { type: "string", example: "Milo" },
                      active: { type: "boolean", example: true },
                    },
                  },
                },
              },
            },
            responses: { "204": { description: "Done" } },
          },
        },
      },
    }),
  );
  const operations = toSpecView(spec).operations;

  const textCurl = operations.find((operation) => operation.path === "/text")?.curl;
  assert.ok(textCurl);
  assert.match(textCurl, /Content-Type: text\/plain/);
  assert.match(textCurl, /--data-raw 'it'\\''s ready'/);

  const formCurl = operations.find((operation) => operation.path === "/form")?.curl;
  assert.ok(formCurl);
  assert.match(formCurl, /--data-raw 'name=Milo&active=true'/);
});
