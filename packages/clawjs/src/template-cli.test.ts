import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("templates returns JSON usage errors for unknown subcommands", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-template-unknown-"));

  for (const command of ["template", "templates"]) {
    const result = await runCliCapture([command, "definitely_missing", "--workspace", root, "--json"], root);

    assert.equal(result.code, CLI_EXIT_USAGE);
    assert.equal(result.stderr, "");
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      error: {
        code: string;
        status: string;
        location: string;
        safeNextStep: string;
        details: { received: string; validSubcommands: string[] };
      };
      meta: { canonicalCommand: string; invokedCommand: string; subcommand: string };
    };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "unknown_template_subcommand");
    assert.equal(payload.error.status, "USAGE");
    assert.equal(payload.error.location, "cli.templates.subcommand");
    assert.equal(payload.error.details.received, "definitely_missing");
    assert.equal(payload.error.details.validSubcommands.includes("list"), true);
    assert.equal(payload.error.details.validSubcommands.includes("render"), true);
    assert.match(payload.error.safeNextStep, /templates list --json/);
    assert.match(payload.error.safeNextStep, /help templates --json/);
    assert.equal(payload.meta.canonicalCommand, "templates");
    assert.equal(payload.meta.invokedCommand, "template");
    assert.equal(payload.meta.subcommand, "definitely_missing");
  }
});

test("template create reports missing required input as a JSON usage error without writing state", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-template-create-usage-"));

  const result = await runCliCapture(["template", "create", "Launch Brief", "--workspace", root, "--json"], root);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: {
      code: string;
      status: string;
      location: string;
      safeNextStep: string;
      details: { requiredArguments: string[]; requiredFlags: string[]; validSubcommands: string[] };
    };
    meta: { canonicalCommand: string; invokedCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_template_create_usage");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "template.create");
  assert.deepEqual(payload.error.details.requiredArguments, ["name"]);
  assert.deepEqual(payload.error.details.requiredFlags, ["category"]);
  assert.equal(payload.error.details.validSubcommands.includes("create"), true);
  assert.match(payload.error.safeNextStep, /template create <name> --category report --json/);
  assert.equal(payload.meta.canonicalCommand, "templates");
  assert.equal(payload.meta.invokedCommand, "template");
  assert.equal(payload.meta.subcommand, "create");
  assert.equal(fs.existsSync(path.join(root, ".claw", "templates")), false);
});

test("template render reports missing style as a JSON usage error", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-template-render-usage-"));

  const result = await runCliCapture(["templates", "render", "launch-card", "--workspace", root, "--json"], root);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: {
      code: string;
      status: string;
      location: string;
      safeNextStep: string;
      details: { requiredFlags: string[]; validSubcommands: string[] };
    };
    meta: { canonicalCommand: string; invokedCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "missing_template_render_style");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "template.render.style");
  assert.deepEqual(payload.error.details.requiredFlags, ["style"]);
  assert.equal(payload.error.details.validSubcommands.includes("render"), true);
  assert.match(payload.error.safeNextStep, /style list --json/);
  assert.equal(payload.meta.canonicalCommand, "templates");
  assert.equal(payload.meta.invokedCommand, "template");
  assert.equal(payload.meta.subcommand, "render");
});
