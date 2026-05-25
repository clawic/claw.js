import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

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

test("list and get tolerate corrupt persisted audio metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-audio-store-"));
  const dbPath = path.join(root, "audio.sqlite");
  const store = new AudioServiceStore(dbPath, path.join(root, "audio"));

  try {
    store.register({
      id: "interrupted-metadata-audio",
      kind: "dictation",
      appId: "clawix",
      originActor: "user",
      mimeType: "audio/wav",
      bytesBase64: Buffer.from("audio bytes").toString("base64"),
      durationMs: 1100,
      metadata: { source: "fixture" },
    });

    const db = new Database(dbPath);
    try {
      db.prepare("UPDATE audio_assets SET metadata_json = ? WHERE id = ?").run(
        "{interrupted-json",
        "interrupted-metadata-audio",
      );
    } finally {
      db.close();
    }

    const listed = store.list({ appId: "clawix" });
    assert.equal(listed.total, 1);
    assert.equal(listed.items[0]?.asset.id, "interrupted-metadata-audio");
    assert.equal(listed.items[0]?.asset.metadata, null);

    const fetched = store.getById("interrupted-metadata-audio", "clawix");
    assert.equal(fetched?.asset.metadata, null);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
