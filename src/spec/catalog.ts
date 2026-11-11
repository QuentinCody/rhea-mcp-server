import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";
import { sparqlEndpoints, sparqlWorkflows } from "./sparql";

export const rheaCatalog: ApiCatalog = {
	name: "Rhea",
	baseUrl: "https://www.rhea-db.org",
	version: "1.0",
	auth: "none",
	endpointCount: 1 + sparqlEndpoints.length,
	notes:
        "Existing /rhea JSON search is retained. Provider REST documentation primarily describes TSV; native JSON returns count/results with id/equation/status fields. Observed count equals the returned page size, not a global total. Offset is forwarded; live pages are not a pinned snapshot. " +
        "The adapter-owned /sparql/* routes use documented fixed read queries on the separate Rhea SPARQL host. Preserve RDF terms and release/continuation metadata; do not flatten away staging handles. " +
        "SPARQL has the provider's matching ChEBI snapshot; federated UniProt remains live and independently versioned. No arbitrary SPARQL updates or SERVICE hosts are accepted.",
    workflows: sparqlWorkflows,
	endpoints: [
        ...sparqlEndpoints,
		{
			method: "GET",
			path: "/rhea",
			summary:
				"Universal Rhea search — use for free text, compound names, EC numbers, ChEBI/UniProt/GO/KEGG/RHEA identifiers. Replaces the deprecated /reaction, /ec/{id}, /chebi/{id}, /uniprot/{id}, /go/{id}, /kegg/{id}, /compound endpoints.",
			category: "search",
			queryParams: [
				{
					name: "query",
					type: "string",
					required: true,
					description:
						"Search term. Supports free text ('caffeine'), EC ('EC 2.7.1.1'), identifiers (RHEA:47148, CHEBI:15377, UNIPROT:P00734, GO:0004672, KEGG:R00703).",
				},
				{
					name: "columns",
					type: "string",
					required: false,
					description:
						"Comma-separated fields (rhea-id,equation,ec,chebi-id,uniprot). The documented uniprot column is a protein count, not accessions; use /sparql/uniprot for identifiers.",
				},
				{ name: "limit", type: "number", required: false, description: "Requested result limit; native count reflects this page, not all matching reactions" },
				{ name: "offset", type: "number", required: false, description: "Native JSON offset; observed five-row pages advance correctly. Not documented in the public TSV contract or an atomic snapshot guarantee" },
				{
					name: "format",
					type: "string",
					required: false,
					description:
						"Legacy search forces json. The provider also documents TSV downloads; this route does not expose them.",
					enum: ["json"],
				},
			],
		},
	],
};
