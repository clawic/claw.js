import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("template render reports malformed data JSON as a usage error", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-template-render-json-"));
  const badData = path.join(root, "data.json");
  fs.writeFileSync(badData, "{bad-json", "utf8");

  const result = await runCliCapture([
    "template",
    "render",
    "missing-template",
    "--style",
    "missing-style",
    "--data",
    badData,
    "--workspace",
    root,
    "--json",
  ], root);

  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: { code: string; status: string; location: string };
    meta: { canonicalCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_template_data_json");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "template.render.data");
  assert.equal(payload.meta.canonicalCommand, "templates");
  assert.equal(payload.meta.subcommand, "render");
});
