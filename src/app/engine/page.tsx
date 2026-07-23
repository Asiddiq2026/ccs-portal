// Deterministic Engine diagnostics — operator-only read-only view over the pure
// engine (src/lib/engine). No DB access, no writes: the client harness computes
// live against the same functions the runtime uses (Invariant 7). Gated to
// COMPLIANCE/SMF like the rest of the console.
import { requireTenant } from "@/lib/session";
import { ConsoleShell, AccessPanel } from "@/components/ConsoleShell";
import { EngineHarness } from "@/components/EngineHarness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function EnginePage() {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return (
      <AccessPanel
        title="Sign in required"
        body="Engine diagnostics are restricted to CCS compliance operators. Sign in to continue."
      />
    );
  }
  if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
    return (
      <AccessPanel
        title="Operators only"
        body="The deterministic-engine diagnostics are visible to COMPLIANCE and SMF only."
      />
    );
  }

  return (
    <ConsoleShell role={tenant.role} active="/engine">
      <EngineHarness />
    </ConsoleShell>
  );
}
