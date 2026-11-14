import assert from "node:assert/strict";
import test from "node:test";
import { buildCatalog } from "../src/spec/catalog";
import { buildEndpointDetail } from "../src/spec/details";
import { openApi31, swagger2 } from "./fixtures";
import { find, load } from "./helpers";

test("groups untagged operations by first path segment", async () => {
  const catalog = buildCatalog(await load(openApi31));
  assert.deepEqual(catalog.modules.map((m) => m.name), ["items", "login", "upload"]);
  assert.deepEqual(
    catalog.modules[0].endpoints.map((e) => `${e.method} ${e.title}`),
    ["GET List Items", "POST Create Item", "DELETE Delete Item"],
  );
});

test("groups tagged operations by tag in declared order", async () => {
  const catalog = buildCatalog(await load(swagger2));
  assert.deepEqual(catalog.modules.map((m) => m.name), ["pet", "store"]);
  assert.equal(catalog.modules[0].description, "Pets");
  assert.ok(catalog.operations.has("GET /store/inventory"));
});

test("endpoint detail describes params, body fields and responses", async () => {
  const spec = await load(openApi31);
  const list = buildEndpointDetail(spec, find(spec, "get", "/items"));
  assert.deepEqual(list.parameters.map((p) => `${p.name}:${p.type}:${p.location}`), ["limit:integer:query", "q:string:query"]);
  assert.equal(list.responses[0].status, "200");
  assert.match(list.responses[0].example ?? "", /"name": "Widget"/);

  const create = buildEndpointDetail(spec, find(spec, "post", "/items"));
  assert.equal(create.body?.contentType, "application/json");
  // readOnly `id` is hidden from request fields.
  assert.deepEqual(create.body?.fields.map((f) => `${f.name}:${f.type}:${f.required}`), [
    "name:string:true",
    "price:number | null:false",
  ]);

  const upload = buildEndpointDetail(spec, find(spec, "post", "/upload"));
  assert.deepEqual(upload.auth, [{ name: "bearer", label: "Bearer" }]);
  assert.equal(upload.body?.fields[0].type, "file");
});
