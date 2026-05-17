import type { CliContext } from "./index.ts";
import { resolveClawCliCommandIntent } from "@clawjs/core";

import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeJsonError } from "./cli-json.ts";
import { relatedCliMatches } from "./cli-surface.ts";

export function handleUnknownCliCommand(input: {
  group: string | undefined;
  positionals?: string[];
  context: CliContext;
  wantsJson: boolean;
  usage: string;
}): number {
  if (!input.group) {
    input.context.stderr.write(`${input.usage}\n`);
    return CLI_EXIT_USAGE;
  }
  const phrase = input.positionals?.length ? input.positionals.join(" ") : input.group;
  const related = relatedCliMatches(phrase, { limit: 5 });
  const commandIntent = resolveClawCliCommandIntent({ phrase });
  if (input.wantsJson) {
    writeJsonError(
      input.context.stdout,
      new CliHandledError("unknown_command", `Unknown Claw CLI command: ${input.group}`, CLI_EXIT_USAGE),
      {
        schemaVersion: 1,
        canonicalCommand: null,
        related,
        commandIntent,
      },
    );
    return CLI_EXIT_USAGE;
  }
  if (related.length > 0) {
    input.context.stderr.write(`Unknown command: ${input.group}\nRelated:\n${related.map((entry) => `  ${entry.name}${entry.canonicalCommand ? ` -> ${entry.canonicalCommand}` : ""} (${entry.type})`).join("\n")}\n\n`);
  }
  input.context.stderr.write(`Intent: ${commandIntent.status}. Try: ${input.context.binName ?? "claw"} commands resolve ${JSON.stringify(phrase)} --json\n\n`);
  input.context.stderr.write(`${input.usage}\n`);
  return CLI_EXIT_USAGE;
}
