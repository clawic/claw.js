import type { DEFAULT_SEARCH_BUDGETS } from "@clawjs/search";

export const SEARCH_ADMIN_COMMANDS = new Set(["sources", "status", "service", "profiles", "entrypoints", "aliases", "saved", "monitors", "actions", "audit", "jobs", "shards", "embeddings", "explain"]);

export const WORKSPACE_SEARCH_DOMAINS = new Set([
  "areas",
  "tasks",
  "goals",
  "projects",
  "milestones",
  "activity",
  "blockers",
  "artifacts",
  "decisions",
  "work_sessions",
  "assignments",
  "handoffs",
  "approvals",
  "capacity",
  "reminders",
  "deadlines",
  "people",
  "inbox",
  "events",
]);

export type CommandFallbackPolicy = "off" | "empty" | "always";

export const OPERATIONAL_SEARCH_SIDECARS = [
  { filename: "monitor.sqlite", domain: "monitor" },
  { filename: "infra.sqlite", domain: "infra" },
  { filename: "ops.sqlite", domain: "ops" },
] as const;

export const FINANCE_SEARCH_COLLECTIONS = [
  "financial_accounts",
  "transactions",
  "invoices",
  "payment_intents",
  "accounting_entries",
  "accounting_lines",
] as const;

export const ELN_SEARCH_COLLECTIONS = [
  "lab_notebooks",
  "notebook_entries",
  "protocol_runs",
  "experiment_observations",
] as const;

export const WORK_SEARCH_COLLECTIONS = new Set([
  "tasks",
  "projects",
  "goals",
  "people",
  "inbox_threads",
  "inbox_messages",
  "events",
  "reminders",
  "deadlines",
  "blockers",
  "decisions",
  "assignments",
  "handoffs",
  "approvals",
  "work_sessions",
  "artifacts",
]);

export interface SearchServiceStateFile {
  state: "ready" | "stopped" | "external_pending";
  mode: "embedded" | "daemon";
  pid?: number;
  startedAt?: string;
  stoppedAt?: string;
  heartbeatAt?: string;
  reason?: string;
  storage: { canonical: string; index: string; indexRebuildable: true };
  budgets: typeof DEFAULT_SEARCH_BUDGETS;
  worker?: {
    lastRunAt: string;
    claimed: number;
    completed: number;
    failed: number;
    stoppedReason?: SearchServiceWorkerStopReason;
    budgets?: SearchServiceWorkerBudgets;
  };
}

export type SearchServiceWorkerStopReason = "empty" | "job_limit" | "runtime_budget" | "failure_budget";

export interface SearchServiceWorkerBudgets {
  maxJobs: number;
  maxRuntimeMs: number;
  maxFailures: number;
  leaseMs?: number;
}

export interface BusinessRecordRow {
  id: string;
  kind: string;
  name: string;
  status: string;
  page_id: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
