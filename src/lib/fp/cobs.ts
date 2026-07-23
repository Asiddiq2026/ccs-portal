// Canonical Financial-Promotion constants + pure validators shared by the
// submission route and the AR submit form (single source of truth). Only
// type-only imports from ./service, so this module has no runtime dependency
// and is safe to import from a client component.
import type { CobsItem, FpType } from "./service";

/** The promotion types an AR may submit. */
export const FP_TYPES: readonly FpType[] = [
  "RESEARCH",
  "TEASER",
  "DECK",
  "MARKETING",
  "ADVISORY",
] as const;

export function isFpType(v: string): v is FpType {
  return (FP_TYPES as readonly string[]).includes(v);
}

/**
 * Canonical COBS 4 self-certification checklist shown to the AR at submission.
 * The AR ticks each line; the ticked state is stored verbatim on the promotion
 * and later fed to the advisory AI review and the SMF's manual review.
 */
export const COBS_CHECKLIST: readonly string[] = [
  "Fair, clear and not misleading (COBS 4.2)",
  "Risk warnings prominent and balanced (COBS 4.5)",
  "Past performance not presented as a guide to the future (COBS 4.6)",
  "Costs, charges and fees clearly disclosed",
  "Target audience / client categorisation appropriate",
  "Capital-at-risk statement present where applicable",
] as const;

/**
 * Parses the `cobs` submission field (a JSON string) into a validated
 * CobsItem[]. Returns null on anything malformed or empty so the caller can
 * respond 400 (the service also rejects an empty checklist).
 */
export function parseCobs(raw: string | null | undefined): CobsItem[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const out: CobsItem[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) return null;
    const { label, checked } = item as { label?: unknown; checked?: unknown };
    if (typeof label !== "string" || label.trim() === "" || typeof checked !== "boolean") {
      return null;
    }
    out.push({ label, checked });
  }
  return out;
}
