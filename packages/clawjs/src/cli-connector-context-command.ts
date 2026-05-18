import {
  CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS,
  buildConnectorContextDoctorReport,
  explainConnectorContextChoice,
  getConnectorGovernedContextProviderSchema,
  redactConnectorContextRecord,
  type ConnectorContextRequirement,
  type ConnectorGovernedContextRecord,
} from "@clawjs/core";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";

interface ConnectorContextCliInput {
  group: string | undefined;
  command: string | undefined;
  subcommand: string | undefined;
  positionals: string[];
  flags: Record<string, string>;
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
  };
  wantsJson: boolean;
  binName: string;
}

export async function runConnectorContextCli(input: ConnectorContextCliInput): Promise<number | null> {
  if (input.group === "connectors" && input.command !== "context" && input.command !== "ctx") return null;
  if (input.group !== "connectors" && input.group !== "accounts" && input.group !== "acct") return null;

  const invoked = input.group ?? "accounts";
  const canonicalCommand = invoked === "connectors" ? "connectors" : "accounts";
  const action = invoked === "connectors" ? input.positionals[2] ?? "list" : input.positionals[1] ?? "list";
  const subject = invoked === "connectors" ? input.positionals[3] : input.positionals[2];

  try {
    if (action === "list") {
      return writeConnectorContextResult(input, canonicalCommand, action, {
        providers: listProviders(input.flags.provider),
      });
    }

    if (action === "schema" || action === "show" || action === "inspect") {
      const providerId = input.flags.provider || subject;
      if (!providerId) throw new CliHandledError("missing_provider", `Usage: ${usagePrefix(input)} ${action} <provider> --json`, CLI_EXIT_USAGE);
      const schema = getConnectorGovernedContextProviderSchema(providerId);
      if (!schema) throw new CliHandledError("unknown_provider", `Unknown connector provider: ${providerId}`, CLI_EXIT_USAGE);
      return writeConnectorContextResult(input, canonicalCommand, action, { schema });
    }

    if (action === "doctor" || action === "validate") {
      const schemas = input.flags.provider
        ? [getRequiredSchema(input.flags.provider)]
        : CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS;
      return writeConnectorContextResult(input, canonicalCommand, action, {
        report: buildConnectorContextDoctorReport(schemas),
      });
    }

    if (action === "explain") {
      const providerId = input.flags.provider || subject;
      if (!providerId) throw new CliHandledError("missing_provider", `Usage: ${usagePrefix(input)} explain <provider> [--operation OP] --json`, CLI_EXIT_USAGE);
      const schema = getRequiredSchema(providerId);
      const decision = explainConnectorContextChoice({
        providerId,
        operationId: input.flags.operation || input.flags["operation-id"],
        environment: input.flags.environment || input.flags.env,
        requirements: requirementsForProvider(providerId, input.flags.operation || input.flags["operation-id"]),
        defaultRefs: schema.defaults?.map((entry) => entry.contextRef),
        fallbackRules: schema.fallbacks,
        candidates: fixtureCandidatesForExplain(providerId, input.flags),
      });
      return writeConnectorContextResult(input, canonicalCommand, action, {
        providerId,
        decision: {
          ...decision,
          selected: decision.selected.map((record) => redactConnectorContextRecord(record)),
        },
      });
    }

    if (["activate", "pause", "block", "retire", "edit", "set-policy"].includes(action)) {
      const recordId = subject || input.flags.id || input.flags.record;
      if (!recordId) throw new CliHandledError("missing_context_record", `Usage: ${usagePrefix(input)} ${action} <context-id> --dry-run --json`, CLI_EXIT_USAGE);
      return writeConnectorContextResult(input, canonicalCommand, action, {
        mutationSupported: false,
        externalPending: true,
        plan: {
          action,
          recordId,
          providerId: input.flags.provider ?? null,
          state: action === "activate" ? "active" : action === "pause" ? "paused" : action === "block" ? "blocked" : action === "retire" ? "retired" : undefined,
          policy: input.flags.policy ?? input.flags.reason ?? null,
        },
        message: "Local governed-context storage mutation is intentionally not wired in this first slice; this command returns an auditable plan only.",
      });
    }

    return writeConnectorContextUsage(input);
  } catch (error) {
    throw error;
  }
}

function usagePrefix(input: ConnectorContextCliInput): string {
  return input.group === "connectors" ? `${input.binName} connectors context` : `${input.binName} ${input.group ?? "accounts"}`;
}

function writeConnectorContextUsage(input: ConnectorContextCliInput): number {
  input.context.stderr.write([
    `Usage: ${usagePrefix(input)} list|schema|doctor|validate|explain|activate|pause|block|retire|edit [options]`,
    "",
    "Examples:",
    `  ${usagePrefix(input)} list --json`,
    `  ${usagePrefix(input)} schema apple --json`,
    `  ${usagePrefix(input)} doctor --json`,
    `  ${usagePrefix(input)} explain apple --operation apple.upload --env production --json`,
  ].join("\n") + "\n");
  return CLI_EXIT_USAGE;
}

function writeConnectorContextResult(input: ConnectorContextCliInput, canonicalCommand: "accounts" | "connectors", action: string, data: unknown): number {
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, canonicalCommand, data, {
      invokedCommand: input.group ?? canonicalCommand,
      subcommand: input.group === "connectors" ? "context" : action,
      operation: input.group === "connectors" ? action : action,
    });
    return CLI_EXIT_OK;
  }
  if (isProviderListPayload(data)) {
    input.context.stdout.write(`${formatCliTable(data.providers.map((provider) => ({
      provider: provider.providerId,
      contexts: String(provider.contextKinds.length),
      subprofiles: provider.subprofiles.join(",") || "-",
      summary: provider.summary,
    })))}\n`);
    return CLI_EXIT_OK;
  }
  if (isDoctorPayload(data)) {
    input.context.stdout.write(`${data.report.ok ? "ok" : "gaps"}\tproviders=${data.report.providers}\tgaps=${data.report.gaps.length}\n`);
    return data.report.ok ? CLI_EXIT_OK : CLI_EXIT_USAGE;
  }
  input.context.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  return CLI_EXIT_OK;
}

function listProviders(providerId?: string): Array<{ providerId: string; displayName: string; summary: string; contextKinds: string[]; subprofiles: string[] }> {
  const schemas = providerId ? [getRequiredSchema(providerId)] : CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS;
  return schemas.map((schema) => ({
    providerId: schema.providerId,
    displayName: schema.displayName,
    summary: schema.summary,
    contextKinds: schema.contextKinds.map((entry) => entry.kind),
    subprofiles: schema.subprofiles?.map((entry) => entry.id) ?? [],
  }));
}

function getRequiredSchema(providerId: string) {
  const schema = getConnectorGovernedContextProviderSchema(providerId);
  if (!schema) throw new CliHandledError("unknown_provider", `Unknown connector provider: ${providerId}`, CLI_EXIT_USAGE);
  return schema;
}

function requirementsForProvider(providerId: string, operationId?: string): ConnectorContextRequirement[] {
  if (providerId === "apple" || operationId?.startsWith("apple.")) {
    return [
      { kind: "team", fields: ["team_id"] },
      { kind: "app", fields: ["bundle_id", "sku"] },
      { kind: "signing_identity", fields: ["team_id", "signing_certificate_sha256"], optional: true },
    ];
  }
  if (providerId === "revenuecat") return [{ kind: "key", fields: ["api_version", "api_key"] }];
  if (providerId === "google") return [{ kind: "app", fields: ["package_name"] }, { kind: "signing_identity", fields: ["certificate_sha256"], optional: true }];
  return [{ kind: "account", fields: ["account_id"] }];
}

function fixtureCandidatesForExplain(providerId: string, flags: Record<string, string>): ConnectorGovernedContextRecord[] {
  if (providerId === "apple") {
    const records: ConnectorGovernedContextRecord[] = [
      {
        id: flags["team-context-id"] || "apple_team_default",
        providerId,
        kind: "team",
        displayName: "Apple Team",
        state: parseState(flags["team-state"]),
        fields: {
          ...(flags["team-id"] ? { team_id: { value: flags["team-id"], sensitivity: "private" as const } } : {}),
        },
      },
      {
        id: flags["app-context-id"] || "apple_app_default",
        providerId,
        kind: "app",
        displayName: "Apple App",
        state: parseState(flags["app-state"]),
        fields: {
          ...(flags["bundle-id"] ? { bundle_id: { value: flags["bundle-id"], sensitivity: "private" as const } } : {}),
          ...(flags.sku ? { sku: { value: flags.sku, sensitivity: "private" as const } } : {}),
          ...(flags.environment || flags.env ? { environment: { value: flags.environment || flags.env, sensitivity: "public" as const } } : {}),
        },
      },
    ];
    if (flags["signing-certificate-sha256"] || flags["signing-state"] || flags["signing-context-id"]) {
      records.push({
        id: flags["signing-context-id"] || "apple_signing_default",
        providerId,
        kind: "signing_identity",
        displayName: "Apple Signing Identity",
        state: parseState(flags["signing-state"]),
        fields: {
          ...(flags["team-id"] ? { team_id: { value: flags["team-id"], sensitivity: "private" as const } } : {}),
          ...(flags["signing-certificate-sha256"] ? { signing_certificate_sha256: { value: flags["signing-certificate-sha256"], sensitivity: "private" as const } } : {}),
        },
      });
    }
    return records;
  }

  if (providerId === "revenuecat") {
    return [
      {
        id: "revenuecat_api_v2",
        providerId,
        kind: "key",
        displayName: "RevenueCat API v2",
        state: parseState(flags["v2-state"] || "active"),
        fields: {
          api_version: { value: "v2", sensitivity: "public" },
          api_key: { sensitivity: "secret_ref", ...(flags["v2-secret-ref"] ? { secretRef: flags["v2-secret-ref"] } : {}) },
        },
      },
      {
        id: "revenuecat_api_v1",
        providerId,
        kind: "key",
        displayName: "RevenueCat API v1",
        state: parseState(flags["v1-state"] || "active"),
        fields: {
          api_version: { value: "v1", sensitivity: "public" },
          api_key: { sensitivity: "secret_ref", ...(flags["v1-secret-ref"] ? { secretRef: flags["v1-secret-ref"] } : {}) },
        },
      },
    ];
  }

  if (providerId === "google") {
    return [{
      id: "google_play_app_default",
      providerId,
      kind: "app",
      displayName: "Google Play App",
      state: parseState(flags["app-state"]),
      fields: {
        ...(flags["package-name"] ? { package_name: { value: flags["package-name"], sensitivity: "private" as const } } : {}),
      },
    }];
  }

  return [{
    id: `${providerId}_account_default`,
    providerId,
    kind: "account",
    displayName: `${providerId} account`,
    state: parseState(flags.state),
    fields: {
      ...(flags["account-id"] ? { account_id: { value: flags["account-id"], sensitivity: "private" as const } } : {}),
    },
  }];
}

function parseState(value?: string): ConnectorGovernedContextRecord["state"] {
  if (value === "active" || value === "paused" || value === "blocked" || value === "retired") return value;
  return "active";
}

function isProviderListPayload(value: unknown): value is { providers: ReturnType<typeof listProviders> } {
  return typeof value === "object" && value !== null && "providers" in value;
}

function isDoctorPayload(value: unknown): value is { report: ReturnType<typeof buildConnectorContextDoctorReport> } {
  return typeof value === "object" && value !== null && "report" in value;
}
