import path from "path";

import {
  capabilityReportSchema,
  channelsStateSnapshotSchema,
  memoryStateSnapshotSchema,
  providerStateSnapshotSchema,
  schedulerStateSnapshotSchema,
  skillsStateSnapshotSchema,
  telegramStateSnapshotSchema,
  slackStateSnapshotSchema,
  whatsappStateSnapshotSchema,
  workspaceStateSnapshotSchema,
  type CapabilityReport,
  type ChannelsStateSnapshot,
  type MemoryStateSnapshot,
  type ProviderStateSnapshot,
  type SchedulerStateSnapshot,
  type SkillsStateSnapshot,
  type SlackStateSnapshot,
  type TelegramStateSnapshot,
  type WhatsAppStateSnapshot,
  type WorkspaceStateSnapshot,
} from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { resolveClawWorkspaceSurfacePath } from "../surface-paths.ts";

export const CAPABILITY_REPORT_FILE = "capability-report.json";
export const WORKSPACE_STATE_FILE = "workspace.json";
export const PROVIDER_STATE_FILE = "providers.json";
export const SCHEDULER_STATE_FILE = "scheduler.json";
export const MEMORY_STATE_FILE = "memory.json";
export const SKILLS_STATE_FILE = "skills.json";
export const CHANNELS_STATE_FILE = "channels.json";

export function resolveCapabilityReportPath(workspaceDir: string): string {
  return resolveClawWorkspaceSurfacePath("claw.workspace.compat", workspaceDir, CAPABILITY_REPORT_FILE);
}

export function resolveWorkspaceStatePath(workspaceDir: string): string {
  return resolveClawWorkspaceSurfacePath("claw.workspace.observedState", workspaceDir, WORKSPACE_STATE_FILE);
}

export function resolveProviderStatePath(workspaceDir: string): string {
  return resolveClawWorkspaceSurfacePath("claw.workspace.observedState", workspaceDir, PROVIDER_STATE_FILE);
}

export function resolveSchedulerStatePath(workspaceDir: string): string {
  return resolveClawWorkspaceSurfacePath("claw.workspace.observedState", workspaceDir, SCHEDULER_STATE_FILE);
}

export function resolveMemoryStatePath(workspaceDir: string): string {
  return resolveClawWorkspaceSurfacePath("claw.workspace.observedState", workspaceDir, MEMORY_STATE_FILE);
}

export function resolveSkillsStatePath(workspaceDir: string): string {
  return resolveClawWorkspaceSurfacePath("claw.workspace.observedState", workspaceDir, SKILLS_STATE_FILE);
}

export function resolveChannelsStatePath(workspaceDir: string): string {
  return resolveClawWorkspaceSurfacePath("claw.workspace.observedState", workspaceDir, CHANNELS_STATE_FILE);
}

export function resolveTelegramStatePath(workspaceDir: string): string {
  return resolveChannelsStatePath(workspaceDir);
}

function writeJsonFile(filePath: string, payload: unknown, filesystem = new NodeFileSystemHost()): void {
  filesystem.withLockRetry(resolveFileLockPath(filePath), () => {
    filesystem.writeTextAtomic(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  });
}

function readJsonFile<T>(filePath: string, schema: { safeParse(value: unknown): { success: boolean; data?: unknown; error?: { message?: string } } }, filesystem = new NodeFileSystemHost()): T | null {
  if (!filesystem.exists(filePath)) {
    return null;
  }

  let contents: string;
  try {
    contents = filesystem.readText(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read JSON file at ${filePath}: ${message}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON file at ${filePath}: ${message}`);
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data === undefined) {
    const message = parsed.error?.message ? `: ${parsed.error.message}` : "";
    throw new Error(`Invalid JSON schema for file at ${filePath}${message}`);
  }

  return parsed.data as T;
}

export function writeCapabilityReport(workspaceDir: string, report: CapabilityReport, filesystem = new NodeFileSystemHost()): CapabilityReport {
  const filePath = resolveCapabilityReportPath(workspaceDir);
  filesystem.ensureDir(path.dirname(filePath));
  writeJsonFile(filePath, report, filesystem);
  return report;
}

export function readCapabilityReport(workspaceDir: string, filesystem = new NodeFileSystemHost()): CapabilityReport | null {
  return readJsonFile<CapabilityReport>(resolveCapabilityReportPath(workspaceDir), capabilityReportSchema, filesystem);
}

export function writeWorkspaceStateSnapshot(workspaceDir: string, snapshot: WorkspaceStateSnapshot, filesystem = new NodeFileSystemHost()): WorkspaceStateSnapshot {
  const filePath = resolveWorkspaceStatePath(workspaceDir);
  filesystem.ensureDir(path.dirname(filePath));
  writeJsonFile(filePath, snapshot, filesystem);
  return snapshot;
}

export function readWorkspaceStateSnapshot(workspaceDir: string, filesystem = new NodeFileSystemHost()): WorkspaceStateSnapshot | null {
  return readJsonFile(resolveWorkspaceStatePath(workspaceDir), workspaceStateSnapshotSchema, filesystem);
}

export function writeProviderStateSnapshot(workspaceDir: string, snapshot: ProviderStateSnapshot, filesystem = new NodeFileSystemHost()): ProviderStateSnapshot {
  const filePath = resolveProviderStatePath(workspaceDir);
  filesystem.ensureDir(path.dirname(filePath));
  writeJsonFile(filePath, snapshot, filesystem);
  return snapshot;
}

export function readProviderStateSnapshot(workspaceDir: string, filesystem = new NodeFileSystemHost()): ProviderStateSnapshot | null {
  return readJsonFile(resolveProviderStatePath(workspaceDir), providerStateSnapshotSchema, filesystem);
}

export function writeSchedulerStateSnapshot(workspaceDir: string, snapshot: SchedulerStateSnapshot, filesystem = new NodeFileSystemHost()): SchedulerStateSnapshot {
  const filePath = resolveSchedulerStatePath(workspaceDir);
  filesystem.ensureDir(path.dirname(filePath));
  writeJsonFile(filePath, snapshot, filesystem);
  return snapshot;
}

export function readSchedulerStateSnapshot(workspaceDir: string, filesystem = new NodeFileSystemHost()): SchedulerStateSnapshot | null {
  return readJsonFile(resolveSchedulerStatePath(workspaceDir), schedulerStateSnapshotSchema, filesystem);
}

export function writeMemoryStateSnapshot(workspaceDir: string, snapshot: MemoryStateSnapshot, filesystem = new NodeFileSystemHost()): MemoryStateSnapshot {
  const filePath = resolveMemoryStatePath(workspaceDir);
  filesystem.ensureDir(path.dirname(filePath));
  writeJsonFile(filePath, snapshot, filesystem);
  return snapshot;
}

export function readMemoryStateSnapshot(workspaceDir: string, filesystem = new NodeFileSystemHost()): MemoryStateSnapshot | null {
  return readJsonFile(resolveMemoryStatePath(workspaceDir), memoryStateSnapshotSchema, filesystem);
}

export function writeSkillsStateSnapshot(workspaceDir: string, snapshot: SkillsStateSnapshot, filesystem = new NodeFileSystemHost()): SkillsStateSnapshot {
  const filePath = resolveSkillsStatePath(workspaceDir);
  filesystem.ensureDir(path.dirname(filePath));
  writeJsonFile(filePath, snapshot, filesystem);
  return snapshot;
}

export function readSkillsStateSnapshot(workspaceDir: string, filesystem = new NodeFileSystemHost()): SkillsStateSnapshot | null {
  return readJsonFile(resolveSkillsStatePath(workspaceDir), skillsStateSnapshotSchema, filesystem);
}

export function writeChannelsStateSnapshot(workspaceDir: string, snapshot: ChannelsStateSnapshot, filesystem = new NodeFileSystemHost()): ChannelsStateSnapshot {
  const filePath = resolveChannelsStatePath(workspaceDir);
  filesystem.ensureDir(path.dirname(filePath));
  writeJsonFile(filePath, snapshot, filesystem);
  return snapshot;
}

export function readChannelsStateSnapshot(workspaceDir: string, filesystem = new NodeFileSystemHost()): ChannelsStateSnapshot | null {
  return readJsonFile(resolveChannelsStatePath(workspaceDir), channelsStateSnapshotSchema, filesystem);
}

export function writeTelegramStateSnapshot(workspaceDir: string, snapshot: TelegramStateSnapshot, filesystem = new NodeFileSystemHost()): TelegramStateSnapshot {
  const channelsPath = resolveChannelsStatePath(workspaceDir);
  filesystem.ensureDir(path.dirname(channelsPath));
  const currentChannels = readChannelsStateSnapshot(workspaceDir, filesystem) ?? {
    schemaVersion: 1,
    updatedAt: snapshot.updatedAt,
    channels: [],
  };
  writeJsonFile(channelsPath, {
    ...currentChannels,
    details: {
      ...(currentChannels.details ?? {}),
      telegram: snapshot,
    },
  }, filesystem);
  return snapshot;
}

export function readTelegramStateSnapshot(workspaceDir: string, filesystem = new NodeFileSystemHost()): TelegramStateSnapshot | null {
  const channels = readChannelsStateSnapshot(workspaceDir, filesystem);
  const parsed = telegramStateSnapshotSchema.safeParse(channels?.details?.telegram);
  return parsed.success ? parsed.data as TelegramStateSnapshot : null;
}

export function writeSlackStateSnapshot(workspaceDir: string, snapshot: SlackStateSnapshot, filesystem = new NodeFileSystemHost()): SlackStateSnapshot {
  const channelsPath = resolveChannelsStatePath(workspaceDir);
  filesystem.ensureDir(path.dirname(channelsPath));
  const currentChannels = readChannelsStateSnapshot(workspaceDir, filesystem) ?? {
    schemaVersion: 1,
    updatedAt: snapshot.updatedAt,
    channels: [],
  };
  writeJsonFile(channelsPath, {
    ...currentChannels,
    details: {
      ...(currentChannels.details ?? {}),
      slack: snapshot,
    },
  }, filesystem);
  return snapshot;
}

export function readSlackStateSnapshot(workspaceDir: string, filesystem = new NodeFileSystemHost()): SlackStateSnapshot | null {
  const channels = readChannelsStateSnapshot(workspaceDir, filesystem);
  const parsed = slackStateSnapshotSchema.safeParse(channels?.details?.slack);
  return parsed.success ? parsed.data as SlackStateSnapshot : null;
}

export function writeWhatsAppStateSnapshot(workspaceDir: string, snapshot: WhatsAppStateSnapshot, filesystem = new NodeFileSystemHost()): WhatsAppStateSnapshot {
  const channelsPath = resolveChannelsStatePath(workspaceDir);
  filesystem.ensureDir(path.dirname(channelsPath));
  const currentChannels = readChannelsStateSnapshot(workspaceDir, filesystem) ?? {
    schemaVersion: 1,
    updatedAt: snapshot.updatedAt,
    channels: [],
  };
  writeJsonFile(channelsPath, {
    ...currentChannels,
    details: {
      ...(currentChannels.details ?? {}),
      whatsapp: snapshot,
    },
  }, filesystem);
  return snapshot;
}

export function readWhatsAppStateSnapshot(workspaceDir: string, filesystem = new NodeFileSystemHost()): WhatsAppStateSnapshot | null {
  const channels = readChannelsStateSnapshot(workspaceDir, filesystem);
  const parsed = whatsappStateSnapshotSchema.safeParse(channels?.details?.whatsapp);
  return parsed.success ? parsed.data as WhatsAppStateSnapshot : null;
}
