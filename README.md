# rhea-mcp-server

MCP server wrapping the [Rhea](https://www.rhea-db.org) biochemical reaction database.

- Upstream: `https://www.rhea-db.org`
- Port: `8886`
- Tools: `rhea_search`, `rhea_execute`, `rhea_query_data`, `rhea_get_schema`

The adapter forces `format=json` on every upstream request so Code Mode never
sees RDF/XML.

## Local dev

```bash
./scripts/dev-servers.sh rhea
```
