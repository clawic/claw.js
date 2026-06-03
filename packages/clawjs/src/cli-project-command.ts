import path from "path";

import type { CliContext } from "./index.ts";
import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { readBooleanFlag } from "./cli-flag-parsers.ts";
import { requireCliExportReview } from "./cli-export-review.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import {
  attachProjectFolder,
  createLocalForgeClaim,
  createLocalForgeMergePlan,
  createLocalForgeRecoveryReceipt,
  createLocalForgeReview,
  createLocalForgeSnapshot,
  detachProjectFolder,
  evaluateLocalForgeStaleClaims,
  exportProjectHandoff,
  importProjectHandoff,
  inspectProjectFolder,
  readLocalForgeInventory,
  recordLocalForgeWorktree,
  runLocalForgePreflight,
  syncProjectHandoff,
} from "./project.ts";

const PROJECT_SUBCOMMANDS = ["inspect", "attach", "detach", "export", "import", "sync-handoff", "preflight", "worktree", "claim", "snapshot", "review", "merge-plan", "recover", "forge-status"] as const;

function resolveProjectExportOutputPath(outputPath: string, workspaceRoot: string): string {
  const requested = outputPath.trim();
  if (!requested) {
    throw new CliHandledError("invalid_project_output_path", "--output must not be empty.", CLI_EXIT_USAGE, {
      location: "cli.project.output",
      suggestion: "Use a workspace-relative output path such as exports/project.clawexport.",
      safeNextStep: "Retry project export with an output path inside the current workspace.",
    });
  }
  const workspacePath = path.resolve(workspaceRoot);
  const resolvedOutputPath = path.isAbsolute(requested)
    ? path.resolve(requested)
    : path.resolve(workspacePath, requested);
  const relativePath = path.relative(workspacePath, resolvedOutputPath);
  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new CliHandledError("invalid_project_output_path", "--output must stay inside the current workspace.", CLI_EXIT_USAGE, {
      location: "cli.project.output",
      suggestion: "Use a workspace-relative output path such as exports/project.clawexport.",
      safeNextStep: "Retry project export with an output path inside the current workspace.",
      details: { outputPath },
    });
  }
  return resolvedOutputPath;
}

export async function runProjectManifestCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number | null> {
  const [group, command] = input.positionals;
  if (group !== "project") return null;
  const action = command ?? "inspect";
  const meta = { invokedCommand: "project", subcommand: action };

  if (action === "import") {
    const handoffTarget = input.flags.input || input.positionals[2];
    const folderTarget = input.flags.project || input.flags.folder || input.positionals[3] || ".";
    const workspaceId = input.flags["workspace-id"] || input.flags.workspaceId;
    if (!handoffTarget || !workspaceId) {
      input.context.stderr.write(`Usage: ${input.binName} project import <handoff.clawexport> <folder> --workspace-id ID [--accept]\n`);
      return CLI_EXIT_USAGE;
    }
    const projectRoot = path.resolve(input.context.cwd, folderTarget);
    const handoffPath = path.resolve(input.context.cwd, handoffTarget);
    const preview = await importProjectHandoff({
      handoffPath,
      projectRoot,
      workspaceId,
      accept: readBooleanFlag(input.argv, input.flags, "accept", false),
      replaceDuplicate: readBooleanFlag(input.argv, input.flags, "replace", false),
    });
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", preview, meta);
    else {
      input.context.stdout.write(`${preview.accepted ? "imported" : "preview"} ${preview.projectId}\n`);
      input.context.stdout.write(`${preview.writes.map((entry) => `${entry.action} ${entry.path}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  const target = input.flags.project || input.flags.folder || input.positionals[2] || ".";
  const projectRoot = path.resolve(input.context.cwd, target);
  const dataDir = input.flags["data-dir"];
  const accepted = readBooleanFlag(input.argv, input.flags, "accept", false);

  if (action === "inspect" || action === "status") {
    const inspection = inspectProjectFolder(projectRoot, { workspaceId: input.flags["workspace-id"] || input.flags.workspaceId });
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", inspection, meta);
    else input.context.stdout.write(`${inspection.state} ${inspection.manifest?.projectId ?? "unattached"} ${inspection.projectRoot}\n`);
    return CLI_EXIT_OK;
  }

  if (action === "forge-status") {
    const projectId = input.flags["project-id"];
    const staleAfterMinutes = input.flags["stale-after-minutes"] ? Number(input.flags["stale-after-minutes"]) : undefined;
    const markStale = readBooleanFlag(input.argv, input.flags, "mark-stale", false);
    const staleEvaluation = evaluateLocalForgeStaleClaims({
      dataDir,
      projectId,
      staleAfterMinutes,
      accept: accepted && markStale,
    });
    const inventory = readLocalForgeInventory(dataDir);
    const worktrees = Object.values(inventory.worktrees).filter((worktree) => !projectId || worktree.projectId === projectId);
    const claims = Object.values(inventory.claims).filter((claim) => !projectId || claim.projectId === projectId);
    const snapshots = Object.values(inventory.snapshots).filter((snapshot) => !projectId || snapshot.projectId === projectId);
    const reviews = Object.values(inventory.reviews).filter((review) => !projectId || review.projectId === projectId);
    const mergePlans = Object.values(inventory.mergePlans).filter((mergePlan) => !projectId || mergePlan.projectId === projectId);
    const recoveries = Object.values(inventory.recoveries).filter((recovery) => !projectId || recovery.projectId === projectId);
    const payload = {
      statePath: inventory.statePath,
      status: "ok",
      worktrees,
      claims,
      snapshots,
      reviews,
      mergePlans,
      recoveries,
      staleEvaluation,
      writes: false,
    };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", payload, meta);
    else input.context.stdout.write(`${worktrees.length} worktrees, ${claims.length} claims, ${snapshots.length} snapshots\n`);
    return CLI_EXIT_OK;
  }

  if (action === "preflight") {
    const report = runLocalForgePreflight(projectRoot);
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", report, meta);
    else input.context.stdout.write(`${report.status} ${report.includedFiles.length} included, ${report.findings.length} findings\n`);
    return CLI_EXIT_OK;
  }

  if (action === "worktree") {
    const result = recordLocalForgeWorktree({
      projectRoot,
      dataDir,
      accept: accepted,
      nodeId: input.flags["node-id"],
      authorityServiceId: input.flags["authority-service"],
    });
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", result, meta);
    else input.context.stdout.write(`${result.accepted ? "recorded" : "preview"} ${result.worktree.worktreeId}\n`);
    return CLI_EXIT_OK;
  }

  if (action === "claim") {
    const result = createLocalForgeClaim({
      projectRoot,
      dataDir,
      accept: accepted,
      exclusive: readBooleanFlag(input.argv, input.flags, "exclusive", false),
      actorId: input.flags["actor-id"],
      agentId: input.flags["agent-id"],
      nodeId: input.flags["node-id"],
      task: input.flags.task,
      intent: input.flags.intent,
      subpath: input.flags.subpath,
      branch: input.flags.branch,
      expectedOutput: input.flags["expected-output"],
    });
    if (result.conflicts.length > 0) {
      if (input.wantsJson) {
        writeCommandJsonError(input.context.stdout, "project", new CliHandledError(
          "local_forge_claim_lock_conflict",
          "Exclusive local forge claim conflicts with an active claim.",
          CLI_EXIT_USAGE,
          {
            location: "cli.project.claim",
            suggestion: "Use a non-exclusive claim or resolve the active claim before requesting an exclusive lock.",
            safeNextStep: `${input.binName} project forge-status --project-id ${result.claim.projectId} --json`,
            details: {
              claim: result.claim,
              conflicts: result.conflicts,
            },
          },
        ), meta);
      } else {
        input.context.stderr.write(`blocked ${result.claim.claimId}\n`);
      }
      return CLI_EXIT_USAGE;
    }
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", result, meta);
    else input.context.stdout.write(`${result.accepted ? "claimed" : result.conflicts.length ? "blocked" : "preview"} ${result.claim.claimId}\n`);
    return CLI_EXIT_OK;
  }

  if (action === "snapshot") {
    const result = createLocalForgeSnapshot({
      projectRoot,
      dataDir,
      accept: accepted,
      reason: input.flags.reason,
      nodeId: input.flags["node-id"],
    });
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", result, meta);
    else input.context.stdout.write(`${result.accepted ? "snapshot" : "preview"} ${result.snapshot.snapshotId} ${result.snapshot.status}\n`);
    return CLI_EXIT_OK;
  }

  if (action === "review") {
    const testsRun = input.flags["tests-run"] ? input.flags["tests-run"].split(",").map((value) => value.trim()).filter(Boolean) : [];
    const risks = input.flags.risks ? input.flags.risks.split(",").map((value) => value.trim()).filter(Boolean) : [];
    const mergeStatus = input.flags["merge-status"] === "ready_for_merge" || input.flags["merge-status"] === "not_ready"
      ? input.flags["merge-status"]
      : "needs_human_review";
    const result = createLocalForgeReview({
      projectRoot,
      dataDir,
      accept: accepted,
      claimId: input.flags["claim-id"],
      snapshotId: input.flags["snapshot-id"],
      explanation: input.flags.explanation,
      testsRun,
      risks,
      mergeStatus,
    });
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", result, meta);
    else input.context.stdout.write(`${result.accepted ? "review" : "preview"} ${result.review.reviewId} ${result.review.mergeStatus}\n`);
    return CLI_EXIT_OK;
  }

  if (action === "merge-plan") {
    if (!input.flags["base-snapshot-id"] || !input.flags["proposed-snapshot-id"]) {
      input.context.stderr.write(`Usage: ${input.binName} project merge-plan <folder> --base-snapshot-id ID --proposed-snapshot-id ID [--accept] [--json]\n`);
      return CLI_EXIT_USAGE;
    }
    const result = createLocalForgeMergePlan({
      projectRoot,
      dataDir,
      accept: accepted,
      baseSnapshotId: input.flags["base-snapshot-id"],
      proposedSnapshotId: input.flags["proposed-snapshot-id"],
    });
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", result, meta);
    else input.context.stdout.write(`${result.accepted ? "merge-plan" : "preview"} ${result.mergePlan.mergePlanId} ${result.mergePlan.status}\n`);
    return CLI_EXIT_OK;
  }

  if (action === "recover") {
    const recoveryAction = input.flags.action === "resume" || input.flags.action === "review" || input.flags.action === "merge" || input.flags.action === "recover" || input.flags.action === "abandon"
      ? input.flags.action
      : "review";
    const result = createLocalForgeRecoveryReceipt({
      projectRoot,
      dataDir,
      accept: accepted,
      claimId: input.flags["claim-id"],
      action: recoveryAction,
    });
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", result, meta);
    else input.context.stdout.write(`${result.accepted ? "recorded" : "preview"} ${result.recovery.recoveryId} ${result.recovery.action}\n`);
    return CLI_EXIT_OK;
  }

  if (action === "attach") {
    const workspaceId = input.flags["workspace-id"] || input.flags.workspaceId;
    if (!workspaceId) {
      input.context.stderr.write(`Usage: ${input.binName} project attach <folder> --workspace-id ID [--accept] [--project-id ID]\n`);
      return CLI_EXIT_USAGE;
    }
    const preview = await attachProjectFolder({
      projectRoot,
      workspaceId,
      projectId: input.flags["project-id"],
      name: input.flags.name,
      title: input.flags.title,
      accept: accepted,
      replaceDuplicate: readBooleanFlag(input.argv, input.flags, "replace", false),
    });
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", preview, meta);
    else {
      input.context.stdout.write(`${preview.accepted ? "attached" : "preview"} ${preview.projectId}\n`);
      input.context.stdout.write(`${preview.writes.map((entry) => `${entry.action} ${entry.path}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (action === "detach") {
    const manifest = await detachProjectFolder(projectRoot, input.flags.reason || "detached_by_user");
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", { projectRoot, manifest }, meta);
    else input.context.stdout.write(`detached ${manifest.projectId}\n`);
    return CLI_EXIT_OK;
  }

  if (action === "sync-handoff") {
    const result = await syncProjectHandoff(projectRoot);
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", result, meta);
    else input.context.stdout.write(`${result.writes.map((entry) => `${entry.action} ${entry.path}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (action === "export") {
    const output = input.flags.output || input.flags.path;
    const outputPath = output ? resolveProjectExportOutputPath(output, input.context.cwd) : undefined;
    const review = requireCliExportReview({ argv: input.argv, flags: input.flags, operation: "project export" });
    const handoff = await exportProjectHandoff(projectRoot, outputPath, {
      approvalId: review.approvalId,
      legalLabel: review.legalLabel,
    });
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", { projectRoot, output: outputPath ?? null, handoff }, meta);
    else input.context.stdout.write(`${outputPath ?? JSON.stringify(handoff)}\n`);
    return CLI_EXIT_OK;
  }

  if (input.wantsJson) {
    writeCommandJsonError(input.context.stdout, "project", new CliHandledError(
      "unknown_project_subcommand",
      `Unknown project subcommand: ${action}.`,
      CLI_EXIT_USAGE,
      {
        location: "cli.project.subcommand",
        suggestion: "Use one of the registered project subcommands.",
        safeNextStep: `Run ${input.binName} project inspect --json to inspect a project folder, or ${input.binName} help project --json for the project command surface.`,
        details: {
          received: action,
          validSubcommands: [...PROJECT_SUBCOMMANDS],
        },
      },
    ), {
      subcommand: action,
    });
    return CLI_EXIT_USAGE;
  }

  input.context.stderr.write(`Usage: ${input.binName} project inspect|attach|detach|export|import|sync-handoff|preflight|worktree|claim|snapshot|review|merge-plan|recover|forge-status [folder] [--json]\n`);
  return CLI_EXIT_USAGE;
}
