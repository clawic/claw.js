const RELAY_BROWSER_SESSION_STORAGE_KEY = "claw-browser-auth";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "vitest";

import { BrowserSessionManager } from "../../../browser/host/session-manager.ts";

test("BrowserSessionManager reuses one persistent profile per workspace and emits frames", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-browser-workspace-"));
  const events: Array<{ type: "state" | "frame"; reason?: string }> = [];
  const manager = new BrowserSessionManager({
    idleTtlMs: 60_000,
    onState: (event) => events.push({ type: "state", reason: event.reason }),
    onFrame: () => events.push({ type: "frame" }),
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/set-auth") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`
        <html>
          <body>
            <script>
              localStorage["setItem"]("", "signed-in");
              document.title = "auth-saved";
            </script>
            auth saved
          </body>
        </html>
      `);
      return;
    }
    if (url.pathname === "/status") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`
        <html>
          <body>
            <script>
              const value = localStorage["getItem"]("");
              document.title = value === "signed-in" ? "signed-in" : "missing-auth";
            </script>
            status
          </body>
        </html>
      `);
      return;
    }
    res.writeHead(404);
    res.end("missing");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const idle = await manager.getSessionStatus({
      workspaceId: "main",
      workspaceDir,
    });
    assert.equal(idle.active, false);

    const ensured = await manager.ensureSession({
      workspaceId: "main",
      workspaceDir,
      initialUrl: `${baseUrl}/set-auth`,
    });
    assert.equal(ensured.active, true);

    const actor = {
      deviceId: "device-1",
      userId: "user-1",
      email: "user@example.com",
    };
    const controlled = await manager.acquireControl({
      workspaceId: "main",
      workspaceDir,
      actor,
    });
    assert.equal(controlled.controller?.deviceId, "device-1");

    await manager.navigate({
      workspaceId: "main",
      workspaceDir,
      actor,
      url: `${baseUrl}/status`,
    });

    let current = await manager.getSessionStatus({
      workspaceId: "main",
      workspaceDir,
    });
    for (let attempt = 0; attempt < 10 && current.navigation.title !== "signed-in"; attempt += 1) {
      await delay(100);
      current = await manager.getSessionStatus({
        workspaceId: "main",
        workspaceDir,
      });
    }
    assert.equal(current.navigation.title, "signed-in");
    assert.equal(current.navigation.displayUrl, "Local preview");
    assert.ok(events.some((event) => event.type === "frame"));

    const released = await manager.releaseControl({
      workspaceId: "main",
      workspaceDir,
      actor,
    });
    assert.equal(released.controller, null);
  } finally {
    await manager.closeAll();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
