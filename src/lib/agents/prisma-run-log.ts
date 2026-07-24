// AgentRun writer backed by Prisma. agent_run is append-only (RLS revokes
// UPDATE/DELETE); this is the only writer. 7-year retention.
import { randomUUID } from "node:crypto";
import { withTenant } from "../db";
import type { AgentRunWriter } from "./runner";

export const prismaAgentRunLog: AgentRunWriter = {
  async append(run, tenant) {
    return withTenant(tenant, async (tx) => {
      // createMany (no RETURNING): agent_run's SELECT policy is operator-only, and
      // INSERT ... RETURNING is gated by it, so a non-operator writer could not
      // read back its own row. Generate the id here; append-only WITH CHECK still
      // passes. (Same reasoning as prismaAudit.)
      const id = `run_${randomUUID()}`;
      await tx.agentRun.createMany({
        data: [
          {
            id,
            agentId: run.agentId,
            version: run.version,
            promptHash: run.promptHash,
            inputHash: run.inputHash,
            tokens: run.tokens,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            output: run.output as any,
          },
        ],
      });
      return { id };
    });
  },
};
