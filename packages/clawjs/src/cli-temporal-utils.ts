import fs from "fs";
import path from "path";

import type { TemporalItem } from "@clawjs/core";

import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { collectFlagValues, formatCliTable } from "./cli-flag-parsers.ts";

type CliTemporalExecution = {
  itemId: string;
  status: string;
  scheduledFor: string;
  output?: string;
};

function temporalNext(item: TemporalItem): string {
  return item.nextRunAt ?? item.startsAt ?? item.dueAt ?? "";
}

export function writeTemporalItems(
  stream: NodeJS.WritableStream,
  items: TemporalItem[],
  options: { empty?: string } = {},
): void {
  if (items.length === 0) {
    stream.write(`${options.empty ?? "No items"}\n`);
    return;
  }
  stream.write(`${formatCliTable(items.map((item) => ({
    id: item.id,
    status: item.status,
    next: temporalNext(item),
    title: item.title,
  })))}\n`);
}

export function writeTemporalExecutions(stream: NodeJS.WritableStream, executions: CliTemporalExecution[]): void {
  if (executions.length === 0) {
    stream.write("No runs\n");
    return;
  }
  stream.write(`${formatCliTable(executions.map((execution) => ({
    id: execution.itemId,
    status: execution.status,
    next: execution.scheduledFor,
    title: execution.output ?? "",
  })))}\n`);
}

export function parseWatchTarget(value: string): { anchorType: NonNullable<TemporalItem["anchorType"]>; anchorId: string } {
  const separatorIndex = value.indexOf(":");
  const anchorType = separatorIndex === -1 ? "standalone" : value.slice(0, separatorIndex);
  const anchorId = separatorIndex === -1 ? value : value.slice(separatorIndex + 1);
  if (!["thread", "task", "project", "goal", "event", "execution", "standalone"].includes(anchorType) || !anchorId.trim()) {
    throw new CliHandledError("usage_error", `Invalid watch target "${value}". Use values like thread:123.`, CLI_EXIT_USAGE);
  }
  return {
    anchorType: anchorType as NonNullable<TemporalItem["anchorType"]>,
    anchorId: anchorId.trim(),
  };
}
export function parseSimpleDurationMs(value: string | undefined): number | null {
  const match = value?.trim().match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const unit = match[2];
  if (unit === "ms") return amount;
  if (unit === "s") return amount * 1000;
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

export function parseRoutineStaggerMs(flags: Record<string, string>, argv: string[]): number | undefined {
  const hasExact = argv.includes("--exact");
  const raw = flags.stagger;
  if (hasExact && raw) {
    throw new CliHandledError("usage_error", "Choose --stagger or --exact, not both.", CLI_EXIT_USAGE);
  }
  if (hasExact) return 0;
  if (!raw) return undefined;
  const parsed = parseSimpleDurationMs(raw);
  if (parsed === null) {
    throw new CliHandledError("invalid_duration", `Unsupported stagger "${raw}". Use durations like 30s, 5m, or 1h.`, CLI_EXIT_USAGE);
  }
  return parsed;
}

function parseHeartbeatLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliHandledError("invalid_heartbeat_limit", "--limit must be a positive integer.", CLI_EXIT_USAGE);
  }
  return parsed;
}

function parseActiveHours(raw: string | undefined, timezone: string | undefined): NonNullable<NonNullable<TemporalItem["heartbeat"]>["activeHours"]> | undefined {
  if (!raw) return undefined;
  const match = raw.trim().match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (!match || !isClockTime(match[1]!) || !isClockTime(match[2]!)) {
    throw new CliHandledError("usage_error", 'Invalid --active-hours. Use "09:00-18:00".', CLI_EXIT_USAGE);
  }
  return {
    start: match[1]!,
    end: match[2]!,
    timezone: timezone || "UTC",
  };
}

function isClockTime(value: string): boolean {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function parseHeartbeatGate(pathValue: string | undefined): NonNullable<TemporalItem["heartbeat"]>["gate"] | undefined {
  if (!pathValue) return undefined;
  const gatePath = path.resolve(pathValue);
  let policy: unknown;
  try {
    policy = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  } catch (error) {
    throw new CliHandledError("invalid_heartbeat_gate_json", `Invalid JSON for --gate ${gatePath}: ${error instanceof Error ? error.message : "parse error"}`, CLI_EXIT_USAGE);
  }
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new CliHandledError("invalid_heartbeat_gate_json", `Invalid JSON for --gate ${gatePath}: expected an object.`, CLI_EXIT_USAGE);
  }
  return { path: gatePath, policy: policy as Record<string, unknown> };
}

export function buildRoutineHeartbeat(argv: string[], flags: Record<string, string>): Partial<NonNullable<TemporalItem["heartbeat"]>> | undefined {
  const when = collectFlagValues(argv, "when");
  const stopWhen = collectFlagValues(argv, "stop-when");
  const allowedCustomChecks = collectFlagValues(argv, "allow-custom-check");
  const gate = parseHeartbeatGate(flags.gate);
  const cooldownMs = flags.cooldown ? parseSimpleDurationMs(flags.cooldown) : undefined;
  const limit = parseHeartbeatLimit(flags.limit);
  if (flags.cooldown && cooldownMs === null) {
    throw new CliHandledError("invalid_duration", `Unsupported cooldown "${flags.cooldown}". Use durations like 30s, 5m, or 1h.`, CLI_EXIT_USAGE);
  }
  const maxWakes = flags["max-wakes"] ? Number(flags["max-wakes"]) : undefined;
  const maxWakesWindowMs = flags["max-wakes-window"] ? parseSimpleDurationMs(flags["max-wakes-window"]) : undefined;
  if (flags["max-wakes"] && (!Number.isSafeInteger(maxWakes) || Number(maxWakes) <= 0)) {
    throw new CliHandledError("usage_error", "--max-wakes must be a positive integer.", CLI_EXIT_USAGE);
  }
  if (flags["max-wakes-window"] && maxWakesWindowMs === null) {
    throw new CliHandledError("invalid_duration", `Unsupported max wake window "${flags["max-wakes-window"]}".`, CLI_EXIT_USAGE);
  }
  if ((maxWakes && !maxWakesWindowMs) || (!maxWakes && maxWakesWindowMs)) {
    throw new CliHandledError("usage_error", "Use --max-wakes and --max-wakes-window together.", CLI_EXIT_USAGE);
  }
  const activeHours = parseActiveHours(flags["active-hours"], flags["active-timezone"]);
  const target = flags.target as "main" | "isolated" | undefined;
  if (target && target !== "main" && target !== "isolated") {
    throw new CliHandledError("usage_error", "--target must be main or isolated.", CLI_EXIT_USAGE);
  }
  const deliver = flags.deliver ? { target: flags.deliver, mode: "summary" as const } : undefined;
  if (when.length === 0 && stopWhen.length === 0 && !gate && !flags.prompt && !activeHours && cooldownMs === undefined && !maxWakes && !target && !deliver && limit === undefined) return undefined;
  const missingCustomChecks = [...when, ...stopWhen]
    .filter((condition) => condition.startsWith("custom:"))
    .map((condition) => condition.slice("custom:".length).trim())
    .filter((id) => id && !allowedCustomChecks.includes(id));
  if (missingCustomChecks.length > 0) {
    throw new CliHandledError("usage_error", `Custom heartbeat checks require --allow-custom-check: ${[...new Set(missingCustomChecks)].join(", ")}`, CLI_EXIT_USAGE);
  }
  return {
    when,
    ...(stopWhen.length > 0 ? { stopWhen } : {}),
    context: "diff",
    limit: limit ?? 20,
    ...(target ? { target } : {}),
    ...(deliver ? { deliver } : {}),
    ...(activeHours ? { activeHours } : {}),
    ...(cooldownMs !== undefined && cooldownMs !== null ? { cooldownMs } : {}),
    ...(maxWakes && maxWakesWindowMs ? { maxWakesPerWindow: { count: maxWakes, windowMs: maxWakesWindowMs } } : {}),
    ...(flags.prompt ? { prompt: flags.prompt } : {}),
    ...(gate ? { gate } : {}),
    ...(allowedCustomChecks.length > 0 ? { allowedCustomChecks } : {}),
  };
}
