// Mint a training-ingest service token for one AR firm.
//
//   npm run token:mint -- <arId>
//   e.g.  npm run token:mint -- ar_six
//
// Prints the RAW token exactly once — hand it to the training platform's
// operator and store it in the secrets vault; it is never recoverable from
// this platform (only its SHA-256 hash is configured, Invariant 6). The
// printed registry entry goes into TRAINING_INGEST_TOKENS (comma-separated
// with any existing entries).
//
// The token is AR-scoped: it can append training completions/certificates for
// exactly this firm and nothing else (wrong-firm bodies are rejected 403, and
// RLS confines the write path regardless).
import { randomBytes } from "node:crypto";
import { formatRegistryEntry } from "../src/lib/training/service-token";

const arId = process.argv[2];

if (!arId || !/^ar_[a-z0-9_]{2,30}$/.test(arId)) {
  console.error("usage: npm run token:mint -- <arId>   (e.g. ar_six — must match an appointed_rep row)");
  process.exit(1);
}

const raw = `tt_${randomBytes(32).toString("hex")}`;
const entry = formatRegistryEntry(arId, raw);

console.log(`raw token (shown ONCE — vault it, never commit it):`);
console.log(`  ${raw}`);
console.log();
console.log(`registry entry for TRAINING_INGEST_TOKENS:`);
console.log(`  ${entry}`);
console.log();
console.log(`next steps:`);
console.log(`  1. append the entry to TRAINING_INGEST_TOKENS (comma-separated), restart the app`);
console.log(`  2. give the raw token to ${arId}'s training platform (server-side config or vault)`);
console.log(`  3. add that platform's origin to TRAINING_CORS_ORIGINS only if it calls from a browser`);
console.log(`     (browser-held tokens are readable by every user of the page — prefer a server-side proxy)`);
console.log(`  4. verify ${arId} exists in appointed_rep — an unknown arId writes rows nobody can read`);
