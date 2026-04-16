import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class RheaDataDO extends RestStagingDO {
    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        const obj = data as Record<string, unknown>;

        // Rhea search responses look like: { count, limit, offset, results: [...] }
        if (Array.isArray((obj as { results?: unknown[] }).results)) {
            const sample = (obj.results as unknown[])[0];
            if (sample && typeof sample === "object") {
                return {
                    tableName: "reactions",
                    indexes: ["rhea-id", "ec", "equation"],
                };
            }
        }

        if (Array.isArray(data)) {
            const sample = data[0];
            if (sample && typeof sample === "object" && ("rhea-id" in sample || "id" in sample)) {
                return {
                    tableName: "reactions",
                    indexes: ["rhea-id", "ec"],
                };
            }
        }

        return undefined;
    }
}
