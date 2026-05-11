import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AudioApiClient, buildAudioApp } from "@clawjs/audio";

const SECRET = "test-secret-xyz";

interface TestContext {
  client: AudioApiClient;
  close: () => Promise<void>;
  tmpDir: string;
}

async function spinUp(): Promise<TestContext> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-e2e-"));
  const { app } = buildAudioApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: tmpDir,
      dbPath: path.join(tmpDir, "audio.sqlite"),
      blobsDir: path.join(tmpDir, "blobs"),
      sharedSecret: SECRET,
    },
  });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const client = new AudioApiClient({ baseUrl: address, token: SECRET });
  return {
    client,
    tmpDir,
    close: async () => {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

const SILENT_M4A_BASE64 = Buffer.from("placeholder-bytes-for-test").toString("base64");

test("register + getById + getBytes round-trip", async () => {
  const ctx = await spinUp();
  try {
    const registered = await ctx.client.register({
      kind: "user_message",
      appId: "clawix",
      originActor: "user",
      mimeType: "audio/mp4",
      bytesBase64: SILENT_M4A_BASE64,
      durationMs: 1500,
      threadId: "thread-1",
      linkedMessageId: "msg-1",
      transcript: { text: "hola caracola", provider: "whisper", language: "es" },
    });
    assert.equal(registered.asset.kind, "user_message");
    assert.equal(registered.asset.appId, "clawix");
    assert.equal(registered.asset.threadId, "thread-1");
    assert.equal(registered.transcripts.length, 1);
    assert.equal(registered.transcripts[0].isPrimary, true);
    assert.equal(registered.transcripts[0].text, "hola caracola");

    const fetched = await ctx.client.get(registered.asset.id, "clawix");
    assert.equal(fetched.asset.id, registered.asset.id);
    assert.equal(fetched.transcripts.length, 1);

    const bytes = await ctx.client.getBytes(registered.asset.id, "clawix");
    assert.equal(bytes.base64, SILENT_M4A_BASE64);
    assert.equal(bytes.mimeType, "audio/mp4");
  } finally {
    await ctx.close();
  }
});

test("appId isolation: app A cannot read app B's audio", async () => {
  const ctx = await spinUp();
  try {
    const a = await ctx.client.register({
      kind: "dictation",
      appId: "app-a",
      originActor: "user",
      mimeType: "audio/mp4",
      bytesBase64: SILENT_M4A_BASE64,
      durationMs: 1000,
    });
    const fetchedSelf = await ctx.client.get(a.asset.id, "app-a");
    assert.equal(fetchedSelf.asset.id, a.asset.id);

    let caught: Error | null = null;
    try {
      await ctx.client.get(a.asset.id, "app-b");
    } catch (error) {
      caught = error as Error;
    }
    assert.ok(caught, "expected 404 when reading across appId boundary");
    assert.match(caught!.message, /404/);
  } finally {
    await ctx.close();
  }
});

test("attachTranscript flips is_primary when markAsPrimary=true", async () => {
  const ctx = await spinUp();
  try {
    const registered = await ctx.client.register({
      kind: "user_message",
      appId: "clawix",
      originActor: "user",
      mimeType: "audio/mp4",
      bytesBase64: SILENT_M4A_BASE64,
      durationMs: 1200,
      transcript: { text: "v1", provider: "whisper-small" },
    });

    await ctx.client.attachTranscript(registered.asset.id, {
      text: "v2 mejor",
      role: "transcription",
      provider: "whisper-large",
      markAsPrimary: true,
    });

    const fetched = await ctx.client.get(registered.asset.id, "clawix");
    assert.equal(fetched.transcripts.length, 2);
    const primary = fetched.transcripts.find((t) => t.isPrimary);
    assert.ok(primary);
    assert.equal(primary!.text, "v2 mejor");
    assert.equal(primary!.provider, "whisper-large");
  } finally {
    await ctx.close();
  }
});

test("list filters by threadId within app", async () => {
  const ctx = await spinUp();
  try {
    await ctx.client.register({
      kind: "user_message", appId: "clawix", originActor: "user",
      mimeType: "audio/mp4", bytesBase64: SILENT_M4A_BASE64, durationMs: 1000,
      threadId: "thread-A",
    });
    await ctx.client.register({
      kind: "user_message", appId: "clawix", originActor: "user",
      mimeType: "audio/mp4", bytesBase64: SILENT_M4A_BASE64, durationMs: 1000,
      threadId: "thread-B",
    });
    await ctx.client.register({
      kind: "user_message", appId: "clawix", originActor: "user",
      mimeType: "audio/mp4", bytesBase64: SILENT_M4A_BASE64, durationMs: 1000,
      threadId: "thread-A",
    });

    const allClawix = await ctx.client.list({ appId: "clawix" });
    assert.equal(allClawix.total, 3);

    const onlyA = await ctx.client.list({ appId: "clawix", threadId: "thread-A" });
    assert.equal(onlyA.total, 2);
    assert.ok(onlyA.items.every((item) => item.asset.threadId === "thread-A"));
  } finally {
    await ctx.close();
  }
});

test("delete cascades transcripts and removes blob", async () => {
  const ctx = await spinUp();
  try {
    const registered = await ctx.client.register({
      kind: "dictation", appId: "clawix", originActor: "user",
      mimeType: "audio/mp4", bytesBase64: SILENT_M4A_BASE64, durationMs: 1000,
      transcript: { text: "hola" },
    });
    const blobPath = path.join(ctx.tmpDir, "blobs", registered.asset.bytesRelPath);
    assert.ok(fs.existsSync(blobPath), "blob should exist before delete");

    const deleted = await ctx.client.delete(registered.asset.id, "clawix");
    assert.equal(deleted.deleted, true);
    assert.ok(!fs.existsSync(blobPath), "blob should be removed after delete");

    let caught: Error | null = null;
    try {
      await ctx.client.get(registered.asset.id, "clawix");
    } catch (error) {
      caught = error as Error;
    }
    assert.ok(caught);
    assert.match(caught!.message, /404/);
  } finally {
    await ctx.close();
  }
});

test("register is idempotent on duplicate id", async () => {
  const ctx = await spinUp();
  try {
    const first = await ctx.client.register({
      id: "fixed-id-1",
      kind: "user_message", appId: "clawix", originActor: "user",
      mimeType: "audio/mp4", bytesBase64: SILENT_M4A_BASE64, durationMs: 1000,
    });
    const second = await ctx.client.register({
      id: "fixed-id-1",
      kind: "user_message", appId: "clawix", originActor: "user",
      mimeType: "audio/mp4", bytesBase64: SILENT_M4A_BASE64, durationMs: 9999,
    });
    assert.equal(first.asset.id, "fixed-id-1");
    assert.equal(second.asset.id, "fixed-id-1");
    assert.equal(second.asset.durationMs, 1000, "duration of first wins, second is ignored");
  } finally {
    await ctx.close();
  }
});
