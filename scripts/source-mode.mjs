#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const args = process.argv.slice(2);
const command = args[0] ?? "status";

if (command === "activate") {
  const binDir = flagValue("--bin-dir");
  if (!binDir) usage("source mode activation needs --bin-dir <dir>");
  activate(path.resolve(expandHome(binDir)));
} else if (command === "status") {
  printStatus();
} else if (command === "verify") {
  const result = spawnSync(process.execPath, [path.join(rootDir, "scripts", "verify-source-mode.mjs")], {
    cwd: rootDir,
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
} else {
  usage(`unknown command ${command}`);
}

function activate(binDir) {
  assertSourceRoot(rootDir);
  fs.mkdirSync(binDir, { recursive: true });
  const shims = {
    claw: ["packages", "clawjs", "bin", "claw.mjs"],
    "create-claw-app": ["packages", "create-claw-app", "bin", "create-claw-app.mjs"],
    "create-claw-agent": ["packages", "create-claw-agent", "bin", "create-claw-agent.mjs"],
    "create-claw-server": ["packages", "create-claw-server", "bin", "create-claw-server.mjs"],
    "create-claw-plugin": ["packages", "create-claw-plugin", "bin", "create-claw-plugin.mjs"],
  };
  const tsxBin = path.join(rootDir, "node_modules", ".bin", "tsx");
  if (!fs.existsSync(tsxBin)) {
    throw new Error("Source mode activation needs npm ci first so node_modules/.bin/tsx exists.");
  }
  for (const [name, segments] of Object.entries(shims)) {
    const target = path.join(rootDir, ...segments);
    if (!fs.existsSync(target)) throw new Error(`Missing shim target ${path.relative(rootDir, target)}`);
    const shimPath = path.join(binDir, name);
    fs.writeFileSync(shimPath, [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `export CLAWJS_SOURCE_ROOT=${shellQuote(rootDir)}`,
      `exec ${shellQuote(tsxBin)} ${shellQuote(target)} "$@"`,
      "",
    ].join("\n"));
    fs.chmodSync(shimPath, 0o755);
  }
  printStatus({ binDir });
}

function printStatus(extra = {}) {
  assertSourceRoot(rootDir);
  const packageMap = packageMapFor(rootDir);
  console.log(JSON.stringify({
    ok: true,
    data: {
      active: true,
      trustLabel: "source",
      sourceRoot: rootDir,
      branch: git(["branch", "--show-current"]),
      commit: git(["rev-parse", "HEAD"]),
      packageCount: Object.keys(packageMap).length,
      packageMap,
      ...extra,
    },
    meta: { schemaVersion: 1, canonicalCommand: "source" },
  }, null, 2));
}

function packageMapFor(sourceRoot) {
  const packagesDir = path.join(sourceRoot, "packages");
  const entries = {};
  for (const dirent of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const packageDir = path.join(packagesDir, dirent.name);
    const packageJsonPath = path.join(packageDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) continue;
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    if (!packageJson.name || !isSourceManagedPackage(packageJson.name)) continue;
    entries[packageJson.name] = {
      version: packageJson.version ?? null,
      relativePath: path.relative(sourceRoot, packageDir),
    };
  }
  return Object.fromEntries(Object.entries(entries).sort(([left], [right]) => left.localeCompare(right)));
}

function isSourceManagedPackage(packageName) {
  return packageName.startsWith("@clawjs/")
    || packageName.startsWith("create-claw-")
    || packageName === "eslint-config-claw";
}

function assertSourceRoot(sourceRoot) {
  const rootPackageJson = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
  const cliPackageJson = JSON.parse(fs.readFileSync(path.join(sourceRoot, "packages", "clawjs", "package.json"), "utf8"));
  if (rootPackageJson.name !== "@clawjs/monorepo" || cliPackageJson.name !== "@clawjs/cli") {
    throw new Error(`${sourceRoot} is not a ClawJS source checkout`);
  }
}

function flagValue(name) {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function git(gitArgs) {
  const result = spawnSync("git", gitArgs, { cwd: rootDir, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function expandHome(value) {
  if (value === "~") return process.env.HOME ?? value;
  if (value.startsWith("~/")) return path.join(process.env.HOME ?? "~", value.slice(2));
  return value;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function usage(message) {
  console.error(`${message}\nUsage: node scripts/source-mode.mjs activate --bin-dir <dir>|status|verify`);
  process.exit(64);
}
