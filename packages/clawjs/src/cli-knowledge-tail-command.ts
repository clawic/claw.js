// @ts-nocheck
import type { RuntimeAdapterId } from "@clawjs/core";

import type { CliContext } from "./index.ts";
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
