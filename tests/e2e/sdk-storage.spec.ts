import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { pathToFileURL } from "url";

import { expect, test } from "./fixtures";

const execFileAsync = promisify(execFile);

function startFakeDriveShareServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  return new Promise((resolve) => {
    const uploads = new Map<string, Buffer>();
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        const body = Buffer.concat(chunks);
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        response.setHeader("content-type", "application/json");

        if (request.method === "POST" && url.pathname === "/v1/uploads") {
          uploads.set("item-1", body);
          response.end(JSON.stringify({ id: "item-1" }));
          return;
        }

        if (request.method === "POST" && url.pathname === "/v1/items/item-1/shares") {
          const address = server.address();
          const port = typeof address === "object" && address ? address.port : 0;
          response.end(JSON.stringify({
            share: { id: "share-1" },
            url: `http://127.0.0.1:${port}/shared/share-1`,
          }));
          return;
        }

        if (request.method === "POST" && url.pathname === "/v1/items/item-1/shares/share-1/revoke") {
          response.end(JSON.stringify({ ok: true }));
          return;
        }

        if (request.method === "GET" && url.pathname === "/shared/share-1") {
          response.setHeader("content-type", "text/plain");
          response.end(uploads.get("item-1") ?? Buffer.alloc(0));
          return;
        }

        response.statusCode = 404;
        response.end(JSON.stringify({ error: "not_found" }));
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => error ? closeReject(error) : closeResolve());
        }),
      });
    });
  });
}

test("sdk storage scopes agent objects, shares through Drive shape, and backs generated assets and documents", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-storage-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const commandPath = path.join(tempRoot, "fake-generation.js");
  const whisperPath = path.join(tempRoot, "fake-whisper.js");
  const ffmpegPath = path.join(tempRoot, "fake-ffmpeg.js");
  const modelPath = path.join(tempRoot, "fake-model.bin");
  const moduleUrl = pathToFileURL(path.join(rootDir, "packages", "clawjs-node", "dist", "index.js")).href;
  const fakeDrive = await startFakeDriveShareServer();

  fs.mkdirSync(tempRoot, { recursive: true });
  fs.writeFileSync(commandPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const outputPath = args[args.indexOf("--out") + 1];
fs.mkdirSync(require("path").dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 1, 0, 0, 0, 1,
  8, 2, 0, 0, 0,
]));
`, { mode: 0o755 });
  fs.writeFileSync(whisperPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const outputBase = args[args.indexOf("-of") + 1];
fs.writeFileSync(outputBase + ".txt", "voice transcript storage requirements");
`, { mode: 0o755 });
  fs.writeFileSync(ffmpegPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const input = args[args.indexOf("-i") + 1];
const output = args[args.length - 1];
fs.copyFileSync(input, output);
`, { mode: 0o755 });
  fs.writeFileSync(modelPath, "fake model");

  const script = `
const { Claw, createLocalStorageStore, startStorageHttpServer } = await import(${JSON.stringify(moduleUrl)});

const base = {
  runtime: { adapter: "demo" },
  workspace: {
    appId: "demo",
    workspaceId: "storage-main",
    rootDir: ${JSON.stringify(workspaceDir)},
  },
};
const driveIndexed = [];

const agentA = await Claw({
  ...base,
  workspace: { ...base.workspace, agentId: "agent-a" },
  storage: {
    driveIndex: {
      index(object) { driveIndexed.push(object.key); },
      remove(ref) {
        const index = driveIndexed.indexOf(ref.key);
        if (index >= 0) driveIndexed.splice(index, 1);
      },
    },
    share: {
      driveBaseUrl: ${JSON.stringify(fakeDrive.baseUrl)},
      token: "fake-drive-token",
    },
  },
});

const agentB = await Claw({
  ...base,
  workspace: { ...base.workspace, agentId: "agent-b" },
});

const stored = agentA.storage.writeText({ key: "reports/launch.txt", content: "shared payload" });
const internalRaw = agentA.storage.writeText({ key: "scratch/cache.txt", content: "internal cache" });
let denied = false;
try {
  agentB.storage.readText({ key: stored.key });
} catch {
  denied = true;
}

const share = await agentA.storage.share.create({ key: "reports/launch.txt", label: "Launch report", ttlMs: 30 });
agentA.storage.writeText({ key: "reports/launch.txt", content: "new payload" });
const sharedText = await (await fetch(share.url)).text();
await new Promise((resolve) => setTimeout(resolve, 50));

const httpStore = createLocalStorageStore({
  workspaceDir: ${JSON.stringify(workspaceDir)},
  agentId: "agent-a",
});
const remote = await startStorageHttpServer({ store: httpStore, host: "127.0.0.1", port: 0 });
const writable = agentA.storage.tokens.issue({
  label: "remote writer",
  grants: [{
    bucket: "workspace",
    prefix: "agents/agent-a/remote/",
    operations: ["objects:list", "objects:read", "objects:write", "objects:delete"],
  }],
});
const readonly = agentA.storage.tokens.issue({
  label: "remote reader",
  grants: [{
    bucket: "workspace",
    prefix: "agents/agent-a/remote/",
    operations: ["objects:list", "objects:read"],
  }],
});
const remoteObjectUrl = remote.url + "/v1/storage/objects/workspace/agents/agent-a/remote/note.txt";
const remoteWrite = await fetch(remoteObjectUrl, {
  method: "PUT",
  headers: { authorization: "Bearer " + writable.token, "content-type": "text/plain" },
  body: "remote payload",
});
const remoteRead = await fetch(remoteObjectUrl, { headers: { authorization: "Bearer " + writable.token } });
const remoteList = await fetch(remote.url + "/v1/storage/objects?bucket=workspace&prefix=agents/agent-a/remote/", {
  headers: { authorization: "Bearer " + writable.token },
});
const readonlyWrite = await fetch(remoteObjectUrl, {
  method: "PUT",
  headers: { authorization: "Bearer " + readonly.token, "content-type": "text/plain" },
  body: "blocked",
});
agentA.storage.tokens.revoke(writable.record.id);
const revokedRead = await fetch(remoteObjectUrl, { headers: { authorization: "Bearer " + writable.token } });
const expiredShareProxy = await fetch(remote.url + "/shared/storage/" + share.id, { redirect: "manual" });

const backend = agentA.generations.registerCommandBackend({
  id: "fake-image",
  label: "Fake Image",
  supportedKinds: ["image"],
  command: ${JSON.stringify(commandPath)},
  args: ["--out", "{outputPath}"],
  outputExtension: "png",
  mimeType: "image/png",
});
const generation = await agentA.generations.create({
  kind: "image",
  prompt: "storage backed image",
  backendId: backend.id,
});
const imageRecord = await agentA.image.generate({
  prompt: "storage backed image from image facade",
  backendId: backend.id,
});

const document = await agentA.documents.upload({
  name: "brief.txt",
  mimeType: "text/plain",
  data: Buffer.from("alpha storage document", "utf8").toString("base64"),
  sessionId: "session-1",
});
const hits = await agentA.documents.search({ query: "storage", sessionId: "session-1" });
const downloaded = await agentA.documents.download(document.documentId);
const documentMediaHits = agentA.media.search({ query: "alpha", sessionId: "session-1", kind: "document" });
const voiceNote = agentA.voiceNotes.create({
  data: Buffer.from("RIFF0000WAVEfmt "),
  mimeType: "audio/wav",
  fileName: "note.wav",
  source: {
    origin: "telegram",
    provider: "telegram",
    accountId: "support",
    targetId: "test-chat-001",
    threadId: "test-topic-001",
    providerMessageId: "voice-message-001",
  },
});
const transcribedVoice = await agentA.voiceNotes.transcribe(voiceNote.id, {
  binaryPath: ${JSON.stringify(whisperPath)},
  ffmpegPath: ${JSON.stringify(ffmpegPath)},
  modelPath: ${JSON.stringify(modelPath)},
});
const voiceMediaHits = agentA.media.search({ query: "voice transcript", provider: "telegram", kind: "audio" });
const galleryShare = await agentA.media.share.create({
  label: "Storage documents",
  filters: { kind: "document", query: "alpha" },
});
const resolvedGallery = agentA.media.share.resolveGallery(galleryShare.id);
const revokedGallery = await agentA.media.share.revoke(galleryShare.id);
const revokedResolvedGallery = agentA.media.share.resolveGallery(galleryShare.id);
const driveVisible = agentA.storage.list({ prefix: "agents/agent-a/" }).filter((object) => object.visibility === "drive").map((object) => object.key);

process.stdout.write(JSON.stringify({
  stored,
  internalRawVisibility: internalRaw.visibility,
  denied,
  share,
  sharedTextIncludesPayload: sharedText.includes("shared payload"),
  sharedTextStillSnapshot: !sharedText.includes("new payload"),
  expiredShareProxyStatus: expiredShareProxy.status,
  remoteWriteStatus: remoteWrite.status,
  remoteReadText: await remoteRead.text(),
  remoteListCount: (await remoteList.json()).items.length,
  readonlyWriteStatus: readonlyWrite.status,
  revokedReadStatus: revokedRead.status,
  generationOutputExists: generation.output?.exists,
  generationOutputPath: generation.output?.filePath,
  imageRecordOutputExists: imageRecord.output?.exists,
  driveVisible,
  driveIndexed,
  imageCount: agentA.image.list().length,
  documentStoragePath: document.storage.path,
  documentHit: hits[0]?.documentId === document.documentId,
  documentDownload: downloaded?.buffer.toString("utf8"),
  documentMediaHit: documentMediaHits[0]?.metadata?.documentId === document.documentId,
  voiceMediaHit: voiceMediaHits[0]?.metadata?.voiceNoteId === transcribedVoice.id,
  voiceMediaText: voiceMediaHits[0]?.sourceText,
  galleryShareUrl: galleryShare.url,
  galleryShareCount: resolvedGallery?.items.length,
  revokedGallery,
  revokedGalleryMissing: revokedResolvedGallery === null,
}, null, 2));
await remote.close();
httpStore.close();
`;

  try {
    const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: rootDir,
      env: {
        ...process.env,
        CI: "1",
      },
      maxBuffer: 10 * 1024 * 1024,
    });

    const payload = JSON.parse(stdout) as {
      stored: { key: string; filePath: string };
      internalRawVisibility: string;
      denied: boolean;
      share: { url: string; expiresAt: string | null };
      sharedTextIncludesPayload: boolean;
      sharedTextStillSnapshot: boolean;
      expiredShareProxyStatus: number;
      remoteWriteStatus: number;
      remoteReadText: string;
      remoteListCount: number;
      readonlyWriteStatus: number;
      revokedReadStatus: number;
      generationOutputExists: boolean;
      generationOutputPath: string;
      imageRecordOutputExists: boolean;
      driveVisible: string[];
      driveIndexed: string[];
      imageCount: number;
      documentStoragePath: string;
      documentHit: boolean;
      documentDownload: string;
      documentMediaHit: boolean;
      voiceMediaHit: boolean;
      voiceMediaText?: string;
      galleryShareUrl: string;
      galleryShareCount?: number;
      revokedGallery: boolean;
      revokedGalleryMissing: boolean;
    };

    expect(payload.stored.key).toBe("agents/agent-a/reports/launch.txt");
    expect(payload.internalRawVisibility).toBe("internal");
    expect(payload.denied).toBeTruthy();
    expect(payload.share.url).toContain("/shared/share-1");
    expect(payload.share.expiresAt).toBeTruthy();
    expect(payload.sharedTextIncludesPayload).toBeTruthy();
    expect(payload.sharedTextStillSnapshot).toBeTruthy();
    expect(payload.expiredShareProxyStatus).toBe(404);
    expect(payload.remoteWriteStatus).toBe(201);
    expect(payload.remoteReadText).toBe("remote payload");
    expect(payload.remoteListCount).toBe(1);
    expect(payload.readonlyWriteStatus).toBe(400);
    expect(payload.revokedReadStatus).toBe(401);
    expect(payload.generationOutputExists).toBeTruthy();
    expect(payload.generationOutputPath).toContain("storage-blobs");
    expect(payload.imageRecordOutputExists).toBeTruthy();
    expect(payload.driveVisible.some((key) => key.includes("/images/"))).toBeTruthy();
    expect(payload.driveVisible.some((key) => key.includes("/generations/"))).toBeTruthy();
    expect(payload.driveVisible.some((key) => key.includes("/documents/"))).toBeTruthy();
    expect(payload.driveIndexed.length).toBeGreaterThanOrEqual(3);
    expect(payload.driveIndexed.some((key) => key.includes("scratch/cache"))).toBeFalsy();
    expect(payload.imageCount).toBeGreaterThanOrEqual(1);
    expect(payload.documentStoragePath).toContain("storage://workspace/agents/agent-a/documents/blobs/");
    expect(payload.documentHit).toBeTruthy();
    expect(payload.documentDownload).toBe("alpha storage document");
    expect(payload.documentMediaHit).toBeTruthy();
    expect(payload.voiceMediaHit).toBeTruthy();
    expect(payload.voiceMediaText).toContain("voice transcript storage requirements");
    expect(payload.galleryShareUrl).toContain("clawjs://media-gallery/");
    expect(payload.galleryShareCount).toBeGreaterThanOrEqual(1);
    expect(payload.revokedGallery).toBeTruthy();
    expect(payload.revokedGalleryMissing).toBeTruthy();

    await page.setViewportSize({ width: 1280, height: 840 });
    await page.setContent(`
      <main style="font-family: Menlo, Monaco, monospace; padding: 32px; min-height: 100vh; background: #f8f7f2; color: #14213d;">
        <section style="max-width: 980px; margin: 0 auto;">
          <h1 style="margin: 0 0 16px; font-size: 30px;">Storage E2E</h1>
          <p style="font-size: 16px; line-height: 1.6;">Agent-scoped object writes, Drive-shaped shares, generated images, and document downloads all resolved through local storage.</p>
          <pre style="white-space: pre-wrap; border: 1px solid #d7d3c7; border-radius: 8px; background: white; padding: 18px; font-size: 13px; line-height: 1.5;">${JSON.stringify(payload, null, 2)}</pre>
        </section>
      </main>
    `);
    const screenshotPath = path.join(rootDir, "artifacts", "e2e", "sdk-storage.png");
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } finally {
    await fakeDrive.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
