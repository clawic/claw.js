import assert from "node:assert/strict";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./inspect-cli-test-support.ts";

test("sync cache rejects invalid ttl values as stable JSON usage errors", async () => {
  for (const ttlSeconds of ["nope", "-1"] as const) {
    const result = await runCliCapture(["sync", "cache", "--ttl-seconds", ttlSeconds, "--json"], process.cwd());

    assert.equal(result.code, CLI_EXIT_USAGE);
    assert.equal(result.stderr, "");

    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      error?: {
        code: string;
        status: string;
        location: string;
        details?: { flag?: string; received?: string };
      };
      data?: unknown;
    };

    assert.equal(payload.ok, false);
    assert.equal(payload.error?.code, "invalid_sync_cache_ttl");
    assert.notEqual(payload.error?.code, "internal_error");
    assert.equal(payload.error?.status, "USAGE");
    assert.equal(payload.error?.location, "cli.sync.ttl_seconds");
    assert.equal(payload.error?.details?.flag, "--ttl-seconds");
    assert.equal(payload.error?.details?.received, ttlSeconds);
    assert.equal(payload.data, undefined);
  }
});
