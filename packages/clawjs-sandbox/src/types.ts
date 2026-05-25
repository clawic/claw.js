export type SandboxBackend = "local" | "docker" | "ssh";

export type RunStatus = "running" | "completed" | "failed" | "timeout" | "cancelled";

export interface RunRequest {
  id?: string;
  backend: SandboxBackend;
  command: string;
  args?: string[];
  cwd?: string | null;
  env?: Record<string, string> | null;
  stdin?: string | null;
  timeoutMs?: number | null;
  maxOutputBytes?: number | null;
  /** docker only: image to run */
  image?: string | null;
  /** docker only: pass --network mode */
  network?: string | null;
  /** ssh only: host (user@host or host) */
  host?: string | null;
  /** ssh only: identity file path */
  identityFile?: string | null;
  /** ssh only: extra options like "StrictHostKeyChecking=no" */
  sshOptions?: string[] | null;
  /** Free-form metadata persisted with the run */
  metadata?: Record<string, unknown> | null;
}

export interface RunResult {
  id: string;
  backend: SandboxBackend;
  status: RunStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  command: string;
  args: string[];
  cwd: string | null;
  containerId: string | null;
  host: string | null;
  image: string | null;
  metadata: Record<string, unknown> | null;
  error: string | null;
}

export interface RunRecord extends RunResult {
  env: Record<string, string> | null;
  timeoutMs: number | null;
}

export interface ListRunsFilter {
  backend?: SandboxBackend;
  status?: RunStatus;
  host?: string;
  limit?: number;
  offset?: number;
}

export interface BackendAdapter {
  readonly kind: SandboxBackend;
  run(request: RunRequest): Promise<{
    status: Exclude<RunStatus, "running" | "cancelled">;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    containerId?: string | null;
    error?: string | null;
  }>;
}
