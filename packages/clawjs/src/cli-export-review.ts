import fs from "fs";

import { CliHandledError, CLI_EXIT_FAILURE } from "./cli-errors.ts";
import { readBooleanFlag } from "./cli-flag-parsers.ts";

export interface CliExportReview {
  confirmed: true;
  approvalId: string;
  legalLabel: string;
}

export function requireCliExportReview(input: {
  argv: string[];
  flags: Record<string, string>;
  operation: string;
}): CliExportReview {
  const confirmed = readBooleanFlag(input.argv, input.flags, "confirm", false) ||
    readBooleanFlag(input.argv, input.flags, "approved", false);
  if (!confirmed) {
    throw new CliHandledError(
      "export_confirmation_required",
      `${input.operation} requires --confirm before exporting or sharing data.`,
      CLI_EXIT_FAILURE,
    );
  }
  const approvalId = (input.flags["approval-id"] ?? input.flags["host-approval-id"] ?? "").trim();
  if (!approvalId) {
    throw new CliHandledError(
      "export_approval_required",
      `${input.operation} requires --approval-id or --host-approval-id from explicit human review.`,
      CLI_EXIT_FAILURE,
    );
  }
  const legalLabel = (input.flags["legal-label"] ?? "").trim();
  if (!legalLabel) {
    throw new CliHandledError(
      "export_legal_label_required",
      `${input.operation} requires --legal-label so the exported output keeps its review label.`,
      CLI_EXIT_FAILURE,
    );
  }
  return { confirmed: true, approvalId, legalLabel };
}

export function writeCliLegalSidecar(input: {
  outputPath: string;
  review: CliExportReview;
  kind: string;
  source: Record<string, unknown>;
}): void {
  fs.writeFileSync(`${input.outputPath}.claw-legal.json`, JSON.stringify({
    schemaVersion: 1,
    kind: input.kind,
    exportedAt: new Date().toISOString(),
    approvalId: input.review.approvalId,
    legalLabel: input.review.legalLabel,
    confirmed: input.review.confirmed,
    source: input.source,
  }, null, 2));
}
