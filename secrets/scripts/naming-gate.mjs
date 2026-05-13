import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const allowed = [
  "secrets/scripts/naming-gate.mjs",
  "apps/host/Sources/CommanderAdapters/ObsidianAdapter.swift",
  "apps/host/Tests/CommanderE2ETests/CommanderE2ETests.swift",
];

const pattern = "vault|Vault|VAULT|claw vault|claw open vault|/v1/vault|VAULT_|clawixvault|CLAWIX_VAULT_DIR";
const roots = [
  "secrets",
  "packages/clawjs/bin",
  "packages/clawjs/src",
  "packages/clawjs-node/src/secrets",
  "docs",
  "package.json",
  "apps/host",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const res = spawnSync("rg", ["-n", pattern, ...roots], { cwd: repoRoot, encoding: "utf8" });
const lines = res.stdout.split("\n").filter(Boolean);
const failures = lines.filter((line) => !allowed.some((prefix) => line.startsWith(`${prefix}:`)));

if (failures.length > 0) {
  console.error("Secrets naming gate failed:");
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Secrets naming gate passed.");
