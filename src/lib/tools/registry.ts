import type { Tool } from "./types";
import { queryDatabase } from "./query-database";
import { writeRegisterEntry } from "./write-register-entry";
import { enqueueForSignoff } from "./enqueue-for-signoff";
import { computeDates, computeThresholds } from "./compute";
import { draftTemplate } from "./draft-template";
import { compilePack } from "./compile-pack";
import { gatherDocs } from "./gather-docs";
import { screenFeeds } from "./screen-feeds";

/**
 * Withheld tools — PERMANENTLY forbidden (Invariant 2). These are NOT permission
 * checks: they have no implementation anywhere in TOOL_REGISTRY, so they are
 * genuinely unreachable code paths. The gateway additionally rejects them by
 * name to produce the 403 + TOOL DENIED audit row.
 */
export const WITHHELD_TOOLS = ["send_email", "file_regulatory", "persist_final"] as const;
export type WithheldTool = (typeof WITHHELD_TOOLS)[number];

/**
 * Reserved tools — declared on an agent whitelist but not yet implemented; the
 * gateway fails closed (501) on any such tool. This list is now EMPTY: the three
 * former entries are implemented —
 *   - compile_pack / gather_docs produce non-register sign-off ARTIFACTS
 *     (review_pack / evidence_pack; see src/lib/signoff/artifacts.ts);
 *   - screen_feeds calls an injected adverse-media screener and fails closed to
 *     OPERATOR_REVIEW while the production screener is a stub (see feeds.ts).
 * The reserved mechanism is retained for any future capability gap.
 */
export const RESERVED_TOOLS = [] as const;

/** The implemented tools. Withheld tools intentionally have NO entry here. */
export const TOOL_REGISTRY: Readonly<Record<string, Tool>> = Object.freeze({
  [queryDatabase.name]: queryDatabase,
  [writeRegisterEntry.name]: writeRegisterEntry,
  [enqueueForSignoff.name]: enqueueForSignoff,
  [computeDates.name]: computeDates,
  [computeThresholds.name]: computeThresholds,
  [draftTemplate.name]: draftTemplate,
  [compilePack.name]: compilePack,
  [gatherDocs.name]: gatherDocs,
  [screenFeeds.name]: screenFeeds,
});

export function isWithheld(name: string): name is WithheldTool {
  return (WITHHELD_TOOLS as readonly string[]).includes(name);
}

export function isReserved(name: string): boolean {
  return (RESERVED_TOOLS as readonly string[]).includes(name);
}
