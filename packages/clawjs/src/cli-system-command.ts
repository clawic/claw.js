import os from "os";

import {
  listSystemTelemetryMetrics,
  listSystemTelemetryWidgets,
  type SystemTelemetryMetricDefinition,
  type SystemTelemetryMetricSample,
  type SystemTelemetrySnapshot,
} from "@clawjs/core";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonOk, writeJsonLine } from "./cli-json.ts";
import type { CliContext } from "./index.ts";

const SYSTEM_RULES: Array<{
  id: string;
  metricKey: string;
  operator: string;
  threshold: number | string | boolean;
  severity: string;
  enabled: boolean;
}> = [
  {
    id: "cpu-load-high",
    metricKey: "system.cpu.load1",
    operator: "gte",
    threshold: os.cpus().length,
    severity: "warning",
    enabled: true,
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function metricByKey(key: string): SystemTelemetryMetricDefinition | null {
  return listSystemTelemetryMetrics().find((metric) => metric.key === key) ?? null;
}

function sample(input: Omit<SystemTelemetryMetricSample, "capturedAt" | "source"> & { detail?: string }): SystemTelemetryMetricSample {
  return {
    key: input.key,
    value: input.value,
    unit: input.unit,
    availability: input.availability,
    capturedAt: nowIso(),
    quality: input.quality,
    tags: input.tags,
    source: {
      adapter: "node",
      confidence: "official",
      detail: input.detail,
    },
  };
}

function safeOsUptime(): number | null {
  try {
    return Math.round(os.uptime());
  } catch {
    return null;
  }
}

function collectSafeLocalSnapshot(): SystemTelemetrySnapshot {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const uptime = safeOsUptime();
  const samples: SystemTelemetryMetricSample[] = [
    sample({
      key: "system.cpu.load1",
      value: os.loadavg()[0] ?? null,
      unit: "count",
      availability: "available",
    }),
    sample({
      key: "system.memory.used",
      value: Math.max(0, totalMemory - freeMemory),
      unit: "bytes",
      availability: "available",
    }),
    sample({
      key: "system.power.uptime",
      value: uptime,
      unit: "seconds",
      availability: uptime === null ? "unavailable" : "available",
      quality: uptime === null ? "unsupported" : "ok",
    }),
  ];
  const sampledKeys = new Set(samples.map((entry) => entry.key));
  return {
    schemaVersion: 1,
    generatedAt: nowIso(),
    host: {
      platform: os.platform(),
      arch: os.arch(),
      id: "local",
    },
    policy: {
      defaultAgentAccess: "safe_read",
      sensitiveRequiresGrant: true,
      controlsRequireSignedHostBroker: true,
    },
    samples,
    unavailableMetrics: listSystemTelemetryMetrics()
      .filter((metric) => !sampledKeys.has(metric.key))
      .map((metric) => metric.key),
  };
}

function parseRangeMs(value: string | undefined): number {
  if (!value) return 3_600_000;
  const match = value.match(/^(\d+)(m|h|d)$/);
  if (!match) throw new CliHandledError("invalid_range", "Use --range with values like 15m, 1h or 24h.", CLI_EXIT_USAGE);
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "m") return amount * 60_000;
  if (unit === "h") return amount * 3_600_000;
  return amount * 86_400_000;
}

function writeHuman(context: CliContext, value: unknown): void {
  context.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function runSystemCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number> {
  const [, command, subcommand] = input.positionals;
  if (!command || command === "help") {
    input.context.stdout.write(`Usage: ${input.binName} system snapshot|metrics|history|watch|rules|widgets|capabilities [options]\n`);
    return CLI_EXIT_OK;
  }

  if (command === "snapshot") {
    const snapshot = collectSafeLocalSnapshot();
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "system", snapshot, { subcommand: "snapshot" });
    else writeHuman(input.context, snapshot);
    return CLI_EXIT_OK;
  }

  if (command === "metrics") {
    if (subcommand && subcommand !== "list") throw new CliHandledError("usage_error", `Usage: ${input.binName} system metrics list`, CLI_EXIT_USAGE);
    const payload = { metrics: listSystemTelemetryMetrics() };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "system", payload, { subcommand: "metrics list" });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  if (command === "history") {
    const metricKey = subcommand;
    if (!metricKey) throw new CliHandledError("usage_error", `Usage: ${input.binName} system history <metric-key> --range 1h`, CLI_EXIT_USAGE);
    const metric = metricByKey(metricKey);
    if (!metric) throw new CliHandledError("unknown_metric", `Unknown system metric: ${metricKey}`, CLI_EXIT_USAGE);
    const rangeMs = parseRangeMs(input.flags.range);
    const payload = {
      metric,
      rangeMs,
      retention: {
        store: "monitor.sqlite",
        status: "schema_registered",
        rawPolicy: "short_local",
        rollups: true,
      },
      samples: [],
    };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "system", payload, { subcommand: "history" });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  if (command === "watch") {
    const snapshot = collectSafeLocalSnapshot();
    if (input.wantsJson) writeJsonLine(input.context.stdout, { ok: true, data: snapshot, meta: { schemaVersion: 1, canonicalCommand: "system", subcommand: "watch" } });
    else writeHuman(input.context, snapshot);
    return CLI_EXIT_OK;
  }

  if (command === "rules") {
    if (subcommand && subcommand !== "list") {
      throw new CliHandledError("system_rules_read_only", "This CLI slice currently exposes rules list; upsert/delete require the Monitor write path.", CLI_EXIT_USAGE);
    }
    const payload = { rules: SYSTEM_RULES };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "system", payload, { subcommand: "rules list" });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  if (command === "widgets") {
    if (subcommand && subcommand !== "list") {
      throw new CliHandledError("system_widgets_read_only", "This CLI slice currently exposes widgets list; upsert/delete require host-specific Clawix state.", CLI_EXIT_USAGE);
    }
    const payload = { widgets: listSystemTelemetryWidgets() };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "system", payload, { subcommand: "widgets list" });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  return CLI_EXIT_USAGE;
}
