import { z } from "zod";

export const CLAW_EVOLUTION_CHANGE_CLASSES = [
  "additive",
  "compatible",
  "migration_required",
  "adapter_required",
  "breaking_requires_adr",
] as const;

export const CLAW_EVOLUTION_RECORD_STATUSES = [
  "draft",
  "active",
  "superseded",
  "blocked",
  "retired_runtime_adapter",
] as const;

export const clawEvolutionPolicy = {
  schemaVersion: 1,
  sourceOfTruth: "clawjs",
  preV1: "clean_cut_with_explicit_approval",
  postV1Migration: "step_by_step_all_public_versions",
  rescueCore: "launch_chat_repair",
  legacyLocation: "boundary_migrators_adapters_receipts",
  breakingApproval: "adr_required",
  backup: {
    threshold: { maxBytes: 1_073_741_824, maxFiles: 10_000, overrideRequired: true },
    retentionDays: 30,
    externalSources: "read_only_never_mutate_or_copy_wholesale",
  },
  receipts: {
    defaultPrivacy: "redacted",
    externalSubmission: "explicit_approval_only",
  },
  cli: {
    command: "claw evolution",
    subcommands: ["list", "show", "diff", "plan", "dry-run", "apply", "verify", "doctor", "repair", "rollback", "backup", "receipt", "report"],
  },
  ledger: {
    directory: "docs/evolution",
    baseline: "docs/evolution/baseline.json",
    schema: "docs/evolution/schema.json",
  },
} as const;

export const clawEvolutionRecordSchema = z.object({
  id: z.string().regex(/^evo_[a-z0-9_]+$/),
  title: z.string().min(1),
  class: z.enum(CLAW_EVOLUTION_CHANGE_CLASSES),
  status: z.enum(CLAW_EVOLUTION_RECORD_STATUSES),
  owner: z.string().min(1),
  surfaces: z.array(z.string().min(1)).min(1),
  tests: z.array(z.string().min(1)),
  adr: z.string().optional(),
  migration: z.string().optional(),
  adapter: z.string().optional(),
  receipt: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

export const clawEvolutionLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  policy: z.object({
    sourceOfTruth: z.literal("clawjs"),
    postV1Migration: z.literal("step_by_step_all_public_versions"),
    rescueCore: z.literal("launch_chat_repair"),
  }).passthrough(),
  records: z.array(clawEvolutionRecordSchema),
});

export type ClawEvolutionPolicy = typeof clawEvolutionPolicy;
export type ClawEvolutionRecord = z.infer<typeof clawEvolutionRecordSchema>;
export type ClawEvolutionLedger = z.infer<typeof clawEvolutionLedgerSchema>;

export function summarizeEvolutionLedger(ledger: ClawEvolutionLedger): {
  records: number;
  active: number;
  blocked: number;
  migrationRequired: number;
  adapterRequired: number;
  breakingRequiresAdr: number;
} {
  return {
    records: ledger.records.length,
    active: ledger.records.filter((record) => record.status === "active").length,
    blocked: ledger.records.filter((record) => record.status === "blocked").length,
    migrationRequired: ledger.records.filter((record) => record.class === "migration_required").length,
    adapterRequired: ledger.records.filter((record) => record.class === "adapter_required").length,
    breakingRequiresAdr: ledger.records.filter((record) => record.class === "breaking_requires_adr").length,
  };
}
