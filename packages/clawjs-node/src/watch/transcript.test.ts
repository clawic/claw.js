import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { watchSessionTranscript } from "./transcript.ts";
import { resolveClawWorkspaceSurfacePath } from "../surface-paths.ts";

test("watchSessionTranscript observes transcript changes", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-watch-transcript-"));
  const transcriptDir = resolveClawWorkspaceSurfacePath("claw.workspace.sessions", workspaceDir);
  fs.mkdirSync(transcriptDir, { recursive: true });
  const sessionId = "session-1";
  const transcriptPath = path.join(transcriptDir, `${sessionId}.jsonl`);
  fs.writeFileSync(transcriptPath, "");

  const event = await new Promise<{ filePath: string }>((resolve) => {
    const stop = watchSessionTranscript(workspaceDir, sessionId, (payload) => {
      stop();
      resolve(payload);
    });
    setTimeout(() => {
      fs.appendFileSync(transcriptPath, '{"type":"session"}\n');
    }, 20);
  });

  assert.equal(event.filePath, transcriptPath);
});

test("watchSessionTranscript rejects session ids outside the sessions directory", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-watch-transcript-"));

  assert.throws(
    () => watchSessionTranscript(workspaceDir, "../escaped-session", () => {}),
    /file-safe id/,
  );
});
