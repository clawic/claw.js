import { spawn } from "node:child_process";

import { nextCronFire } from "./cron.ts";
import { evaluateAlertRules } from "./alerts.ts";
import type { IndexServiceConfig } from "./config.ts";
import type { IndexStore } from "./store.ts";
import type { MonitorRow, RunRow } from "./types.ts";

export interface CodexRunOptions {
  prompt: string;
  monitorId?: string | null;
  searchId?: string | null;
  runId: string;
  timeoutMs: number;
  codexBinary: string;
  mcpHelperPath?: string;
}

export interface SchedulerHooks {
  runCodexSession?: (options: CodexRunOptions) => Promise<{ status: "succeeded" | "failed" | "timeout"; error?: string; tokensIn?: number; tokensOut?: number; log?: unknown }>;
}

function defaultRunner(options: CodexRunOptions): Promise<{ status: "succeeded" | "failed" | "timeout"; error?: string; tokensIn?: number; tokensOut?: number; log?: unknown }> {
  return new Promise((resolve) => {
    const args = ["exec", "--prompt", options.prompt, "--no-color"];
    if (options.mcpHelperPath) args.push("--mcp-server", options.mcpHelperPath);
    const subprocess = spawn(options.codexBinary, args, {
      env: {
        ...process.env,
        INDEX_RUN_ID: options.runId,
        INDEX_MONITOR_ID: options.monitorId ?? "",
        INDEX_SEARCH_ID: options.searchId ?? "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = ""; let stderr = "";
    subprocess.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    subprocess.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    const timer = setTimeout(() => {
      try { subprocess.kill("SIGTERM"); } catch { /* ignore */ }
      resolve({ status: "timeout", error: "codex session exceeded budget", log: { stderr: stderr.slice(-2000) } });
    }, options.timeoutMs);
    subprocess.on("error", (err) => {
      clearTimeout(timer);
      resolve({ status: "failed", error: err.message, log: { stderr: stderr.slice(-2000) } });
    });
    subprocess.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ status: "succeeded", log: { stdout: stdout.slice(-4000) } });
      } else {
        resolve({ status: "failed", error: `codex exit ${code}`, log: { stderr: stderr.slice(-2000), stdout: stdout.slice(-2000) } });
      }
    });
  });
}

export class IndexScheduler {
  private timer: NodeJS.Timeout | null = null;
  private workers = 0;
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly store: IndexStore,
    private readonly config: IndexServiceConfig,
    private readonly hooks: SchedulerHooks = {},
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err) => console.error("[index] scheduler tick failed", err));
    }, this.config.schedulerTickMs);
    this.timer.unref?.();
    this.tick().catch(() => undefined);
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async fireNow(monitor: MonitorRow): Promise<RunRow> {
    const search = this.store.getSearch(monitor.searchId);
    const prompt = this.composePrompt(monitor, search?.promptTemplate ?? null, search?.criteria ?? {});
    const run = this.store.createRun({ monitorId: monitor.id, searchId: monitor.searchId, kind: "monitor", prompt });
    this.runRow(run, monitor, prompt).catch((err) => console.error("[index] monitor fire failed", err));
    return run;
  }

  async runManualSearch(searchId: string, overridePrompt?: string): Promise<RunRow> {
    const search = this.store.getSearch(searchId);
    if (!search) throw new Error(`unknown search ${searchId}`);
    const prompt = overridePrompt ?? this.composePrompt(null, search.promptTemplate ?? null, search.criteria);
    const run = this.store.createRun({ monitorId: null, searchId, kind: "manual", prompt });
    this.runRow(run, null, prompt).catch((err) => console.error("[index] manual run failed", err));
    return run;
  }

  private composePrompt(monitor: MonitorRow | null, template: string | null, criteria: Record<string, unknown>): string {
    const header = monitor
      ? `[index monitor "${monitor.name ?? monitor.id}"] Scheduled fire at ${new Date().toISOString()}.`
      : `[index search run] Manual trigger at ${new Date().toISOString()}.`;
    const body = template ?? "Use the MCP `index.*` tools to capture results as typed entities. Upsert each match with index.entities.upsert.";
    return `${header}\n\nCriteria: ${JSON.stringify(criteria, null, 2)}\n\n${body}`.trim();
  }

  private async runRow(run: RunRow, monitor: MonitorRow | null, prompt: string): Promise<void> {
    if (this.inFlight.has(run.id)) return;
    while (this.workers >= this.config.workerConcurrency) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    this.inFlight.add(run.id); this.workers += 1;
    this.store.updateRun(run.id, { status: "running", startedAt: new Date().toISOString() });
    try {
      const runner = this.hooks.runCodexSession ?? defaultRunner;
      const outcome = await runner({
        prompt, monitorId: monitor?.id ?? null, searchId: run.searchId ?? null,
        runId: run.id, timeoutMs: this.config.defaultRunTimeoutMs, codexBinary: this.config.codexBinary,
      });
      const endedAt = new Date().toISOString();
      this.store.updateRun(run.id, {
        status: outcome.status, endedAt, error: outcome.error ?? null,
        tokensIn: outcome.tokensIn ?? null, tokensOut: outcome.tokensOut ?? null, log: outcome.log,
      });
      if (monitor) {
        const entities = this.store.listEntitiesForRun(run.id);
        const observationsByEntity = new Map<string, ReturnType<IndexStore["listObservations"]>>();
        for (const entity of entities) {
          observationsByEntity.set(entity.id, this.store.listObservations(entity.id, 10));
        }
        const alerts = evaluateAlertRules(monitor.alertRules, {
          runId: run.id, monitorId: monitor.id, store: this.store,
          observationsByEntity, entities,
        });
        if (alerts > 0) this.store.updateRun(run.id, { alertsFired: alerts });
        const nextFire = nextCronFire(monitor.cronExpr);
        this.store.updateMonitor(monitor.id, { lastFireAt: endedAt, nextFireAt: nextFire.toISOString() });
      }
    } catch (error) {
      this.store.updateRun(run.id, {
        status: "failed", endedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.workers -= 1; this.inFlight.delete(run.id);
    }
  }

  private async tick(): Promise<void> {
    const due = this.store.monitorsDueNow();
    for (const monitor of due) {
      const nextFire = nextCronFire(monitor.cronExpr);
      this.store.updateMonitor(monitor.id, { nextFireAt: nextFire.toISOString() });
      await this.fireNow(monitor);
    }
  }
}
