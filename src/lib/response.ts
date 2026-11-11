import { readResponseBytes, decodeResponseText } from "@bio-mcp/shared/http/response-reader";
export function fail(message: string, status = 400, data?: unknown): never {
  throw Object.assign(new Error(message), { status, ...(data === undefined ? {} : { data }) });
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Provider returned an invalid object", 502);
  return value as Record<string, unknown>;
}
export async function hash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
/** Bound headers and body with the caller's remaining workflow budget. */
export async function readText(response: Response, deadline = Date.now() + 30_000): Promise<string> {
  const bytes = await readResponseBytes(response, {label:"Rhea",maxBytes:2 * 1024 * 1024,timeoutMs:deadline - Date.now()});
  return decodeResponseText(bytes,"Rhea");
}

export async function readNativeText(response: Response, deadline: number): Promise<string> {
  let text: string;
  try { text = await readText(response,deadline); }
  catch (error) {
    if (!response.ok) fail(`Rhea HTTP ${response.status}`,response.status,{http_status:response.status,body_unavailable:true,body_error:error instanceof Error ? error.message : String(error)});
    throw error;
  }
  if (!response.ok) fail(`Rhea HTTP ${response.status}`,response.status,{response:text});
  return text;
}
