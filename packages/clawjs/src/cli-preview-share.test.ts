import assert from "node:assert/strict";
import { test } from "vitest";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("preview share dry-runs provider URLs without invalid placeholders", async () => {
  const tailscale = await runCliCapture([
    "preview",
    "share",
    "--mode",
    "tailscale",
    "--url",
    "http://127.0.0.1:5173/app",
    "--dry-run",
    "--json",
  ], process.cwd());
  assert.equal(tailscale.code, CLI_EXIT_OK, tailscale.stderr || tailscale.stdout);
  const tailscalePayload = JSON.parse(tailscale.stdout) as { data: { shareUrl: string } };
  assert.match(tailscalePayload.data.shareUrl, /^https:\/\/tailnet-device\.invalid\/app\?/);

  const cloudflare = await runCliCapture([
    "preview",
    "share",
    "--mode",
    "cloudflare",
    "--url",
    "http://127.0.0.1:5173",
    "--dry-run",
    "--json",
  ], process.cwd());
  assert.equal(cloudflare.code, CLI_EXIT_OK, cloudflare.stderr || cloudflare.stdout);
  const cloudflarePayload = JSON.parse(cloudflare.stdout) as { data: { shareUrl: string } };
  assert.match(cloudflarePayload.data.shareUrl, /^https:\/\/trycloudflare-preview\.invalid\/\?/);
});

test("preview share rejects invalid explicit share URLs", async () => {
  const result = await runCliCapture([
    "preview",
    "share",
    "--mode",
    "tailscale",
    "--url",
    "http://127.0.0.1:5173",
    "--share-url",
    "notaurl",
    "--dry-run",
    "--json",
  ], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; status: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_preview_share_url");
  assert.equal(payload.error.status, "USAGE");
});

test("preview share validates LAN listen port before probing target", async () => {
  const result = await runCliCapture([
    "preview",
    "share",
    "--mode",
    "lan",
    "--url",
    "http://127.0.0.1:1",
    "--share-port",
    "nope",
    "--dry-run",
    "--json",
  ], process.cwd());

  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; message: string; status: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "usage_error");
  assert.equal(payload.error.status, "USAGE");
  assert.match(payload.error.message, /--share-port/);
});
