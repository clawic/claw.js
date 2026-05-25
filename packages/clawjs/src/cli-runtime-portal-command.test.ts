import assert from "node:assert/strict";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("runtime domain requires an explicit manifest domain in JSON mode", async () => {
  const result = await runCliCapture(["runtime", "codex", "domain", "--json"], process.cwd());
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error?: { code?: string; status?: string };
    meta?: { canonicalCommand?: string; operation?: string; runtimeId?: string };
  };

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(payload.ok, false);
  assert.equal(payload.error?.code, "missing_runtime_domain");
  assert.equal(payload.error?.status, "USAGE");
  assert.equal(payload.meta?.canonicalCommand, "runtime");
  assert.equal(payload.meta?.operation, "domain");
  assert.equal(payload.meta?.runtimeId, "codex");
});

test("runtime session metadata omits gateway credentials in JSON mode", async () => {
  const result = await runCliCapture([
    "runtime",
    "hermes",
    "session",
    "--gateway-url",
    "http://127.0.0.1:18181",
    "--gateway-token",
    "secret-runtime-token-12345678",
    "--json",
  ], process.cwd());
  const payload = JSON.parse(result.stdout) as {
    data?: {
      session?: {
        gateway?: { token?: string; headers?: Record<string, string> };
        fallbackGateway?: { token?: string; headers?: Record<string, string> };
      };
    };
  };

  assert.equal(result.code, 0);
  assert.equal(result.stdout.includes("secret-runtime-token-12345678"), false);
  assert.equal(payload.data?.session?.gateway?.token, undefined);
  assert.equal(payload.data?.session?.gateway?.headers, undefined);
  assert.equal(payload.data?.session?.fallbackGateway?.token, undefined);
  assert.equal(payload.data?.session?.fallbackGateway?.headers, undefined);
});
