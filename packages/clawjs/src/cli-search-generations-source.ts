import fs from "node:fs";
import path from "node:path";

import { resolveClawPersistentSurfacePath } from "@clawjs/core";
import { SearchStore, type SearchDocumentInput } from "@clawjs/search";
import { redactedStructuredText } from "./cli-search-web-external-source.ts";

export function ensureGenerationsArtifactsSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const workspaceRoot = path.resolve(flags.workspace ?? cwd);
  const records = readWorkspaceCollectionRecords(workspaceRoot, "generations");
  let indexed = 0;
  for (const record of records) {
    const document = generationArtifactSearchDocument(record, workspaceRoot);
    if (!document) continue;
    store.upsertDocument(document);
    indexed += 1;
  }
  store.setCursor({
    source: "generations.artifacts",
    cursor: `generations:${indexed}`,
    metadata: { workspaceRoot, collections: ["generations"] },
  });
  store.setSourceState("generations.artifacts", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return indexed;
}

export function ensureGenerationArtifactResourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string, generationId: string): number {
  const workspaceRoot = path.resolve(flags.workspace ?? cwd);
  const record = readWorkspaceCollectionRecord(workspaceRoot, "generations", generationId);
  if (!record) {
    store.tombstone({ source: "generations.artifacts", resourceId: generationId, reason: "generation artifact missing during Search event refresh" });
    return 1;
  }
  const document = generationArtifactSearchDocument(record, workspaceRoot);
  if (!document) {
    store.tombstone({ source: "generations.artifacts", resourceId: generationId, reason: "generation artifact skipped during Search event refresh" });
    return 1;
  }
  store.upsertDocument(document);
  store.setSourceState("generations.artifacts", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return 1;
}

function generationArtifactSearchDocument(record: Record<string, unknown>, workspaceRoot: string): SearchDocumentInput | null {
  const id = stringField(record, "id");
  if (!id) return null;
  const kind = stringField(record, "kind") ?? "generation";
  const title = stringField(record, "title") ?? id;
  const prompt = stringField(record, "prompt");
  const command = isPlainRecord(record.command) ? record.command : {};
  const outputRelativePath = stringField(record, "outputRelativePath");
  const metadata = isPlainRecord(record.metadata) ? record.metadata : {};
  const metadataText = redactedStructuredText(metadata);
  const commandText = redactedGenerationCommandText(command);
  const body = [
    title,
    kind,
    stringField(record, "status"),
    prompt,
    stringField(record, "backendId"),
    stringField(record, "backendLabel"),
    stringField(record, "backendType"),
    stringField(record, "backendSource"),
    stringField(record, "model"),
    ...commandText,
    metadataText,
    stringField(record, "error"),
  ].filter(Boolean).join("\n");
  return {
    id: `generations.artifacts:${id}`,
    source: "generations.artifacts",
    domain: "generations",
    type: kind === "document" ? "document" : kind,
    resourceId: id,
    title,
    subtitle: [kind, stringField(record, "status"), stringField(record, "backendLabel")].filter(Boolean).join(" / "),
    snippet: prompt ?? stringField(record, "error") ?? title,
    body,
    ...(outputRelativePath ? { path: resolveClawPersistentSurfacePath("claw.workspace.data", workspaceRoot, "assets", outputRelativePath) } : {}),
    ...(stringField(record, "updatedAt") ?? stringField(record, "createdAt") ? { updatedAt: stringField(record, "updatedAt") ?? stringField(record, "createdAt") } : {}),
    metadata: {
      generationId: id,
      kind,
      status: stringField(record, "status") ?? null,
      backendId: stringField(record, "backendId") ?? null,
      backendLabel: stringField(record, "backendLabel") ?? null,
      backendType: stringField(record, "backendType") ?? null,
      backendSource: stringField(record, "backendSource") ?? null,
      model: stringField(record, "model") ?? null,
      outputMimeType: stringField(record, "outputMimeType") ?? null,
      command: stringField(command, "command") ?? null,
      hasOutput: !!outputRelativePath,
      hasError: !!stringField(record, "error"),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      generation: 1,
      succeeded: stringField(record, "status") === "succeeded" ? 0.2 : 0,
    },
    fragments: [
      ...(prompt ? [{
        id: `generations.artifacts:${id}:prompt`,
        title: "prompt",
        body: prompt,
        snippet: prompt.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "prompt" },
      }] : []),
      ...(metadataText ? [{
        id: `generations.artifacts:${id}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open generated artifact", requiresApproval: true, risk: "read", grant: "search.generations.open" },
      { id: "copy-reference", kind: "copy", label: "Copy generation reference", requiresApproval: false },
    ],
  };
}

function readWorkspaceCollectionRecord(root: string, collection: string, id: string): Record<string, unknown> | null {
  const filePath = resolveClawPersistentSurfacePath("claw.workspace.data", root, "collections", collection, `${id}.json`);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    return isPlainRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readWorkspaceCollectionRecords(root: string, collection: string): Array<Record<string, unknown>> {
  const dir = resolveClawPersistentSurfacePath("claw.workspace.data", root, "collections", collection);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, entry.name), "utf8")) as unknown;
        return isPlainRecord(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((record): record is Record<string, unknown> => record !== null);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function redactedGenerationCommandText(command: Record<string, unknown>): string[] {
  const text: string[] = [];
  const executable = stringField(command, "command");
  if (executable) text.push(executable);
  const args = Array.isArray(command.args)
    ? command.args.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const redacted = redactedGenerationCommandArg(arg);
    if (redacted) {
      text.push(redacted);
      if (!arg.includes("=") && isSensitiveCommandArg(arg) && index + 1 < args.length) index += 1;
      continue;
    }
    text.push(arg);
  }
  return text;
}

function redactedGenerationCommandArg(arg: string): string | null {
  const equalsIndex = arg.indexOf("=");
  if (equalsIndex >= 0) {
    const key = arg.slice(0, equalsIndex);
    return isSensitiveCommandArg(key) ? `${key}=[redacted]` : null;
  }
  if (!isSensitiveCommandArg(arg)) return null;
  return arg.startsWith("-") ? `${arg} [redacted]` : "[redacted]";
}

function isSensitiveCommandArg(arg: string): boolean {
  return /token|secret|password|credential|api[_-]?key/i.test(arg);
}
