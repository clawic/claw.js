import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { watchSessionTranscript } from "./transcript.ts";

test("watchSessionTranscript observes transcript changes", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-watch-transcript-"));
  const transcriptDir = path.join(workspaceDir, ".claw", "sessions");
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
