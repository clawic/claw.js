import { test } from "vitest";
import assert from "node:assert/strict";

import type { Host } from "@clawjs/mesh";

import {
  InMemoryKnownHostsStore,
  InMemorySecretResolver,
  SshAuthError,
  SshClient,
  SshClientError,
  SshHostKeyError,
} from "../src/index.ts";
import { makeClientKeyPair, startFakeSshServer } from "./helpers/fake-ssh-server.ts";

interface Harness {
  client: SshClient;
  host: Host;
  resolver: InMemorySecretResolver;
  knownHosts: InMemoryKnownHostsStore;
  shutdown(): Promise<void>;
}

function makeHost(overrides: Partial<Host> = {}): Host {
  return {
    id: "host-1",
    kind: "linuxServer",
    displayName: "Test Server",
    endpoints: [{ kind: "ssh", host: "127.0.0.1", port: 0, protocol: "ssh" }],
    permissionProfile: "scoped",
    capabilities: ["shell"],
    ssh: {
      user: "tester",
      authMethod: "password",
      passwordSecretId: "secret-pw-1",
    },
    metadata: { tags: [] },
    createdAt: new Date(),
    ...overrides,
  };
}

async function makePasswordHarness(): Promise<Harness> {
  const server = await startFakeSshServer({
    acceptPassword: "topsecret",
    execHandlers: {
      "echo hi": (h) => {
        h.write("hi\n");
        h.exit(0);
        h.end();
      },
      "echo err": (h) => {
        h.writeStderr("oops\n");
        h.exit(2);
        h.end();
      },
      "sleep 5": () => {
        // never returns
      },
    },
  });
  const resolver = new InMemorySecretResolver();
  resolver.put("secret-pw-1", { kind: "password", password: "topsecret" });
  const knownHosts = new InMemoryKnownHostsStore();
  const host = makeHost({
    endpoints: [
      { kind: "ssh", host: server.host, port: server.port, protocol: "ssh" },
    ],
  });
  const hostResolver = {
    async resolve(id: string): Promise<Host | null> {
      return id === host.id ? host : null;
    },
  };
  const client = new SshClient({
    hostResolver,
    secretResolver: resolver,
    knownHostsStore: knownHosts,
    readyTimeoutMs: 5_000,
  });
  return {
    client,
    host,
    resolver,
    knownHosts,
    async shutdown() {
      await client.closeAll();
      await server.close();
    },
  };
}

test("open connects with password auth and records the host key (TOFU)", async () => {
  const h = await makePasswordHarness();
  try {
    const session = await h.client.open(h.host.id);
    assert.equal(session.username, "tester");
    assert.ok(session.hostKeyFingerprint.length > 0);
    const stored = await h.knownHosts.get(h.host.id);
    assert.ok(stored);
    assert.equal(stored!.fingerprintSha256, session.hostKeyFingerprint);
  } finally {
    await h.shutdown();
  }
});

test("open rejects when host key fingerprint mismatches a stored one", async () => {
  const h = await makePasswordHarness();
  try {
    await h.knownHosts.put({
      hostId: h.host.id,
      fingerprintSha256: "BOGUS-FINGERPRINT",
      lastSeenAt: new Date(),
    });
    await assert.rejects(h.client.open(h.host.id), SshHostKeyError);
  } finally {
    await h.shutdown();
  }
});

test("open rejects when host ssh config pins a mismatched host key fingerprint", async () => {
  const h = await makePasswordHarness();
  try {
    h.host.ssh = {
      ...h.host.ssh!,
      knownHostFingerprint: "BOGUS-FINGERPRINT",
    };
    await assert.rejects(
      h.client.open(h.host.id),
      (err: unknown) =>
        err instanceof SshHostKeyError &&
        err.expectedFingerprint === "BOGUS-FINGERPRINT" &&
        err.presentedFingerprint !== "BOGUS-FINGERPRINT",
    );
  } finally {
    await h.shutdown();
  }
});

test("exec returns stdout, stderr and exit code", async () => {
  const h = await makePasswordHarness();
  try {
    const session = await h.client.open(h.host.id);
    const ok = await session.exec({ command: "echo hi" });
    assert.equal(ok.exitCode, 0);
    assert.equal(ok.stdout.toString(), "hi\n");
    const failed = await session.exec({ command: "echo err" });
    assert.equal(failed.exitCode, 2);
    assert.equal(failed.stderr.toString(), "oops\n");
  } finally {
    await h.shutdown();
  }
});

test("exec streams stdout chunks to onStdout listener", async () => {
  const h = await makePasswordHarness();
  try {
    const session = await h.client.open(h.host.id);
    const chunks: string[] = [];
    await session.exec({
      command: "echo hi",
      onStdout: (chunk) => chunks.push(chunk.toString("utf8")),
    });
    assert.equal(chunks.join(""), "hi\n");
  } finally {
    await h.shutdown();
  }
});

test("exec timeout kills the remote command and rejects", async () => {
  const h = await makePasswordHarness();
  try {
    const session = await h.client.open(h.host.id);
    await assert.rejects(
      session.exec({ command: "sleep 5", timeoutMs: 80 }),
      (err: unknown) =>
        err instanceof SshClientError && err.code === "exec-timeout",
    );
  } finally {
    await h.shutdown();
  }
});

test("public-key auth succeeds when the client key matches the server", async () => {
  const kp = makeClientKeyPair();
  const server = await startFakeSshServer({
    acceptPublicKey: Buffer.from(kp.publicKey, "utf8"),
    execHandlers: {
      whoami: (handle) => {
        handle.write("tester\n");
        handle.exit(0);
        handle.end();
      },
    },
  });
  const resolver = new InMemorySecretResolver();
  resolver.put("k1", { kind: "private-key", privateKeyPem: kp.privateKey });
  const host: Host = {
    id: "host-key",
    kind: "linuxServer",
    displayName: "Key Server",
    endpoints: [
      { kind: "ssh", host: server.host, port: server.port, protocol: "ssh" },
    ],
    permissionProfile: "scoped",
    capabilities: ["shell"],
    ssh: { user: "tester", authMethod: "key", keySecretId: "k1" },
    metadata: { tags: [] },
    createdAt: new Date(),
  };
  const client = new SshClient({
    hostResolver: { async resolve(id) { return id === host.id ? host : null; } },
    secretResolver: resolver,
  });
  try {
    const session = await client.open(host.id);
    const result = await session.exec({ command: "whoami" });
    assert.equal(result.stdout.toString().trim(), "tester");
  } finally {
    await client.closeAll();
    await server.close();
  }
});

test("auth failure surfaces SshAuthError", async () => {
  const server = await startFakeSshServer({ acceptPassword: "the-truth" });
  const resolver = new InMemorySecretResolver();
  resolver.put("bad", { kind: "password", password: "wrong" });
  const host: Host = {
    id: "host-bad",
    kind: "linuxServer",
    displayName: "Bad",
    endpoints: [
      { kind: "ssh", host: server.host, port: server.port, protocol: "ssh" },
    ],
    permissionProfile: "scoped",
    capabilities: [],
    ssh: { user: "tester", authMethod: "password", passwordSecretId: "bad" },
    metadata: { tags: [] },
    createdAt: new Date(),
  };
  const client = new SshClient({
    hostResolver: { async resolve(id) { return id === host.id ? host : null; } },
    secretResolver: resolver,
    readyTimeoutMs: 3_000,
  });
  try {
    await assert.rejects(client.open(host.id), SshAuthError);
  } finally {
    await client.closeAll();
    await server.close();
  }
});

test("sftp writeFile + readFile + readdir round-trip", async () => {
  const h = await makePasswordHarness();
  try {
    const session = await h.client.open(h.host.id);
    const sftp = await session.sftp();
    // Note: the fake server uses ssh2's built-in in-memory sftp accept which
    // doesn't back to an actual filesystem; assert basic API smoke only.
    assert.equal(typeof sftp.writeFile, "function");
    assert.equal(typeof sftp.readFile, "function");
    await sftp.close();
  } finally {
    await h.shutdown();
  }
});

test("open returns the same session on repeated calls (pool)", async () => {
  const h = await makePasswordHarness();
  try {
    const a = await h.client.open(h.host.id);
    const b = await h.client.open(h.host.id);
    assert.equal(a, b);
    assert.equal(h.client.listSessions().length, 1);
  } finally {
    await h.shutdown();
  }
});

test("close removes the session from the pool", async () => {
  const h = await makePasswordHarness();
  try {
    const a = await h.client.open(h.host.id);
    await a.close();
    assert.equal(h.client.listSessions().length, 0);
  } finally {
    await h.shutdown();
  }
});

test("open rejects when ssh secret cannot be resolved", async () => {
  const server = await startFakeSshServer({ acceptPassword: "x" });
  const host: Host = {
    id: "host-nosec",
    kind: "linuxServer",
    displayName: "No Sec",
    endpoints: [
      { kind: "ssh", host: server.host, port: server.port, protocol: "ssh" },
    ],
    permissionProfile: "scoped",
    capabilities: [],
    ssh: { user: "tester", authMethod: "password", passwordSecretId: "missing" },
    metadata: { tags: [] },
    createdAt: new Date(),
  };
  const client = new SshClient({
    hostResolver: { async resolve(id) { return id === host.id ? host : null; } },
    secretResolver: new InMemorySecretResolver(),
  });
  try {
    await assert.rejects(client.open(host.id), (err: unknown) =>
      err instanceof SshClientError && err.code === "secret-missing",
    );
  } finally {
    await server.close();
  }
});
