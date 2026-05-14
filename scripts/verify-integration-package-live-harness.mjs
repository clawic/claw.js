#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const scratchDir = path.join(rootDir, ".tmp-integration-package-live");
const packageDirs = [
  { name: "@clawjs/core", dir: path.join(rootDir, "packages", "clawjs-core") },
  { name: "@clawjs/agents", dir: path.join(rootDir, "packages", "clawjs-agents") },
  { name: "@clawjs/integrations", dir: path.join(rootDir, "packages", "clawjs-integrations") },
];
const liveRequested = process.env.CLAW_TEST_LIVE === "1" || process.env.CLAW_TEST_LIVE_PACKAGE === "1";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    shell: false,
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(`${command} ${args.join(" ")} failed${stderr ? `: ${stderr}` : stdout ? `: ${stdout}` : ""}`);
  }
  return result.stdout;
}

function runVisible(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function removeScratch() {
  fs.rmSync(scratchDir, { force: true, recursive: true });
}

function parsePackOutput(output) {
  const entries = JSON.parse(output);
  const first = entries[0];
  if (!first?.filename) {
    throw new Error("npm pack did not return a tarball filename.");
  }
  return path.join(scratchDir, first.filename);
}

function buildAndPackWorkspacePackage(entry) {
  runVisible("npm", ["--workspace", entry.name, "run", "build"]);
  const output = run("npm", ["pack", "--json", "--pack-destination", scratchDir], { cwd: entry.dir });
  return parsePackOutput(output);
}

function assertNoRawLiveSecrets() {
  const denied = [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_TOKEN",
    "TELEGRAM_BOT_API",
    "STRIPE_API_KEY",
    "STRIPE_SECRET_KEY",
  ].filter((name) => process.env[name]);
  if (denied.length > 0) {
    throw new Error(`raw live credential env vars are not allowed in package/live harness: ${denied.join(", ")}`);
  }
}

function installedSmoke(appDir) {
  const smokePath = path.join(appDir, "smoke.mjs");
  fs.writeFileSync(smokePath, `
    import assert from "node:assert/strict";
    import {
      TELEGRAM_OFFICIAL_API_MATRIX,
      buildConnectorCredentialLeaseRequest,
      runConnectorOperation,
      verifyOfficialApiCoverageMatrix,
    } from "@clawjs/integrations";

    assert.equal(typeof runConnectorOperation, "function");
    assert.equal(typeof buildConnectorCredentialLeaseRequest, "function");
    const report = verifyOfficialApiCoverageMatrix(TELEGRAM_OFFICIAL_API_MATRIX);
    assert.equal(report.provider, "telegram_bot_api");
    assert.equal(report.totalOfficialMethods, 176);
  `);
  runVisible(process.execPath, [smokePath], { cwd: appDir });
}

function runBrokerCommand(tarballPath, appDir) {
  const brokerCommand = process.env.CLAW_LIVE_BROKER_COMMAND;
  if (!brokerCommand) {
    console.error("EXTERNAL PENDING package/live lane: set CLAW_LIVE_BROKER_COMMAND for approved brokered live validation.");
    return;
  }
  assertNoRawLiveSecrets();
  const result = spawnSync("bash", ["-lc", brokerCommand], {
    cwd: appDir,
    env: {
      ...process.env,
      CLAWJS_INTEGRATION_PACKAGE_READY: "1",
      CLAWJS_INTEGRATION_PACKAGE_DIR: appDir,
      CLAWJS_INTEGRATION_PACKAGE_TARBALL: tarballPath,
      CLAWJS_LIVE_PROVIDER: "telegram_bot_api",
    },
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runDockerSmoke(tarballPath) {
  if (process.env.CLAWJS_PACKAGE_LIVE_DOCKER !== "1") {
    console.error("EXTERNAL PENDING package/docker lane: set CLAWJS_PACKAGE_LIVE_DOCKER=1 to run the containerized install check.");
    return;
  }
  const dockerVersion = spawnSync("docker", ["--version"], { encoding: "utf8" });
  if (dockerVersion.status !== 0) {
    console.error("EXTERNAL PENDING package/docker lane: docker is not available.");
    return;
  }
  const dockerInfo = spawnSync("docker", ["info"], { encoding: "utf8" });
  if (dockerInfo.status !== 0) {
    const reason = (dockerInfo.stderr || dockerInfo.stdout || "docker daemon is not reachable").trim().split(/\r?\n/)[0];
    console.error(`EXTERNAL PENDING package/docker lane: ${reason}`);
    return;
  }
  const mountDir = path.dirname(tarballPath);
  const tarballName = path.basename(tarballPath);
  runVisible("docker", [
    "run",
    "--rm",
    "-v",
    `${mountDir}:/candidate:ro`,
    "node:20-alpine",
    "sh",
    "-lc",
    `mkdir /tmp/app && cd /tmp/app && npm init -y >/dev/null && npm install --ignore-scripts /candidate/${tarballName} >/dev/null && node -e "import('@clawjs/integrations').then((m)=>{ if (!m.TELEGRAM_OFFICIAL_API_MATRIX) process.exit(1); })"`,
  ]);
}

removeScratch();
fs.mkdirSync(scratchDir, { recursive: true });

try {
  assertNoRawLiveSecrets();
  const tarballs = packageDirs.map((entry) => buildAndPackWorkspacePackage(entry));
  const tarballPath = tarballs.find((entry) => path.basename(entry).startsWith("clawjs-integrations-"));
  if (!tarballPath) {
    throw new Error("failed to pack @clawjs/integrations candidate tarball.");
  }
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-integration-package-live."));
  fs.writeFileSync(path.join(appDir, "package.json"), JSON.stringify({
    name: "clawjs-integration-package-live",
    version: "0.0.0",
    private: true,
    type: "module",
  }, null, 2));
  runVisible("npm", ["install", "--ignore-scripts", ...tarballs], { cwd: appDir });
  installedSmoke(appDir);
  runDockerSmoke(tarballPath);
  if (liveRequested) {
    runBrokerCommand(tarballPath, appDir);
  } else {
    console.error("EXTERNAL PENDING package/live lane: set CLAW_TEST_LIVE=1 and CLAW_LIVE_BROKER_COMMAND for brokered live validation.");
  }
  console.log("integration package/live harness passed");
} finally {
  removeScratch();
}
