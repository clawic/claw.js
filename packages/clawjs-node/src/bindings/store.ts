import { z } from "zod";
import type { BindingDefinition } from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { resolveClawWorkspaceSurfacePath } from "../surface-paths.ts";

const bindingRecordSchema = z.object({
  schemaVersion: z.number().int().positive(),
  bindings: z.array(z.object({
    id: z.string().min(1),
    targetFile: z.string().min(1),
    mode: z.enum(["managed_block", "insert_before_anchor", "insert_after_anchor", "append", "prepend"]),
    blockId: z.string().optional(),
    anchor: z.string().optional(),
    required: z.boolean().optional(),
    visibleToUser: z.boolean().optional(),
    settingsPath: z.string().min(1),
  })),
});

const settingsSchemaRecordSchema = z.object({
  schemaVersion: z.number().int().positive(),
  settingsSchema: z.record(z.unknown()),
});

const settingsValuesRecordSchema = z.object({
  schemaVersion: z.number().int().positive(),
  values: z.record(z.unknown()),
});

export interface BindingStoreRecord {
  schemaVersion: number;
  bindings: BindingDefinition[];
}

export interface SettingsSchemaRecord {
  schemaVersion: number;
  settingsSchema: Record<string, unknown>;
}

export interface SettingsValuesRecord {
  schemaVersion: number;
  values: Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface SettingsValidationIssue {
  path: string;
  message: string;
}

export function resolveBindingsPath(workspaceDir: string): string {
  return resolveClawWorkspaceSurfacePath("claw.workspace.projections", workspaceDir, "file-bindings.json");
}

export function resolveSettingsSchemaPath(workspaceDir: string): string {
  return resolveClawWorkspaceSurfacePath("claw.workspace.projections", workspaceDir, "settings-schema.json");
}

export function resolveSettingsValuesPath(workspaceDir: string): string {
  return resolveClawWorkspaceSurfacePath("claw.workspace.intents", workspaceDir, "files.json");
}

function readRecord<T>(
  filePath: string,
  fallback: T,
  schema: z.ZodType<T>,
  invalidJsonMessage: string,
  invalidRecordMessage: string,
  filesystem: NodeFileSystemHost,
): T {
  if (!filesystem.exists(filePath)) return fallback;

  let raw: string;
  try {
    raw = filesystem.readText(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return fallback;
    throw error;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error(invalidJsonMessage);
  }

  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    throw new Error(invalidRecordMessage);
  }
  return parsed.data;
}

export function readBindingStore(workspaceDir: string, filesystem = new NodeFileSystemHost()): BindingStoreRecord {
  return readRecord(
    resolveBindingsPath(workspaceDir),
    { schemaVersion: 1, bindings: [] },
    bindingRecordSchema,
    "invalid_binding_store_json",
    "invalid_binding_store_record",
    filesystem,
  );
}

export function writeBindingStore(workspaceDir: string, bindings: BindingDefinition[], filesystem = new NodeFileSystemHost()): BindingStoreRecord {
  const record: BindingStoreRecord = {
    schemaVersion: 1,
    bindings,
  };
  const filePath = resolveBindingsPath(workspaceDir);
  filesystem.withLockRetry(resolveFileLockPath(filePath), () => filesystem.writeTextAtomic(filePath, `${JSON.stringify(record, null, 2)}\n`));
  return record;
}

export function readSettingsSchemaRecord(workspaceDir: string, filesystem = new NodeFileSystemHost()): SettingsSchemaRecord {
  return readRecord(
    resolveSettingsSchemaPath(workspaceDir),
    { schemaVersion: 1, settingsSchema: {} },
    settingsSchemaRecordSchema,
    "invalid_settings_schema_json",
    "invalid_settings_schema_record",
    filesystem,
  );
}

export function writeSettingsSchemaRecord(workspaceDir: string, settingsSchema: Record<string, unknown>, filesystem = new NodeFileSystemHost()): SettingsSchemaRecord {
  const record: SettingsSchemaRecord = {
    schemaVersion: 1,
    settingsSchema,
  };
  const filePath = resolveSettingsSchemaPath(workspaceDir);
  filesystem.withLockRetry(resolveFileLockPath(filePath), () => filesystem.writeTextAtomic(filePath, `${JSON.stringify(record, null, 2)}\n`));
  return record;
}

export function readSettingsValuesRecord(workspaceDir: string, filesystem = new NodeFileSystemHost()): SettingsValuesRecord {
  return readRecord(
    resolveSettingsValuesPath(workspaceDir),
    { schemaVersion: 1, values: {} },
    settingsValuesRecordSchema,
    "invalid_settings_values_json",
    "invalid_settings_values_record",
    filesystem,
  );
}

export function writeSettingsValuesRecord(workspaceDir: string, values: Record<string, unknown>, filesystem = new NodeFileSystemHost()): SettingsValuesRecord {
  const record: SettingsValuesRecord = {
    schemaVersion: 1,
    values,
  };
  const filePath = resolveSettingsValuesPath(workspaceDir);
  filesystem.withLockRetry(resolveFileLockPath(filePath), () => filesystem.writeTextAtomic(filePath, `${JSON.stringify({
    ...record,
    updatedAt: nowIso(),
  }, null, 2)}\n`));
  return record;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateSettingsNode(schemaNode: unknown, value: unknown, currentPath: string): SettingsValidationIssue[] {
  if (!isPlainObject(schemaNode)) return [];
  const expectedType = typeof schemaNode.type === "string" ? schemaNode.type : null;
  if (!expectedType) return [];

  switch (expectedType) {
    case "string":
      return typeof value === "string" ? [] : [{ path: currentPath, message: "expected string" }];
    case "number":
      return typeof value === "number" ? [] : [{ path: currentPath, message: "expected number" }];
    case "boolean":
      return typeof value === "boolean" ? [] : [{ path: currentPath, message: "expected boolean" }];
    case "array":
      if (!Array.isArray(value)) return [{ path: currentPath, message: "expected array" }];
      return Array.isArray(schemaNode.items)
        ? []
        : value.flatMap((entry, index) => validateSettingsNode(schemaNode.items, entry, `${currentPath}[${index}]`));
    case "object": {
      if (!isPlainObject(value)) return [{ path: currentPath, message: "expected object" }];
      const properties = isPlainObject(schemaNode.properties) ? schemaNode.properties : {};
      const required = Array.isArray(schemaNode.required)
        ? schemaNode.required.filter((entry): entry is string => typeof entry === "string")
        : [];
      const issues: SettingsValidationIssue[] = [];
      for (const key of required) {
        if (!(key in value)) {
          issues.push({ path: `${currentPath}.${key}`, message: "missing required value" });
        }
      }
      for (const [key, propertySchema] of Object.entries(properties)) {
        if (!(key in value)) continue;
        issues.push(...validateSettingsNode(propertySchema, value[key], `${currentPath}.${key}`));
      }
      return issues;
    }
    default:
      return [];
  }
}

export function validateSettingsUpdate(settingsSchema: Record<string, unknown>, values: Record<string, unknown>): SettingsValidationIssue[] {
  const issues: SettingsValidationIssue[] = [];
  for (const [key, schemaNode] of Object.entries(settingsSchema)) {
    if (!(key in values)) continue;
    issues.push(...validateSettingsNode(schemaNode, values[key], key));
  }
  return issues;
}
