// Applies prisma/rls.sql through the Prisma connection. Run after every
// migration: `npm run db:rls` (also part of `npm run db:setup`).
//
// OWNERSHIP: ENABLE/FORCE ROW LEVEL SECURITY, CREATE POLICY, and REVOKE all
// require table ownership. In local dev `ccs_app` owns the tables, so the
// runtime `DATABASE_URL` works. In production the recommended hardening runs
// migrations as a dedicated OWNER role distinct from the runtime `ccs_app`
// (see prisma/rls.sql header) — there, set `RLS_DATABASE_URL` to that owner/
// admin connection so this script does not fail as the non-owner runtime role.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

// Prefer an explicit admin/owner connection for DDL; fall back to DATABASE_URL.
const rlsUrl = process.env.RLS_DATABASE_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient(
  rlsUrl ? { datasources: { db: { url: rlsUrl } } } : undefined,
);

async function main() {
  const sql = readFileSync(join(process.cwd(), "prisma", "rls.sql"), "utf8");

  // Split into individual statements. Strip `--` line comments FIRST, then
  // split on `;`: comment text can itself contain semicolons (e.g. the header's
  // "COMPLIANCE read-all + draft; SMF sign-off."), which would otherwise split
  // into bogus fragments like "SMF sign-off." and fail with a syntax error.
  // rls.sql intentionally has no dollar-quoting and no string literals
  // containing `;` or `--`, so comment-strip-then-split is safe.
  const statements = sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }

  console.log(`Applied ${statements.length} RLS statements.`);
}

main()
  .catch((e) => {
    console.error("Failed to apply RLS policies:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
