import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);

const checks = [
  {
    file: "packages/clawjs/bin/claw.mjs",
    forbidden: [
      "@clawjs/core",
      "@clawjs/core/catalogs",
      "./secrets-commands.mjs",
      "./catalog-commands.mjs",
      "./database-server-launcher.mjs",
      "./memory-server-launcher.mjs",
      "./drive-server-launcher.mjs",
      "./audio-server-launcher.mjs",
      "./index-server-launcher.mjs",
      "./sessions-server-launcher.mjs",
    ],
  },
  {
    file: "packages/clawjs/src/index.ts",
    forbidden: [
      "@clawjs/core",
      "@clawjs/claw",
      "@clawjs/workspace",
      "@clawjs/database",
      "@clawjs/search",
      "better-sqlite3",
      "./chat.ts",
      "./database-magic.ts",
      "./inspect-cli.ts",
      "./memory-local.ts",
      "./v1-data.ts",
    ],
  },
  {
    file: "packages/clawjs/src/cli-json.ts",
    forbidden: [
      "@clawjs/core",
      "@clawjs/claw",
    ],
  },
  {
    file: "packages/clawjs/src/cli-surface.ts",
    forbidden: [
      "@clawjs/core",
      "@clawjs/claw",
    ],
  },
];

const failures = [];

for (const check of checks) {
  const text = fs.readFileSync(path.join(rootDir, check.file), "utf8");
  for (const forbidden of check.forbidden) {
    const staticImportPattern = new RegExp(`(?:import|export)\\s+(?:[^"']+\\s+from\\s+)?["']${escapeRegExp(forbidden)}["']`);
    if (staticImportPattern.test(text)) {
      failures.push(`${check.file}: forbidden base static import ${forbidden}`);
    }
  }
}

if (failures.length > 0) {
  console.error("CLI base import check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("cli base imports passed");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
