import type { Completeness } from "@bio-mcp/shared";
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

function directCompleteness(data: unknown): Completeness | undefined {
  if (!record(data) || data.__staged === true) return undefined;
  let rows: unknown[] | undefined;
  if (record(data.results) && Array.isArray(data.results.bindings)) rows = data.results.bindings;
  else if (Array.isArray(data.results)) rows = data.results;
  if (!rows) return undefined;
  return {complete:false,returned:rows.length,
    truncation:{reason:"unknown",detail:"This bounded native search or RDF binding page does not establish complete query coverage.",remedy:"Retain filters, offsets, native page counts and observed source releases while traversing. Legacy JSON count reports the page size, not an authoritative total. RDF binding counts are not unique reaction counts. Live or federated pages are not an atomic snapshot, and chemical-class membership is not exact identity."}};
}

/** Preserve native coverage limits when a program returns composed evidence. */
export function rheaCompleteness(data: unknown): Completeness | undefined {
  const observations: Completeness[] = [];
  const pending = [data];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    const direct = directCompleteness(value);
    if (direct) { observations.push(direct); continue; }
    if (record(value) && value.__staged === true) {
      const staging = value._staging;
      if (record(staging) && record(staging.completeness) && staging.completeness.complete === false)
        observations.push({ ...staging.completeness, complete: false });
      continue;
    }
    for (const child of Object.values(value)) pending.push(child);
  }
  if (observations.length === 0) return undefined;
  if (observations.length === 1) return observations[0];
  return { complete: false, truncation: { reason: "unknown",
    detail: "Composed Rhea evidence includes multiple native observations with unverified coverage.",
    remedy: "Retain the native identifiers, counts, page bounds and source metadata of each native response separately." } };
}
