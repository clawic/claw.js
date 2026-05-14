import type { RuntimeAdapterId } from "@clawjs/core";

import type { CliContext } from "./index.ts";
import { CODEX_AGENT_ID, registerCodexAgentProcessor, resolveCodexRuntimeAdapterId } from "./cli-telegram-codex.ts";
import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { writeJsonOk } from "./cli-json.ts";
import { createCliClaw } from "./cli-claw-factory.ts";

export async function runCodexAgentCli(input: {
  group: string | undefined; command: string | undefined; subcommand: string | undefined; positionals: string[]; flags: Record<string, string>; argv: string[]; context: CliContext; wantsJson: boolean; binName: string; workspaceRoot: string; appId: string; workspaceId: string; runtimeAdapterId: RuntimeAdapterId;
}): Promise<number | null> {
  const { group, command, subcommand, positionals, flags, argv, context, wantsJson, binName, workspaceRoot, appId, workspaceId } = input;
if (group === "agents" && command === "codex") {
  const codexCommand = subcommand || "status";
  const codexRuntimeAdapterId = resolveCodexRuntimeAdapterId(flags);
  const claw = await createCliClaw(codexRuntimeAdapterId, flags, workspaceRoot, appId, workspaceId, CODEX_AGENT_ID, argv);
  if (codexCommand === "setup") {
    const processor = registerCodexAgentProcessor({ claw, workspaceRoot, runtimeAdapterId: codexRuntimeAdapterId, flags });
    const status = await claw.runtime.status();
    const payload = { agentId: CODEX_AGENT_ID, runtime: codexRuntimeAdapterId, processor, status };
    if (wantsJson) writeAgentsCodexJson(context.stdout, payload, codexCommand);
    else context.stdout.write(`codex setup processor=${processor.id} runtime=${codexRuntimeAdapterId}\n`);
    return CLI_EXIT_OK;
  }
  if (codexCommand === "status") {
    const processor = claw.channels.processors.get(CODEX_AGENT_ID);
    const status = await claw.runtime.status();
    const payload = { agentId: CODEX_AGENT_ID, runtime: codexRuntimeAdapterId, processorRegistered: !!processor, processor, status };
    if (wantsJson) writeAgentsCodexJson(context.stdout, payload, codexCommand);
    else context.stdout.write(`agent=codex runtime=${codexRuntimeAdapterId} processor=${processor ? "registered" : "missing"}\n`);
    return CLI_EXIT_OK;
  }
  if (codexCommand === "models") {
    const models = await claw.models.list();
    if (wantsJson) writeAgentsCodexJson(context.stdout, models, codexCommand);
    else context.stdout.write(`${models.map((model) => `${model.isDefault ? "*" : "-"} ${model.id}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  if (codexCommand === "auth" && positionals[3] === "status") {
    const auth = await claw.auth.status();
    if (wantsJson) writeAgentsCodexJson(context.stdout, auth, "auth.status");
    else context.stdout.write(`${Object.entries(auth).map(([provider, summary]) => `${provider}:${summary.hasAuth ? "authenticated" : "missing"}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  context.stderr.write(`Usage: ${binName} agents codex setup|status|models|auth status\n`);
  return CLI_EXIT_USAGE;
}
  return null;
}

function writeAgentsCodexJson(stream: NodeJS.WritableStream, data: unknown, subcommand: string): void {
  writeJsonOk(stream, data, {
    schemaVersion: 1,
    canonicalCommand: "agents",
    subcommand: `codex.${subcommand}`,
  });
}
