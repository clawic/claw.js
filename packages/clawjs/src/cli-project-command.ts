import path from "path";

import type { CliContext } from "./index.ts";
import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { readBooleanFlag } from "./cli-flag-parsers.ts";
import { requireCliExportReview } from "./cli-export-review.ts";
import { writeCommandJsonOk } from "./cli-json.ts";
import {
  attachProjectFolder,
  detachProjectFolder,
  exportProjectHandoff,
  importProjectHandoff,
  inspectProjectFolder,
  syncProjectHandoff,
} from "./project.ts";

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

  if (action === "inspect" || action === "status") {
    const inspection = inspectProjectFolder(projectRoot, { workspaceId: input.flags["workspace-id"] || input.flags.workspaceId });
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", inspection, meta);
    else input.context.stdout.write(`${inspection.state} ${inspection.manifest?.projectId ?? "unattached"} ${inspection.projectRoot}\n`);
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
      accept: readBooleanFlag(input.argv, input.flags, "accept", false),
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

  input.context.stderr.write(`Usage: ${input.binName} project inspect|attach|detach|export|import|sync-handoff [folder] [--json]\n`);
  return CLI_EXIT_USAGE;
}
