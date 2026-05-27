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
    // @clawjs-persistent-surface-ddl-source
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        source TEXT,
        model TEXT,
        parent_session_id TEXT,
        started_at REAL,
        ended_at REAL,
        end_reason TEXT,
        message_count INTEGER,
        tool_call_count INTEGER,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cache_read_tokens INTEGER,
        cache_write_tokens INTEGER,
        reasoning_tokens INTEGER,
        billing_provider TEXT,
        billing_mode TEXT,
        estimated_cost_usd REAL,
        actual_cost_usd REAL,
        cost_status TEXT,
        api_call_count INTEGER
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
      INSERT INTO sessions (id, title, source, model, parent_session_id, started_at, ended_at, end_reason, message_count, tool_call_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, billing_provider, billing_mode, estimated_cost_usd, actual_cost_usd, cost_status, api_call_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("sqlite-native-session", "SQLite Native Session", "cli", "openai/gpt-4.1", "parent-session", 1779700000, null, null, 3, 0, 11, 23, 5, 7, 13, "openai", "api_key", 0.0123, 0.0101, "estimated", 2);
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
          parentSessionId?: string;
          messageCount?: number;
          inputTokens?: number;
          outputTokens?: number;
          cacheReadTokens?: number;
          cacheWriteTokens?: number;
          reasoningTokens?: number;
          billingProvider?: string;
          billingMode?: string;
          estimatedCostUsd?: number;
          actualCostUsd?: number;
          costStatus?: string;
          apiCallCount?: number;
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
  assert.equal(listed?.parentSessionId, "parent-session");
  assert.equal(listed?.messageCount, 3);
  assert.equal(listed?.inputTokens, 11);
  assert.equal(listed?.outputTokens, 23);
  assert.equal(listed?.cacheReadTokens, 5);
  assert.equal(listed?.cacheWriteTokens, 7);
  assert.equal(listed?.reasoningTokens, 13);
  assert.equal(listed?.billingProvider, "openai");
  assert.equal(listed?.billingMode, "api_key");
  assert.equal(listed?.estimatedCostUsd, 0.0123);
  assert.equal(listed?.actualCostUsd, 0.0101);
  assert.equal(listed?.costStatus, "estimated");
  assert.equal(listed?.apiCallCount, 2);
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

  const pinStdout = captureStream();
  const pinExit = await runCli(["runtime", "hermes", "sessions", "pin", "--session-key", "sqlite-native-session", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: pinStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(pinExit, CLI_EXIT_OK);
  const pinPayload = JSON.parse(pinStdout.getOutput()) as {
    data: { authority?: string; writesRuntime?: boolean; writesLocalOverlay?: boolean; result?: { overlayThreadId?: string; pinned?: boolean; nativeIdentifier?: { name?: string } } };
  };
  assert.equal(pinPayload.data.authority, "clawix_local_overlay");
  assert.equal(pinPayload.data.writesRuntime, false);
  assert.equal(pinPayload.data.writesLocalOverlay, true);
  assert.equal(pinPayload.data.result?.overlayThreadId, "runtime:hermes:sessions:sqlite-native-session");
  assert.equal(pinPayload.data.result?.pinned, true);

  const conflictsStdout = captureStream();
  const conflictsExit = await runCli(["runtime", "hermes", "sessions", "conflicts", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: conflictsStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(conflictsExit, CLI_EXIT_OK);
  const conflictsPayload = JSON.parse(conflictsStdout.getOutput()) as {
    data: { result?: { totalOverlays?: number; totalConflicts?: number; overlays?: Array<{ id?: string; nativeFound?: boolean; conflictStatus?: string; nativePinned?: boolean | null }> } };
  };
  assert.equal(conflictsPayload.data.result?.totalOverlays, 1);
  assert.equal(conflictsPayload.data.result?.totalConflicts, 1);
  assert.equal(conflictsPayload.data.result?.overlays?.[0]?.id, "sqlite-native-session");
  assert.equal(conflictsPayload.data.result?.overlays?.[0]?.nativeFound, true);
  assert.equal(conflictsPayload.data.result?.overlays?.[0]?.nativePinned, null);
  assert.equal(conflictsPayload.data.result?.overlays?.[0]?.conflictStatus, "local_only");

  const unpinStdout = captureStream();
  const unpinExit = await runCli(["runtime", "hermes", "sessions", "unpin", "--session-key", "sqlite-native-session", "--workspace", workspaceRoot, "--home-dir", hermesHome, "--json"], {
    stdout: unpinStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(unpinExit, CLI_EXIT_OK);
  const unpinPayload = JSON.parse(unpinStdout.getOutput()) as {
    data: { writesRuntime?: boolean; writesLocalOverlay?: boolean; result?: { pinned?: boolean } };
  };
  assert.equal(unpinPayload.data.writesRuntime, false);
  assert.equal(unpinPayload.data.writesLocalOverlay, true);
  assert.equal(unpinPayload.data.result?.pinned, false);
});
