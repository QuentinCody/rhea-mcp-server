import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { rheaFetch } from "./http";
import { rheaCompleteness } from "./completeness";
import { sparql } from "./sparql";
import { fail, readNativeText } from "./response";

export function createRheaApiFetch(): ApiFetchFn {
  return async request => {
    if (request.method.toUpperCase() !== "GET" || request.body !== undefined) fail("Rhea operations accept GET without a body", 405);
    if (request.path.startsWith("/sparql/")) {
      const data = await sparql(request.path, request.params ?? {});
      return {status:200,data,completeness:rheaCompleteness(data)};
    }
    const deadline = Date.now() + 30_000;
    const response = await rheaFetch(request.path, request.params, { deadlineMs: 30_000 });
    const text = await readNativeText(response,deadline);
    if (!(response.headers.get("content-type") ?? "").includes("json")) return { status: response.status, data: text };
    try { const data: unknown = JSON.parse(text.replace(/^\uFEFF/, "")); return { status: response.status, data, upstreamTotal:null, completeness:rheaCompleteness(data) }; }
    catch { fail("Rhea returned invalid JSON", 502, {response:text}); }
  };
}
