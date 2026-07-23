import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirror the tsconfig `@/*` path alias so Vitest resolves the same imports the
// Next.js build does. Vitest does not read tsconfig `paths`, so without this
// any `src` module that imports via `@/…` fails to resolve under the runner.
// A `^@/` regex (not a bare `@`) so scoped deps like `@prisma/client` and
// `@azure/storage-blob` are left untouched.
const srcDir = fileURLToPath(new URL("./src", import.meta.url)).replace(/\\/g, "/");

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${srcDir}/` }],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
