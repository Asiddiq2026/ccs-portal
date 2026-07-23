import { z } from "zod";
import { PER_AR_REGISTERS, type PerArRegister, type Tool } from "./types";

const REGISTERS = [...PER_AR_REGISTERS] as [string, ...string[]];

/**
 * write_register_entry — WRITE. Every write lands as a PENDING sign-off draft.
 * It NEVER persists a FINAL register row: FINAL materialisation happens only on
 * an audited SMF sign-off (Invariants 1 & 3). The output status is a literal
 * "PENDING" so a caller can never coax a FINAL write out of this path.
 */
export const writeRegisterEntry: Tool = {
  name: "write_register_entry",
  kind: "WRITE",
  input: z.object({
    register: z.enum(REGISTERS),
    arId: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
    summary: z.string().min(1),
  }),
  output: z.object({
    id: z.string(),
    status: z.literal("PENDING"),
  }),
  async run(input, ctx) {
    const draft = await ctx.deps.store.createPendingDraft(
      {
        register: input.register as PerArRegister,
        arId: input.arId,
        payload: input.data,
        summary: input.summary,
        agentId: ctx.agentId,
        createdBy: ctx.agentId,
      },
      ctx.tenant,
    );
    await ctx.deps.audit.append(
      {
        actor: ctx.agentId,
        action: "REGISTER WRITE (PENDING)",
        entity: input.register,
        entityId: draft.id,
      },
      ctx.tenant,
    );
    return { id: draft.id, status: "PENDING" };
  },
};
