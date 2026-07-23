import type { Config } from "tailwindcss";

// Design tokens sourced from design_handoff_ccs_platform/README.md (CCS internal
// light theme). Values are wired to the CSS variables declared in globals.css so
// the palette stays single-sourced.
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--ccs-bg)",
        card: "var(--ccs-card)",
        border: "var(--ccs-border)",
        panel: "var(--ccs-panel)",
        text: {
          DEFAULT: "var(--ccs-text)",
          secondary: "var(--ccs-text-secondary)",
          muted: "var(--ccs-text-muted)",
        },
        accent: {
          DEFAULT: "var(--ccs-accent)",
          hover: "var(--ccs-accent-hover)",
        },
        status: {
          success: "var(--ccs-success)",
          warn: "var(--ccs-warn)",
          danger: "var(--ccs-danger)",
          info: "var(--ccs-info)",
          ai: "var(--ccs-ai)",
          live: "var(--ccs-live)",
        },
        // Razlin AR portal deltas
        razlin: {
          header: "var(--razlin-header)",
          accent: "var(--razlin-accent)",
        },
      },
      fontFamily: {
        heading: ["var(--font-sora)", "sans-serif"],
        body: ["var(--font-manrope)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      borderRadius: {
        // Square corners are part of the spec.
        none: "0",
      },
      boxShadow: {
        card: "0 1px 3px rgba(16,24,40,.05)",
      },
    },
  },
  plugins: [],
};

export default config;
