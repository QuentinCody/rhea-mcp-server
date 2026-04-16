import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const RHEA_BASE = "https://www.rhea-db.org";

export interface RheaFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    baseUrl?: string;
}

/**
 * Fetch from the Rhea reaction database REST API.
 * Rhea defaults to RDF for many endpoints, so always include `format=json`
 * as a default query param unless the caller overrides it.
 */
export async function rheaFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: RheaFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? RHEA_BASE;
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts?.headers ?? {}),
    };

    // Default to JSON; Rhea returns RDF/XML otherwise.
    const mergedParams: Record<string, unknown> = { format: "json", ...(params ?? {}) };

    return restFetch(baseUrl, path, mergedParams, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 30_000,
        userAgent: "rhea-mcp-server/1.0 (bio-mcp)",
    });
}
