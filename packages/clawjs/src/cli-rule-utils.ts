import type { RulesCompileInput } from "@clawjs/core";

import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { parseCsvFlag } from "./cli-flag-parsers.ts";

export function parseRuleHints(flags: Record<string, string>): Omit<RulesCompileInput, "prompt"> | undefined {
  const rulesLimit = parseRulesLimitFlag(flags["rules-limit"]);
  const hints: Omit<RulesCompileInput, "prompt"> = {
    ...(flags.user ? { user: flags.user } : {}),
    ...(flags.organization || flags.org ? { organization: flags.organization || flags.org } : {}),
    ...(flags.brand ? { brand: flags.brand } : {}),
    ...(flags.client ? { client: flags.client } : {}),
    ...(flags.project ? { project: flags.project } : {}),
    ...(flags.domain ? { domain: flags.domain } : {}),
    ...(flags.service ? { service: flags.service } : {}),
    ...(flags["task-type"] || flags.task ? { taskType: flags["task-type"] || flags.task } : {}),
    ...(flags["output-format"] || flags.output ? { outputFormat: flags["output-format"] || flags.output } : {}),
    ...(flags.agent ? { agent: flags.agent } : {}),
    ...(flags.channel ? { channel: flags.channel } : {}),
    ...(rulesLimit !== undefined ? { limit: rulesLimit } : {}),
  };
  return Object.keys(hints).length > 0 ? hints : undefined;
}

export function parseRuleReferences(value: string | undefined): Array<{ kind: string; ref: string; label?: string }> {
  return parseCsvFlag(value).map((entry) => {
    const [kind, ref, label] = entry.split(":");
    if (!kind || !ref) {
      throw new CliHandledError("usage_error", `Invalid rule reference "${entry}". Use kind:ref[:label].`, CLI_EXIT_USAGE);
    }
    return {
      kind,
      ref,
      ...(label ? { label } : {}),
    };
  });
}

function parseRulesLimitFlag(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!trimmed || !Number.isInteger(parsed) || parsed <= 0) {
    throw new CliHandledError("invalid_rules_hint_limit", "--rules-limit must be a positive integer.", {
      exitCode: CLI_EXIT_USAGE,
      location: "cli.rules.rules-limit",
      details: { flag: "--rules-limit", value },
    });
  }
  return parsed;
}
