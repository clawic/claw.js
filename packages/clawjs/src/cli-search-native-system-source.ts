import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SearchStore,
  type SearchAction,
  type SearchDocumentInput,
  type SearchProfileId,
  type SearchSourceState,
} from "@clawjs/search";
import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";

type NativeSystemSourceStateWriter = (
  flags: Record<string, string>,
  source: string,
  state: SearchSourceState,
  input?: { profile: SearchProfileId; actor?: string; surface?: string },
) => void;

export type NativeSystemSearchSourceSnapshot = {
  source: "native.system";
  domain: "native";
  state: "enabled" | "external_pending" | "disabled" | "paused" | "degraded";
  updatedAt?: string;
  error?: string;
  documents?: NativeSystemSearchSourceSnapshotDocument[];
};

export type NativeSystemSearchSourceSnapshotDocument = {
  id: string;
  source?: string;
  domain?: string;
  type: string;
  title: string;
  subtitle?: string;
  snippet?: string;
  body?: string;
  resourceId?: string;
  path?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
  permissions?: SearchDocumentInput["permissions"];
  rankingHints?: SearchDocumentInput["rankingHints"];
  fragments?: SearchDocumentInput["fragments"];
  actions?: SearchAction[];
};

export function hasNativeSystemSnapshotFlag(flags: Record<string, string>): boolean {
  return Boolean(nativeSystemSnapshotFlag(flags));
}

export function enableNativeSystemSourceFromSnapshotFlag(input: {
  store: SearchStore;
  flags: Record<string, string>;
  selectedSources?: string[];
  writeCanonicalSearchSourceState: NativeSystemSourceStateWriter;
}): void {
  if (!hasNativeSystemSnapshotFlag(input.flags)) return;
  if (input.selectedSources && !input.selectedSources.includes("native.system")) return;
  input.store.setSourceState("native.system", "enabled", {
    error: null,
  });
  input.writeCanonicalSearchSourceState(input.flags, "native.system", "enabled", {
    profile: "full",
    actor: input.flags.actor,
    surface: input.flags.surface ?? "claw.search.native_system.snapshot",
  });
}

export function ensureNativeSystemSourceIndexed(input: {
  store: SearchStore;
  flags: Record<string, string>;
  cwd: string;
  writeCanonicalSearchSourceState: NativeSystemSourceStateWriter;
}): number {
  const snapshotText = readNativeSystemSnapshotFlag(input.flags, input.cwd);
  if (!snapshotText) {
    input.store.setSourceState("native.system", "external_pending", {
      backlog: 0,
      error: "native.system requires --native-system-snapshot from the signed host",
      lastIndexedAt: null,
    });
    return 0;
  }
  const snapshot = parseNativeSystemSnapshot(snapshotText);
  if (snapshot.state !== "enabled") {
    input.store.setSourceState("native.system", snapshot.state === "degraded" ? "degraded" : "external_pending", {
      backlog: 0,
      error: snapshot.error ?? `native.system snapshot state is ${snapshot.state}`,
      lastIndexedAt: snapshot.updatedAt ?? null,
    });
    return 0;
  }
  const documents = (snapshot.documents ?? []).map(nativeSystemSnapshotSearchDocument);
  for (const document of documents) input.store.upsertDocument(document);
  const checksum = stableNativeSystemSnapshotId(snapshotText);
  input.store.setCursor({
    source: "native.system",
    cursor: `host-snapshot:${checksum}:documents:${documents.length}`,
    watermark: snapshot.updatedAt,
    metadata: {
      source: "signed_host_snapshot",
      documents: documents.length,
      checksum,
    },
  });
  input.store.setSourceState("native.system", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: snapshot.updatedAt ?? new Date().toISOString(),
  });
  input.writeCanonicalSearchSourceState(input.flags, "native.system", "enabled", {
    profile: "full",
    actor: input.flags.actor,
    surface: input.flags.surface ?? "claw.search.native_system.snapshot",
  });
  return documents.length;
}

function nativeSystemSnapshotFlag(flags: Record<string, string>): string | undefined {
  return flags["native-system-snapshot"] ?? flags["native-system-snapshot-json"] ?? flags["host-native-system-snapshot"] ?? flags["host-native-system-snapshot-json"];
}

function nativeSystemSnapshotSource(flags: Record<string, string>): "path" | "json" | undefined {
  if (flags["native-system-snapshot"] || flags["host-native-system-snapshot"]) return "path";
  if (flags["native-system-snapshot-json"] || flags["host-native-system-snapshot-json"]) return "json";
  return undefined;
}

function readNativeSystemSnapshotFlag(flags: Record<string, string>, cwd: string): string | undefined {
  const value = nativeSystemSnapshotFlag(flags);
  if (!value) return undefined;
  if (nativeSystemSnapshotSource(flags) === "json") return value;
  const expanded = expandNativeSystemSnapshotHome(value);
  const snapshotPath = path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
  return fs.readFileSync(snapshotPath, "utf8");
}

function parseNativeSystemSnapshot(value: string): NativeSystemSearchSourceSnapshot {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliHandledError("invalid_native_system_snapshot", "Native system snapshot must be a JSON object.", CLI_EXIT_USAGE);
  }
  const snapshot = parsed as Partial<NativeSystemSearchSourceSnapshot>;
  if (snapshot.source !== "native.system" || snapshot.domain !== "native") {
    throw new CliHandledError("invalid_native_system_snapshot", "Native system snapshot must declare source native.system and domain native.", CLI_EXIT_USAGE);
  }
  const state = snapshot.state;
  if (state !== "enabled" && state !== "external_pending" && state !== "disabled" && state !== "paused" && state !== "degraded") {
    throw new CliHandledError("invalid_native_system_snapshot", "Native system snapshot state must be enabled, external_pending, disabled, paused, or degraded.", CLI_EXIT_USAGE);
  }
  if (snapshot.documents !== undefined && !Array.isArray(snapshot.documents)) {
    throw new CliHandledError("invalid_native_system_snapshot", "Native system snapshot documents must be an array.", CLI_EXIT_USAGE);
  }
  return {
    source: "native.system",
    domain: "native",
    state,
    ...(typeof snapshot.updatedAt === "string" ? { updatedAt: snapshot.updatedAt } : {}),
    ...(typeof snapshot.error === "string" ? { error: snapshot.error } : {}),
    documents: (snapshot.documents ?? []).map(validateNativeSystemSnapshotDocument),
  };
}

function validateNativeSystemSnapshotDocument(value: unknown): NativeSystemSearchSourceSnapshotDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CliHandledError("invalid_native_system_snapshot", "Native system snapshot document must be a JSON object.", CLI_EXIT_USAGE);
  }
  const document = value as Partial<NativeSystemSearchSourceSnapshotDocument>;
  if (typeof document.id !== "string" || typeof document.type !== "string" || typeof document.title !== "string") {
    throw new CliHandledError("invalid_native_system_snapshot", "Native system snapshot documents require id, type, and title.", CLI_EXIT_USAGE);
  }
  if (document.source && document.source !== "native.system") {
    throw new CliHandledError("invalid_native_system_snapshot", "Native system snapshot document source must be native.system.", CLI_EXIT_USAGE);
  }
  if (document.domain && document.domain !== "native") {
    throw new CliHandledError("invalid_native_system_snapshot", "Native system snapshot document domain must be native.", CLI_EXIT_USAGE);
  }
  return {
    id: document.id,
    source: "native.system",
    domain: "native",
    type: document.type,
    title: document.title,
    ...(typeof document.subtitle === "string" ? { subtitle: document.subtitle } : {}),
    ...(typeof document.snippet === "string" ? { snippet: document.snippet } : {}),
    ...(typeof document.body === "string" ? { body: document.body } : {}),
    ...(typeof document.resourceId === "string" ? { resourceId: document.resourceId } : {}),
    ...(typeof document.path === "string" ? { path: document.path } : {}),
    ...(typeof document.updatedAt === "string" ? { updatedAt: document.updatedAt } : {}),
    ...(document.metadata && typeof document.metadata === "object" && !Array.isArray(document.metadata) ? { metadata: document.metadata } : {}),
    ...(document.permissions && typeof document.permissions === "object" && !Array.isArray(document.permissions) ? { permissions: document.permissions } : {}),
    ...(document.rankingHints && typeof document.rankingHints === "object" && !Array.isArray(document.rankingHints) ? { rankingHints: document.rankingHints } : {}),
    ...(Array.isArray(document.fragments) ? { fragments: document.fragments } : {}),
    ...(Array.isArray(document.actions) ? { actions: document.actions } : {}),
  };
}

function nativeSystemSnapshotSearchDocument(document: NativeSystemSearchSourceSnapshotDocument): SearchDocumentInput {
  const metadataText = document.metadata ? Object.values(document.metadata).filter((value) => typeof value === "string" || typeof value === "number" || typeof value === "boolean").join(" ") : "";
  const body = [document.body, document.title, document.subtitle, document.snippet, metadataText].filter(Boolean).join("\n");
  return {
    ...document,
    source: "native.system",
    domain: "native",
    body,
  };
}

function expandNativeSystemSnapshotHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function stableNativeSystemSnapshotId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}
