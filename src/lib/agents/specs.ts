// CCS-AGENT-SPECS-001 — the seven headless agents and their tool whitelists.
// Sourced from design_references/Agent Runtime & Sign-Off Queue.dc.html.
//
// Invariants enforced here:
//   #1 the only writeable path is the API tool layer;
//   #2 the withheld tools (send_email / file_regulatory / persist_final) appear
//      on NO whitelist — this is asserted in tests;
//   #3 enqueue_for_signoff is the sole egress on every agent.
//
// All tools named here are now implemented. screen_feeds calls an injected
// adverse-media screener and fails closed to OPERATOR_REVIEW while the provider
// is a stub (src/lib/tools/feeds.ts). compile_pack / gather_docs produce
// non-register sign-off ARTIFACTS (src/lib/signoff/artifacts.ts). draft_template
// is pure COMPUTE, DO-NOT-SEND (src/lib/tools/draft-template.ts). RESERVED_TOOLS
// is now empty; the gateway's 501 path is retained for any future capability gap.

export type Trigger = "CRON" | "WEBHOOK" | "ON_DEMAND";

export interface AgentSpec {
  id: string;
  version: string;
  trigger: Trigger;
  schedule: string;
  description: string;
  /** The exhaustive whitelist — the only tools this agent may ever call. */
  tools: string[];
}

export const AGENT_SPECS: readonly AgentSpec[] = Object.freeze([
  {
    id: "agent-quarterly-cycle",
    version: "v3",
    trigger: "CRON",
    schedule: "Daily · 06:00",
    description: "CF30 quarterly cycle: computes due dates and drafts chases / escalations.",
    tools: ["query_database", "compute_dates", "write_register_entry", "enqueue_for_signoff"],
  },
  {
    id: "agent-anomaly",
    version: "v2",
    trigger: "CRON",
    schedule: "Nightly · 02:00",
    description: "Adverse-media / anomaly screening; fails closed on ambiguity.",
    tools: ["query_database", "screen_feeds", "write_register_entry", "enqueue_for_signoff"],
  },
  {
    id: "agent-cpd-tracker",
    version: "v2",
    trigger: "CRON",
    schedule: "Daily · 06:00",
    // Reads training_completion evidence, credits CPD hours via compute_thresholds
    // (engine-coded, never the model), and drafts the three-strike person_cpd row
    // for SMF sign-off. Source data is ingested at POST /api/training/completions.
    description: "CPD 35h three-strike tracking against coded thresholds.",
    tools: ["query_database", "compute_thresholds", "write_register_entry", "enqueue_for_signoff"],
  },
  {
    id: "agent-consolidator",
    version: "v4",
    trigger: "WEBHOOK",
    schedule: "On return submit",
    description: "Consolidates CF30 returns; flags cross-check exceptions.",
    tools: ["query_database", "write_register_entry", "enqueue_for_signoff"],
  },
  {
    id: "agent-notification-drafter",
    version: "v3",
    trigger: "WEBHOOK",
    schedule: "On flagged event",
    description: "Drafts notifications (e.g. ICO Art 33) — DO NOT SEND; SMF egress only.",
    tools: ["query_database", "draft_template", "write_register_entry", "enqueue_for_signoff"],
  },
  {
    id: "agent-pre-meeting-prep",
    version: "v2",
    trigger: "ON_DEMAND",
    schedule: "Operator-triggered",
    description: "Compiles oversight-meeting prep packs.",
    tools: ["query_database", "compile_pack", "enqueue_for_signoff"],
  },
  {
    id: "agent-evidence-packer",
    version: "v2",
    trigger: "ON_DEMAND",
    schedule: "Operator-triggered",
    description: "Gathers evidence documents into a review pack.",
    tools: ["query_database", "gather_docs", "enqueue_for_signoff"],
  },
]);

const byId = new Map(AGENT_SPECS.map((a) => [a.id, a]));

export function getAgentSpec(id: string): AgentSpec | undefined {
  return byId.get(id);
}
