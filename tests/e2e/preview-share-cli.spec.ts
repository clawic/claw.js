import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { once } from "events";

import { expect, saveArtifactScreenshot, test } from "./fixtures";

async function createPreviewServer() {
  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end(`preview:${request.url || "/"}`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  expect(typeof address).toBe("object");
  expect(address).toBeTruthy();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/app`,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

async function waitForJsonLine(child: ReturnType<typeof spawn>) {
  let stdout = "";
  child.stdout?.setEncoding("utf8");
  for await (const chunk of child.stdout ?? []) {
    stdout += String(chunk);
    const start = stdout.indexOf("{");
    if (start === -1) continue;
    const candidate = stdout.slice(start).trim();
    try {
      return JSON.parse(candidate) as {
      shareUrl: string;
      token: string;
      provider?: { available?: boolean; command?: string[] };
      };
    } catch {
      // Pretty JSON output may arrive over multiple chunks.
    }
  }
  throw new Error(`CLI did not emit JSON. stdout=${stdout}`);
}

test("preview share exposes a local server through a tokenized LAN proxy", async ({ page }) => {
  const preview = await createPreviewServer();
  const rootDir = process.cwd();
  const binPath = path.join(rootDir, "packages", "clawjs", "bin", "claw.mjs");
  const child = spawn(process.execPath, [
    binPath,
    "preview",
    "share",
    "--mode",
    "lan",
    "--url",
    preview.url,
    "--host",
    "127.0.0.1",
    "--advertise-host",
    "127.0.0.1",
    "--share-port",
    "0",
    "--ttl",
    "1m",
    "--json",
  ], { cwd: rootDir, stdio: ["ignore", "pipe", "pipe"] });

  try {
    const payload = await waitForJsonLine(child);
    const allowed = await fetch(payload.shareUrl);
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toContain("preview:/");

    const blockedUrl = new URL(payload.shareUrl);
    blockedUrl.searchParams.delete("claw_share_token");
    const blocked = await fetch(blockedUrl);
    expect(blocked.status).toBe(401);

    await page.setContent(`<main><h1>Preview share</h1><p>${payload.shareUrl.replace(/[<>&]/g, "")}</p></main>`);
    await saveArtifactScreenshot(page, "preview-share-lan.png");
  } finally {
    child.kill("SIGTERM");
    await preview.close();
  }
});

test("preview share reports optional tunnel providers without real external services", async ({ page }) => {
  const preview = await createPreviewServer();
  const rootDir = process.cwd();
  const binPath = path.join(rootDir, "packages", "clawjs", "bin", "claw.mjs");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-preview-share-"));
  const tailscalePath = path.join(tempRoot, "tailscale");
  fs.writeFileSync(tailscalePath, "#!/bin/sh\nprintf 'tailscale mock\\n'\n");
  fs.chmodSync(tailscalePath, 0o755);

  try {
    const tailscale = spawn(process.execPath, [
      binPath,
      "preview",
      "share",
      "--mode",
      "tailscale",
      "--url",
      preview.url,
      "--share-url",
      "https://test-device.example-tailnet.ts.net/app",
      "--dry-run",
      "--json",
    ], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PATH: `${tempRoot}${path.delimiter}${process.env.PATH || ""}` },
    });
    const tailscalePayload = await waitForJsonLine(tailscale);
    expect(tailscalePayload.shareUrl).toContain("https://test-device.example-tailnet.ts.net/app");
    expect(tailscalePayload.provider?.available).toBe(true);
    expect(tailscalePayload.provider?.command?.join(" ")).toContain("tailscale serve --bg");

    const cloudflare = spawn(process.execPath, [
      binPath,
      "preview",
      "share",
      "--mode",
      "cloudflare",
      "--url",
      preview.url,
      "--json",
    ], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CLAW_PREVIEW_CLOUDFLARE_URL: "https://preview-test.trycloudflare.com" },
    });
    const cloudflarePayload = await waitForJsonLine(cloudflare);
    expect(cloudflarePayload.shareUrl).toContain("https://preview-test.trycloudflare.com/");
    expect(cloudflarePayload.shareUrl).toContain("claw_share_token=");

    await page.setContent("<main><h1>Preview tunnel providers</h1><p>Tailscale and Cloudflare provider flows are hermetic.</p></main>");
    await saveArtifactScreenshot(page, "preview-share-providers.png");
  } finally {
    await preview.close();
  }
});
