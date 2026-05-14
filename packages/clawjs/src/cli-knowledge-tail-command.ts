// @ts-nocheck
import type { RuntimeAdapterId } from "@clawjs/core";

import type { CliContext } from "./index.ts";
import { createCliWorkspaceClaw } from "./cli-claw-factory.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { parseCsvFlag, readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeJson } from "./cli-json.ts";
import { runCommitmentsCli, runContextCli, runJudgmentCli, runLearningCli, runOutcomesCli } from "./cli-productivity-command.ts";
import { runUserKnowledgeCli } from "./cli-user-knowledge-command.ts";
import { runRulesLibrarySkillsCli } from "./cli-rules-library-skills-command.ts";
import { runCodexAgentCli } from "./cli-codex-agent-command.ts";
import { runChannelTelegramCli } from "./cli-channel-telegram-command.ts";
import { runFileSessionDocumentCli } from "./cli-file-session-document-command.ts";
import { runMediaGenerationCli } from "./cli-media-generation-command.ts";

export async function runKnowledgeTailCli(input: {
  argv: string[];
  group: string | undefined;
  command: string | undefined;
  subcommand: string | undefined;
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
  mediaGroup: string | undefined;
}): Promise<number | null> {
  const { argv, group, command, subcommand, positionals, flags, context, wantsJson, binName, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId, mediaGroup } = input;

  if (group === "workspace-search" && command === "query") {
    const query = subcommand || flags.query;
    if (!query) {
      context.stderr.write("Usage: claw workspace-search query <query> [--domains tasks,notes,...]\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    const results = await claw.search.query({
      query,
      domains: parseCsvFlag(flags.domains) as Array<"areas" | "tasks" | "goals" | "projects" | "milestones" | "activity" | "blockers" | "artifacts" | "decisions" | "work_sessions" | "assignments" | "handoffs" | "approvals" | "capacity" | "reminders" | "deadlines" | "notes" | "people" | "inbox" | "events">,
      strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
    });
    if (wantsJson) writeJson(context.stdout, results);
    else context.stdout.write(`${results.map((result) => `${result.domain} ${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
    return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "workspace-index" && command === "rebuild") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    const result = await claw.workspaceIndex.rebuild();
    if (wantsJson) writeJson(context.stdout, result);
    else context.stdout.write(`reindexed=${result.reindexed} embeddings=${result.embeddings}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "outcomes") {
    return await runOutcomesCli({
      argv,
      positionals,
      flags,
      context,
      wantsJson,
      binName,
      workspaceRoot,
      appId,
      workspaceId,
      agentId,
      runtimeAdapterId,
    });
  }

  if (group === "context") {
    return await runContextCli({
      argv,
      positionals,
      flags,
      context,
      wantsJson,
      binName,
      workspaceRoot,
      appId,
      workspaceId,
      agentId,
      runtimeAdapterId,
    });
  }

  if (group === "commitments") {
    return await runCommitmentsCli({
      argv,
      positionals,
      flags,
      context,
      wantsJson,
      binName,
      workspaceRoot,
      appId,
      workspaceId,
      agentId,
      runtimeAdapterId,
    });
  }

  if (group === "judgment") {
    return await runJudgmentCli({
      argv,
      positionals,
      flags,
      context,
      wantsJson,
      binName,
      workspaceRoot,
      appId,
      workspaceId,
      agentId,
      runtimeAdapterId,
    });
  }

  if (group === "learning") {
    return await runLearningCli({
      argv,
      positionals,
      flags,
      context,
      wantsJson,
      binName,
      workspaceRoot,
      appId,
      workspaceId,
      agentId,
      runtimeAdapterId,
    });
  }

  const userKnowledgeExitCode = await runUserKnowledgeCli({ group, command, subcommand, positionals, flags, argv, context, wantsJson, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId });
  if (userKnowledgeExitCode !== null) return userKnowledgeExitCode;

  const rulesLibrarySkillsExitCode = await runRulesLibrarySkillsCli({ group, command, subcommand, positionals, flags, argv, context, wantsJson, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId });
  if (rulesLibrarySkillsExitCode !== null) return rulesLibrarySkillsExitCode;

  const codexAgentExitCode = await runCodexAgentCli({ group, command, subcommand, positionals, flags, argv, context, wantsJson, binName, workspaceRoot, appId, workspaceId, runtimeAdapterId });
  if (codexAgentExitCode !== null) return codexAgentExitCode;

  const channelTelegramExitCode = await runChannelTelegramCli({ group, command, subcommand, positionals, flags, argv, context, wantsJson, binName, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId });
  if (channelTelegramExitCode !== null) return channelTelegramExitCode;

  const fileSessionDocumentExitCode = await runFileSessionDocumentCli({ group, command, subcommand, flags, argv, context, wantsJson, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId });
  if (fileSessionDocumentExitCode !== null) return fileSessionDocumentExitCode;

  const mediaGenerationExitCode = await runMediaGenerationCli({ group, command, subcommand, flags, argv, context, wantsJson, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId, mediaGroup });
  if (mediaGenerationExitCode !== null) return mediaGenerationExitCode;

  return null;
}
