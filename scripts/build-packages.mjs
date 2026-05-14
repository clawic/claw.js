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
  const args = ["run", "build", "--workspace", workspace];
  if (!hasBuildTsconfig(workspace)) {
    args.push("--", "--tsconfig", writePackageTsconfig(workspace));
  }
  const result = spawnSync("npm", args, {
    cwd: rootDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  waitForWorkspaceTypes(workspace);
}

function hasBuildTsconfig(workspace) {
  const entry = workspacePackages.get(workspace);
  return typeof entry?.manifest?.scripts?.build === "string" && entry.manifest.scripts.build.includes("--tsconfig");
}

function writePackageTsconfig(workspace) {
  const entry = workspacePackages.get(workspace);
  if (!entry) {
    throw new Error(`Unknown workspace ${workspace}`);
  }
  const configDir = path.join(rootDir, ".tmp", "package-build-tsconfig");
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, `${workspace.replaceAll("/", "__").replaceAll("@", "")}.json`);
  fs.writeFileSync(configPath, JSON.stringify({
    extends: path.join(rootDir, "tsconfig.json"),
    include: [
      path.join(entry.packageDir, "src/**/*.ts"),
    ],
    exclude: [
      path.join(entry.packageDir, "src/**/*.test.ts"),
      path.join(entry.packageDir, "src/**/*.spec.ts"),
      path.join(entry.packageDir, "src/**/__tests__/**"),
      path.join(entry.packageDir, "template/**/*"),
      path.join(entry.packageDir, "templates/**/*"),
    ],
  }, null, 2));
  return path.relative(rootDir, configPath);
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
