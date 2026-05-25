import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import BetterSqlite3 from "better-sqlite3";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, runCli } from "./index.ts";
import { captureStream, useIsolatedClawDataRoot } from "./index-test-utils.ts";

function createHermesStateDatabase(databasePath: string) {
  const db = new BetterSqlite3(databasePath);
  try {
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        source TEXT,
        model TEXT,
        started_at REAL,
        ended_at REAL,
        end_reason TEXT,
        message_count INTEGER,
        tool_call_count INTEGER,
        input_tokens INTEGER,
        output_tokens INTEGER
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT,
        content TEXT,
        timestamp REAL
      );
    `);
    db.prepare(`
      INSERT INTO sessions (id, title, source, model, started_at, ended_at, end_reason, message_count, tool_call_count, input_tokens, output_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("sqlite-native-session", "SQLite Native Session", "cli", "openai/gpt-4.1", 1779700000, null, null, 3, 0, 11, 23);
    const insertMessage = db.prepare("INSERT INTO messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)");
    insertMessage.run("msg-1", "sqlite-native-session", "user", "hermes sqlite preview", 1779700001);
    insertMessage.run("msg-2", "sqlite-native-session", "assistant", "Hermes reply with api_key=TEST_SECRET_1234567890", 1779700002);
    insertMessage.run("msg-3", "sqlite-native-session", "user", "follow up", 1779700003);
  } finally {
    db.close();
  }
}

test("runCli reads Hermes sessions from the official SQLite session store", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-hermes-sqlite-workspace-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const hermesHome = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-hermes-sqlite-home-")), ".hermes");
  fs.mkdirSync(hermesHome, { recursive: true });
  createHermesStateDatabase(path.join(hermesHome, "state.db"));

  const listStdout = captureStream();
  const listExit = await runCli(["runtime", "hermes", "sessions", "list", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(listExit), true);
  const listPayload = JSON.parse(listStdout.getOutput()) as {
    data: {
      result?: {
        totalProjected?: number;
        sessions?: Array<{
          id?: string;
          title?: string;
          model?: string;
          messageCount?: number;
          nativeIdentifier?: { name?: string };
          sessionStorageContract?: string;
          provenance?: { source?: string; table?: string };
        }>;
      };
    };
  };
  const listed = listPayload.data.result?.sessions?.[0];
  assert.equal(listPayload.data.result?.totalProjected, 1);
  assert.equal(listed?.id, "sqlite-native-session");
  assert.equal(listed?.title, "SQLite Native Session");
  assert.equal(listed?.model, "openai/gpt-4.1");
  assert.equal(listed?.messageCount, 3);
  assert.equal(listed?.nativeIdentifier?.name, "sessionId");
  assert.equal(listed?.sessionStorageContract, "sqlite_with_gateway_transcripts");
  assert.equal(listed?.provenance?.source, "runtime-session-sqlite");
  assert.equal(listed?.provenance?.table, "sessions");

  const resolveStdout = captureStream();
  const resolveExit = await runCli(["runtime", "hermes", "sessions", "resolve", "--session-key", "sqlite-native-session", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: resolveStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(resolveExit), true);
  const resolvePayload = JSON.parse(resolveStdout.getOutput()) as {
    data: { result?: { found?: boolean; matchedBy?: string; nativeIdentifier?: { name?: string }; writesRuntime?: boolean } };
  };
  assert.equal(resolvePayload.data.result?.found, true);
  assert.equal(resolvePayload.data.result?.matchedBy, "sessionId");
  assert.equal(resolvePayload.data.result?.nativeIdentifier?.name, "sessionId");
  assert.equal(resolvePayload.data.result?.writesRuntime, false);

  const resolveTitleStdout = captureStream();
  const resolveTitleExit = await runCli(["runtime", "hermes", "sessions", "resolve", "--session-key", "SQLite Native Session", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: resolveTitleStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(resolveTitleExit), true);
  const resolveTitlePayload = JSON.parse(resolveTitleStdout.getOutput()) as {
    data: { result?: { id?: string; found?: boolean; matchedBy?: string; nativeIdentifier?: { name?: string } } };
  };
  assert.equal(resolveTitlePayload.data.result?.id, "sqlite-native-session");
  assert.equal(resolveTitlePayload.data.result?.found, true);
  assert.equal(resolveTitlePayload.data.result?.matchedBy, "sessionTitle");
  assert.equal(resolveTitlePayload.data.result?.nativeIdentifier?.name, "sessionId");

  const historyMetadataStdout = captureStream();
  const historyMetadataExit = await runCli(["runtime", "hermes", "sessions", "history", "--session-key", "sqlite-native-session", "--limit", "2", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: historyMetadataStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(historyMetadataExit), true);
  const historyMetadataPayload = JSON.parse(historyMetadataStdout.getOutput()) as {
    data: { result?: { contentIncluded?: boolean; contentTruncated?: boolean; totalProjected?: number; totalAvailableInStore?: number; messages?: Array<{ contentPreview?: string }> } };
  };
  assert.equal(historyMetadataPayload.data.result?.contentIncluded, false);
  assert.equal(historyMetadataPayload.data.result?.contentTruncated, true);
  assert.equal(historyMetadataPayload.data.result?.totalProjected, 2);
  assert.equal(historyMetadataPayload.data.result?.totalAvailableInStore, 3);
  assert.equal(historyMetadataPayload.data.result?.messages?.some((entry) => entry.contentPreview), false);

  const historyContentStdout = captureStream();
  const historyContentExit = await runCli(["runtime", "hermes", "sessions", "history", "--session-key", "sqlite-native-session", "--include-content", "--limit", "3", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: historyContentStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(historyContentExit), true);
  const historyContentPayload = JSON.parse(historyContentStdout.getOutput()) as {
    data: { result?: { contentIncluded?: boolean; messages?: Array<{ contentPreview?: string }> } };
  };
  assert.equal(historyContentPayload.data.result?.contentIncluded, true);
  assert.equal(historyContentPayload.data.result?.messages?.some((entry) => entry.contentPreview?.includes("Hermes reply")), true);
  assert.equal(historyContentPayload.data.result?.messages?.some((entry) => entry.contentPreview?.includes("TEST_SECRET_1234567890")), false);

  const previewStdout = captureStream();
  const previewExit = await runCli(["runtime", "hermes", "sessions", "preview", "--session-key", "sqlite-native-session", "--include-content", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: previewStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(previewExit), true);
  const previewPayload = JSON.parse(previewStdout.getOutput()) as {
    data: { result?: { contentIncluded?: boolean; contentPreview?: string; nativeIdentifier?: { name?: string } } };
  };
  assert.equal(previewPayload.data.result?.contentIncluded, true);
  assert.match(previewPayload.data.result?.contentPreview ?? "", /hermes sqlite preview/);
  assert.equal(previewPayload.data.result?.contentPreview?.includes("TEST_SECRET_1234567890"), false);
  assert.equal(previewPayload.data.result?.nativeIdentifier?.name, "sessionId");
});
