import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { __verifyCliTest } from "./cli-verify-command.ts";
import { runCliCapture } from "./index-test-utils.ts";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claw-verify-test-"));
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test("verify release accepts artifact checksum, SBOM, provenance and signature metadata", () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "artifact.tgz"), "artifact");
  const manifest = {
    schemaVersion: 1,
    artifacts: [{
      name: "@clawjs/example",
      version: "0.1.0",
      path: "artifact.tgz",
      sha256: sha256("artifact"),
      sbom: { format: "CycloneDX JSON", ref: "artifact.sbom.json" },
      provenance: { type: "npm", ref: "npm provenance" },
      signature: { type: "sigstore", ref: "sigstore bundle" },
    }],
  };
  const manifestPath = path.join(root, "release.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  assert.equal(__verifyCliTest.validateReleaseManifest(manifestPath).ok, true);
});

test("verify release rejects missing provenance and checksum mismatch", () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "artifact.tgz"), "artifact");
  const manifestPath = path.join(root, "release.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    artifacts: [{
      name: "@clawjs/example",
      version: "0.1.0",
      path: "artifact.tgz",
      sha256: "0".repeat(64),
      sbom: { ref: "artifact.sbom.json" },
      signature: { ref: "signature" },
    }],
  }, null, 2));
  const result = __verifyCliTest.validateReleaseManifest(manifestPath);
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "artifact_sha256_mismatch"));
  assert(result.issues.some((issue) => issue.code === "provenance_missing"));
});

test("verify plugin requires supply-chain metadata and malware review", () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "plugin.json"), JSON.stringify({ name: "sample" }));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    name: "sample-plugin",
    supplyChain: {
      sbom: { ref: "sample.sbom.json" },
      provenance: { ref: "provenance" },
      signature: { ref: "signature" },
      malwareReview: { status: "reviewed" },
    },
  }, null, 2));
  assert.equal(__verifyCliTest.validatePlugin(root).ok, true);
});

test("verify plugin tarball extraction uses the Mac Care system temp route", () => {
  assert.equal(__verifyCliTest.verifyPluginTempRoot(), "/tmp");
  assert.equal(__verifyCliTest.verifyTarExecutablePath(), "/usr/bin/tar");
  const source = fs.readFileSync(new URL("./cli-verify-command.ts", import.meta.url), "utf8");
  assert.match(source, /requireMacCareRoutePathPattern\("mac_care\.route\.system_temp"\)/);
  assert.match(source, /requireMacCareRoutePathPattern\("mac_care\.route\.system_tar_cli"\)/);
  assert.equal(source.includes("os.tmpdir()"), false);
  assert.equal(source.includes('path.join(os.tmpdir(), "claw-verify-plugin-")'), false);
  assert.equal(source.includes('spawnSync("tar"'), false);
});

test("verify plugin rejects lifecycle scripts without accepted metadata", () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "plugin.json"), JSON.stringify({ name: "sample" }));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    name: "sample-plugin",
    scripts: { postinstall: "node install.js" },
  }, null, 2));
  const result = __verifyCliTest.validatePlugin(root);
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "lifecycle_script_review_required"));
  assert(result.issues.some((issue) => issue.code === "supply_chain_metadata_missing"));
});

test("verify usage errors keep the JSON contract", async () => {
  const release = await runCliCapture(["verify", "release", "--json"], process.cwd());
  assert.equal(release.code, CLI_EXIT_USAGE);
  assert.equal(release.stderr, "");
  const releasePayload = JSON.parse(release.stdout) as {
    ok: boolean;
    error: { code: string; message: string };
    meta: { canonicalCommand: string; operation: string };
  };
  assert.equal(releasePayload.ok, false);
  assert.equal(releasePayload.error.code, "missing_verify_release_manifest");
  assert.equal(releasePayload.meta.canonicalCommand, "verify");
  assert.equal(releasePayload.meta.operation, "release");

  const plugin = await runCliCapture(["verify", "plugin", "--json"], process.cwd());
  assert.equal(plugin.code, CLI_EXIT_USAGE);
  const pluginPayload = JSON.parse(plugin.stdout) as {
    ok: boolean;
    error: { code: string };
    meta: { operation: string };
  };
  assert.equal(pluginPayload.ok, false);
  assert.equal(pluginPayload.error.code, "missing_verify_plugin_target");
  assert.equal(pluginPayload.meta.operation, "plugin");
});
