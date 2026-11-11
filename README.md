# rhea-mcp-server

MCP access to [Rhea](https://www.rhea-db.org), including its public [SPARQL service](https://sparql.rhea-db.org/sparql) and matching ChEBI snapshot. No API key is required.

- Local port: `8886`
- Tools: `rhea_search`, `rhea_execute`, `rhea_query_data`, `rhea_get_schema`, each also registered with the `mcp_` prefix.
- Existing `/rhea` JSON search remains available. The [public REST guide](https://www.rhea-db.org/help/rest-api) principally documents TSV; the legacy JSON route retains its native `count` and `results` envelope. Observed `count` follows the returned page size; it is not a total match count. Its documented `uniprot` column counts proteins; it does not list their accessions.

## SPARQL operations

These are **adapter-owned routes**, exposed through Code Mode `api.get()`. They generate fixed read queries for the separate SPARQL host.

| Route | Required parameters | Purpose |
| --- | --- | --- |
| `/sparql/release` | None | Observe release/date from the provider service description |
| `/sparql/reaction` | `rhea_id` | Raw predicate/object rows for an exact reaction, including direction/citation/status links when present |
| `/sparql/participants` | `rhea_id` | Participant/side/compound/ChEBI joins with mapping type, native side relation, coefficient predicate and reactive-part position |
| `/sparql/chebi` | `chebi_id`, `match` | Find reactions with an exact ChEBI identifier or inclusive chemical-class descendants |
| `/sparql/uniprot` | `rhea_id` | Federated protein/catalytic-activity annotation join, optionally filtered by `taxon_id` and boolean `reviewed` |

Use prefixed identifiers such as `RHEA:10336` and `CHEBI:29985`. `match` must explicitly be `exact` or `descendants`. Taxon filtering matches the exact NCBI taxon, without descendant expansion. Omitting `reviewed` retains both UniProt categories.

For example:

```javascript
return await api.get("/sparql/participants", {
  rhea_id: "RHEA:10336",
  limit: 100,
});
```

The catalog includes five executable recipes. Return API results intact so errors, release metadata and staging handles remain available.

## Provenance and interpretation

The [service description](https://sparql.rhea-db.org/.well-known/void) identifies the SPARQL release and date. Its `YYYY_NN` label differs from the website's numeric release. Discovery returns the observed statement and a hash of the description; no release is hard-coded. The adapter checks the label/date before and after data retrieval. Optional `expected_release` detects drift; it cannot select a historical endpoint. Malformed or ambiguous release metadata fails explicitly.

The endpoint contains a ChEBI snapshot matching Rhea. Its independent ChEBI version remains unknown; do not silently join to today's ChEBI as if it were the same release. [Bulk archives](https://www.rhea-db.org/help/download) provide historical data separately; bulk ingestion is not implemented here.

RDF terms retain URI/blank-node/literal types, datatypes, language tags and unbound optional values. The participant join distinguishes direct compounds, reactive parts and polymer
underlying ChEBI. `sideRelation` retains the native `side`, `substrates`, `products`
or `substratesOrProducts` predicate for the exact requested reaction. It does not
convert a directional identifier to its master. `coefficientPredicate` links the
side to its participant (for example, `contains1` or `containsN`); `coefficient`
preserves that predicate's native literal, including symbolic `N`. `sideOrder`
is the native curated order, not a substrate/product classification. `reactivePart`
and its optional `position` retain distinct sites such as `C1` and `C2`.
Several reactive-part rows can describe the same participant and repeat its
coefficient; do not sum those rows as separate stoichiometric participants.
Missing or symbolic coefficients are not zeros. Undefined-direction reaction
sides are not substrate/product assignments. Exact chemical identity, chemical-class membership and protonation/microspecies mappings are distinct concepts; the adapter performs no implicit conversion.

UniProt queries use the provider-documented catalytic-activity path at a fixed `SERVICE` endpoint. Failures are not hidden with `SERVICE SILENT`. Protein, annotation, activity, organism and reviewed terms remain distinct. Rhea checks cannot pin the live UniProt release or prove cross-source synchronization, so the federated source release stays unknown. Exact reaction IDs retain their direction; no implicit quartet merging occurs. Annotation or chemical participation alone does not establish activity in a tissue or organism context.

## Bounds and validation

Data queries accept `limit` 1–200 (default 50) and `offset` 0–10000. Continuation requires the prior `expected_release`. Results include an ordered query, response hash, observed release, row count, `at_limit` and continuation parameters. A full page may have more rows; no authoritative total or atomic multi-page snapshot is claimed. Row counts are binding counts, not unique reactions. Empty pages do not demonstrate biological absence.

Upstream responses are capped at 2MiB, with a 45-second SPARQL HTTP budget. The deadline includes body reads and cancellation cannot extend it. Native HTTP
errors preserve their complete bounded bodies; unavailable error bodies retain the
HTTP status with an explicit explanation. Oversized or malformed responses fail
explicitly. Complete tool responses above 30KiB use shared staging, including
composed programs, SQL results and errors. Use `rhea_get_schema` before querying:
SPARQL rows materialize as `bindings`, legacy search records as `reactions`.
RDF values, types, datatypes and language tags remain separate columns; unbound
values remain absent in the original envelope. `payloads.root_json` and ordered
`content_chunks` retain the complete original response. SQL/schema outputs carry
verifiable citations, and conservative coverage metadata survives composition.

October 3 native checks observe SPARQL release `2026_03`, dated `2026-09-02`.
They exposed and repaired missing coefficients/reactive-part positions and empty
directional participant queries. Native `RHEA:10008` distinguishes two cysteine
reactive parts; `RHEA:10068` retains symbolic `N` coefficients. Exact ChEBI and
reviewed-category filters now bind their requested values directly, avoiding the
observed timeout of the original filter form. Provider latency can still vary.
Local validation includes real Durable Object/SQLite recovery, both aliases,
independent SPARQL parsing and RDF fixture execution. See the
[acceptance tracker](../../docs/plans/2026-09-26-upstream-api-implementation.md)
for final live coverage, repository gates and remaining limitations. Local
Workerd uses installed public CA roots with TLS verification; production has
not been deployed.

Start locally with `./scripts/dev-servers.sh rhea`.

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from Rhea and stays under the terms of that source: CC BY 4.0.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
