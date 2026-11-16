#!/usr/bin/env node
// Usage: node test/cli.js file.syx [...]   — prints the report for each file (exit 1 if any is not safe/warn)
const fs = require("fs"), path = require("path");
const S = require("../docs/sanity.js");
let bad = 0;
for (const f of process.argv.slice(2)) {
  const t = Date.now();
  const r = S.check(new Uint8Array(fs.readFileSync(f)), path.basename(f));
  if (process.env.BRIEF) console.log(r.verdict.padEnd(9), path.basename(f), `${Date.now() - t}ms`, r.checks.filter(c => !["pass","info"].includes(c.status)).map(c => c.status + ":" + c.title).join(" | "));
  else console.log(S.report(r) + "\n");
  if (r.verdict === "fail" || r.verdict === "critical") bad++;
}
process.exit(bad ? 1 : 0);
