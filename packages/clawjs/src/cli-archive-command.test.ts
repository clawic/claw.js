import assert from "node:assert/strict";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("archive rejects explicitly empty path flags", async () => {
  for (const entry of [
    { args: ["archive", "verify", "--archive=", "--json"], code: "invalid_archive_flag", location: "cli.archive.archive" },
    { args: ["archive", "export", "--output=", "--json"], code: "invalid_archive_flag", location: "cli.archive.output" },
    { args: ["archive", "import", "--target=", "--json"], code: "invalid_archive_flag", location: "cli.archive.target" },
    { args: ["archive", "plan", "--root=", "--json"], code: "invalid_archive_flag", location: "cli.archive.root" },
  ]) {
    const result = await runCliCapture(entry.args, process.cwd());
    assert.equal(result.code, CLI_EXIT_USAGE, entry.location);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      error: { code: string; status: string; location: string };
    };
    assert.equal(payload.ok, false, entry.location);
    assert.equal(payload.error.code, entry.code);
    assert.equal(payload.error.status, "USAGE");
    assert.equal(payload.error.location, entry.location);
  }
});
