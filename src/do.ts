import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export class RheaDataDO extends RestStagingDO {
    protected getTabularData(value: unknown): unknown {
        const data = record(value) && Array.isArray(value.content) && record(value.structuredContent) && "data" in value.structuredContent
            ? value.structuredContent.data : value;
        if (record(data) && typeof data.sql === "string" && Array.isArray(data.rows)) return {query_rows:data.rows.map(native => ({native}))};
        if (record(data) && record(data.results) && Array.isArray(data.results.bindings)) return {bindings:data.results.bindings};
        if (record(data) && Array.isArray(data.results)) return {reactions:data.results};
        if (Array.isArray(data) && record(data[0]) && ("id" in data[0] || "rhea-id" in data[0])) return {reactions:data};
        return data;
    }

}
