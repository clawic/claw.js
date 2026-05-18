import path from "path";

import type { CliContext } from "./index.ts";
import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";
import {
  attachProjectFolder,
  detachProjectFolder,
  exportProjectHandoff,
  inspectProjectFolder,
  syncProjectHandoff,
} from "./project.ts";

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
  const target = input.flags.project || input.flags.folder || input.positionals[2] || ".";
  const projectRoot = path.resolve(input.context.cwd, target);
  const meta = { invokedCommand: "project", subcommand: action };

  if (action === "inspect" || action === "status") {
    const inspection = inspectProjectFolder(projectRoot);
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
    const outputPath = output ? path.resolve(input.context.cwd, output) : undefined;
    const handoff = await exportProjectHandoff(projectRoot, outputPath);
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "project", { projectRoot, output: outputPath ?? null, handoff }, meta);
    else input.context.stdout.write(`${outputPath ?? JSON.stringify(handoff)}\n`);
    return CLI_EXIT_OK;
  }

  input.context.stderr.write(`Usage: ${input.binName} project inspect|attach|detach|export|sync-handoff [folder] [--json]\n`);
  return CLI_EXIT_USAGE;
}
