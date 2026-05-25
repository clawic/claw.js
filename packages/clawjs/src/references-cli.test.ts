import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

type ReferenceUsageErrorPayload = {
  ok: false;
  error: {
    code: string;
    status: string;
    location: string;
    safeNextStep: string;
    details: {
      received?: unknown;
      validSubcommands: string[];
      validTypes?: string[];
    };
  };
  meta: {
    canonicalCommand: string;
    invokedCommand: string;
    subcommand: string | null;
  };
};

function tempWorkspace(): { cwd: string; workspaceRoot: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-references-cli-"));
  return {
    cwd: path.join(root, "cwd"),
    workspaceRoot: path.join(root, "workspace"),
  };
}

function parseUsageError(stdout: string): ReferenceUsageErrorPayload {
  return JSON.parse(stdout) as ReferenceUsageErrorPayload;
}

test("references returns JSON usage errors for unknown subcommands", async () => {
  const { cwd, workspaceRoot } = tempWorkspace();
  fs.mkdirSync(cwd, { recursive: true });

  const result = await runCliCapture(["references", "definitely_missing", "--workspace", workspaceRoot, "--json"], cwd);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = parseUsageError(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_reference_subcommand");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.references.subcommand");
  assert.equal(payload.error.details.received, "definitely_missing");
  assert.deepEqual(payload.error.details.validSubcommands, ["list", "get", "add", "delete", "link"]);
  assert.match(payload.error.safeNextStep, /claw references list --json/);
  assert.equal(payload.meta.canonicalCommand, "references");
  assert.equal(payload.meta.invokedCommand, "ref");
  assert.equal(payload.meta.subcommand, "definitely_missing");
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".claw", "references")), false);
});
test("ref add reports invalid usage as a JSON usage error without writing references", async () => {
  const { cwd, workspaceRoot } = tempWorkspace();
  fs.mkdirSync(cwd, { recursive: true });

  const result = await runCliCapture(["ref", "add", "--workspace", workspaceRoot, "--json"], cwd);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = parseUsageError(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "missing_reference_type");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.references.add.type");
  assert.deepEqual(payload.error.details.validTypes, ["web", "pdf", "image", "video", "screenshot", "snippet"]);
  assert.deepEqual(payload.error.details.validSubcommands, ["list", "get", "add", "delete", "link"]);
  assert.equal(payload.meta.canonicalCommand, "references");
  assert.equal(payload.meta.invokedCommand, "ref");
  assert.equal(payload.meta.subcommand, "add");
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".claw", "references")), false);
});

test("ref reports other invalid usage paths as JSON usage errors without writing references", async () => {
  for (const scenario of [
    {
      args: ["ref", "list", "--type", "unknown"],
      code: "invalid_reference_type",
      location: "cli.references.list.type",
      subcommand: "list",
    },
    {
      args: ["ref", "get"],
      code: "missing_reference_id",
      location: "cli.references.get.id",
      subcommand: "get",
    },
    {
      args: ["ref", "link", "reference.demo"],
      code: "missing_reference_link_input",
      location: "cli.references.link",
      subcommand: "link",
    },
  ]) {
    const { cwd, workspaceRoot } = tempWorkspace();
    fs.mkdirSync(cwd, { recursive: true });

    const result = await runCliCapture([...scenario.args, "--workspace", workspaceRoot, "--json"], cwd);

    assert.equal(result.code, CLI_EXIT_USAGE, scenario.code);
    assert.equal(result.stderr, "", scenario.code);
    const payload = parseUsageError(result.stdout);
    assert.equal(payload.error.code, scenario.code);
    assert.equal(payload.error.status, "USAGE");
    assert.equal(payload.error.location, scenario.location);
    assert.deepEqual(payload.error.details.validSubcommands, ["list", "get", "add", "delete", "link"]);
    assert.equal(payload.meta.canonicalCommand, "references");
    assert.equal(payload.meta.invokedCommand, "ref");
    assert.equal(payload.meta.subcommand, scenario.subcommand);
    assert.equal(fs.existsSync(path.join(workspaceRoot, ".claw", "references")), false);
  }
});
