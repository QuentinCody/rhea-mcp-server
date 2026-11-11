import { fail } from "./response";
export type Params = Record<string, unknown>;
const prefixes = `PREFIX rh: <http://rdf.rhea-db.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX up: <http://purl.uniprot.org/core/>
PREFIX CHEBI: <http://purl.obolibrary.org/obo/CHEBI_>`;
const participant = `?side rh:contains ?participant . ?participant rh:compound ?compound .
{ ?compound rh:chebi ?chebi . BIND("direct" AS ?mapping) }
UNION { ?compound rh:reactivePart ?reactivePart . ?reactivePart rh:chebi ?chebi . OPTIONAL { ?reactivePart rh:position ?position } BIND("reactive_part" AS ?mapping) }
UNION { ?compound rh:underlyingChebi ?chebi . BIND("polymer_underlying" AS ?mapping) }`;
export const operations = ["/sparql/reaction", "/sparql/participants", "/sparql/chebi", "/sparql/uniprot"];
function integer(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) fail(`${name} must be an integer from ${min} to ${max}`);
  return value;
}
function id(value: unknown, namespace: "RHEA" | "CHEBI"): string {
  const pattern = namespace === "RHEA" ? /^RHEA:[1-9][0-9]{0,9}$/ : /^CHEBI:[1-9][0-9]{0,9}$/;
  if (typeof value !== "string" || !pattern.test(value)) fail(`Use an exact ${namespace}:number identifier`);
  return value.slice(namespace.length + 1);
}
export function releasePin(value: unknown) {
  if (value !== undefined && (typeof value !== "string" || !/^\d{4}_\d{2}$/.test(value))) fail("expected_release must be the SPARQL YYYY_NN label, not a website release number");
}
export function makeQuery(path: string, params: Params) {
  if (!operations.includes(path)) fail("Unknown Rhea SPARQL operation", 404);
  const extras = path === "/sparql/chebi" ? ["chebi_id", "match"] : path === "/sparql/uniprot" ? ["rhea_id", "taxon_id", "reviewed"] : ["rhea_id"];
  const allowed = new Set(["limit", "offset", "expected_release", ...extras]);
  for (const key of Object.keys(params)) if (!allowed.has(key)) fail(`Unsupported SPARQL parameter: ${key}`);
  const limit = integer(params.limit ?? 50, 1, 200, "limit");
  const offset = integer(params.offset ?? 0, 0, 10_000, "offset");
  releasePin(params.expected_release);
  if (offset && !params.expected_release) fail("Continuation requires expected_release from the previous page");
  let vars: string;
  let body: string;
  let selected: string;
  if (path === "/sparql/chebi") {
    selected = `http://purl.obolibrary.org/obo/CHEBI_${id(params.chebi_id, "CHEBI")}`;
    if (params.match !== "exact" && params.match !== "descendants") fail("Select match=exact or descendants explicitly");
    vars = "requestedChebi chebi rhea equation status mapping";
    body = `VALUES ?requestedChebi { <${selected}> }
?rhea rdfs:subClassOf rh:Reaction ; rh:equation ?equation .
?rhea rh:side ?side .
${participant}
${params.match === "exact" ? `VALUES ?chebi { <${selected}> }` : "?chebi rdfs:subClassOf* ?requestedChebi ."}
OPTIONAL { ?rhea rh:status ?status }`;
  } else {
    selected = `http://rdf.rhea-db.org/${id(params.rhea_id, "RHEA")}`;
    const values = `VALUES ?rhea { <${selected}> }`;
    if (path === "/sparql/reaction") {
      vars = "rhea predicate object";
      body = `${values} ?rhea ?predicate ?object .`;
    } else if (path === "/sparql/participants") {
      vars = "rhea side participant compound mapping chebi name coefficient position reactivePart coefficientPredicate sideOrder sideRelation";
      body = `${values}
VALUES ?sideRelation { rh:side rh:substrates rh:products rh:substratesOrProducts }
?rhea ?sideRelation ?side .
${participant}
OPTIONAL { ?chebi up:name ?name }
OPTIONAL { ?side ?coefficientPredicate ?participant . ?coefficientPredicate rh:coefficient ?coefficient }
OPTIONAL { ?side rh:curatedOrder ?sideOrder }`;
    } else {
      if (params.reviewed !== undefined && typeof params.reviewed !== "boolean") fail("reviewed must be a boolean when supplied");
      const taxon = params.taxon_id === undefined ? undefined : integer(params.taxon_id, 1, 2_147_483_647, "taxon_id");
      vars = "rhea uniprot annotation activity reviewed taxon equation";
      // Values live INSIDE SERVICE so the remote join is restricted to one exact reaction.
      // No SERVICE SILENT: a federation failure must never look like absent annotations.
      body = `SERVICE <https://sparql.uniprot.org/sparql> {
${values}
?uniprot up:annotation ?annotation ; up:reviewed ?reviewed ; up:organism ?taxon .
?annotation up:catalyticActivity ?activity . ?activity up:catalyzedReaction ?rhea .
${params.reviewed === undefined ? "" : `VALUES ?reviewed { ${params.reviewed} }`}
${taxon === undefined ? "" : `VALUES ?taxon { <http://purl.uniprot.org/taxonomy/${taxon}> }`}
}
?rhea rh:equation ?equation .`;
    }
  }
  const variables = vars.split(" ");
  const selection = variables.map(value => `?${value}`).join(" ");
  return { query: `${prefixes}\nSELECT DISTINCT ${selection} WHERE {\n${body}\n}\nORDER BY ${selection}\nLIMIT ${limit}\nOFFSET ${offset}`, variables, limit, offset, selected };
}
