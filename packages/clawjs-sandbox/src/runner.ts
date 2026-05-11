import { randomUUID } from "node:crypto";

import type { SandboxServiceStore } from "./store.ts";
import type { BackendAdapter, RunRequest, RunResult, SandboxBackend } from "./types.ts";

export interface SandboxRunnerOptions {
  defaultTimeoutMs?: number;
  backends: Partial<Record<SandboxBackend, BackendAdapter>>;
}

export async function runOnBackend(
  store: SandboxServiceStore,
  options: SandboxRunnerOptions,
  request: RunRequest,
): Promise<RunResult> {
  const backend = options.backends[request.backend];
  if (!backend) {
    throw new Error(`sandbox backend not enabled: ${request.backend}`);
  }
  const id = request.id ?? randomUUID();
  const startedAt = Date.now();
  const effective: RunRequest = {
    ...request,
    timeoutMs: request.timeoutMs ?? options.defaultTimeoutMs ?? null,
  };
  store.insertRun({ id, request: effective, startedAt });
  try {
    const outcome = await backend.run(effective);
    return store.finishRun(id, {
      status: outcome.status,
      exitCode: outcome.exitCode,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      containerId: outcome.containerId ?? null,
      error: outcome.error ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return store.finishRun(id, {
      status: "failed",
      exitCode: null,
      stdout: "",
      stderr: "",
      error: message,
    });
  }
}
