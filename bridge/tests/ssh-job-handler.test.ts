import { test } from "vitest";
import assert from "node:assert/strict";

import type { SshClient } from "@clawjs/ssh-client";

import {
  handleSshJob,
  type SshAuditSink,
} from "../src/ssh-job-handler.ts";

function makeAuditSink(): {
  records: { action: string; outcome: string; context?: Record<string, unknown> }[];
  sink: SshAuditSink;
} {
  const records: { action: string; outcome: string; context?: Record<string, unknown> }[] = [];
  return {
    records,
    sink: {
      record(input) {
        records.push({
          action: input.action,
          outcome: input.outcome,
          context: input.context,
        });
      },
    },
  };
}

function makeClient(): SshClient {
  const sftp = {
    async readFile(remotePath: string): Promise<Buffer> {
      assert.equal(remotePath, "/tmp/hello.txt");
      return Buffer.from("hello ssh");
    },
    async close(): Promise<void> {},
  };
  const session = {
    info() {
      return {
        hostId: "host-1",
        username: "alice",
        remoteHost: "server.local",
        remotePort: 22,
        hostKeyFingerprint: "SHA256:test",
        connectedAt: new Date("2026-01-01T00:00:00Z"),
        lastUsedAt: new Date("2026-01-01T00:00:00Z"),
      };
    },
    async exec(input: {
      command: string;
      onStdout?: (chunk: Buffer) => void;
      onStderr?: (chunk: Buffer) => void;
    }) {
      assert.equal(input.command, "printf ok");
      input.onStdout?.(Buffer.from("ok"));
      return {
        exitCode: 0,
        signal: null,
        stdout: Buffer.from("ok"),
        stderr: Buffer.alloc(0),
        durationMs: 4,
      };
    },
    async sftp() {
      return sftp;
    },
  };
  return {
    async open(hostId: string) {
      assert.equal(hostId, "host-1");
      return session;
    },
    async close() {},
    listSessions() {
      return [session.info()];
    },
  } as unknown as SshClient;
}

test("ssh.exec returns buffered output, streams chunks, and audits success", async () => {
  const audit = makeAuditSink();
  const stdout: Buffer[] = [];
  const out = await handleSshJob(
    {
      client: makeClient(),
      audit: audit.sink,
      actorId: "agent-1",
      onStdout: (chunk) => stdout.push(chunk),
    },
    { method: "ssh.exec", hostId: "host-1", command: "printf ok" },
    "job-1",
  );

  assert.equal(out.ok, true);
  if (!out.ok) throw new Error("expected ok");
  assert.deepEqual(stdout.map((chunk) => chunk.toString()), ["ok"]);
  assert.deepEqual(out.result, {
    exitCode: 0,
    signal: null,
    stdoutBase64: Buffer.from("ok").toString("base64"),
    stderrBase64: "",
    durationMs: 4,
  });
  assert.equal(audit.records[0]!.action, "proxySsh");
  assert.equal(audit.records[0]!.outcome, "success");
  assert.equal(audit.records[0]!.context?.method, "ssh.exec");
});

test("ssh.sftp.readFile returns base64 data and closes sftp", async () => {
  const out = await handleSshJob(
    { client: makeClient() },
    {
      method: "ssh.sftp.readFile",
      hostId: "host-1",
      remotePath: "/tmp/hello.txt",
    },
    "job-2",
  );

  assert.equal(out.ok, true);
  if (!out.ok) throw new Error("expected ok");
  assert.deepEqual(out.result, {
    dataBase64: Buffer.from("hello ssh").toString("base64"),
    bytes: 9,
  });
});

test("invalid ssh job returns a structured error", async () => {
  const out = await handleSshJob(
    { client: makeClient() },
    { method: "ssh.exec", hostId: "", command: "" },
    "job-bad",
  );

  assert.equal(out.ok, false);
  if (out.ok) throw new Error("expected failure");
  assert.equal(out.method, "unknown");
  assert.match(out.error, /invalid ssh job/);
});
