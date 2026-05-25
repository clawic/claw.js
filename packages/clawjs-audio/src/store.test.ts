import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AudioServiceStore } from "./store.ts";

test("catalog asset imports use stable v1 provider metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-audio-store-"));
  const store = new AudioServiceStore(path.join(root, "audio.sqlite"), path.join(root, "audio"));

  try {
    store.insertCatalogAsset({
      id: "audio-1",
      kind: "dictation",
      appId: "clawix",
      originActor: "user",
      mimeType: "audio/wav",
      bytesRelPath: "clawix/audio-1.wav",
      durationMs: 1200,
      createdAt: 1_765_000_000_000,
      transcriptText: "ship the stable audio catalog",
    });

    const imported = store.getById("audio-1", "clawix");
    assert.equal(imported?.transcripts[0]?.provider, "unknown");
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("register does not leak an existing audio record across apps", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-audio-store-"));
  const store = new AudioServiceStore(path.join(root, "audio.sqlite"), path.join(root, "audio"));

  try {
    store.register({
      id: "shared-audio-id",
      kind: "dictation",
      appId: "private-app",
      originActor: "user",
      mimeType: "audio/wav",
      bytesBase64: Buffer.from("private audio").toString("base64"),
      durationMs: 900,
      transcript: {
        text: "private transcript",
        role: "transcription",
        provider: "fixture",
      },
    });

    assert.throws(
      () => store.register({
        id: "shared-audio-id",
        kind: "dictation",
        appId: "other-app",
        originActor: "user",
        mimeType: "audio/wav",
        bytesBase64: Buffer.from("other audio").toString("base64"),
        durationMs: 1000,
      }),
      /already exists/,
    );

    assert.equal(store.getById("shared-audio-id", "other-app"), null);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
