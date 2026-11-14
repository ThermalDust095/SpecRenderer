import assert from "node:assert/strict";
import test from "node:test";
import { discoveryCandidates, loadSpec } from "../src/spec/loader";
import { openApi31 } from "./fixtures";

function fakeFetch(routes: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const body = routes[url];
    return new Response(body ?? "Not found", { status: body === undefined ? 404 : 200 });
  }) as typeof fetch;
}

test("loads a spec URL directly", async () => {
  const url = "http://127.0.0.1:8000/openapi.json";
  const loaded = await loadSpec(url, fakeFetch({ [url]: JSON.stringify(openApi31) }));
  assert.equal(loaded.spec.title, "Test API");
  assert.equal(loaded.resolvedUrl, url);
});

test("discovers the spec from a FastAPI /docs page", async () => {
  const page = `<html><script>SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui' })</script></html>`;
  const loaded = await loadSpec(
    "http://127.0.0.1:8000/docs",
    fakeFetch({
      "http://127.0.0.1:8000/docs": page,
      "http://127.0.0.1:8000/openapi.json": JSON.stringify(openApi31),
    }),
  );
  assert.equal(loaded.resolvedUrl, "http://127.0.0.1:8000/openapi.json");
});

test("falls back to well-known paths like Spring's /v3/api-docs", async () => {
  const loaded = await loadSpec(
    "http://localhost:8080/swagger-ui/index.html",
    fakeFetch({
      "http://localhost:8080/swagger-ui/index.html": "<html></html>",
      "http://localhost:8080/v3/api-docs": JSON.stringify(openApi31),
    }),
  );
  assert.equal(loaded.resolvedUrl, "http://localhost:8080/v3/api-docs");
});

test("candidate list is de-duplicated and excludes the page itself", () => {
  const candidates = discoveryCandidates(new URL("http://h.test/openapi.json"), "");
  assert.ok(!candidates.includes("http://h.test/openapi.json"));
  assert.equal(new Set(candidates).size, candidates.length);
});

test("rejects bad URLs with a readable message", async () => {
  await assert.rejects(loadSpec("localhost:8000", fakeFetch({})), /http/);
  await assert.rejects(loadSpec("http://user:pw@h.test/spec", fakeFetch({})), /username/);
  await assert.rejects(loadSpec("http://h.test/missing", fakeFetch({})), /HTTP 404/);
});
