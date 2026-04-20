import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

/**
 * Rhea (https://www.rhea-db.org) — expert-curated database of biochemical
 * reactions.
 *
 * IMPORTANT: Rhea's non-`/rhea` paths (`/reaction`, `/ec/...`, `/chebi/...`,
 * `/uniprot/...`, `/go/...`, `/kegg/...`, `/compound`) are served by the
 * public web site, NOT the search API, and upstream returns HTTP 403
 * (Cloudflare Turnstile) when called directly. We removed them from the
 * catalog. For all those use-cases, drive them through `/rhea?query=...`
 * with the right term:
 *
 *   - EC number:     /rhea?query=EC%202.7.1.1
 *   - ChEBI:         /rhea?query=CHEBI:15377   (or compound name)
 *   - UniProt:       /rhea?query=UNIPROT:P00734
 *   - GO:            /rhea?query=GO:0004672
 *   - KEGG:          /rhea?query=KEGG:R00703
 *   - Reaction ID:   /rhea?query=RHEA:47148
 *   - Compound name: /rhea?query=caffeine
 *
 * `/rhea` returns `{ count, limit, offset, results: [...] }` and the adapter
 * forces `format=json` by default. Large list results auto-stage at >30KB.
 */
export const rheaCatalog: ApiCatalog = {
	name: "Rhea",
	baseUrl: "https://www.rhea-db.org",
	version: "1.0",
	auth: "none",
	endpointCount: 1,
	notes:
		"- /rhea is the ONLY supported endpoint. Use it for ALL lookups (free text, EC, ChEBI, UniProt, GO, KEGG, RHEA IDs).\n" +
		"- `format=json` is forced by the adapter. Do NOT override with format=rdf/turtle/xml — upstream fronts those paths with Cloudflare Turnstile and returns 403.\n" +
		"- `columns` picks output fields (rhea-id, equation, ec, chebi-id, chebi, uniprot, etc.).\n" +
		"- Typical result shape: { count, limit, offset, results: [...] } — flatten via `record_path=results`.\n" +
		"- Rhea's /reaction, /ec/*, /chebi/*, /uniprot/*, /go/*, /kegg/*, /compound paths are web-only and NOT in this catalog — use /rhea?query=... instead.",
	endpoints: [
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
						"Comma-separated fields (e.g. 'rhea-id,equation,ec,chebi-id,uniprot'). Reduce to avoid large htmlequation blobs that push staging.",
				},
				{ name: "limit", type: "number", required: false, description: "Max results per page (default 25)" },
				{ name: "offset", type: "number", required: false, description: "Page offset for pagination" },
				{
					name: "format",
					type: "string",
					required: false,
					description:
						"Response format. Do NOT override — the adapter forces json; other values hit a Cloudflare 403.",
					enum: ["json"],
				},
			],
		},
	],
};
