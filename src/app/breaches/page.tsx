// Data-breach channel (UK GDPR Art 33). Visible to every signed-in role: an AR
// sees and logs only its own firm's breaches (RLS enforces this regardless of
// what is requested); operators see the network. The 72h clocks are computed
// server-side by the deterministic engine so the browser never does the maths.
import { requireTenant } from "@/lib/session";
import { ConsoleShell, AccessPanel } from "@/components/ConsoleShell";
import { BreachConsole, type BreachRow } from "@/components/BreachConsole";
import { breachPrismaDeps } from "@/lib/breach/prisma-adapter";
import { listBreaches } from "@/lib/breach/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BreachesPage() {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return (
      <AccessPanel
        title="Sign in required"
        body="The data-breach register is restricted to authenticated users. Sign in to continue."
      />
    );
  }

  // An AR is scoped to its own firm; operators see every firm.
  const filter = tenant.role === "AR" ? { arId: tenant.arId } : {};
  const breaches = (await listBreaches(breachPrismaDeps, tenant, filter)) as BreachRow[];

  return (
    <ConsoleShell role={tenant.role} active="/breaches">
      <BreachConsole role={tenant.role} arId={tenant.arId} breaches={breaches} />
    </ConsoleShell>
  );
}
