# HANDOFF.md — CCS AR Oversight Platform

Developer handoff for implementing the production system. The design prototypes in this
project are the source of truth for UI, flows, and guardrail behaviour; the reference
logic in `deterministic-engine.js` is the source of truth for all date/threshold arithmetic.

## What's in this package

| File | What it is |
|---|---|
| `Agent Runtime & Sign-Off Queue.dc.html` | Tier 4 — 7 headless agents, tool whitelists, the single egress point (Sign-Off Queue), AgentRun log with TOOL DENIED proof |
| `Backend & Data Infrastructure.dc.html` | Tiers 2–3 — request path, API tool surface (callable vs withheld), Postgres register tables + RLS policies, WORM object store, append-only audit |
| `Deterministic Engine.dc.html` | Interactive harness over `deterministic-engine.js` — CF30 cycle computer, risk banding, CPD strikes, 18-test suite |
| `deterministic-engine.js` | **Portable reference implementation** — port to TS, keep the test cases as unit tests |
| `AR Portal (Razlin).dc.html` | AR-facing Razlin-branded portal — FP submission (COBS 4 checklist, client-side SHA-256 on attach), NIL CF30 return flow, tenant-isolated submission list |
| `Go-Live Monitoring.dc.html` | Phases/gates, queue-age metric, fail-closed alerts, definition-of-done, AGENTS_AUTONOMOUS flag behaviour |
| `uploads/RAZ and CCS documentation (3)/` | Original architecture one-pager, BUILD_GUIDE phases, go-live checklist, portal reference |

## Target stack (per BUILD_GUIDE)

Next.js (App Router) · Prisma + Postgres (RLS) · Azure Blob / S3 Object Lock (WORM) ·
Entra/Okta OIDC · Anthropic API server-side only · Agent SDK workers behind a scheduler.

## Non-negotiable invariants (verify in code review + tests)

1. **One writeable path.** Every read/write goes through the API tool layer. Agents get
   `query_database`, `write_register_entry` (rows land `PENDING`), `enqueue_for_signoff`.
2. **Withheld tools are unreachable code paths**, not permission checks:
   `send_email`, `file_regulatory`, `persist_final` must not exist in any agent's tool
   registry. A call attempt returns 403 at the gateway and writes an audit row.
3. **Sign-Off Queue is the sole egress.** Nothing leaves the platform (email, filing,
   FINAL persistence) without an SMF16/17 action, which is itself audited.
4. **Append-only audit** — the app role has INSERT only; no UPDATE/DELETE grants.
   `audit_event` 6-yr retention, `agent_run` 7-yr.
5. **RLS tenant isolation** — `arId = current_setting('app.ar_id')` pattern per table;
   COMPLIANCE read-all + draft; SMF sign-off. Write cross-tenant leak tests.
6. **Documents are WORM** — SHA-256 recorded at ingest; verify-on-read exposed in UI.
7. **All arithmetic in code** — port `deterministic-engine.js` (quarter-end +10BD due
   dates, T-5BD…T+20BD ladder, 5/8/12 risk bands, CPD 35h three-strike, retention
   clocks, Art 33 72h). Agents call `compute_dates`/`compute_thresholds`; the model
   never does date maths. Keep all 18 test cases; extend bank holidays past 2027.
8. **No client-side secrets** — Anthropic key vaulted server-side; grep build output.
9. **Fail closed** — any agent error/ambiguity halts and opens an operator-review alert;
   never auto-resolve.
10. **AGENTS_AUTONOMOUS=false until Gate 5** (clean Codrington pilot quarter + DPA
    executed + pen test signed off, each cleared in writing by SMF16/17). Until then,
    all agent runs are operator-triggered.

## Open items to confirm with RAZ (Gate 1 residue)

- CPD strike thresholds (currently coded: 75%/90% pace checks at 3/1 months, hard fail at deadline)
- NIL-return section list (12 sections modelled in AR Portal)
- Queue-age SLO (48h assumed) and escalation recipient list

## Suggested build order

Phases 1–6 as in `BUILD_GUIDE.md`. The prototypes map: Phase 2–3 → Backend & Data screen,
Phase 4 → Agent Runtime screen, Phase 5 → AR Portal + Go-Live, Phase 6 → autonomy flag.
