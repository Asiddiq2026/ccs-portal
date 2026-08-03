// Tiny static server for the Codrington training app — deliberately a SEPARATE
// origin (http://localhost:4173) from the oversight platform, because that is
// the real deployment shape: the training platform is an external client of the
// ingest APIs, allowlisted via TRAINING_CORS_ORIGINS. Run: npm run training:app
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = 4173;
const page = new URL("./index.html", import.meta.url);

createServer((req, res) => {
  // Single-page app: every path serves the page. Re-read per request so edits
  // to index.html show on refresh without restarting.
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(readFileSync(page));
}).listen(PORT, () => {
  console.log(`Codrington training app: http://localhost:${PORT}`);
  console.log("Expects the oversight platform on http://localhost:3000 (npm run dev).");
});
