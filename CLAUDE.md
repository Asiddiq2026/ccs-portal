# CLAUDE.md — CCS AR Oversight Platform

You are building the **production** version of the CCS AR Oversight Platform for **Razlin Limited** (FCA principal firm, FRN 730805). CCS ("Comprehensive Compliance Solutions") is the third-party platform provider; Razlin licenses it. This is a regulated-compliance tool — correctness, auditability and access control matter more than speed.

## What exists
- `CCS AR Oversight Portal Light.html` — the **high-fidelity design reference** (preferred theme). Recreate this look/behaviour faithfully.
- `CCS AR Oversight Portal.html` — same app, dark theme (optional toggle).
- `README.md` — full screen/component/token spec. Read it first.
- `BUILD_GUIDE.md` — the step-by-step plan. Follow it in order.

## Golden rules (never violate)
1. **Agents draft; humans decide.** No agent may send email, file to a regulator, or persist a final document. The ONLY egress from an agent is `enqueue_for_signoff`. Withhold every other egress tool from the agent tool list.
2. **Fail-closed.** On error, ambiguity, missing data or rule conflict, an agent halts and enqueues an OPERATOR REVIEW flag. Never silently proceed or retry blindly.
3. **Deterministic where regulation requires it.** Deadlines, retention periods, escalation steps and thresholds are computed in code, never by the LLM.
4. **Tenant isolation.** AR users see ONLY their own firm's data (row-level security). AR-facing output carries Razlin branding only; CCS marks are internal.
5. **Immutable audit.** Every submission, upload, decision and agent run is written to an append-only store. Never expose update/delete on audit or agent-run tables.
6. **Secrets server-side only.** The Anthropic API key lives in a secrets vault and is used only by server code. Never ship it to the browser.
7. **AR roster is fixed:** SIX Financial Information UK, Drake Star UK, Codrington Associates. Do NOT add Acuvera, Arlington or Novel Vision as ARs.
8. **Retention:** documents & audit 6 years; agent run logs 7 years; AR/approved-person records indefinitely.

## Stack (unless the user overrides)
- **Frontend:** Next.js (App Router) + React + TypeScript, Tailwind for the tokens below.
- **DB:** PostgreSQL via Prisma. **Auth:** Auth.js (NextAuth) with Entra ID / Okta OIDC. **Storage:** Azure Blob with immutability (WORM) policy; S3 + Object Lock is an acceptable substitute.
- **Agents:** Anthropic Agent SDK, headless, run as scheduled functions (Azure Functions Timer + queue triggers) or a Node worker with node-cron for a simpler first deploy.
- **Hosting:** Azure (fits the agent runtime). Vercel is fine for the web tier if agents run separately.

## Working style
- Build in the phase order in BUILD_GUIDE.md. After each phase, stop and show me how to run/verify it before continuing.
- Write tests for the deterministic date/threshold engine and for the agent tool-whitelist enforcement.
- Keep the UI visually faithful to the light-theme reference (tokens in README.md).
- Commit per phase with clear messages.
