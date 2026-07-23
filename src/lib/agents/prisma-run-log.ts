// AgentRun writer backed by Prisma. agent_run is append-only (RLS revokes
// UPDATE/DELETE); this is the only writer. 7-year retention.
import { withTenant } from "../db";
import type { AgentRunWriter } from "./runner";

export const prismaAgentRunLog: AgentRunWriter = {
  async append(run, tenant) {
    return withTenant(tenant, async (tx) => {
      const row = await tx.agentRun.create({
        data: {
          agentId: run.agentId,
          version: run.version,
          promptHash: run.promptHash,
          inputHash: run.inputHash,
          tokens: run.tokens,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          output: run.output as any,
        },
      });
      return { id: row.id };
    });
  },
};
