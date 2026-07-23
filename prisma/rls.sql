-- ===========================================================================
-- CCS AR Oversight Platform — Row-Level Security policies.
--
-- Prisma does not manage RLS, so these policies are applied out-of-band after
-- every `prisma migrate` (see `npm run db:rls`, wired into `npm run db:setup`).
-- Re-run after any migration: Prisma may recreate tables and drop grants.
--
-- Enforces Invariants 4 & 5 from design_handoff_ccs_platform/README.md:
--   #5 RLS tenant isolation — arId = current_setting('app.ar_id') per table;
--      COMPLIANCE read-all + draft; SMF sign-off.
--   #4 Append-only audit — app role has INSERT only on audit_event/agent_run;
--      no UPDATE/DELETE grants.
--
-- The app connects as `ccs_app`, a non-superuser NOBYPASSRLS role (see
-- docker/postgres/init.sql). FORCE ROW LEVEL SECURITY makes the policies bind
-- even though ccs_app owns the tables. Two GUCs carry request context, set per
-- transaction via SET LOCAL (see src/lib/db.ts):
--   app.ar_id  — the caller's firm (arId)
--   app.role   — AR | COMPLIANCE | SMF
-- current_setting(..., true) returns NULL when unset, so a context-less
-- connection matches no rows (fail-closed).
--
-- NOTE ON LAYERING: the PENDING -> FINAL transition is SMF-only authority. That
-- is enforced in the API tool layer (Phase 3, write_register_entry /
-- enqueue_for_signoff / sign-off action), not in RLS, since it is a
-- status-transition rule rather than a row-visibility rule.
--
-- PRODUCTION HARDENING: run migrations as a dedicated owner role distinct from
-- the runtime ccs_app role, so the runtime role is a non-owner and cannot
-- re-grant privileges to itself. In local dev ccs_app owns the tables and the
-- REVOKEs below provide defense-in-depth.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Per-AR tenant-isolated registers
-- ---------------------------------------------------------------------------

-- appointed_rep
ALTER TABLE "appointed_rep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointed_rep" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "appointed_rep";
CREATE POLICY tenant_isolation ON "appointed_rep"
  USING (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  )
  WITH CHECK (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  );

-- cf30_return
ALTER TABLE "cf30_return" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cf30_return" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cf30_return";
CREATE POLICY tenant_isolation ON "cf30_return"
  USING (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  )
  WITH CHECK (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  );

-- financial_promotion
ALTER TABLE "financial_promotion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_promotion" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "financial_promotion";
CREATE POLICY tenant_isolation ON "financial_promotion"
  USING (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  )
  WITH CHECK (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  );

-- risk_score
ALTER TABLE "risk_score" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "risk_score" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "risk_score";
CREATE POLICY tenant_isolation ON "risk_score"
  USING (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  )
  WITH CHECK (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  );

-- data_breach
ALTER TABLE "data_breach" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_breach" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "data_breach";
CREATE POLICY tenant_isolation ON "data_breach"
  USING (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  )
  WITH CHECK (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  );

-- person_cpd
ALTER TABLE "person_cpd" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "person_cpd" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "person_cpd";
CREATE POLICY tenant_isolation ON "person_cpd"
  USING (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  )
  WITH CHECK (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  );

-- promotion_document — tenant-isolated FP document manifest.
ALTER TABLE "promotion_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promotion_document" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "promotion_document";
CREATE POLICY tenant_isolation ON "promotion_document"
  USING (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  )
  WITH CHECK (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  );

-- sign_off_item (PENDING draft queue) — tenant-isolated like the registers.
ALTER TABLE "sign_off_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sign_off_item" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "sign_off_item";
CREATE POLICY tenant_isolation ON "sign_off_item"
  USING (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  )
  WITH CHECK (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  );

-- training_completion — HYBRID: tenant-isolated per AR (like the registers) AND
-- append-only (like the audit log). SELECT/INSERT are scoped to the caller's
-- firm; UPDATE/DELETE/TRUNCATE are revoked so completion evidence is immutable.
ALTER TABLE "training_completion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_completion" FORCE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE, TRUNCATE ON "training_completion" FROM ccs_app;
DROP POLICY IF EXISTS tenant_isolation ON "training_completion";
CREATE POLICY tenant_isolation ON "training_completion"
  USING (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  )
  WITH CHECK (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  );

-- ---------------------------------------------------------------------------
-- Network-scoped append-only registers
-- Network-wide read for COMPLIANCE + SMF only; INSERT allowed; no UPDATE/DELETE.
-- ---------------------------------------------------------------------------

-- audit_event
ALTER TABLE "audit_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_event" FORCE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_event" FROM ccs_app;
DROP POLICY IF EXISTS append_only ON "audit_event";
DROP POLICY IF EXISTS network_read ON "audit_event";
CREATE POLICY append_only ON "audit_event"
  FOR INSERT WITH CHECK (true);
CREATE POLICY network_read ON "audit_event"
  FOR SELECT USING (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
  );

-- agent_run
ALTER TABLE "agent_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_run" FORCE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE, TRUNCATE ON "agent_run" FROM ccs_app;
DROP POLICY IF EXISTS append_only ON "agent_run";
DROP POLICY IF EXISTS network_read ON "agent_run";
CREATE POLICY append_only ON "agent_run"
  FOR INSERT WITH CHECK (true);
CREATE POLICY network_read ON "agent_run"
  FOR SELECT USING (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
  );
