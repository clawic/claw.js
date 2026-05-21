import { EmbeddedTimeEngine, TimeClient, type TimeServiceLike } from "./time/index.ts";
import type { TemporalItem } from "@clawjs/claw";
import type { CreateClawTimeOptions, TemporalTarget, TemporalWatchInput } from "./create-claw-options.ts";

const TIME_CLIENT_KEYS = new Set(["mode", "baseUrl", "token"]);
const TIME_DISABLED_KEYS = new Set(["mode"]);
const TIME_EMBEDDED_KEYS = new Set([
  "mode",
  "dbPath",
  "defaultTimeZone",
  "schedulerIntervalMs",
  "maxCatchUpPerCycle",
  "missedJobStaggerMs",
  "runLogLimit",
  "notifyBaseUrl",
  "notifySourceToken",
  "heartbeatChecks",
  "heartbeatAgent",
]);

function assertOnlyTimeKeys(input: Record<string, unknown>, allowed: Set<string>, mode: string): void {
  const invalid = Object.keys(input).filter((key) => !allowed.has(key));
  if (invalid.length > 0) {
    throw new Error(`Invalid CreateClawOptions.time fields for mode "${mode}": ${invalid.join(", ")}.`);
  }
}

function embeddedTimeOptions(input: Extract<CreateClawTimeOptions, { mode: "embedded-on-demand" | "scheduler" }>, defaultMainDbPath: () => string) {
  return {
    dbPath: input.dbPath ?? defaultMainDbPath(),
    defaultTimeZone: input.defaultTimeZone ?? "UTC",
    schedulerIntervalMs: input.schedulerIntervalMs,
    maxCatchUpPerCycle: input.maxCatchUpPerCycle,
    missedJobStaggerMs: input.missedJobStaggerMs,
    runLogLimit: input.runLogLimit,
    notifyBaseUrl: input.notifyBaseUrl,
    notifySourceToken: input.notifySourceToken,
    heartbeatChecks: input.heartbeatChecks,
    heartbeatAgent: input.heartbeatAgent,
  };
}

function createLazyEmbeddedTimeService(resolveEngine: () => EmbeddedTimeEngine): TimeServiceLike {
  return {
    list: (filters) => resolveEngine().list(filters),
    get: (id) => resolveEngine().get(id),
    create: (input) => resolveEngine().create(input),
    update: (id, input) => resolveEngine().update(id, input),
    delete: (id) => resolveEngine().delete(id),
    pause: (id) => resolveEngine().pause(id),
    resume: (id) => resolveEngine().resume(id),
    runNow: (id) => resolveEngine().runNow(id),
    listExecutions: (itemId) => resolveEngine().listExecutions(itemId),
    listRunLog: (itemId, limit) => resolveEngine().listRunLog(itemId, limit),
    calendarView: (input) => resolveEngine().calendarView(input),
    timelineView: (input) => resolveEngine().timelineView(input),
    signalAnchor: (input) => resolveEngine().signalAnchor(input),
  };
}

export function createTimeService(input: CreateClawTimeOptions | undefined, defaultMainDbPath: () => string): { client: TimeServiceLike | null; close: () => void } {
  if (!input) return { client: null, close: () => undefined };
  if (!("mode" in input)) {
    throw new Error("CreateClawOptions.time requires an explicit mode: disabled, client, embedded-on-demand, or scheduler.");
  }

  switch (input.mode) {
    case "disabled": {
      assertOnlyTimeKeys(input, TIME_DISABLED_KEYS, input.mode);
      return { client: null, close: () => undefined };
    }
    case "client": {
      assertOnlyTimeKeys(input, TIME_CLIENT_KEYS, input.mode);
      if (!input.baseUrl.trim()) {
        throw new Error('CreateClawOptions.time mode "client" requires baseUrl.');
      }
      return {
        client: new TimeClient({
          baseUrl: input.baseUrl,
          token: input.token,
        }),
        close: () => undefined,
      };
    }
    case "embedded-on-demand": {
      assertOnlyTimeKeys(input, TIME_EMBEDDED_KEYS, input.mode);
      let engine: EmbeddedTimeEngine | null = null;
      const resolveEngine = () => {
        engine ??= new EmbeddedTimeEngine(embeddedTimeOptions(input, defaultMainDbPath));
        return engine;
      };
      return {
        client: createLazyEmbeddedTimeService(resolveEngine),
        close: () => {
          engine?.close();
          engine = null;
        },
      };
    }
    case "scheduler": {
      assertOnlyTimeKeys(input, TIME_EMBEDDED_KEYS, input.mode);
      let engine: EmbeddedTimeEngine | null = new EmbeddedTimeEngine(embeddedTimeOptions(input, defaultMainDbPath));
      engine.startScheduler();
      return {
        client: engine,
        close: () => {
          engine?.close();
          engine = null;
        },
      };
    }
    default:
      throw new Error(`Unsupported CreateClawOptions.time mode "${(input as { mode?: string }).mode ?? "unknown"}".`);
  }
}

export function parseTemporalTarget(target: string): Required<Pick<TemporalTarget, "anchorType" | "anchorId">> {
  const separatorIndex = target.indexOf(":");
  const rawType = separatorIndex === -1 ? "standalone" : target.slice(0, separatorIndex);
  const anchorId = separatorIndex === -1 ? target : target.slice(separatorIndex + 1);
  const allowed = new Set(["thread", "task", "project", "goal", "event", "execution", "standalone"]);
  if (!allowed.has(rawType) || !anchorId.trim()) {
    throw new Error(`Invalid watch target "${target}". Use values like thread:123 or task:123.`);
  }
  return {
    anchorType: rawType as NonNullable<TemporalItem["anchorType"]>,
    anchorId: anchorId.trim(),
  };
}

export function resolveTemporalWatchTitle(input: TemporalWatchInput): string {
  if (input.title?.trim()) return input.title.trim();
  if (typeof input.then === "string" && input.then.trim()) return input.then.trim();
  if (typeof input.then === "object" && input.then.kind === "remind" && input.then.title.trim()) return input.then.title.trim();
  return `Watch ${input.target}`;
}
