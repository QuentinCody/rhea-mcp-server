import { fail, hash, object, readNativeText } from "./response";
import { makeQuery, releasePin, type Params } from "./sparql-query";
const ENDPOINT = "https://sparql.rhea-db.org/sparql";
const DESCRIPTION = "https://sparql.rhea-db.org/.well-known/void";

export function parseRelease(html: string) {
  const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ");
  const title = [...text.matchAll(/SPARQL Rhea (\d{4}_\d{2})\b/g)].map(match => match[1]);
  const dated = [...text.matchAll(/Rhea data of release (\d{4}_\d{2})\s*\((\d{4}-\d{2}-\d{2})\)/g)];
  if (!title.length || !dated.length || new Set([...title, ...dated.map(match => match[1])]).size !== 1 || new Set(dated.map(match => match[2])).size !== 1) fail("Rhea service description has no unambiguous release/date; cannot establish release provenance", 502);
  const date = dated[0][2];
  if (Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail("Rhea service description has an invalid release date", 502);
  return { release: dated[0][1], date, source_url: DESCRIPTION, statement: dated[0][0] };
}
async function fetchText(url: string, accept: string, deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) fail("Rhea SPARQL workflow exceeded its 45-second HTTP budget", 504);
  let response: Response;
  try { response = await fetch(url, { headers: { Accept: accept, "User-Agent": "rhea-mcp-server/1.0 (bio-mcp)" }, redirect: "manual", signal: AbortSignal.timeout(remaining) }); }
  catch { fail("Rhea SPARQL request failed or timed out", 502); }
  return {text:await readNativeText(response,deadline),contentType:response.headers.get("content-type") ?? ""};
}
async function release(deadline: number) {
  const response = await fetchText(DESCRIPTION, "text/html", deadline);
  const data = parseRelease(response.text);
  return { ...data, description_sha256: await hash(response.text), hash_scope: "UTF-8 JSON.stringify of the service-description HTML string" };
}
function validateResult(raw: unknown, variables: string[], limit: number) {
  const payload = object(raw);
  if (payload.error !== undefined || payload.errors !== undefined || payload.boolean !== undefined) fail("SPARQL response is not a successful SELECT result", 502);
  const head = object(payload.head);
  const returnedVars = head.vars;
  if (!Array.isArray(returnedVars) || returnedVars.length !== variables.length || new Set(returnedVars).size !== variables.length || variables.some(key => !returnedVars.includes(key))) fail("SPARQL response variables disagree with the query", 502);
  const results = object(payload.results);
  if (!Array.isArray(results.bindings) || results.bindings.length > limit) fail("SPARQL response has invalid or over-limit bindings", 502);
  for (const value of results.bindings) {
    const row = object(value);
    for (const name of variables) if (!["name", "coefficient", "position", "status", "reactivePart", "coefficientPredicate", "sideOrder"].includes(name) && row[name] === undefined) fail("SPARQL result lacks a required binding", 502);
    for (const [name, rawTerm] of Object.entries(row)) {
      const term = object(rawTerm);
      if (!variables.includes(name) || !["uri", "bnode", "literal", "typed-literal"].includes(String(term.type)) || typeof term.value !== "string" || (term.datatype !== undefined && typeof term.datatype !== "string") || (term["xml:lang"] !== undefined && typeof term["xml:lang"] !== "string")) fail("SPARQL binding is malformed", 502);
    }
  }
  return { payload, rows: results.bindings as Record<string, unknown>[] };
}
function uri(row: Record<string, unknown>, key: string) {
  const term = object(row[key]);
  if (term.type !== "uri" || typeof term.value !== "string") fail(`SPARQL binding lacks ${key} URI`, 502);
  return term.value;
}
export async function sparql(path: string, params: Params) {
  if (path === "/sparql/release") {
    for (const key of Object.keys(params)) if (key !== "expected_release") fail(`Unsupported release parameter: ${key}`);
    releasePin(params.expected_release);
    const observed = await release(Date.now() + 45_000);
    if (params.expected_release && params.expected_release !== observed.release) fail("Rhea SPARQL release differs from expected_release", 409);
    return { ...observed, retrieved_at: new Date().toISOString(), endpoint: ENDPOINT, chebi_release: null,
      note: "SPARQL release labels differ from website release numbers. ChEBI is the provider's matching snapshot; its independent version is not established by this description. No historical endpoint selection.",
      downloads: "https://www.rhea-db.org/help/download" };
  }
  const request = makeQuery(path, params);
  const deadline = Date.now() + 45_000;
  const before = await release(deadline);
  if (params.expected_release && params.expected_release !== before.release) fail("Rhea SPARQL release differs from expected_release", 409);
  return await readSparqlEvidence(request, deadline, path, params, before);
}

async function readSparqlEvidence(request: { query: string; variables: string[]; limit: number; offset: number; selected: string; }, deadline: number, path: string, params: Params, before: { description_sha256: string; hash_scope: string; release: string; date: string; source_url: string; statement: string; }) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("query", request.query);
  const response = await fetchText(url.href, "application/sparql-results+json", deadline);
  if (!/\b(?:application\/sparql-results\+json|application\/json)\b/i.test(response.contentType)) fail("Rhea did not return SPARQL JSON", 502, { response: response.text });
  let raw: unknown;
  try { raw = JSON.parse(response.text.replace(/^\uFEFF/, "")); } catch { fail("Rhea returned invalid SPARQL JSON", 502, { response: response.text }); }
  const { payload, rows } = validateResult(raw, request.variables, request.limit);
  validateSelectedRows(rows, path, request, params);
  const after = await release(deadline);
  if (before.release !== after.release || before.date !== after.date) fail("Rhea SPARQL release changed during retrieval; retry", 409);
  return {
    ...payload, _rhea: {
      source_url: ENDPOINT, retrieved_at: new Date().toISOString(), query: request.query,
      release: before, release_after: after, chebi_release: null,
      response_sha256: await hash(payload), hash_scope: "JSON.stringify of the complete SPARQL JSON envelope before adapter metadata",
      limit: request.limit, offset: request.offset, returned_rows: rows.length, at_limit: rows.length === request.limit,
      continuation: rows.length === request.limit && request.offset + request.limit <= 10000 ? { ...params, limit: request.limit, offset: request.offset + request.limit, expected_release: before.release } : null,
      completeness: "Bounded ordered SELECT; no authoritative total. A full page may have more rows. Offset pages are observations, not an atomic snapshot; empty results do not prove biological absence.",
      federation: path === "/sparql/uniprot" ? { endpoint: "https://sparql.uniprot.org/sparql", release: null, note: "Live federated annotation join. Rhea release checks do not pin UniProt or prove cross-source synchronization. Exact reaction direction is retained; no quartet normalization." } : null,
      interpretation: "RDF terms retain datatype/language and unbound values. Reaction direction, side and chemical-class/microspecies distinctions must not be collapsed. An annotation or chemical match does not establish activity in a biological context.",
    }
  };
}

function validateSelectedRows(rows: Record<string, unknown>[], path: string, request: { query: string; variables: string[]; limit: number; offset: number; selected: string; }, params: Params) {
  for (const row of rows) {
    if (uri(row, path === "/sparql/chebi" ? "requestedChebi" : "rhea") !== request.selected) fail("SPARQL returned an unrequested identifier", 502);
    if (path === "/sparql/chebi" && params.match === "exact" && uri(row, "chebi") !== request.selected) fail("Exact ChEBI query returned a different compound", 502);
    if (path === "/sparql/uniprot") {
      if (params.taxon_id !== undefined && uri(row, "taxon") !== `http://purl.uniprot.org/taxonomy/${params.taxon_id}`) fail("SPARQL returned an unrequested taxon", 502);
      if (params.reviewed !== undefined) {
        const term = object(row.reviewed);
        const valid = params.reviewed ? ["true", "1"] : ["false", "0"];
        if (term.type !== "literal" && term.type !== "typed-literal" || term.datatype !== "http://www.w3.org/2001/XMLSchema#boolean" || !valid.includes(String(term.value))) fail("SPARQL returned an inconsistent reviewed flag", 502);
      }
    }
  }
}
