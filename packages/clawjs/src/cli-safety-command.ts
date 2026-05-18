import {
  allowedRegulatedUses,
  blockedRegulatedUses,
  createRegulatedOutputLabels,
  evaluateRegulatedAction,
  getRegulatedDomainPolicy,
  isRegulatedDomain,
  prohibitedRegulatedPractices,
  regulatedDomainSafetyPolicies,
  regulatedDomains,
  regulatedDomainSafetyVersion,
  type RegulatedDecisionEffect,
} from "@clawjs/core";

import { CliHandledError, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";

interface SafetyCliInput {
  positionals: string[];
  flags: Record<string, string>;
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
  };
  wantsJson: boolean;
  binName: string;
}

export async function runSafetyCli(input: SafetyCliInput): Promise<number> {
  const action = input.positionals[1];
  if (!action) return writeSafetyUsage(input);

  if (action === "domains") {
    return writeSafetyResult(input, {
      version: regulatedDomainSafetyVersion,
      domains: regulatedDomainSafetyPolicies,
    });
  }

  if (action === "classify") {
    const domain = input.positionals[2] || input.flags.domain;
    if (!domain) throw new CliHandledError("missing_regulated_domain", `Usage: ${input.binName} safety classify <domain> --json`, CLI_EXIT_USAGE);
    if (!isRegulatedDomain(domain)) {
      return writeSafetyResult(input, {
        matched: false,
        domain,
        knownDomains: regulatedDomains,
      });
    }
    return writeSafetyResult(input, {
      matched: true,
      policy: getRegulatedDomainPolicy(domain),
    });
  }

  if (action === "check") {
    const domain = input.flags.domain || input.positionals[2];
    if (!domain || !isRegulatedDomain(domain)) {
      throw new CliHandledError("invalid_regulated_domain", `Use --domain with one of: ${regulatedDomains.join(", ")}.`, CLI_EXIT_USAGE);
    }
    const decisionEffect = parseDecisionEffect(input.flags.effect || input.flags["decision-effect"] || input.positionals[3] || "summary");
    const requestedUse = input.flags.use || input.flags["requested-use"];
    const decision = evaluateRegulatedAction({
      regulatedDomain: domain,
      decisionEffect,
      requestedUse: requestedUse as Parameters<typeof evaluateRegulatedAction>[0]["requestedUse"],
      minorInvolved: input.flags.minor === "true" || input.flags["minor-involved"] === "true",
      externalAction: input.flags.external === "true" || input.flags["external-action"] === "true",
      sensitiveExport: input.flags.export === "true" || input.flags["sensitive-export"] === "true",
      remoteOrProviderUse: input.flags.remote === "true" || input.flags.provider === "true",
      professionalContext: input.flags.professional === "true" || input.flags["professional-context"] === "true",
    });
    return writeSafetyResult(input, { decision });
  }

  if (action === "explain") {
    const domain = input.positionals[2] || input.flags.domain;
    if (!domain || !isRegulatedDomain(domain)) {
      throw new CliHandledError("invalid_regulated_domain", `Use a domain: ${regulatedDomains.join(", ")}.`, CLI_EXIT_USAGE);
    }
    const policy = getRegulatedDomainPolicy(domain);
    return writeSafetyResult(input, {
      policy,
      allowedUses: policy.allowedUses,
      blockedUses: policy.blockedUses,
      prohibitedPractices: policy.prohibitedPractices,
    });
  }

  if (action === "disclaimers") {
    const domain = input.positionals[2] || input.flags.domain;
    if (!domain || !isRegulatedDomain(domain)) {
      throw new CliHandledError("invalid_regulated_domain", `Use a domain: ${regulatedDomains.join(", ")}.`, CLI_EXIT_USAGE);
    }
    return writeSafetyResult(input, {
      domain,
      disclaimerPolicy: getRegulatedDomainPolicy(domain).disclaimerPolicy,
      outputLabels: createRegulatedOutputLabels({
        regulatedDomain: domain,
        decisionEffect: parseDecisionEffect(input.flags.effect || input.flags["decision-effect"] || "summary"),
      }),
    });
  }

  return writeSafetyUsage(input);
}

function parseDecisionEffect(value: string): RegulatedDecisionEffect {
  const allowed = ["none", "recordkeeping", "draft", "summary", "interpretation", "recommendation", "external_action", "final_decision"];
  if (allowed.includes(value)) return value as RegulatedDecisionEffect;
  throw new CliHandledError("invalid_decision_effect", `Use one of: ${allowed.join(", ")}.`, CLI_EXIT_USAGE);
}

function writeSafetyUsage(input: SafetyCliInput): number {
  input.context.stderr.write([
    `Usage: ${input.binName} safety domains|classify|check|explain|disclaimers [options]`,
    "",
    "Commands:",
    "  safety domains --json",
    "  safety classify <domain> --json",
    "  safety check --domain health --effect final_decision --use diagnosis_or_treatment --json",
    "  safety explain legal --json",
    "  safety disclaimers mental_health --json",
  ].join("\n") + "\n");
  return CLI_EXIT_USAGE;
}

function writeSafetyResult(input: SafetyCliInput, data: unknown): number {
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, "safety", data, {
      subcommand: input.positionals[1] ?? null,
      operation: input.positionals[2] ?? null,
    });
    return CLI_EXIT_OK;
  }

  if (isDomainsPayload(data)) {
    input.context.stdout.write(`${formatCliTable(data.domains.map((entry) => ({
      domain: entry.regulatedDomain,
      disclaimer: entry.disclaimerPolicy,
      labels: entry.outputLabelPolicy,
      audit: entry.auditPolicy,
    })))}\n`);
    return CLI_EXIT_OK;
  }

  if (isDecisionPayload(data)) {
    input.context.stdout.write([
      `${data.decision.allowed ? "allowed" : "blocked"}\t${data.decision.denialCodes.join(",") || "none"}`,
      `disclaimer\t${data.decision.disclaimerPolicy}`,
      `labels\t${data.decision.outputLabels.join(",")}`,
    ].join("\n") + "\n");
    return CLI_EXIT_OK;
  }

  input.context.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  return CLI_EXIT_OK;
}

function isDomainsPayload(value: unknown): value is { domains: typeof regulatedDomainSafetyPolicies } {
  return typeof value === "object" && value !== null && "domains" in value;
}

function isDecisionPayload(value: unknown): value is { decision: ReturnType<typeof evaluateRegulatedAction> } {
  return typeof value === "object" && value !== null && "decision" in value;
}

export const safetyCliVocabulary = {
  allowedRegulatedUses,
  blockedRegulatedUses,
  prohibitedRegulatedPractices,
};
