import { afterEach, expect, it, vi } from "vitest";
import { McpServer } from "@bio-mcp/shared/mcp";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { registerCodeMode } from "./code-mode";
import { registerQueryData } from "./query-data";
import { registerGetSchema } from "./get-schema";
import { createRheaApiFetch } from "../lib/api-adapter";
import { rheaCatalog } from "../spec/catalog";
afterEach(() => vi.unstubAllGlobals());
const release = () => new Response('<h1>SPARQL Rhea 2026_03</h1><p>Rhea data of release 2026_03 (2026-09-02)</p>');
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/sparql-results+json" } });
it("registers both aliases and discoverable joins with both-fields error contracts", async () => {
  const server = new McpServer({ name: "fixture", version: "1" });
  registerCodeMode(server, { CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1]);
  registerQueryData(server, {}); registerGetSchema(server, {});
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<unknown> }> })._registeredTools;
  for (const name of ["rhea_search", "rhea_execute", "rhea_query_data", "rhea_get_schema"]) {
    expect(tools[name]).toBeDefined(); expect(tools[`mcp_${name}`]).toBeDefined();
  }
  const result = await tools.mcp_rhea_search.handler({ query: "Human reviewed UniProt annotations for a reaction", category: "workflows", max_results: 5 }, {});
  expect(result).toMatchObject({ content: expect.any(Array), structuredContent: { success: true } });
  expect(JSON.stringify(result)).toContain("taxon_id");
  expect(await tools.mcp_rhea_query_data.handler({ data_access_id: "rhea_fixture", sql: "SELECT 1" }, {})).toMatchObject({ isError: true, content: expect.any(Array), structuredContent: expect.any(Object) });
  expect(rheaCatalog.endpointCount).toBe(rheaCatalog.endpoints.length);
});
it("stages large RDF terms with types, language, unbound fields and release metadata intact", async () => {
  const raw = { head: { vars: ["rhea", "predicate", "object"] }, results: { bindings: [{ rhea: { type: "uri", value: "http://rdf.rhea-db.org/10336" }, predicate: { type: "uri", value: "http://www.w3.org/2000/01/rdf-schema#comment" }, object: { type: "literal", "xml:lang": "en", value: "α".repeat(17_000) } }] } };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(release()).mockResolvedValueOnce(json(raw)).mockResolvedValueOnce(release()));
  const stored: unknown[] = [];
  const namespace = { idFromName: (name: string) => name, get: () => ({ fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      stored.push((await request.json() as { data: unknown }).data);
      return json({ success: true, tables_created: ["bindings"], total_rows: 1, input_rows: 1, table_row_counts: { bindings: 1 } });
    }
    return json({ success: true, schema: { tables: { bindings: { columns: [{ name: "rhea" }] } } } });
  } }) } as unknown as DurableObjectNamespace;
  const proxy = createApiProxyTool({ apiFetch: createRheaApiFetch(), catalog: rheaCatalog, doNamespace: namespace, stagingPrefix: "rhea", maxInlineBytes: 30 * 1024 });
  const result = await proxy.handler({ method: "GET", path: "/sparql/reaction", params: { rhea_id: "RHEA:10336" } }, { sql: () => [] });
  expect(result).toMatchObject({ __staged: true, data_access_id: expect.any(String) });
  expect(JSON.parse(stored[0] as string)).toMatchObject({ ...raw, _rhea: { release: { release: "2026_03" }, response_sha256: expect.any(String) } });
  expect(stored[1]).toMatchObject({ ...raw, _rhea: { chebi_release: null } });
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(30_000);
});
it.each([{ __api_error: true, status: 409 }, { __staged: true, data_access_id: "rhea_fixture" }, { __stage_error: true, message: "staging unavailable" }])("recipes preserve error and staging handles %#", async handle => {
  for (const workflow of rheaCatalog.workflows!) {
    const run = new Function("api", `return (async () => { ${workflow.code} })()`);
    expect(await run({ get: vi.fn().mockResolvedValue(handle) })).toEqual(handle);
  }
});
it("release failures survive canonical proxy handling", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(release()));
  const proxy = createApiProxyTool({ apiFetch: createRheaApiFetch(), catalog: rheaCatalog, stagingPrefix: "rhea", maxInlineBytes: 30 * 1024 });
  expect(await proxy.handler({ method: "GET", path: "/sparql/reaction", params: { rhea_id: "RHEA:10336", expected_release: "1999_01" } }, { sql: () => [] })).toMatchObject({ __api_error: true, status: 409, incomplete: true });
});
