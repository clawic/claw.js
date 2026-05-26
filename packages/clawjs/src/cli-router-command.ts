import {
  type KeywordRouterMatch,
  routeKeywords,
} from "@clawjs/core";
import type { CliContext } from "./index.ts";
import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonOk } from "./cli-json.ts";

export interface RunCliRouterCommandInput {
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 24;

export async function runCliRouterCommand(input: RunCliRouterCommandInput): Promise<number> {
  const terms = input.positionals.slice(1).filter((value) => value.trim().length > 0);
  const limit = parseRouterLimit(input.flags.limit);
  if (terms.length === 0) {
    if (input.wantsJson) {
      writeCommandJsonOk(
        input.context.stdout,
        "router",
        { queryTerms: [], matches: [], usage: routerUsage(input.binName) },
        {
          schemaVersion: 1,
          canonicalCommand: "router",
          mode: "deterministic-keyword-router",
          actor: { hint: "Pass one or more terms describing the intent." },
        },
      );
      return CLI_EXIT_OK;
    }
    input.context.stderr.write(`${routerUsage(input.binName)}\n`);
    return CLI_EXIT_USAGE;
  }

  const matches = routeKeywords(terms, { limit });

  if (input.wantsJson) {
    writeCommandJsonOk(
      input.context.stdout,
      "router",
      {
        queryTerms: terms,
        matches: matches.map((match) => serializeMatch(match)),
      },
      {
        schemaVersion: 1,
        canonicalCommand: "router",
        mode: "deterministic-keyword-router",
      },
    );
    return CLI_EXIT_OK;
  }

  input.context.stdout.write(`${renderHumanRouterMatches({ binName: input.binName, terms, matches })}\n`);
  return CLI_EXIT_OK;
}

function parseRouterLimit(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new CliHandledError(
      "invalid_router_limit",
      `Expected --limit to be a positive decimal integer, got ${raw}.`,
      CLI_EXIT_USAGE,
      { location: "cli.router.limit", suggestion: "Pass a positive decimal integer such as --limit 6." },
    );
  }
  const value = Number.parseInt(raw, 10);
  if (value > MAX_LIMIT) {
    throw new CliHandledError(
      "invalid_router_limit",
      `--limit must be at most ${MAX_LIMIT}, got ${value}.`,
      CLI_EXIT_USAGE,
      { location: "cli.router.limit", suggestion: `Pass a value between 1 and ${MAX_LIMIT}.` },
    );
  }
  return value;
}

function serializeMatch(match: KeywordRouterMatch): Record<string, unknown> {
  return {
    conceptId: match.concept.id,
    primaryCommand: match.concept.primaryCommand,
    summary: match.concept.summary,
    useWhen: match.concept.useWhen,
    exampleInvocation: match.concept.exampleInvocation,
    relatedConcepts: match.concept.relatedConcepts,
    antiPattern: match.concept.antiPattern,
    family: match.concept.family,
    synonyms: match.concept.keywords,
    matchedTerms: match.matchedKeywords,
    matchedInputs: match.matchedInputs,
    score: match.score,
  };
}

function renderHumanRouterMatches(input: {
  binName: string;
  terms: string[];
  matches: KeywordRouterMatch[];
}): string {
  const header = `Router results for: ${input.terms.map((value) => JSON.stringify(value)).join(" ")}`;
  if (input.matches.length === 0) {
    return [
      header,
      "",
      "No concept matched these terms. Try synonyms in English or Spanish, or run:",
      `  ${input.binName} about`,
      `  ${input.binName} inspect commands --json`,
    ].join("\n");
  }
  const blocks = input.matches.map((match, index) => renderMatch({ match, index, binName: input.binName }));
  return [header, "", ...blocks].join("\n");
}

function renderMatch(input: { match: KeywordRouterMatch; index: number; binName: string }): string {
  const { match, index, binName } = input;
  const concept = match.concept;
  const matchedLabel = match.matchedKeywords.length > 0
    ? `Matched terms: ${match.matchedKeywords.join(", ")}`
    : `Matched inputs: ${match.matchedInputs.join(", ")}`;
  return [
    `${index + 1}. ${concept.primaryCommand}  (concept: ${concept.id}, family: ${concept.family})`,
    `   ${concept.summary}`,
    `   Use this when: ${concept.useWhen}`,
    `   Example: ${concept.exampleInvocation}`,
    `   Related: ${concept.relatedConcepts.length > 0 ? concept.relatedConcepts.join(", ") : "(none)"}`,
    `   Do not use: ${concept.antiPattern}`,
    `   ${matchedLabel} (score=${match.score})`,
    `   See also: ${binName} help ${concept.primaryCommand}`,
  ].join("\n");
}

function routerUsage(binName: string): string {
  return [
    `Usage: ${binName} router <keyword> [keyword ...] [--limit N] [--json]`,
    "",
    "Maps one or more keywords to the dedicated Claw command for that intent.",
    "Pass several keywords in a single call to disambiguate or broaden the route.",
    "",
    "Examples:",
    `  ${binName} router task`,
    `  ${binName} router task deadline blocker --json`,
    `  ${binName} router memoria decisión`,
  ].join("\n");
}
