# BUILD_GUIDE.md — CCS AR Oversight Platform
Paste these into Claude Code in order. Each phase ends with a verify step — don't move on until it passes. Read `README.md` and `CLAUDE.md` first.

---

## Phase 0 — Scaffold
**Prompt to Claude Code:**
> Read CLAUDE.md and README.md. Scaffold a Next.js (App Router) + TypeScript + Tailwind project called `ccs-portal`. Add Prisma (Postgres), Auth.js, and Zod. Set up a `docker-compose.yml` with Postgres for local dev. Create a `.env.example` listing every secret we'll need (DATABASE_URL, AUTH_* for the OIDC provider, ANTHROPIC_API_KEY, BLOB_* storage creds). Configure Tailwind with the light-theme design tokens from README.md as CSS variables. Do not build features yet.

**Verify:** `npm run dev` serves a blank themed page; `npx prisma migrate dev` runs against local Postgres.

---

## Phase 1 — Data model
**Prompt:**
> From the register objects in the HTML reference (REG_AR, REG_AGREE, REG_PERM, REG_CMP, REG_ANN, REG_PAD, REG_GE, REG_COI, REG_TC, REG_AML, REG_COMP, REG_BR, REG_WB, REG_CF30, REG_CERT, REG_MAR, REG_RES, REG_PIPE, MANUAL_MAP, POLICY_REG, FORMS, TRAINING, DATA_BREACH, SAR, RTM, ATTEST, CAL, FP, AUDIT, CF30_RISK), design a normalised Prisma schema. Core entities: AppointedRep, Person, User (with role + arId), FinancialPromotion, PromotionDocument, AuditEvent (append-only), CF30Return, RiskScore, plus a table per register. Add enums for status/severity/RAG. AuditEvent and AgentRun are append-only — no update/delete in the API layer. Seed with the reference data for SIX, Drake Star, Codrington only.

**Verify:** migrate + seed succeed; `prisma studio` shows the three ARs and seeded registers.

---

## Phase 2 — Auth & tenancy
**Prompt:**
> Add Auth.js with an OIDC provider (Entra ID; make it swappable to Okta via env). Three roles: AR, COMPLIANCE, SMF. Store role + arId on the user. Implement middleware + a query helper that enforces row-level scoping: AR users can read/write only rows where arId = their firm; COMPLIANCE reads all + drafts; SMF has sign-off authority. Add a role-aware layout: the sidebar and available actions render per role. AR-facing pages show Razlin branding; internal pages may show CCS.

**Verify:** log in as each role; an AR user cannot fetch another firm's data (test it).

---

## Phase 3 — UI (recreate the portal)
**Prompt:**
> Recreate the modules from CCS AR Oversight Portal Light.html as React components, pixel-faithful to the reference (tokens in README.md), reading from the API instead of in-file consts. Start with: Oversight Dashboard (health ring, KPIs, priority queue, deadlines, RAG matrix), then the generic register table + add/delete, then all conduct/people/data registers. Keep the sidebar nav structure. Remove all localStorage — state comes from the DB.

**Verify:** every nav item renders live data; add/delete a register row persists to Postgres.

---

## Phase 4 — FP submission channel + documents + audit
**Prompt:**
> Build the Financial Promotions module: AR submission form (identification, audience, COBS 4 checklist, reviewer notes) with drag-and-drop multi-file upload. On upload, stream the file to Blob storage with an immutability policy, compute SHA-256 server-side, and store {name,size,hash,blobUrl}. Submission creates a FinancialPromotion (status PENDING) and writes AuditEvents (SUBMITTED, DOCS ATTACHED). SMF Adopt/Reject updates status and writes an AuditEvent. Render the immutable audit trail card + per-submission detail modal (doc manifest with hashes + filtered history). Add CSV export of the trail. Type filter tabs: research/teaser/deck/marketing/advisory.

**Verify:** submit as an AR with files → appears in SMF queue with hashed docs → Adopt writes an immutable audit row; audit rows cannot be edited/deleted via API.

---

## Phase 5 — Server-side AI review
**Prompt:**
> Add a server route POST /api/fp/:id/ai-review that calls Claude with the COBS 4 / MAR review prompt from the reference (keep the wording), using ANTHROPIC_API_KEY from env. Return a structured verdict (APPROVE / APPROVE WITH CONDITIONS / REFER / REJECT) + findings. Render it in the inline AI panel. Log an AI REVIEW AuditEvent. The verdict is advisory only — final authority is the SMF sign-off.

**Verify:** AI review runs from the server; no key in client bundle (grep the build output).

---

## Phase 6 — Deterministic engine
**Prompt:**
> Implement a pure, unit-tested module for all date/threshold logic: quarter-end + 10-business-day due dates, the T-5BD…T+20BD escalation ladder, retention clocks (6/7 yr), CPD 35h/yr, and the 5-factor risk banding (5-7 bi-annual / 8-11 quarterly / 12-15 quarterly+ad hoc). No LLM involvement. Wire CF30 Returns and Risk Scoring to it.

**Verify:** unit tests green, including UK bank-holiday edge cases and quarter boundaries.

---

## Phase 7 — Agent runtime
**Prompt:**
> Implement the seven agents with the Anthropic Agent SDK, headless. For each: a versioned system prompt, a strict tool whitelist, and a Zod-validated JSON output schema (mirror CCS-AGENT-SPECS-001). Shared runner: validate input → render prompt → call model with ONLY whitelisted tools → validate output → write an immutable AgentRun log (agent id, version, prompt+input hash, model, tokens, output) → on any error/ambiguity, fail-closed and enqueue an OPERATOR REVIEW flag. The only egress tool available to any agent is enqueue_for_signoff; send-email/file-regulatory/persist-final must be unreachable. Triggers: CRON agent-quarterly-cycle (06:00), agent-anomaly (02:00), agent-cpd-tracker (06:00); WEBHOOK agent-consolidator (on return submit), agent-notification-drafter (on flagged event); ON-DEMAND agent-pre-meeting-prep, agent-evidence-packer. Build them in MANUAL-TRIGGER mode first (an operator button), not scheduled.

**Verify:** trigger each agent manually; drafts land in the Sign-Off Queue; a test proving an agent cannot invoke a withheld tool; a forced error fails closed with an OPERATOR REVIEW flag.

---

## Phase 8 — Go-live
**Prompt:**
> Add monitoring (agent failures alert; queue-age + uptime dashboard). Wire the CRON/webhook triggers behind a feature flag so agents can be switched from manual to autonomous per environment. Write a runbook: how to onboard an AR, rotate keys, and review agent output quarterly. Prepare deploy config for Azure (web tier + Functions for agents + Postgres + Blob with immutability).

**Verify:** run one full simulated quarter with agents autonomous in staging; audit trail complete; then enable in production per the Go-Live Checklist gates.

---

## Environment variables (.env)
```
DATABASE_URL=postgres://...
AUTH_ISSUER=...            # Entra/Okta OIDC
AUTH_CLIENT_ID=...
AUTH_CLIENT_SECRET=...
ANTHROPIC_API_KEY=...      # server only
BLOB_ACCOUNT=... BLOB_KEY=... BLOB_CONTAINER=ccs-docs   # immutability policy ON
AGENTS_AUTONOMOUS=false    # flip to true only after Gate 5
```

## Definition of done (regulated tool)
- [ ] AR sees only own firm; SMF is sole sign-off; no agent egress beyond the queue.
- [ ] Every submission/upload/decision/agent-run is in the append-only audit; docs are WORM + SHA-256.
- [ ] Dates/thresholds are code-computed and unit-tested.
- [ ] No secret in any client bundle.
- [ ] DPA (CCS↔Razlin) and a pen test completed before real AR data (Phase 5 of the Go-Live Checklist).
