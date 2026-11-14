import assert from "node:assert/strict";
import test from "node:test";
import { NotASpecError, parseDocument } from "../src/spec/parser";
import { openApi31, swagger2 } from "./fixtures";

test("parses OpenAPI 3.x JSON and dereferences $refs", async () => {
  const { document, warning } = await parseDocument(JSON.stringify(openApi31));
  assert.equal(warning, undefined);
  const paths = document.paths as Record<string, any>;
  assert.equal(paths["/items"].post.requestBody.content["application/json"].schema.type, "object");
});

test("parses YAML", async () => {
  const { document } = await parseDocument("openapi: 3.0.3\ninfo:\n  title: Y\n  version: '1'\npaths: {}\n");
  assert.equal(document.openapi, "3.0.3");
});

test("parses Swagger 2.0", async () => {
  const { document } = await parseDocument(JSON.stringify(swagger2));
  assert.equal(document.swagger, "2.0");
});

test("reads specs with validation errors and returns a warning", async () => {
  const broken = structuredClone(openApi31) as any;
  broken.paths["/items"].get.responses = "not-an-object";
  const { document, warning } = await parseDocument(JSON.stringify(broken));
  assert.ok(document.paths);
  assert.match(warning ?? "", /validation errors/);
});

test("signals non-spec content so the loader can try discovery", async () => {
  await assert.rejects(parseDocument("<!doctype html><html></html>"), NotASpecError);
  await assert.rejects(parseDocument(JSON.stringify({ hello: "world" })), NotASpecError);
});

test("rejects unsupported OpenAPI versions", async () => {
  await assert.rejects(
    parseDocument(JSON.stringify({ openapi: "4.0.0", info: {}, paths: {} })),
    /not supported/,
  );
});
