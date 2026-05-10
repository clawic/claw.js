import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { WebSocket } from "ws";

import { startFakeSshServer } from "../../packages/ssh-client/tests/helpers/fake-ssh-server.ts";
import type { BridgeConfig } from "../src/config.ts";
import { createBridgeRuntime } from "../src/server.ts";

let portCursor = 25_000;
function nextPortPair(): [number, number] {
  const a = portCursor;
  const b = portCursor + 1;
  portCursor += 2;
  return [a, b];
}

async function withRuntime(): Promise<{
  runtime: ReturnType<typeof createBridgeRuntime>;
  config: BridgeConfig;
  cleanup: () => Promise<void>;
}> {
  const workdir = await mkdtemp(join(tmpdir(), "clawjs-ssh-"));
  const [bridgePort, httpPort] = nextPortPair();
  const config: BridgeConfig = {
    bridgePort,
    httpPort,
    bindAddress: "127.0.0.1",
    dbPath: join(workdir, "storage.sqlite"),
    statusPath: join(workdir, "state", "bridge-status.json"),
    displayName: "SSH Mac",
    bonjourEnabled: false,
    version: "0.0.0-test",
    capabilities: ["bridge"],
  };
  const runtime = createBridgeRuntime({
    config,
    ssh: { enabled: true, readyTimeoutMs: 5_000 },
  });
  await runtime.start();
  return {
    runtime,
    config,
    cleanup: async () => {
      await runtime.stop();
      await rm(workdir, { recursive: true, force: true });
    },
  };
}

interface InboundFrame {
  kind: string;
  id?: string;
  payload?: unknown;
}

async function openWs(port: number, token: string): Promise<WebSocket> {
  const ws = new WebSocket(
    `ws://127.0.0.1:${port}/bridge?token=${encodeURIComponent(token)}`,
  );
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  return ws;
}

function bindObserver(ws: WebSocket, requestId: string): {
  events: InboundFrame[];
  response: Promise<InboundFrame>;
  detach: () => void;
} {
  const events: InboundFrame[] = [];
  let resolveResponse!: (frame: InboundFrame) => void;
  const response = new Promise<InboundFrame>((resolve) => {
    resolveResponse = resolve;
  });
  const onMessage = (raw: Buffer) => {
    const f = JSON.parse(raw.toString("utf8")) as InboundFrame;
    if (f.id !== requestId) return;
    if (f.kind === "response") resolveResponse(f);
    else events.push(f);
  };
  ws.on("message", onMessage);
  return { events, response, detach: () => ws.off("message", onMessage) };
}

test("identity advertises ssh capabilities when ssh is enabled", async () => {
  const h = await withRuntime();
  try {
    const res = await fetch(
      `http://127.0.0.1:${h.config.httpPort}/mesh/identity`,
      { headers: { authorization: `Bearer ${h.runtime.identity.bearerToken}` } },
    );
    const body = (await res.json()) as { capabilities: string[] };
    assert.ok(body.capabilities.includes("ssh.exec"));
    assert.ok(body.capabilities.includes("ssh.sftp"));
    assert.ok(body.capabilities.includes("ssh.installBridge"));
  } finally {
    await h.cleanup();
  }
});

test("POST /mesh/hosts upserts host + ssh secret, then ssh.exec works via WS", async () => {
  const fakeServer = await startFakeSshServer({
    acceptPassword: "topsecret",
    execHandlers: {
      "echo bridge": (handle) => {
        handle.write("bridge\n");
        handle.exit(0);
        handle.end();
      },
    },
  });
  const h = await withRuntime();
  try {
    const upsertRes = await fetch(
      `http://127.0.0.1:${h.config.httpPort}/mesh/hosts`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          host: {
            id: "vps-1",
            kind: "linuxServer",
            displayName: "Test VPS",
            endpoints: [
              {
                kind: "ssh",
                host: fakeServer.host,
                port: fakeServer.port,
                protocol: "ssh",
              },
            ],
            permissionProfile: "scoped",
            capabilities: ["shell"],
            ssh: {
              user: "tester",
              authMethod: "password",
              passwordSecretId: "vps-1-pw",
            },
            metadata: { tags: ["vps"] },
          },
          sshSecret: {
            id: "vps-1-pw",
            secret: { kind: "password", password: "topsecret" },
          },
        }),
      },
    );
    assert.equal(upsertRes.status, 200);
    const upsertBody = (await upsertRes.json()) as {
      host: { id: string };
      sshSecret: { id: string; kind: string };
    };
    assert.equal(upsertBody.host.id, "vps-1");
    assert.equal(upsertBody.sshSecret.id, "vps-1-pw");
    assert.equal(upsertBody.sshSecret.kind, "password");

    const ws = await openWs(
      h.config.bridgePort,
      h.runtime.identity.bearerToken,
    );
    try {
      const obs = bindObserver(ws, "r-exec");
      ws.send(
        JSON.stringify({
          kind: "request",
          id: "r-exec",
          payload: {
            method: "ssh.exec",
            hostId: "vps-1",
            command: "echo bridge",
          },
        }),
      );
      const response = await obs.response;
      obs.detach();
      const payload = response.payload as {
        ok: boolean;
        result: { exitCode: number; stdoutBase64: string };
      };
      assert.equal(payload.ok, true);
      assert.equal(payload.result.exitCode, 0);
      assert.equal(
        Buffer.from(payload.result.stdoutBase64, "base64").toString("utf8"),
        "bridge\n",
      );
    } finally {
      ws.close();
      await delay(20);
    }

    const auditEvents = h.runtime.auditStore.list({ action: "proxySsh" });
    assert.ok(auditEvents.length > 0, "expected at least one proxySsh event");
  } finally {
    await fakeServer.close();
    await h.cleanup();
  }
});

test("POST /mesh/hosts without ssh secret store still works for non-ssh hosts", async () => {
  const h = await withRuntime();
  try {
    const res = await fetch(
      `http://127.0.0.1:${h.config.httpPort}/mesh/hosts`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          host: {
            kind: "ios",
            displayName: "Test iPhone",
            permissionProfile: "scoped",
            metadata: { tags: [] },
          },
        }),
      },
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { host: { id: string }; sshSecret: undefined };
    assert.ok(body.host.id.length > 0);
    assert.equal(body.sshSecret, undefined);
  } finally {
    await h.cleanup();
  }
});

test("ssh.exec via WS surfaces auth failure as ok:false", async () => {
  const fakeServer = await startFakeSshServer({ acceptPassword: "the-truth" });
  const h = await withRuntime();
  try {
    await fetch(`http://127.0.0.1:${h.config.httpPort}/mesh/hosts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        host: {
          id: "vps-bad",
          kind: "linuxServer",
          displayName: "Bad",
          endpoints: [
            { kind: "ssh", host: fakeServer.host, port: fakeServer.port, protocol: "ssh" },
          ],
          permissionProfile: "scoped",
          capabilities: [],
          ssh: { user: "tester", authMethod: "password", passwordSecretId: "bad" },
          metadata: { tags: [] },
        },
        sshSecret: {
          id: "bad",
          secret: { kind: "password", password: "wrong" },
        },
      }),
    });
    const ws = await openWs(h.config.bridgePort, h.runtime.identity.bearerToken);
    try {
      const obs = bindObserver(ws, "r-bad");
      ws.send(
        JSON.stringify({
          kind: "request",
          id: "r-bad",
          payload: {
            method: "ssh.exec",
            hostId: "vps-bad",
            command: "whoami",
          },
        }),
      );
      const response = await obs.response;
      obs.detach();
      const payload = response.payload as { ok: boolean; error?: string };
      assert.equal(payload.ok, false);
      assert.match(payload.error ?? "", /authentication|failed/i);
    } finally {
      ws.close();
      await delay(20);
    }
  } finally {
    await fakeServer.close();
    await h.cleanup();
  }
});

test("DELETE /mesh/hosts/:id removes a host", async () => {
  const h = await withRuntime();
  try {
    const create = await fetch(
      `http://127.0.0.1:${h.config.httpPort}/mesh/hosts`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          host: {
            id: "tmp-host",
            kind: "linuxServer",
            displayName: "Temp",
            permissionProfile: "scoped",
            metadata: { tags: [] },
          },
        }),
      },
    );
    assert.equal(create.status, 200);
    const del = await fetch(
      `http://127.0.0.1:${h.config.httpPort}/mesh/hosts/tmp-host`,
      { method: "DELETE" },
    );
    assert.equal(del.status, 200);
    assert.equal(h.runtime.hostStore.get("tmp-host"), null);
  } finally {
    await h.cleanup();
  }
});

test("POST /mesh/hosts/:id/revoke marks a host as revoked", async () => {
  const h = await withRuntime();
  try {
    await fetch(`http://127.0.0.1:${h.config.httpPort}/mesh/hosts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        host: {
          id: "h-rev",
          kind: "linuxServer",
          displayName: "Rev",
          permissionProfile: "scoped",
          metadata: { tags: [] },
        },
      }),
    });
    const res = await fetch(
      `http://127.0.0.1:${h.config.httpPort}/mesh/hosts/h-rev/revoke`,
      { method: "POST" },
    );
    assert.equal(res.status, 200);
    const host = h.runtime.hostStore.get("h-rev");
    assert.ok(host?.revokedAt instanceof Date);
  } finally {
    await h.cleanup();
  }
});
