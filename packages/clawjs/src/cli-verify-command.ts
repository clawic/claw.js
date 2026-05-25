import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { requireMacCareRoutePathPattern } from "@clawjs/core";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import type { CliContext } from "./index.ts";

export interface VerifyCliInput {
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
}

interface VerificationIssue {
  code: string;
  message: string;
  path?: string;
}

function flagValue(argv: string[], name: string): string | undefined {
  const equals = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0) return argv[index + 1];
  return undefined;
}

function readJson(filePath: string, code: string, label: string): { ok: true; value: unknown } | { ok: false; issue: VerificationIssue } {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(filePath, "utf8")) };
  } catch (error) {
    return {
      ok: false,
      issue: {
        code,
        message: `${label} must contain valid JSON: ${error instanceof Error ? error.message : "parse error"}`,
        path: filePath,
      },
    };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: Record<string, unknown>, field: string): string | undefined {
  const entry = value[field];
  return typeof entry === "string" && entry.trim() ? entry : undefined;
}

function sha256(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function resolveAgainst(baseDir: string, candidate: string | undefined): string | null {
  if (!candidate) return null;
  return path.isAbsolute(candidate) ? candidate : path.resolve(baseDir, candidate);
}

function verifyPluginTempRoot(): string {
  return requireMacCareRoutePathPattern("mac_care.route.system_temp");
}

function verifyTarExecutablePath(): string {
  return requireMacCareRoutePathPattern("mac_care.route.system_tar_cli");
}

function validateReleaseManifest(manifestPath: string): { ok: boolean; artifacts: unknown[]; issues: VerificationIssue[] } {
  const issues: VerificationIssue[] = [];
  const absoluteManifest = path.resolve(manifestPath);
  const baseDir = path.dirname(absoluteManifest);
  if (!fs.existsSync(absoluteManifest)) {
    return { ok: false, artifacts: [], issues: [{ code: "manifest_missing", message: `Release manifest is missing: ${manifestPath}` }] };
  }
  const manifestJson = readJson(absoluteManifest, "manifest_json_invalid", "Release manifest");
  if (!manifestJson.ok) return { ok: false, artifacts: [], issues: [manifestJson.issue] };
  const manifest = manifestJson.value;
  if (!isObject(manifest)) {
    return { ok: false, artifacts: [], issues: [{ code: "manifest_invalid", message: "Release manifest must be a JSON object" }] };
  }
  if (manifest.schemaVersion !== 1) issues.push({ code: "schema_version", message: "Release manifest schemaVersion must be 1" });
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  if (artifacts.length === 0) issues.push({ code: "artifacts_missing", message: "Release manifest must list at least one artifact" });
  for (const [index, artifact] of artifacts.entries()) {
    const label = `artifacts[${index}]`;
    if (!isObject(artifact)) {
      issues.push({ code: "artifact_invalid", message: `${label} must be an object` });
      continue;
    }
    const name = stringField(artifact, "name");
    const version = stringField(artifact, "version");
    const artifactPath = stringField(artifact, "path");
    const expectedSha = stringField(artifact, "sha256");
    if (!name) issues.push({ code: "artifact_name_missing", message: `${label}.name is required` });
    if (!version) issues.push({ code: "artifact_version_missing", message: `${label}.version is required` });
    if (!artifactPath) issues.push({ code: "artifact_path_missing", message: `${label}.path is required` });
    if (!expectedSha || !/^[a-f0-9]{64}$/u.test(expectedSha)) issues.push({ code: "artifact_sha256_missing", message: `${label}.sha256 must be a hex SHA-256 digest` });
    const resolvedArtifact = resolveAgainst(baseDir, artifactPath);
    if (resolvedArtifact && fs.existsSync(resolvedArtifact) && expectedSha && sha256(resolvedArtifact) !== expectedSha) {
      issues.push({ code: "artifact_sha256_mismatch", message: `${label}.sha256 does not match file contents`, path: artifactPath });
    }
    if (resolvedArtifact && !fs.existsSync(resolvedArtifact)) {
      issues.push({ code: "artifact_missing", message: `${label}.path does not exist`, path: artifactPath });
    }
    for (const field of ["sbom", "provenance"]) {
      const value = artifact[field];
      if (!isObject(value) || !stringField(value, "ref")) {
        issues.push({ code: `${field}_missing`, message: `${label}.${field}.ref is required` });
      }
    }
    const signature = artifact.signature;
    const signedChecksum = artifact.signedChecksum;
    if ((!isObject(signature) || !stringField(signature, "ref")) && (!isObject(signedChecksum) || !stringField(signedChecksum, "ref"))) {
      issues.push({ code: "signature_missing", message: `${label} requires signature.ref or signedChecksum.ref` });
    }
  }
  return { ok: issues.length === 0, artifacts, issues };
}

function extractTgz(tgzPath: string): string {
  const tempDir = fs.mkdtempSync(path.join(verifyPluginTempRoot(), "claw-verify-plugin-"));
  const result = spawnSync(verifyTarExecutablePath(), ["-xzf", path.resolve(tgzPath), "-C", tempDir], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to extract plugin tarball");
  }
  const packageDir = path.join(tempDir, "package");
  return fs.existsSync(packageDir) ? packageDir : tempDir;
}

function validatePlugin(target: string): { ok: boolean; packageName: string | null; issues: VerificationIssue[] } {
  const issues: VerificationIssue[] = [];
  const absoluteTarget = path.resolve(target);
  if (!fs.existsSync(absoluteTarget)) {
    return { ok: false, packageName: null, issues: [{ code: "plugin_missing", message: `Plugin target is missing: ${target}` }] };
  }
  const root = absoluteTarget.endsWith(".tgz") || absoluteTarget.endsWith(".tar.gz") ? extractTgz(absoluteTarget) : absoluteTarget;
  const packageJsonPath = path.join(root, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return { ok: false, packageName: null, issues: [{ code: "package_json_missing", message: "Plugin package.json is required" }] };
  }
  const packageJsonResult = readJson(packageJsonPath, "package_json_malformed", "Plugin package.json");
  if (!packageJsonResult.ok) return { ok: false, packageName: null, issues: [packageJsonResult.issue] };
  const packageJson = packageJsonResult.value;
  if (!isObject(packageJson)) {
    return { ok: false, packageName: null, issues: [{ code: "package_json_invalid", message: "Plugin package.json must be an object" }] };
  }
  const packageName = stringField(packageJson, "name") ?? null;
  if (!packageName) issues.push({ code: "package_name_missing", message: "Plugin package.json name is required" });
  const pluginManifest = ["plugin.json", "openclaw.plugin.json"].find((name) => fs.existsSync(path.join(root, name)));
  if (!pluginManifest) issues.push({ code: "plugin_manifest_missing", message: "Plugin requires plugin.json or openclaw.plugin.json" });
  const scripts = isObject(packageJson.scripts) ? packageJson.scripts : {};
  for (const scriptName of ["preinstall", "install", "postinstall", "prepare"]) {
    if (typeof scripts[scriptName] === "string") {
      issues.push({ code: "lifecycle_script_review_required", message: `Plugin lifecycle script ${scriptName} requires explicit malware review` });
    }
  }
  const supplyChain = isObject(packageJson.supplyChain) ? packageJson.supplyChain : null;
  if (!supplyChain) {
    issues.push({ code: "supply_chain_metadata_missing", message: "Plugin package.json supplyChain metadata is required" });
  } else {
    for (const field of ["sbom", "provenance", "signature"]) {
      const value = supplyChain[field];
      if (!isObject(value) || !stringField(value, "ref")) {
        issues.push({ code: `${field}_metadata_missing`, message: `Plugin supplyChain.${field}.ref is required` });
      }
    }
    const malwareReview = supplyChain.malwareReview;
    const status = isObject(malwareReview) ? stringField(malwareReview, "status") : null;
    if (!["reviewed", "quarantined"].includes(status ?? "")) {
      issues.push({ code: "malware_review_missing", message: "Plugin supplyChain.malwareReview.status must be reviewed or quarantined" });
    }
  }
  return { ok: issues.length === 0, packageName, issues };
}

function writeResult(input: VerifyCliInput, operation: "release" | "plugin", result: Record<string, unknown>, ok: boolean): number {
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, "verify", { operation, ...result, verified: ok }, { operation });
  } else {
    input.context.stdout.write(`${ok ? "PASS" : "FAIL"} verify ${operation}\n`);
    const issues = Array.isArray(result.issues) ? result.issues as VerificationIssue[] : [];
    for (const issue of issues) input.context.stdout.write(`- ${issue.code}: ${issue.message}\n`);
  }
  return ok ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

function writeUsageError(input: VerifyCliInput, code: string, message: string, usage: string, operation: "release" | "plugin" | null): number {
  if (input.wantsJson) {
    writeCommandJsonError(input.context.stdout, "verify", new CliHandledError(code, message, CLI_EXIT_USAGE), {
      operation,
    });
  } else {
    input.context.stderr.write(`${usage}\n`);
  }
  return CLI_EXIT_USAGE;
}

export async function runVerifyCli(input: VerifyCliInput): Promise<number> {
  const positionals = input.argv.filter((arg) => !arg.startsWith("--"));
  const operation = positionals[1];
  if (operation === "release") {
    const manifest = flagValue(input.argv, "--manifest");
    if (!manifest) {
      return writeUsageError(input, "missing_verify_release_manifest", "Usage: claw verify release --manifest <file> [--json]", "Usage: claw verify release --manifest <file> [--json]", "release");
    }
    const result = validateReleaseManifest(manifest);
    return writeResult(input, "release", { manifest: path.resolve(manifest), artifactCount: result.artifacts.length, issues: result.issues }, result.ok);
  }
  if (operation === "plugin") {
    const target = positionals[2];
    if (!target) {
      return writeUsageError(input, "missing_verify_plugin_target", "Usage: claw verify plugin <dir|tgz> [--json]", "Usage: claw verify plugin <dir|tgz> [--json]", "plugin");
    }
    const result = validatePlugin(target);
    return writeResult(input, "plugin", { target: path.resolve(target), packageName: result.packageName, issues: result.issues }, result.ok);
  }
  return writeUsageError(
    input,
    "unknown_verify_operation",
    "Usage: claw verify release --manifest <file> [--json]\n       claw verify plugin <dir|tgz> [--json]",
    "Usage: claw verify release --manifest <file> [--json]\n       claw verify plugin <dir|tgz> [--json]",
    null,
  );
}

export const __verifyCliTest = {
  validateReleaseManifest,
  validatePlugin,
  verifyPluginTempRoot,
  verifyTarExecutablePath,
};
