import { z } from "zod";
import {
  NETWORK_READ_TABLES,
  PER_AR_REGISTERS,
  ToolDeniedError,
  type Tool,
} from "./types";

const QUERYABLE = [...PER_AR_REGISTERS, ...NETWORK_READ_TABLES] as [
  string,
  ...string[],
];

/**
 * query_database — READ. Scoped reads only. Row-level security applies the
 * caller's arId automatically (via withTenant in the Prisma adapter); this tool
 * additionally blocks AR-role callers from the internal network tables.
 */
export const queryDatabase: Tool = {
  name: "query_database",
  kind: "READ",
  input: z.object({
    table: z.enum(QUERYABLE),
    filter: z.record(z.string(), z.unknown()).optional(),
  }),
  output: z.object({
    rows: z.array(z.record(z.string(), z.unknown())),
  }),
  async run(input, ctx) {
    if (
      (NETWORK_READ_TABLES as readonly string[]).includes(input.table) &&
      ctx.tenant.role === "AR"
    ) {
      throw new ToolDeniedError(
        "query_database",
        `AR role cannot read internal table ${input.table}`,
      );
    }
    const rows = await ctx.deps.store.query(input.table, input.filter, ctx.tenant);
    return { rows };
  },
};
