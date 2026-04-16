import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { rheaFetch } from "./http";

/**
 * Create an ApiFetchFn that routes every call through rheaFetch.
 * The fetch helper always forces `format=json` so Rhea doesn't return RDF.
 */
export function createRheaApiFetch(): ApiFetchFn {
    return async (request) => {
        const response = await rheaFetch(request.path, request.params);

        if (!response.ok) {
            let errorBody: string;
            try {
                errorBody = await response.text();
            } catch {
                errorBody = response.statusText;
            }
            const error = new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`) as Error & {
                status: number;
                data: unknown;
            };
            error.status = response.status;
            error.data = errorBody;
            throw error;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("json")) {
            const text = await response.text();
            return { status: response.status, data: text };
        }

        const data = await response.json();
        return { status: response.status, data };
    };
}
