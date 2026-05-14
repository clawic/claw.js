import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);

const workspaces = [
  "@clawjs/core",
  "@clawjs/claw",
  "@clawjs/node",
  "@clawjs/sessions",
  "@clawjs/user-model",
  "@clawjs/audio",
  "@clawjs/sandbox",
  "@clawjs/mcp",
  "@clawjs/voice",
  "@clawjs/channel-base",
  "@clawjs/mesh",
  "@clawjs/marketplace",
  "@clawjs/profile",
  "@clawjs/workspace",
  "@clawjs/database",
  "@clawjs/agents",
  "@clawjs/integrations",
  "@clawjs/index",
  "@clawjs/runtime",
  "@clawjs/ssh-client",
  "@clawjs/cli",
  "@clawjs/openclaw-plugin",
  "@clawjs/openclaw-context-engine",
  "create-claw-app",
  "create-claw-agent",
  "create-claw-server",
  "create-claw-plugin",
  "eslint-config-claw",
];

const workspacePackages = new Map();
for (const packageDir of fs.readdirSync(path.join(rootDir, "packages"))) {
  const packageJsonPath = path.join(rootDir, "packages", packageDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (typeof manifest.name === "string") {
    workspacePackages.set(manifest.name, { packageJsonPath, packageDir: path.dirname(packageJsonPath), manifest });
  }
}

for (const workspace of workspaces) {
  const result = spawnSync("npm", ["run", "build", "--workspace", workspace], {
    cwd: rootDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  waitForWorkspaceTypes(workspace);
}

function waitForWorkspaceTypes(workspace) {
  const entry = workspacePackages.get(workspace);
  if (!entry || typeof entry.manifest.types !== "string") return;

  const typesPath = path.join(entry.packageDir, entry.manifest.types);
  let previousSize = -1;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (fs.existsSync(typesPath)) {
      const { size } = fs.statSync(typesPath);
      if (size > 0 && size === previousSize) return;
      previousSize = size;
    }
    sleep(100);
  }

  if (!fs.existsSync(typesPath)) {
    throw new Error(`Workspace ${workspace} did not produce ${path.relative(rootDir, typesPath)}`);
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
