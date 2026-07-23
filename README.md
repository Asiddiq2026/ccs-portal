# ccs-portal

Production build of the CCS AR Oversight Platform for Razlin Limited (FRN 730805).
Spec: `../design_handoff_ccs_platform/README.md` and `original_docs/BUILD_GUIDE.md`.

Stack: Next.js (App Router) + TypeScript + Tailwind · Prisma + Postgres (row-level
security) · Auth.js · Zod.

## Status

- **Phase 0 — Scaffold:** done (themed app shell, Tailwind tokens, docker Postgres, `.env.example`).
- **Phase 1 — Data model:** the 8 register tables + RLS policies. done.
- **Deterministic engine:** ported to `src/lib/engine/` with Vitest tests (all 18 reference cases; bank holidays extended to 2030). done. Wiring into CF30/Risk models is Phase 6.
- **API tool layer:** `src/lib/tools/` — the single writeable path. `query_database` / `write_register_entry` (PENDING) / `enqueue_for_signoff` + pure `compute_*` tools, a gateway that 403s the withheld tools (`send_email` / `file_regulatory` / `persist_final`) with a TOOL DENIED audit row, and the 7-agent registry (`src/lib/agents/specs.ts`). done.
- **Phase 2 — Auth & tenancy:** done. Auth.js v5 (`src/auth.ts`) with a generic OIDC
  provider (Entra ID ⇄ Okta swappable purely via `AUTH_*` env) mapping `role`/`arId`
  claims, plus a hard-gated dev login. `sessionToTenant`/`requireTenant`
  (`src/lib/session.ts`) derive the RLS `TenantContext` and fail closed; middleware
  gates every non-auth route. This is what makes RLS + the tool gateway enforce
  *per request* rather than in principle.
- **Tool HTTP endpoint:** `POST /api/tools/invoke` — the only HTTP way to reach the
  tool layer. Derives the tenant from the session (never the body), then runs the
  gateway (whitelist / withheld / reserved) → tool (Zod) → Prisma under
  `withTenant()`. Errors map 400/401/403/501. done.
- **Phase 4 — FP channel (backend spine):** `src/lib/fp/` — AR submission creates a
  PENDING `FinancialPromotion` with a COBS 4 checklist + WORM document manifest
  (SHA-256, content-addressed `BlobStore`), writing SUBMITTED / DOCS ATTACHED audit
  rows; SMF Adopt/Reject is the sole status transition (writes ADOPTED / REJECTED);
  plus RFC-4180 CSV export of the audit trail. Injected deps → DB-free tests. done.
  Deferred: the React submission form / drag-drop UI + detail modal, and the live
  Azure-Blob adapter (Phase 8 infra).
- **Phase 6 — Engine → models:** `src/lib/models/` — `buildCf30Return` (due date +
  T-5BD…T+20BD ladder) and `buildRiskScore` (5-factor band + cadence) derive every
  computed field from the deterministic engine, so no writer hand-enters dates or
  bands (Invariant 7). done.
- **Phase 5 — Server-side AI review:** `POST /api/fp/:id/ai-review` calls Claude
  with the verbatim COBS 4 / MAR review prompt (`src/lib/fp/ai-review.ts`), returns
  a structured verdict (APPROVE / APPROVE WITH CONDITIONS / REFER FOR FURTHER REVIEW
  / REJECT) + analysis, and logs an AI REVIEW audit row. The key stays server-side
  (`ANTHROPIC_API_KEY`, plain-fetch adapter) — the reference called the API from the
  browser; this moves it server-side. Verdict is advisory only; SMF decides. done.
  Deferred: the inline AI panel UI (Phase 3).
- **Phase 7 — Agent runtime:** `src/lib/agents/` — a shared, fail-closed `runAgent`
  runner: validate input (Zod) → render the versioned system prompt (hashed) → run
  the model's tool-use loop with **only** whitelisted tools routed through the
  gateway → validate output (Zod) → write an immutable `agent_run` log → on ANY
  error/ambiguity halt to `OPERATOR REVIEW` (no draft, no egress). The seven agents
  run headless behind `POST /api/agents/:id/run` (operator-only, MANUAL trigger).
  The Anthropic adapter (`anthropic-agent-model.ts`) is a server-only plain-fetch
  tool-use loop offering JSON schemas only for the 9 implemented tools —
  `RESERVED_TOOLS` is now empty, and withheld tools are never offered, so an agent
  needing one fails closed. done.
  - **`draft_template` (implemented):** `src/lib/tools/draft-template.ts` — a pure
    COMPUTE tool rendering SUP 15 / Principle 11 / ICO Art 33 notification **drafts**
    (every output `doNotSend:true`; the 72h Art 33 clock is computed in code, not the
    model — Invariant 7). Unblocks `agent-notification-drafter`. It can never send or
    file: `send_email`/`file_regulatory` stay withheld; the SMF is the sole egress.
  - **`compile_pack` / `gather_docs` (implemented):** COMPUTE tools that assemble an
    oversight prep pack (`review_pack`) / WORM-document evidence pack (`evidence_pack`)
    as a **PENDING sign-off artifact**, never a FINAL register row. Artifacts reuse the
    `SignOffItem.register` column (reserved values `review_pack`/`evidence_pack`, no
    migration); `isMaterialisable()` is false for them, so sign-off is approve-only.
  - **`screen_feeds` (implemented):** a READ tool that runs adverse-media / sanctions
    screening through an **injected** `FeedScreener` (`ToolDeps.feeds`). It writes
    nothing and **fails closed** to `OPERATOR_REVIEW` when no provider is configured,
    the provider throws, or the result is not `ok`; the default `stubFeedScreener`
    returns `ok:false` until a real vendor is wired in. Coded threshold (score ≥ 75).
- **Phase 8 — Go-live:** autonomy is gated (`src/lib/agents/autonomous.ts`):
  CRON/WEBHOOK agents self-fire only when `AGENTS_AUTONOMOUS=true` (fail-closed on
  any other value); ON_DEMAND agents are always operator-triggered; the manual route
  never passes through the gate. Monitoring: `GET /api/monitoring` (operator-only)
  returns a pure snapshot (`src/lib/monitoring/metrics.ts`) — queue age + RAG band
  (target < 48h), open fail-closed OPERATOR REVIEW count, gates cleared, agent egress
  (structurally 0). Ops docs: `docs/RUNBOOK.md` (onboard AR, rotate keys, enable
  autonomy, fail-closed response, quarterly review) + `docs/DEPLOY_AZURE.md`. done.
  Deferred: the monitoring dashboard UI (Phase 3).
- **Sign-off decision path (closes the core loop):** `src/lib/signoff/` — the ONLY
  path that turns a PENDING draft into a FINAL register row (Invariants 1 & 3).
  `POST /api/signoff/:id/decide` (SMF-only): **SIGN_OFF** validates the draft
  payload against its target register's schema (`register-schemas.ts`, fail-closed
  422 on mismatch), then atomically writes the FINAL row *and* flips the item to
  `SIGNED_OFF` in one `withTenant` transaction (a lost race rolls back the FINAL
  row); **RETURN** rejects with a required rationale and writes no row. Both audit
  the decision; sign-off also audits `REGISTER WRITE (FINAL)`. This is what makes
  `write_register_entry` and all 7 agents' drafts actually usable — the queue now
  has an exit. `cf30_return` is forced to FINAL; `financial_promotion` is excluded
  (it has its own channel). done. The two new `sign_off_item` columns
  (`register_id`, `notes`) are both nullable — a greenfield `migrate dev` picks
  them up; for an existing DB apply the one-off `ALTER` in `docs/RUNBOOK.md` §7.

- **Phase 3 UI (first two operator screens):** `src/app/signoff` + `src/app/monitoring`
  with a shared `ConsoleShell`. The **Sign-Off Queue** lists PENDING drafts
  (RLS-scoped via `withTenant`) and lets an SMF sign each off (→ FINAL) or return
  it with a rationale — the decide control posts to `/api/signoff/:id/decide` and
  refreshes; COMPLIANCE gets read visibility, SMF gets the buttons. The **Go-Live
  Monitoring** dashboard renders the pure `buildSnapshot` (gates, median queue age
  + RAG bars, open fail-closed, agent egress, `AGENTS_AUTONOMOUS`). Both are
  server components; non-operators/unauthenticated see an access panel. done.
  Deferred: the full pixel-matched compliance console + Razlin AR portal.

- **Phase 3 UI (FP review screen — third console tab):** `src/app/fp` lists
  submitted financial promotions (RLS-scoped via `withTenant`, PENDING first)
  with their COBS 4 checklist, WORM document manifest (name / size / SHA-256),
  and reviewer notes. The `FpReviewPanel` (client) runs the advisory AI review
  (`POST /api/fp/:id/ai-review`) and — SMF only — adopts or rejects via the new
  `POST /api/fp/:id/decide` (`src/app/api/fp/[id]/decide/route.ts` → `decidePromotion`;
  ADOPT/REJECT are the sole authority, the AI verdict is advisory only; REJECT
  requires reviewer notes surfaced to the AR). COMPLIANCE may run the AI review
  but not decide. done.

- **Phase 3 UI (AR submission):** `POST /api/fp` (`src/app/api/fp/route.ts`) takes
  a multipart submission — type / title / audience / COBS 4 checklist + document
  files — content-hashes every file into WORM storage via `resolveBlobStore`,
  creates the promotion PENDING and writes the audit trail. An AR is scoped to its
  own firm; COMPLIANCE/SMF may submit on behalf of a named `arId`. The AR-facing
  form is `src/app/fp/submit` (`FpSubmitForm`), reachable from the review queue's
  "Submit on behalf" link. Shared FP constants + validators live in
  `src/lib/fp/cobs.ts`. The submit page also shows the AR **their own submissions**
  and review status (PENDING/ADOPTED/REJECTED + reviewer notes, RLS-scoped) so the
  submitter is no longer blind to the outcome. done.

- **Phase 3 UI (Razlin AR Portal):** `src/app/portal` (server) + `RazlinPortal`
  (client) — the appointed representative's branded home (Razlin header/sidebar,
  not the CCS operator chrome). Loads the firm's own promotions, CPD, and CF30
  status under `withTenant` (RLS pins every read to the caller's `arId`), computes
  the quarter + due date via the deterministic engine, and renders: stat cards,
  a "submit for adoption" form (type/audience chips, COBS 4 checklist, client-side
  SHA-256 on attach → `POST /api/fp`), the RLS-isolated submissions list, and a
  two-step **NIL quarterly-return** modal. Filing a NIL return posts to
  `POST /api/cf30/nil` (`src/app/api/cf30/nil/route.ts` → `fileNilReturn`), which
  creates a **PENDING sign-off draft** targeting `cf30_return` routed to Razlin's
  SMF queue — the "FILED" chip means *filed for adoption*, never FINAL (Invariants
  1 & 3). Toasts + optimistic rows on success. done.

- **Phase 3 UI (internal console re-skin + inspection screens):** `ConsoleShell`
  re-skinned to the design handoff (sticky 62px blurred header with the CCS Shard
  mark, 238px sidebar grouped into Oversight/Diagnostics with a 2px accent
  left-border active state). Two operator-only (COMPLIANCE/SMF) diagnostics tabs:
  **Deterministic Engine** (`src/app/engine` + `EngineHarness`) runs the pure
  engine live in the browser — a 12-assertion regression harness, CF30 cycle
  computer, risk-band calculator, and CPD three-strike table, all against the same
  `src/lib/engine` functions the runtime uses (no DB). **Backend & Data
  Infrastructure** (`src/app/infra` + `InfraConsole`) is a read-only data-plane
  inspection: live per-table row counts loaded under `withTenant`, the real API
  tool surface (9 callable + 3 withheld/403 + 0 reserved straight from
  `TOOL_REGISTRY`/`WITHHELD_TOOLS`/`RESERVED_TOOLS`), the 5-tier request path, the
  WORM document manifest, the append-only audit trail, and a click-to-inspect
  table-detail modal quoting the **verbatim RLS policy** from `prisma/rls.sql`. done.

- **Agents console (operator trigger surface):** `src/app/agents` + `AgentsConsole`
  (client). Lists the seven agents (id/version/trigger/schedule) with a one-click
  **Run manually** button (+ optional `arId`) that calls the gateway-enforced
  `POST /api/agents/:id/run`, plus a recent-runs log with verdicts. This is the
  operator surface the MANUAL pilot quarter (Phase E) and fail-closed re-trigger
  (RUNBOOK §4) depend on — previously the run route was curl-only. done.

- **Audit trail CSV export:** `GET /api/audit/export` (COMPLIANCE/SMF only,
  network-scoped) streams the append-only `audit_event` trail via the pure
  `auditTrailToCsv` (RFC 4180 quoting) with optional `entity`/`entityId`/`from`/`to`
  filters — evidence for the SMF quarterly review. Linked from Go-Live Monitoring. done.

- **Role-aware landing:** `src/app/page.tsx` reads the session server-side and
  routes each principal to the surface they can use — an AR to the `/portal`
  (Razlin AR Portal; `/fp/submit` remains as a secondary link), COMPLIANCE/SMF to
  the operator console (`/signoff`, `/fp`, `/agents`, `/monitoring`); unauthenticated
  visitors get the sign-in card. Removes the dead-end where an AR had no reachable
  entry point. done.

- **WORM storage adapter (Azure Blob):** `src/lib/fp/azure-blob.ts` implements
  the `BlobStore` contract against Azure Blob — content-addressed by SHA-256 with
  create-only writes (`ifNoneMatch:"*"`), backstopped by the container's
  immutability policy, so documents are write-once and idempotent on content.
  `src/lib/fp/blob.ts` (`resolveBlobStore`) selects it when `BLOB_ACCOUNT`/
  `BLOB_KEY` are set and **fails closed in production** if they are not (never
  falls back to the volatile in-memory store); dev/test use in-memory. The SDK is
  imported lazily, so it stays out of dev/test bundles. done. This unblocks the
  AR submission route/form.

## The 8 register tables

Per-AR (tenant-isolated on `arId`): `appointed_rep`, `cf30_return`,
`financial_promotion`, `risk_score`, `data_breach`, `person_cpd`.
Network / append-only: `audit_event`, `agent_run`.

Schema: `prisma/schema.prisma`. RLS: `prisma/rls.sql`.

## Setup

```bash
cp .env.example .env      # fill in AUTH_*/ANTHROPIC/BLOB before those phases
npm install
npm run db:up             # start Postgres (creates ccs db + ccs_app role)
npm run db:setup          # prisma migrate + apply RLS + seed
npm run dev               # http://localhost:3000
```

`db:setup` = `prisma migrate dev --name init` → `npm run db:rls` → `npm run db:seed`.
Re-run `npm run db:rls` after any later migration (Prisma may drop the RLS grants).

## Verify (Phase 1)

- `npm run db:setup` completes without error.
- `npm run prisma:studio` shows the three ARs (SIX, Drake Star, Codrington) and
  their seeded CF30/risk/CPD rows.
- `npm run dev` serves the themed placeholder page.
- `npm test` runs the deterministic-engine unit tests (all 18 reference cases green).

## Verify (Phase 2 — auth & tenancy)

- `npm test` — `src/lib/session.test.ts` proves `sessionToTenant` fails closed
  (AR-without-arId throws; COMPLIANCE/SMF are network-scoped).
- With a database: `RUN_DB_TESTS=true npm test` runs `src/lib/db.rls.test.ts`,
  which proves RLS isolation against real Postgres as `ccs_app` — an AR sees only
  its own firm, cross-tenant filters return nothing, COMPLIANCE sees all firms, and
  a context-less connection matches no rows. (Skipped unless `RUN_DB_TESTS=true`.)
- Local login without an IdP: set `AUTH_DEV_LOGIN=true`, `npm run dev`, sign in as
  `ar` / `compliance` / `smf`. Requires `AUTH_SECRET`. SSO activates the moment
  `AUTH_ISSUER` is set.
- `npm test` — `src/app/api/tools/invoke/handler.test.ts` exercises the HTTP
  endpoint end-to-end with in-memory deps: 200 compute, PENDING write, 403 withheld
  (+ TOOL DENIED audit), 403 off-whitelist, a formerly-reserved tool dispatching +
  failing closed to OPERATOR_REVIEW, 400 bad body / bad input.

## Verify (Phase 4 — FP channel · Phase 6 — engine wiring)

- `npm test` — `src/lib/fp/service.test.ts`: SHA-256 known vectors; submit creates
  PENDING + hashed manifest + SUBMITTED/DOCS ATTACHED audit; AR-cross-firm and
  empty-checklist rejected; SMF-only Adopt/Reject (AR/COMPLIANCE 403); reject needs
  notes; 404/409 guards; CSV trail quoting (RFC 4180).
- `npm test` — `src/lib/models/models.test.ts`: CF30 due date `2026-04-16` +
  T-5BD…T+20BD ladder; risk banding GREEN/AMBER/RED with cadence; malformed factors
  rejected. All computed values come from the engine.

## Verify (Phase 5 — server-side AI review)

- `npm test` — `src/lib/fp/ai-review.test.ts`: verdict severity precedence
  (REJECT > APPROVE WITH CONDITIONS > APPROVE > REFER); verbatim prompt framing +
  checklist rendering; AI REVIEW audit written up front; model failure propagates
  (fail closed to manual review) with the request still audited.
- No key in the client bundle: the Anthropic call lives only in a `runtime =
  "nodejs"` route + `src/lib/fp/anthropic-client.ts`. After `npm run build`, grep the
  client chunks for `ANTHROPIC_API_KEY` — expect no match.

## Verify (Phase 7 — agent runtime)

- `npm test` — `src/lib/agents/runner.test.ts` (in-memory deps + stub model):
  happy path enqueues a draft and logs an `agent_run` with 64-hex prompt/input
  hashes + tokens + an AGENT RUN audit row; a **withheld** tool (`send_email`) is
  unreachable → gateway 403 + TOOL DENIED → fail-closed OPERATOR REVIEW; an
  output-schema violation → OPERATOR REVIEW; a bad input → OPERATOR REVIEW before
  the model runs; a thrown model error → OPERATOR REVIEW; an unknown agent throws
  `AgentError(404)`.
- Trigger manually: `POST /api/agents/:id/run` (COMPLIANCE/SMF only; others 403).
  Drafts land in the sign-off queue; a fail-closed run returns 200 with
  `operatorReview: true`.

## Verify (Phase 8 — go-live)

- `npm test` — `src/lib/agents/autonomous.test.ts`: `AGENTS_AUTONOMOUS` is honoured
  only for the exact string `"true"`; CRON/WEBHOOK firing is gated behind the flag;
  ON_DEMAND stays manual regardless; the "· auto" label appears only when live.
- `npm test` — `src/lib/monitoring/metrics.test.ts`: hour-age flooring, RAG banding
  (green < 24h / amber 24–48h / red > 48h), median (empty/odd/even), open-item
  filtering + oldest-first sort, fail-closed count, and a full snapshot matching the
  dashboard signals (agent egress structurally 0).
- `GET /api/monitoring` (operator-only) returns the live snapshot.
- Ops procedures: `docs/RUNBOOK.md`; deploy: `docs/DEPLOY_AZURE.md`; sequenced
  pre-flight with owners + Gate 5 sign-off lines: `docs/GO_LIVE_CHECKLIST.md`.

## Verify (sign-off decision path — closed loop)

- `npm test` — `src/lib/signoff/service.test.ts`: SIGN_OFF materialises a FINAL
  row (coerced dates, `cf30_return` forced FINAL) + audits `SIGNED OFF` and
  `REGISTER WRITE (FINAL)`; SMF-only (AR/COMPLIANCE 403, no row written); RETURN
  needs a rationale (400) and writes no row; a payload that fails its register
  schema fails closed (422, item stays PENDING); `financial_promotion` is refused
  (422); 404 unknown / 409 already-decided; a `risk_score` draft materialises too.
- End-to-end: an agent (or `write_register_entry`) enqueues a PENDING draft →
  `POST /api/signoff/:id/decide {"decision":"SIGN_OFF"}` as SMF → the FINAL row
  appears in its register and the item shows `SIGNED_OFF`.

## Go-live gap map

Compliance spine (Phases 0–2) is in place. What stands between here and go-live:

| Area | State | Blocker to go-live |
| --- | --- | --- |
| Scaffold / data model / RLS | done | — |
| Deterministic engine + CF30/Risk wiring | done (tests green) | — |
| API tool layer + gateway + HTTP endpoint | done | — |
| Sign-off decision path (draft → FINAL, SMF-only, atomic + audited) | done | sign-off queue UI (Phase 3); migration for new columns |
| Auth & tenancy | done | real IdP app registration + mapped `role`/`arId` claims |
| Financial-promotion channel (backend + submit + adopt/reject) | done | — (full loop: AR submits → SMF adopts/rejects) |
| WORM storage (Azure Blob adapter, content-addressed, fail-closed) | done (code) | `npm install` + provision container w/ immutability; live smoke test |
| AI review (Anthropic) | done (server-side, advisory) | — (inline AI panel UI shipped in FP screen) |
| UI — sign-off queue + FP review + FP submit + monitoring + agents | done | — |
| UI — Razlin AR Portal (`/portal`) + NIL CF30 filing (`/api/cf30/nil`) | done | — |
| UI — internal console re-skin (sidebar/62px header) + inspection screens | done | Deterministic Engine harness + Backend & Data inspection (`/engine`, `/infra`) |
| Agents as headless workers (fail-closed runner + manual trigger) | done | monitoring dashboard UI (Phase 3) |
| Autonomy gate (`AGENTS_AUTONOMOUS`) | done (gated off) | flip only after **Gate 5** |
| Monitoring (metrics + `/api/monitoring`) + ops docs | done | dashboard UI (Phase 3) |
| Deploy config (Azure) + WORM storage | documented + adapter coded | `npm install` new dep; run migrate/RLS/verify on a toolchain host |
| **Human Track (non-code)** | outstanding | executed DPA, pen-test sign-off, clean pilot quarter → **Gate 5** (SMF16/17 written approval) |

Nothing may run autonomously until Gate 5: `AGENTS_AUTONOMOUS` stays `false`.

## Row-level security

The app connects as `ccs_app` — a non-superuser `NOBYPASSRLS` role — so the
policies in `prisma/rls.sql` are enforced. Every DB access from the API layer
must go through `withTenant(ctx, fn)` in `src/lib/db.ts`, which sets the
`app.role` / `app.ar_id` GUCs per transaction. A context-less connection matches
no rows (fail-closed). Append-only tables have `UPDATE/DELETE/TRUNCATE` revoked.
