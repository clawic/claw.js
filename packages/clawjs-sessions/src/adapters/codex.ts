import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import type { SessionsServiceStore } from "../store.ts";
import type { CreateSessionInput, AppendMessageInput, MessageRole } from "../types.ts";

const NATIVE_FORMAT = "codex-rollout-jsonl-v1";

export interface CodexImportResult {
  filePath: string;
  sessionId: string | null;
  messagesImported: number;
  skipped: boolean;
  reason?: string;
}

export interface CodexScanResult {
  scanned: number;
  imported: CodexImportResult[];
}

interface RolloutLine {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

interface SessionMetaPayload {
  id?: string;
  timestamp?: string;
  cwd?: string;
  originator?: string;
  cli_version?: string;
  instructions?: string | null;
  git?: {
    commit_hash?: string;
    branch?: string;
    repository_url?: string;
  };
}

interface ResponseMessagePayload {
  type?: string;
  role?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

interface EventMsgPayload {
  type?: string;
  message?: string;
  text?: string;
  kind?: string;
}

function extractMessageText(content: ResponseMessagePayload["content"]): string {
  if (!content) return "";
  return content
    .map((block) => {
      if (typeof block?.text === "string") return block.text;
      return "";
    })
    .filter((text) => text.length > 0)
    .join("\n\n");
}

function isoToMillis(iso: string | undefined): number {
  if (!iso) return Date.now();
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : Date.now();
}

function rolloutBasename(filePath: string): string {
  return path.basename(filePath);
}

function sha1OfFile(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return createHash("sha1").update(buf).digest("hex");
}

function rolloutSessionIdFromName(filePath: string): string | null {
  const match = rolloutBasename(filePath).match(/rollout-[\d-]+T[\d-]+-([0-9a-f-]{8,})\.jsonl$/i);
  return match ? match[1] : null;
}

function classifyResponseMessage(role: string | undefined): MessageRole | null {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  if (role === "system") return "system";
  if (role === "tool") return "tool";
  return null;
}

export interface ImportCodexFileOptions {
  forceReimport?: boolean;
  machine?: string;
}

export function importCodexRolloutFile(
  store: SessionsServiceStore,
  filePath: string,
  options: ImportCodexFileOptions = {},
): CodexImportResult {
  if (!fs.existsSync(filePath)) {
    return { filePath, sessionId: null, messagesImported: 0, skipped: true, reason: "file_not_found" };
  }

  const existingOrigin = store.findOriginByPath(filePath);
  const currentHash = sha1OfFile(filePath);
  if (!options.forceReimport && existingOrigin && existingOrigin.mirrorHash === currentHash) {
    return { filePath, sessionId: existingOrigin.sessionId, messagesImported: 0, skipped: true, reason: "unchanged" };
  }

  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split("\n").filter((line) => line.trim().length > 0);

  let sessionId: string | null = existingOrigin?.sessionId ?? rolloutSessionIdFromName(filePath);
  let sessionInitialized = false;
  let messagesImported = 0;

  for (let index = 0; index < lines.length; index += 1) {
    let parsed: RolloutLine;
    try {
      parsed = JSON.parse(lines[index]) as RolloutLine;
    } catch {
      continue;
    }
    const type = parsed.type;
    const payload = parsed.payload ?? {};
    const lineTimestamp = isoToMillis(parsed.timestamp);

    if (type === "session_meta") {
      const meta = payload as SessionMetaPayload;
      const targetId = meta.id ?? sessionId;
      if (!targetId) continue;
      sessionId = targetId;
      const input: CreateSessionInput = {
        id: targetId,
        agent: "codex",
        runtime: meta.originator ?? meta.cli_version ?? "codex-cli",
        machine: options.machine ?? null,
        projectPath: meta.cwd ?? null,
        title: `Codex ${new Date(isoToMillis(meta.timestamp)).toISOString().slice(0, 16)}`,
        createdAt: isoToMillis(meta.timestamp),
        branch: meta.git?.branch ?? null,
        cwd: meta.cwd ?? null,
        status: "active",
        customMetadata: {
          codex: {
            originator: meta.originator ?? null,
            cliVersion: meta.cli_version ?? null,
            instructions: meta.instructions ?? null,
            repositoryUrl: meta.git?.repository_url ?? null,
            commitHash: meta.git?.commit_hash ?? null,
          },
        },
      };
      store.createSession(input);
      sessionInitialized = true;
      continue;
    }

    if (!sessionId) continue;

    if (!sessionInitialized) {
      store.createSession({
        id: sessionId,
        agent: "codex",
        runtime: "codex-cli",
        machine: options.machine ?? null,
        title: `Codex ${rolloutBasename(filePath)}`,
        createdAt: lineTimestamp,
        status: "active",
      });
      sessionInitialized = true;
    }

    if (type === "response_item") {
      const item = payload as ResponseMessagePayload;
      if (item.type !== "message") continue;
      const role = classifyResponseMessage(item.role);
      if (!role) continue;
      const bodyText = extractMessageText(item.content);
      if (!bodyText.trim()) continue;
      const input: AppendMessageInput = {
        sessionId,
        role,
        contentText: bodyText,
        contentBlocks: Array.isArray(item.content) ? (item.content as unknown[]) : null,
        timestamp: lineTimestamp,
        sourceNativeId: `${rolloutBasename(filePath)}::line:${index}`,
      };
      const outcome = store.appendMessageResult(input);
      if (outcome.inserted) messagesImported += 1;
      continue;
    }

    if (type === "event_msg") {
      const ev = payload as EventMsgPayload;
      if (ev.type === "user_message" && typeof ev.message === "string" && ev.message.trim()) {
        const input: AppendMessageInput = {
          sessionId,
          role: "user",
          contentText: ev.message,
          timestamp: lineTimestamp,
          sourceNativeId: `${rolloutBasename(filePath)}::line:${index}`,
        };
        store.appendMessage(input);
        messagesImported += 1;
          continue;
      }
    }
  }

  if (sessionId) {
    store.upsertOrigin({
      sessionId,
      nativePath: filePath,
      nativeFormat: NATIVE_FORMAT,
      mirrorHash: currentHash,
    });
  }

  return {
    filePath,
    sessionId,
    messagesImported,
    skipped: false,
  };
}

export interface ImportCodexDirOptions extends ImportCodexFileOptions {
  pattern?: RegExp;
}

export function importCodexSessionsDir(
  store: SessionsServiceStore,
  rootDir: string,
  options: ImportCodexDirOptions = {},
): CodexScanResult {
  if (!fs.existsSync(rootDir)) {
    return { scanned: 0, imported: [] };
  }
  const pattern = options.pattern ?? /^rollout-.*\.jsonl$/;
  const stack: string[] = [rootDir];
  const filePaths: string[] = [];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && pattern.test(entry.name)) {
        filePaths.push(full);
      }
    }
  }
  filePaths.sort();
  const imported = filePaths.map((file) =>
    importCodexRolloutFile(store, file, {
      forceReimport: options.forceReimport,
      machine: options.machine,
    }),
  );
  return { scanned: filePaths.length, imported };
}
