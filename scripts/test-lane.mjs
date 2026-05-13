#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const lane = process.argv[2] ?? "fast";
const extraArgs = process.argv.slice(3);

function run(command, args, options = {}) {
  const child = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: "inherit",
    shell: false,
  });
  if (child.status !== 0) {
    process.exit(child.status ?? 1);
  }
}

function npmRun(script, args = []) {
  run("npm", ["run", script, "--", ...args]);
}

function gitChangedFiles() {
  const base = spawnSync("git", ["merge-base", "HEAD", "origin/main"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const from = base.status === 0 && base.stdout.trim() ? base.stdout.trim() : "HEAD~1";
  const diff = spawnSync("git", ["diff", "--name-only", from, "--"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (diff.status !== 0) return [];
  return diff.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function vitest(args = []) {
  run("npx", ["vitest", "run", "--config", "vitest.config.ts", ...args]);
}

function fast(args = []) {
  npmRun("privacy:check");
  npmRun("privacy:test");
  npmRun("test:policy");
  vitest(args);
  npmRun("test:types");
}

function changed() {
  const files = gitChangedFiles();
  const testFiles = files.filter((file) =>
    /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(file) &&
    !file.includes("/tests/e2e/") &&
    !file.startsWith("tests/e2e/"),
  );
  if (testFiles.length > 0) {
    npmRun("privacy:check");
    npmRun("privacy:test");
    vitest(testFiles);
    npmRun("test:types");
    return;
  }
  fast();
}

function integration() {
  fast();
  for (const script of [
    "database:test",
    "audio:test",
    "sessions:test",
    "runtime:test",
    "mcp:test",
    "bridge:test",
    "content:test",
    "notify:test",
    "relay:test",
    "execution:test",
    "delegation:test",
    "secrets:test",
    "wiki:test",
    "drive:test",
    "memory:test",
  ]) {
    npmRun(script);
  }
}

function live() {
  if (process.env.CLAW_TEST_LIVE !== "1") {
    console.error("CLAW_TEST_LIVE=1 is required for the live lane.");
    process.exit(2);
  }
  npmRun("test:e2e:smoke-real", extraArgs);
}

function host() {
  if (process.env.CLAW_HOST_TEST_COMMAND) {
    run("bash", ["-lc", process.env.CLAW_HOST_TEST_COMMAND]);
    return;
  }
  console.error("EXTERNAL PENDING host lane: set CLAW_HOST_TEST_COMMAND for signed-host validation.");
}

function device() {
  if (process.env.CLAW_DEVICE_TEST_COMMAND) {
    run("bash", ["-lc", process.env.CLAW_DEVICE_TEST_COMMAND]);
    return;
  }
  console.error("EXTERNAL PENDING device lane: set CLAW_DEVICE_TEST_COMMAND for device validation.");
}

function release() {
  integration();
  npmRun("test:ts");
  npmRun("build");
  npmRun("test:docs");
  npmRun("test:pack");
  for (const script of [
    "database:test:e2e",
    "agenda:test:e2e",
    "time:test:e2e",
    "erp:test:e2e",
    "content:test:e2e",
    "iot:test:e2e",
    "relay:test:e2e",
    "execution:test:e2e",
    "delegation:test:e2e",
    "secrets:test:e2e",
    "drive:test:e2e",
    "memory:test:e2e",
    "test:e2e:ci",
  ]) {
    npmRun(script);
  }
  host();
  device();
}

switch (lane) {
  case "fast":
    fast(extraArgs);
    break;
  case "changed":
    changed();
    break;
  case "integration":
    integration();
    break;
  case "e2e":
    npmRun("test:e2e", extraArgs);
    break;
  case "host":
    host();
    break;
  case "device":
    device();
    break;
  case "live":
    live();
    break;
  case "release":
    release();
    break;
  default:
    console.error(`Unknown test lane: ${lane}`);
    process.exit(2);
}
