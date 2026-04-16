import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

/**
 * Rhea (https://www.rhea-db.org) — expert-curated database of biochemical
 * reactions. Public API returns RDF/XML by default; we force `format=json`
 * through the fetch layer so Code Mode always sees structured data.
 */
export const rheaCatalog: ApiCatalog = {
    name: "Rhea",
    baseUrl: "https://www.rhea-db.org",
    version: "1.0",
    auth: "none",
    endpointCount: 9,
    notes:
        "- `format=json` is forced by the adapter — override to xlsx/tsv/rdf if needed.\n" +
        "- Search is the workhorse endpoint: `/rhea` with `query=<term>` (free text, compound name, EC number, or RHEA:<id>).\n" +
        "- Reaction detail: `/reaction?id=RHEA:<id>` returns the same shape as a single-hit search.\n" +
        "- `columns` on `/rhea` picks output fields (e.g. `rhea-id,equation,ec,chebi-id,uniprot`).\n" +
        "- Cross-reference endpoints (/ec/, /chebi/, /uniprot/) take the raw external accession.\n" +
        "- Typical result shape: `{ count, limit, offset, results: [...] }` — use `record_path=results` downstream.",
    endpoints: [
        // ===================================================================
        // Search & reaction discovery
        // ===================================================================
        {
            method: "GET",
            path: "/rhea",
            summary: "Search Rhea reactions by free text, compound, EC number, or RHEA ID",
            category: "search",
            queryParams: [
                { name: "query", type: "string", required: true, description: "Search term — compound name, EC number, RHEA ID (e.g. 'caffeine', 'EC 2.7.1.1', 'RHEA:47148')" },
                { name: "columns", type: "string", required: false, description: "Comma-separated fields (e.g. 'rhea-id,equation,ec,chebi-id,uniprot')" },
                { name: "limit", type: "number", required: false, description: "Max results per page (default 25)" },
                { name: "offset", type: "number", required: false, description: "Page offset for pagination" },
                { name: "format", type: "string", required: false, description: "Response format", enum: ["json", "tsv", "rdf", "xlsx"] },
            ],
        },
        {
            method: "GET",
            path: "/reaction",
            summary: "Retrieve a single reaction record by RHEA ID",
            category: "reaction",
            queryParams: [
                { name: "id", type: "string", required: true, description: "RHEA ID (e.g. 'RHEA:47148' or bare '47148')" },
                { name: "format", type: "string", required: false, description: "Response format", enum: ["json", "tsv", "rdf"] },
            ],
        },

        // ===================================================================
        // Cross-references (upstream identifiers → Rhea reactions)
        // ===================================================================
        {
            method: "GET",
            path: "/ec/{ec_number}",
            summary: "List Rhea reactions catalyzed by an Enzyme Commission (EC) number",
            category: "crossref",
            pathParams: [
                { name: "ec_number", type: "string", required: true, description: "EC number without prefix (e.g. '2.7.1.1')" },
            ],
        },
        {
            method: "GET",
            path: "/chebi/{chebi_id}",
            summary: "List Rhea reactions involving a ChEBI compound",
            category: "crossref",
            pathParams: [
                { name: "chebi_id", type: "string", required: true, description: "ChEBI accession (bare number, e.g. '15377' for water)" },
            ],
        },
        {
            method: "GET",
            path: "/uniprot/{uniprot_id}",
            summary: "List Rhea reactions catalyzed by a UniProtKB protein",
            category: "crossref",
            pathParams: [
                { name: "uniprot_id", type: "string", required: true, description: "UniProtKB accession (e.g. 'P00734')" },
            ],
        },
        {
            method: "GET",
            path: "/go/{go_id}",
            summary: "List Rhea reactions linked to a Gene Ontology term",
            category: "crossref",
            pathParams: [
                { name: "go_id", type: "string", required: true, description: "GO ID with or without prefix (e.g. 'GO:0004672' or '0004672')" },
            ],
        },
        {
            method: "GET",
            path: "/kegg/{kegg_id}",
            summary: "List Rhea reactions cross-referenced to a KEGG reaction or compound",
            category: "crossref",
            pathParams: [
                { name: "kegg_id", type: "string", required: true, description: "KEGG reaction (R-prefixed) or compound ID" },
            ],
        },

        // ===================================================================
        // Controlled vocabularies / metadata
        // ===================================================================
        {
            method: "GET",
            path: "/compound",
            summary: "Search Rhea-used ChEBI compounds by name or identifier",
            category: "metadata",
            queryParams: [
                { name: "query", type: "string", required: true, description: "Compound name or ChEBI accession" },
                { name: "limit", type: "number", required: false, description: "Max results (default 25)" },
            ],
        },
        {
            method: "GET",
            path: "/release",
            summary: "Return current Rhea release version, date, and statistics",
            category: "metadata",
        },
    ],
};
