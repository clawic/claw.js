import fs from "fs";
import path from "path";

import { listClawProfessionalRecordsSemanticViewEntries, resolveClawProfessionalRecordsIntent } from "@clawjs/core/catalogs";

import { openMainDataStore } from "./v1-data.ts";

export interface ProfessionalRecordsCliInput {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
  };
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
}

export type ProfessionalRecordsIntent = ReturnType<typeof resolveClawProfessionalRecordsIntent>;
export type DenseSemanticViewEntry = ReturnType<typeof listClawProfessionalRecordsSemanticViewEntries>[number];

export function uniqueRecordsById(records: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<unknown>();
  const out: Array<Record<string, unknown>> = [];
  for (const record of records) {
    if (!record.id || seen.has(record.id)) continue;
    seen.add(record.id);
    out.push(record);
  }
  return out;
}

export function sumNumericField(records: Array<Record<string, unknown>>, fieldName: string): number {
  return records.reduce((total, record) => total + (typeof record[fieldName] === "number" ? record[fieldName] : 0), 0);
}

export function firstStringField(records: Array<Record<string, unknown>>, fieldName: string): string | undefined {
  for (const record of records) {
    if (typeof record[fieldName] === "string") return record[fieldName];
  }
  return undefined;
}

export function relationLabel(record: Record<string, unknown>): string {
  return `${String(record.type ?? "relates")} ${String(record.fromEntityKind ?? "entity")}/${String(record.fromEntityId ?? "?")} -> ${String(record.toEntityKind ?? "entity")}/${String(record.toEntityId ?? "?")}`;
}

export function personLabel(record: Record<string, unknown>): string {
  return [record.firstName, record.lastName].filter((value): value is string => typeof value === "string" && value.length > 0).join(" ") || String(record.email ?? record.id);
}

export function openProfessionalRecordsStore(workspaceRoot: string) {
  const root = fs.realpathSync.native(workspaceRoot);
  const dataDir = path.join(root, ".claw", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const previousDataDir = process.env.CLAW_DATA_DIR;
  process.env.CLAW_DATA_DIR = dataDir;
  try {
    return openMainDataStore({ CLAW_DATA_DIR: dataDir } as NodeJS.ProcessEnv);
  } finally {
    if (previousDataDir === undefined) delete process.env.CLAW_DATA_DIR;
    else process.env.CLAW_DATA_DIR = previousDataDir;
  }
}

export function timelineItem(
  record: Record<string, unknown>,
  kind: string,
  recordId: unknown,
  label: unknown,
  occurredAt: unknown,
  data: Record<string, unknown>,
) {
  return {
    kind,
    recordId,
    label,
    occurredAt: typeof occurredAt === "string" ? occurredAt : null,
    data,
  };
}
