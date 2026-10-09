import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
function check(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "var", "uploads", ".git", "test-results"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) check(p);
    else if (p.endsWith(".js") || p.endsWith(".mjs")) {
      const r = spawnSync(process.execPath, ["--check", p], {
        stdio: "inherit",
      });
      if (r.status) process.exit(r.status);
    }
  }
}
check(".");
console.log("JavaScript syntax OK");
