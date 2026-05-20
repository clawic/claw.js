#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliBin = path.join(repoRoot, "packages/clawjs/bin/claw.mjs");
const forbiddenFragments = [
  "Cannot find module",
  "ERR_MODULE_NOT_FOUND",
  "module not found",
  "CLI dist not built",
  "no such column",
  "SQLITE_ERROR",
];

function fail(message, details = "") {
  console.error(`[inspectability-gate] ${message}`);
  if (details.trim()) console.error(details.trim());
  process.exit(1);
}

function runCli(label, args) {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd: repoRoot,
    env: { ...process.env, FORCE_COLOR: "0" },
    encoding: "utf8",
  });
  const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  for (const fragment of forbiddenFragments) {
    if (combinedOutput.toLowerCase().includes(fragment.toLowerCase())) {
      fail(`${label} exposed a known inspectability failure: ${fragment}`, combinedOutput);
    }
  }
  if (result.status !== 0) {
    fail(`${label} exited ${result.status ?? "without a status"}`, combinedOutput);
  }
  const stdout = (result.stdout ?? "").trim();
  if (!stdout.startsWith("{")) {
    fail(`${label} did not return a JSON object envelope`, combinedOutput);
  }
  try {
    return JSON.parse(stdout);
  } catch (error) {
    fail(`${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`, combinedOutput);
  }
}

function assertEnvelope(label, payload) {
  if (!payload || typeof payload !== "object") fail(`${label} returned a non-object payload`);
  if (payload.ok !== true) fail(`${label} returned ok=false`, JSON.stringify(payload, null, 2));
  if (!payload.meta || payload.meta.schemaVersion !== 1) {
    fail(`${label} returned a payload without the common meta.schemaVersion envelope`, JSON.stringify(payload, null, 2));
  }
}

const schemas = runCli("claw inspect schemas --json", ["inspect", "schemas", "--json"]);
assertEnvelope("claw inspect schemas --json", schemas);
if (schemas.meta.canonicalCommand !== "inspect" || schemas.meta.subcommand !== "schemas") {
  fail("claw inspect schemas --json returned unexpected inspect metadata", JSON.stringify(schemas.meta, null, 2));
}
if (!Array.isArray(schemas.data) || !schemas.data.some((entry) => entry?.id === "claw.contracts.schemas")) {
  fail("claw inspect schemas --json did not include the canonical schema root", JSON.stringify(schemas.data?.slice?.(0, 5) ?? schemas.data, null, 2));
}

const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-inspectability-"));
const patientsSchema = runCli("claw collections patients schema --json", [
  "collections",
  "patients",
  "schema",
  "--workspace",
  workspaceRoot,
  "--json",
]);
assertEnvelope("claw collections patients schema --json", patientsSchema);
if (patientsSchema.data?.collection?.name !== "patients") {
  fail("claw collections patients schema --json did not return the patients schema", JSON.stringify(patientsSchema.data, null, 2));
}
if (!patientsSchema.data.exists) {
  fail("claw collections patients schema --json did not materialize the built-in patients collection", JSON.stringify(patientsSchema.data, null, 2));
}
if (!patientsSchema.data.collection.fields?.some((field) => field?.name === "displayName" && field?.required === true)) {
  fail("claw collections patients schema --json did not include the required displayName field", JSON.stringify(patientsSchema.data.collection.fields, null, 2));
}

fs.rmSync(workspaceRoot, { recursive: true, force: true });
console.log("inspectability gate passed");
