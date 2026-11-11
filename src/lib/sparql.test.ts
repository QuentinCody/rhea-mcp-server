import { afterEach, describe, expect, it, vi } from "vitest";
import { createRheaApiFetch } from "./api-adapter";
import { makeQuery } from "./sparql-query";
import { parseRelease } from "./sparql";

const source = (label = "2026_03", date = "2026-09-02") => `<h1>SPARQL Rhea ${label}</h1><p>This SPARQL endpoint contains all Rhea data of release ${label} (${date}).</p>`;
const html = (label?: string, date?: string) => new Response(source(label, date), { headers: { "Content-Type": "text/html" } });
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/sparql-results+json" } });
const uri = (value: string) => ({ type: "uri", value });
const literal = (value: string, extra = {}) => ({ type: "literal", value, ...extra });
const params = { rhea_id: "RHEA:10336" };
const row = { rhea: uri("http://rdf.rhea-db.org/10336"), predicate: uri("http://rdf.rhea-db.org/equation"), object: literal("citrate ⇌ cis-aconitate", { "xml:lang": "en" }) };
function envelope(path = "/sparql/reaction", input: Record<string, unknown> = params, rows: unknown[] = [row]) {
  return { head: { vars: makeQuery(path, input).variables }, results: { bindings: rows } };
}
function setup(payload: unknown = envelope()) {
  const fetcher = vi.fn().mockResolvedValueOnce(html()).mockResolvedValueOnce(json(payload)).mockResolvedValueOnce(html());
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
const api = createRheaApiFetch();
afterEach(() => vi.unstubAllGlobals());

describe("provider-derived fixed queries", () => {
  it("uses all three participant mappings without assigning substrate/product roles", () => {
    const q = makeQuery("/sparql/participants", params).query;
    expect(q).toContain("?compound rh:reactivePart ?reactivePart"); expect(q).toContain("rh:underlyingChebi");
    expect(q).toContain("?coefficientPredicate rh:coefficient ?coefficient");
    expect(q).toContain("rh:side rh:substrates rh:products rh:substratesOrProducts");
    expect(q).not.toContain("GROUP_CONCAT"); expect(q).toContain("ORDER BY"); expect(q).toContain("LIMIT 50");
  });
  it("separates exact identity from inclusive class matching", () => {
    const p = { chebi_id: "CHEBI:29985", match: "exact" };
    expect(makeQuery("/sparql/chebi", p).query).toContain("VALUES ?chebi { <http://purl.obolibrary.org/obo/CHEBI_29985> }");
    expect(makeQuery("/sparql/chebi", { ...p, match: "descendants" }).query).toContain("?chebi rdfs:subClassOf* ?requestedChebi");
  });
  it("restricts federation inside SERVICE, preserves annotation context and explicit false", () => {
    const q = makeQuery("/sparql/uniprot", { ...params, reviewed: false, taxon_id: 9606 }).query;
    expect(q).toContain("SERVICE <https://sparql.uniprot.org/sparql> {\nVALUES ?rhea");
    expect(q).toContain("?annotation up:catalyticActivity ?activity"); expect(q).toContain("VALUES ?reviewed { false }");
    expect(q).toContain("taxonomy/9606"); expect(q).not.toContain("SILENT");
    expect(makeQuery("/sparql/uniprot", params).query).not.toContain("VALUES ?reviewed");
  });
  it.each([
    ["/sparql/reaction", { rhea_id: "RHEA:1> } SERVICE <https://evil.test> {" }],
    ["/sparql/reaction", { rhea_id: "10336" }],
    ["/sparql/reaction", { ...params, query: "DROP ALL" }],
    ["/sparql/reaction", { ...params, limit: 201 }],
    ["/sparql/reaction", { ...params, limit: "10" }],
    ["/sparql/reaction", { ...params, offset: -1 }],
    ["/sparql/reaction", { ...params, offset: 1 }],
    ["/sparql/reaction", { ...params, expected_release: "142" }],
    ["/sparql/chebi", { chebi_id: "CHEBI:29985" }],
    ["/sparql/chebi", { chebi_id: "CHEBI:0", match: "exact" }],
    ["/sparql/uniprot", { ...params, reviewed: "false" }],
    ["/sparql/uniprot", { ...params, taxon_id: 0 }],
    ["/sparql/arbitrary", params],
  ])("rejects malformed or unbounded inputs before networking %#", async (path, input) => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(api({ method: "GET", path: path as string, params: input as Record<string, unknown> })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("release provenance and result fidelity", () => {
  it("parses markup and matching labels, not script-injected examples", () => {
    expect(parseRelease('<script>SPARQL Rhea 1999_01</script>' + source())).toMatchObject({ release: "2026_03", date: "2026-09-02" });
  });
  it.each(["<h1>Cloudflare challenge</h1>", source().replace("2026_03", "2026_02"), source("2026_03", "2026-02-30"), source() + source("2026_02")])("rejects missing/ambiguous/invalid metadata %#", value => {
    expect(() => parseRelease(value)).toThrow();
  });
  it("discovers current metadata without conflating Rhea and ChEBI versions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(html()));
    expect(await api({ method: "GET", path: "/sparql/release" })).toMatchObject({ data: { release: "2026_03", date: "2026-09-02", chebi_release: null, description_sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } });
  });
  it("retains the complete RDF envelope, language/types, hashes and generated query", async () => {
    const raw = { ...envelope(), extensions: { provider: "fixture" } }; const fetcher = setup(raw);
    const result = await api({ method: "GET", path: "/sparql/reaction", params });
    expect(result).toMatchObject({ status: 200, data: { ...raw, _rhea: { release: { release: "2026_03" }, chebi_release: null, federation: null, returned_rows: 1, at_limit: false, continuation: null } } });
    expect(fetcher).toHaveBeenCalledTimes(3);
    const url = new URL(fetcher.mock.calls[1][0]);
    expect(url.origin).toBe("https://sparql.rhea-db.org"); expect(url.searchParams.get("query")).toBe(makeQuery("/sparql/reaction", params).query);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ redirect: "manual", headers: { Accept: "application/sparql-results+json" } });
  });
  it("pins bounded continuation and treats at-limit as possible, not certain, incompleteness", async () => {
    setup();
    const result = await api({ method: "GET", path: "/sparql/reaction", params: { ...params, limit: 1 } });
    expect(result).toMatchObject({ data: { _rhea: { at_limit: true, continuation: { ...params, limit: 1, offset: 1, expected_release: "2026_03" } } } });
  });
  it("preserves an empty page without claiming biological absence", async () => {
    setup(envelope("/sparql/reaction", params, []));
    expect(await api({ method: "GET", path: "/sparql/reaction", params })).toMatchObject({ data: { results: { bindings: [] }, _rhea: { returned_rows: 0, completeness: expect.stringContaining("do not prove biological absence") } } });
  });
  it("checks expected release before data fetch", async () => {
    const fetcher = setup();
    await expect(api({ method: "GET", path: "/sparql/reaction", params: { ...params, expected_release: "2026_02" } })).rejects.toMatchObject({ status: 409 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects mid-query release drift", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(html()).mockResolvedValueOnce(json(envelope())).mockResolvedValueOnce(html("2026_04")));
    await expect(api({ method: "GET", path: "/sparql/reaction", params })).rejects.toMatchObject({ status: 409 });
  });
  it("retains federated identifiers and does not claim UniProt is pinned", async () => {
    const p = { ...params, reviewed: true, taxon_id: 9606 };
    const binding = { rhea: row.rhea, uniprot: uri("http://purl.uniprot.org/uniprot/P21399"), annotation: { type: "bnode", value: "ann1" }, activity: { type: "bnode", value: "act1" }, reviewed: literal("1", { datatype: "http://www.w3.org/2001/XMLSchema#boolean" }), taxon: uri("http://purl.uniprot.org/taxonomy/9606"), equation: row.object };
    setup(envelope("/sparql/uniprot", p, [binding]));
    expect(await api({ method: "GET", path: "/sparql/uniprot", params: p })).toMatchObject({ data: { results: { bindings: [binding] }, _rhea: { federation: { release: null } } } });
  });
});

describe("failed, partial and inconsistent results", () => {
  it.each([
    { errors: ["remote timeout"], ...envelope() },
    { head: { vars: ["rhea"] }, results: { bindings: [] } },
    { head: { vars: ["rhea", "predicate", "object"] }, results: { bindings: [row, row] } },
    envelope("/sparql/reaction", params, [{}]),
    envelope("/sparql/reaction", params, [{ ...row, rhea: uri("http://rdf.rhea-db.org/99999") }]),
    envelope("/sparql/reaction", params, [{ ...row, object: { type: "literal", value: 5 } }]),
  ])("rejects misleading result bodies %#", async payload => {
    setup(payload);
    await expect(api({ method: "GET", path: "/sparql/reaction", params: { ...params, limit: 1 } })).rejects.toMatchObject({ status: 502 });
  });
  it("rejects exact ChEBI mismatches", async () => {
    const p = { chebi_id: "CHEBI:29985", match: "exact" };
    setup(envelope("/sparql/chebi", p, [{ requestedChebi: uri("http://purl.obolibrary.org/obo/CHEBI_29985"), chebi: uri("http://purl.obolibrary.org/obo/CHEBI_15377"), rhea: row.rhea, equation: row.object, mapping: literal("direct") }]));
    await expect(api({ method: "GET", path: "/sparql/chebi", params: p })).rejects.toMatchObject({ status: 502 });
  });
  it.each([new Response("<html>Timeout</html>"), new Response("{broken", { headers: { "content-type": "application/json" } }), new Response("timeout", { status: 504 })])("rejects provider errors and non-JSON bodies %#", async response => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(html()).mockResolvedValueOnce(response));
    await expect(api({ method: "GET", path: "/sparql/reaction", params })).rejects.toThrow();
  });
  it("caps UTF-8 bytes and rejects rather than truncates", async () => {
    const payload = envelope("/sparql/reaction", params, [{ ...row, object: literal("α".repeat(1_100_000)) }]);
    setup(payload);
    await expect(api({ method: "GET", path: "/sparql/reaction", params })).rejects.toThrow(/exceeds/);
  });
  it("never silently converts update requests into reads", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(api({ method: "POST", path: "/sparql/reaction", body: "DELETE WHERE {}", params })).rejects.toMatchObject({ status: 405 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("retains existing native search routing and forced JSON", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ results: [{ "rhea-id": "RHEA:10336" }], count: 1 })); vi.stubGlobal("fetch", fetcher);
    expect(await api({ method: "GET", path: "/rhea", params: { query: "RHEA:10336", format: "xml" } })).toMatchObject({ data: { count: 1 } });
    const url = new URL(String(fetcher.mock.calls[0][0])); expect(url.origin).toBe("https://www.rhea-db.org"); expect(url.searchParams.get("format")).toBe("json");
  });
});
