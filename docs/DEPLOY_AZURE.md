# CCS AR Oversight Platform — Azure Deployment

Reference deployment for the production platform. The design targets Azure
(Entra ID for SSO, Azure Blob for WORM storage), but the app is
infrastructure-agnostic: any Postgres + OIDC IdP + object store with immutability
works (e.g. RDS + Okta + S3 Object Lock).

> **Prerequisite:** the local toolchain (Node ≥ 20, npm, Docker) must be
> installed on the deploy/CI host. Development here has been code-only; run the
> verification steps below on a host that has the toolchain before promoting.

---

## Topology

```
Entra ID (OIDC) ──▶ Next.js app (App Service / Container App, Node 20)
                          │
                          ├─▶ Azure Database for PostgreSQL (Flexible Server)
                          │      app connects as ccs_app (NOBYPASSRLS) — RLS enforced
                          │
                          ├─▶ Azure Blob Storage (container ccs-docs, immutability ON)
                          │
                          └─▶ Anthropic Messages API (server-side egress only)
```

---

## 1. Provision

1. **Resource group + region** — pick an FCA-appropriate region (UK South/West).
2. **PostgreSQL Flexible Server** — create the `ccs` database. Create the
   application role:
   ```sql
   CREATE ROLE ccs_app LOGIN PASSWORD '<vaulted>' NOBYPASSRLS;
   GRANT CONNECT ON DATABASE ccs TO ccs_app;
   ```
   The app **must** connect as this non-superuser role; RLS is what enforces
   tenant isolation (Invariant 5). Never grant `BYPASSRLS` or use the admin role
   for the app connection.
3. **Blob Storage** — create the storage account and the `ccs-docs` container.
   Enable a **time-based immutability (WORM) policy** on the container so
   documents are write-once (Invariant: immutable evidence). Uploads are
   content-addressed and SHA-256 verified by the app.
4. **App host** — Azure App Service (Linux, Node 20) or a Container App. Set the
   Node runtime; the API routes declare `runtime = "nodejs"`.
5. **Key Vault** — store every secret here; reference from app settings. Nothing
   secret in the repo or the client bundle.

---

## 2. Configure (app settings / Key Vault references)

Populate from `.env.example`. Production values:

| Setting | Notes |
|---|---|
| `DATABASE_URL` | runtime app connection — the non-owner `ccs_app` role; `sslmode=require` |
| `RLS_DATABASE_URL` | **migrate/RLS only** — the table OWNER/admin connection; used by `npm run db:rls`. Not needed at app runtime |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | the canonical **https://** app URL |
| `AUTH_ISSUER` / `AUTH_CLIENT_ID` / `AUTH_CLIENT_SECRET` | Entra app registration; map `role` + `arId` claims |
| `AUTH_DEV_LOGIN` | **must be unset/false in production** (hard-gated off when `NODE_ENV=production`) |
| `ANTHROPIC_API_KEY` | server-only; Key Vault reference |
| `ANTHROPIC_MODEL` | pin per environment (e.g. `claude-sonnet-4-5`) |
| `BLOB_ACCOUNT` / `BLOB_KEY` / `BLOB_CONTAINER` | container has immutability ON; **required in production** — the FP channel refuses to serve without it (fail closed) |
| `AGENTS_AUTONOMOUS` | **`false`** until Gate 5 (see RUNBOOK §3) |
| `GATE5_CLEARED` | `false` until SMF16/17 clear Gate 5 in writing |
| `NODE_ENV` | `production` |

### Entra ID app registration
- Redirect URI: `https://<app-url>/api/auth/callback/<provider>`.
- Emit `role` (`AR` | `COMPLIANCE` | `SMF`) and `arId` as claims (app roles or a
  claims-mapping policy). The app fails closed on a session missing `role`, and
  an `AR` session with no `arId` is rejected.

---

## 3. Migrate & seed

Run from a host with the toolchain and network access to the database.

> **Ownership matters.** `migrate deploy` (DDL) and `rls.sql` (ENABLE/FORCE RLS,
> CREATE POLICY, REVOKE) require **table ownership**. The runtime `ccs_app` role
> is intentionally a non-owner (`NOBYPASSRLS`), so it **cannot** apply these.
> Point migrations and RLS at the OWNER/admin connection via `RLS_DATABASE_URL`
> (or a one-off admin `DATABASE_URL`); the app keeps using the `ccs_app`
> `DATABASE_URL` at runtime.

```bash
npm ci                                          # installs devDeps (tsx) too
DATABASE_URL="$ADMIN_DATABASE_URL" npx prisma migrate deploy   # apply migrations (as owner)
RLS_DATABASE_URL="$ADMIN_DATABASE_URL" npm run db:rls          # enable + FORCE RLS (as owner)
npm run db:seed                                 # reference data only (non-prod / pilot)
```

`npm run db:rls` runs `prisma/rls.sql` through Prisma; it honours
`RLS_DATABASE_URL` for exactly this owner-vs-runtime split. (A no-Node host can
instead run `psql "$ADMIN_DATABASE_URL" -f prisma/rls.sql`.)

`prisma/rls.sql` is **not** optional — it enables and `FORCE`s the
`tenant_isolation` policies and revokes UPDATE/DELETE on the append-only
`audit_event` / `agent_run` tables. Verify after applying:

- a context-less connection matches **no** rows;
- an `AR` GUC context sees only its firm;
- `audit_event` / `agent_run` reject UPDATE and DELETE.

---

## 4. Verify (pre-promotion gate)

```bash
npm run test          # unit + integration suites (DB-free) must be green
RUN_DB_TESTS=true npm run test   # RLS cross-tenant suite against staging DB
npm run build         # production build; grep output for secrets → none
```

Manual smoke on staging:
- Sign in as each role via SSO; confirm tenant isolation in the UI.
- Submit an FP + attach a document; confirm WORM write + SHA-256 + audit rows.
- Run one FP AI review (server-side; key never in the browser).
- Trigger each agent manually (`POST /api/agents/:id/run`); drafts land in the
  sign-off queue. Force an error and confirm it fails closed to OPERATOR REVIEW.
- Confirm a withheld tool (e.g. `send_email`) is rejected 403 + TOOL DENIED.
- Hit `GET /api/monitoring` as an operator; confirm the snapshot.

---

## 5. Go-live sequence

1. Deploy with `AGENTS_AUTONOMOUS=false`, `GATE5_CLEARED=false`.
2. Onboard the pilot AR (Codrington) — RUNBOOK §1.
3. Run the pilot quarter with agents **manual**. Execute the DPA; complete the
   pen test.
4. SMF16/17 clear Gate 5 in writing → set `GATE5_CLEARED=true`, then
   `AGENTS_AUTONOMOUS=true`, redeploy, audit the change (RUNBOOK §3).
5. Onboard SIX and Drake Star; monitoring live; SMF quarterly review standing.

---

## 6. Operational notes

- **Scaling:** the app is stateless; scale out horizontally. Prisma uses a
  connection singleton — size the Postgres connection pool for the instance
  count.
- **Backups:** enable PITR on the Flexible Server. Audit/agent-run retention is
  6/7 years — ensure backup retention and any archival tier meet that.
- **Rotation:** secrets rotate ≤ 90 days — RUNBOOK §2.
- **Monitoring:** alert on `failClosed.open > 0` and on any queue item breaching
  48h. Fail-closed alerts are reviewed, never auto-resolved.
