import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("template list reports invalid category filters as json usage errors", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-template-category-"));

  const result = await runCliCapture(["template", "list", "--category", "unknown", "--workspace", root, "--json"], root);

  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: {
      code: string;
      status: string;
      location: string;
      details: { category: string; allowedCategories: string[] };
    };
    meta: { canonicalCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_template_category");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "template.category");
  assert.equal(payload.error.details.category, "unknown");
  assert.equal(payload.error.details.allowedCategories.includes("report"), true);
  assert.equal(payload.meta.canonicalCommand, "templates");
  assert.equal(payload.meta.subcommand, "list");
});
