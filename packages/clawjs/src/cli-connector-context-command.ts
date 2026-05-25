import {
  CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS,
  buildConnectorContextDoctorReport,
  explainConnectorContextChoice,
  getConnectorGovernedContextProviderSchema,
  redactConnectorContextRecord,
  resolveConnectorContextDefaultRefs,
  type ConnectorContextRequirement,
  type ConnectorGovernedContextRecord,
} from "@clawjs/core";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { parseSetFlags } from "./cli-value-utils.ts";
import { openConnectorContextStore } from "./cli-connector-context-store.ts";
import { requireCliExportReview } from "./cli-export-review.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";

interface ConnectorContextCliInput {
  group: string | undefined;
  command: string | undefined;
  subcommand: string | undefined;
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
  };
  wantsJson: boolean;
  binName: string;
}

const CONNECTOR_CONTEXT_ACTIONS = ["list", "show", "schema", "upsert", "edit", "link-secret", "defaults", "doctor", "validate", "explain", "export", "activate", "pause", "block", "retire", "audit"] as const;

export async function runConnectorContextCli(input: ConnectorContextCliInput): Promise<number | null> {
  if (input.group === "connectors" && input.command !== "context" && input.command !== "ctx") return null;
  if (input.group !== "connectors" && input.group !== "accounts" && input.group !== "acct") return null;

  const invoked = input.group ?? "accounts";
  const canonicalCommand = invoked === "connectors" ? "connectors" : "accounts";
  const action = invoked === "connectors" ? input.positionals[2] ?? "list" : input.positionals[1] ?? "list";
  const subject = invoked === "connectors" ? input.positionals[3] : input.positionals[2];
  const store = openConnectorContextStore();

  try {
    if (action === "list") {
      const records = store.listRecords({
        providerId: input.flags.provider,
        kind: input.flags.kind,
        state: parseOptionalState(input.flags.state),
      });
      return writeConnectorContextResult(input, canonicalCommand, action, {
        providers: listProviders(input.flags.provider),
        records: records.map((record) => redactConnectorContextRecord(record)),
      });
    }

    if (action === "schema" || action === "show" || action === "inspect") {
      const providerId = input.flags.provider || subject;
      if (action === "show" && subject) {
        const record = subject.startsWith("res_") ? store.getRecordByResourceId(subject) : store.getRecord(subject);
        if (record) return writeConnectorContextResult(input, canonicalCommand, action, { record: redactConnectorContextRecord(record) });
      }
      if (!providerId) throw new CliHandledError("missing_provider", `Usage: ${usagePrefix(input)} ${action} <provider|context-id> --json`, CLI_EXIT_USAGE);
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
        storage: {
          records: store.listRecords({ providerId: input.flags.provider }).length,
          defaults: store.listDefaults({ providerId: input.flags.provider }).length,
        },
      });
    }

    if (action === "export") {
      const review = requireCliExportReview({ argv: input.argv, flags: input.flags, operation: "accounts export" });
      const records = store.listRecords({
        providerId: input.flags.provider,
        kind: input.flags.kind,
        state: parseOptionalState(input.flags.state),
      });
      const mode = parseExportMode(input.flags.mode || (input.flags["private-envelope"] === "true" ? "private-envelope" : undefined));
      const includePrivate = mode === "private-envelope";
      const exportedAt = new Date().toISOString();
      const providers = Array.from(new Set(records.map((record) => record.providerId))).sort();
      for (const providerId of providers) {
        store.audit({
          eventType: "context.export",
          providerId,
          actorId: input.flags["actor-id"] || input.flags.agent,
          decision: "recorded",
          contextRefs: records.filter((record) => record.providerId === providerId).map((record) => record.id),
          secretRefs: records
            .filter((record) => record.providerId === providerId)
            .flatMap((record) => Object.values(record.fields).flatMap((field) => field.secretRef ? [field.secretRef] : [])),
          metadata: {
            mode,
            protectedEnvelope: includePrivate,
            plaintextSecretsIncluded: false,
            privateFieldsIncluded: includePrivate,
          },
        });
      }
      return writeConnectorContextResult(input, canonicalCommand, action, {
        export: {
          schemaVersion: 1,
          exportedAt,
          mode,
          store: "core.sqlite",
          filters: {
            ...(input.flags.provider ? { providerId: input.flags.provider } : {}),
            ...(input.flags.kind ? { kind: input.flags.kind } : {}),
            ...(input.flags.state ? { state: input.flags.state } : {}),
          },
          policy: {
            approvalId: review.approvalId,
            legalLabel: review.legalLabel,
            confirmed: review.confirmed,
            protectedHandlingRequired: includePrivate,
            privateFieldsIncluded: includePrivate,
            plaintextSecretsIncluded: false,
            secretMaterialIncluded: false,
            secretRefsIncluded: false,
            secretBindingMetadataIncluded: true,
          },
          records: records.map((record) => exportConnectorContextRecord(record, { includePrivate })),
          defaults: store.listDefaults({ providerId: input.flags.provider }),
        },
      });
    }

    if (action === "explain") {
      const providerId = input.flags.provider || subject;
      if (!providerId) throw new CliHandledError("missing_provider", `Usage: ${usagePrefix(input)} explain <provider> [--operation OP] --json`, CLI_EXIT_USAGE);
      const schema = getRequiredSchema(providerId);
      const storedRecords = store.listRecords({ providerId });
      const defaultRefs = resolveConnectorContextDefaultRefs({
        providerId,
        operationId: input.flags.operation || input.flags["operation-id"],
        workspaceId: input.flags.workspace || input.flags["workspace-id"],
        projectId: input.flags.project || input.flags["project-id"],
        appId: input.flags.app || input.flags["app-id"],
        environment: input.flags.environment || input.flags.env,
        agentId: input.flags["actor-id"] || input.flags.agent,
        roleId: input.flags.role || input.flags["role-id"],
        rules: [...(schema.defaults ?? []), ...store.listDefaults({ providerId })],
      });
      const decision = explainConnectorContextChoice({
        providerId,
        operationId: input.flags.operation || input.flags["operation-id"],
        environment: input.flags.environment || input.flags.env,
        actorId: input.flags["actor-id"] || input.flags.agent,
        roleId: input.flags.role || input.flags["role-id"],
        requirements: requirementsForProvider(providerId, input.flags.operation || input.flags["operation-id"]),
        defaultRefs,
        fallbackRules: schema.fallbacks,
        candidates: storedRecords.length > 0 ? storedRecords : fixtureCandidatesForExplain(providerId, input.flags),
      });
      store.audit({
        eventType: "context.explain",
        providerId,
        operationId: input.flags.operation || input.flags["operation-id"],
        actorId: input.flags["actor-id"] || input.flags.agent,
        decision: decision.allowed ? "allow" : "deny",
        reasonCodes: decision.reasons.map((reason) => reason.code),
        contextRefs: decision.selected.map((record) => record.id),
        secretRefs: decision.selected.flatMap((record) => Object.values(record.fields).flatMap((field) => field.secretRef ? [field.secretRef] : [])),
        appliedRules: decision.trace.fallbackRuleIds,
        metadata: { rejected: decision.rejected.map((entry) => entry.recordId), source: storedRecords.length > 0 ? "core.sqlite" : "fixture" },
      });
      return writeConnectorContextResult(input, canonicalCommand, action, {
        providerId,
        decision: {
          ...decision,
          selected: decision.selected.map((record) => redactConnectorContextRecord(record)),
        },
      });
    }

    if (action === "upsert" || action === "create" || action === "edit") {
      const recordId = subject || input.flags.id || input.flags.record;
      const providerId = input.flags.provider;
      const kind = input.flags.kind;
      if (!providerId || !kind) throw new CliHandledError("missing_context_shape", `Usage: ${usagePrefix(input)} ${action} <id> --provider PROVIDER --kind KIND --set field=value --json`, CLI_EXIT_USAGE);
      const record = store.upsertRecord({
        id: recordId,
        providerId,
        kind,
        displayName: input.flags.name || input.flags.label,
        state: parseOptionalState(input.flags.state),
        parentId: input.flags.parent || input.flags["parent-id"],
        resourceId: input.flags.resource || input.flags["resource-id"],
        principalId: input.flags.principal || input.flags["principal-id"],
        externalId: input.flags.external || input.flags["external-id"],
        scopes: parseScopes(input.flags.scope || input.flags.scopes),
        fields: parseSetFlags(input.argv),
        guidance: input.flags.guidance ? { summary: input.flags.guidance } : undefined,
        policy: input.flags.policy ? parsePolicy(input.flags.policy, input.flags.reason) : undefined,
        desired: parseJsonObjectFlag(input.flags.desired),
        observed: parseJsonObjectFlag(input.flags.observed),
        source: parseSource(input.flags.source),
        verification: parseJsonObjectFlag(input.flags.verification),
        actorId: input.flags["actor-id"] || input.flags.agent,
      });
      return writeConnectorContextResult(input, canonicalCommand, action, { record: redactConnectorContextRecord(record), durable: true, store: "core.sqlite" });
    }

    if (action === "link-secret") {
      const recordId = subject || input.flags.id || input.flags.record;
      const field = input.flags.field;
      const secretRef = input.flags["secret-ref"] || input.flags.secret;
      if (!recordId || !field || !secretRef) throw new CliHandledError("missing_secret_link", `Usage: ${usagePrefix(input)} link-secret <context-id> --field api_key --secret-ref secret://... --json`, CLI_EXIT_USAGE);
      const record = store.linkSecret({ id: recordId, field, secretRef, actorId: input.flags["actor-id"] || input.flags.agent, operationId: input.flags.operation });
      return writeConnectorContextResult(input, canonicalCommand, action, { record: redactConnectorContextRecord(record), durable: true, store: "core.sqlite" });
    }

    if (action === "defaults") {
      if (subject === "set") {
        const contextRef = input.flags.context || input.flags["context-ref"];
        if (!contextRef) throw new CliHandledError("missing_default_context", `Usage: ${usagePrefix(input)} defaults set --context <context-id> --scope provider:apple --json`, CLI_EXIT_USAGE);
        const rule = store.setDefault({
          id: input.flags.id,
          scope: parseScope(input.flags.scope || "global"),
          providerId: input.flags.provider,
          operationIds: input.flags.operation ? input.flags.operation.split(",").map((entry) => entry.trim()).filter(Boolean) : undefined,
          contextRef,
          priority: parseDefaultPriorityFlag(input.flags.priority),
          condition: input.flags.condition,
        });
        return writeConnectorContextResult(input, canonicalCommand, action, { default: rule, durable: true, store: "core.sqlite" });
      }
      return writeConnectorContextResult(input, canonicalCommand, action, {
        defaults: store.listDefaults({ providerId: input.flags.provider }),
        providerDefaults: input.flags.provider ? getRequiredSchema(input.flags.provider).defaults ?? [] : CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS.flatMap((schema) => schema.defaults ?? []),
      });
    }

    if (action === "audit") {
      const limit = parseNonNegativeIntegerFlag(input.flags.limit, "limit");
      const rows = store.sqlite.prepare("SELECT * FROM connector_context_audit_events ORDER BY created_at DESC LIMIT ?").all(limit);
      return writeConnectorContextResult(input, canonicalCommand, action, { events: rows });
    }

    if (["activate", "pause", "block", "retire"].includes(action)) {
      const recordId = subject || input.flags.id || input.flags.record;
      if (!recordId) throw new CliHandledError("missing_context_record", `Usage: ${usagePrefix(input)} ${action} <context-id> --json`, CLI_EXIT_USAGE);
      const state = action === "activate" ? "active" : action === "pause" ? "paused" : action === "block" ? "blocked" : "retired";
      const record = store.setState({ id: recordId, state, reason: input.flags.reason, actorId: input.flags["actor-id"] || input.flags.agent });
      return writeConnectorContextResult(input, canonicalCommand, action, {
        record: redactConnectorContextRecord(record),
        durable: true,
        store: "core.sqlite",
      });
    }

    return writeConnectorContextUsage(input);
  } catch (error) {
    throw error;
  } finally {
    store.close();
  }
}

function usagePrefix(input: ConnectorContextCliInput): string {
  return input.group === "connectors" ? `${input.binName} connectors context` : `${input.binName} ${input.group ?? "accounts"}`;
}

function writeConnectorContextUsage(input: ConnectorContextCliInput): number {
  if (input.wantsJson) {
    const invoked = input.group ?? "accounts";
    const canonicalCommand = invoked === "connectors" ? "connectors" : "accounts";
    const received = invoked === "connectors" ? input.positionals[2] ?? null : input.positionals[1] ?? null;
    writeCommandJsonError(input.context.stdout, canonicalCommand, new CliHandledError(
      `unknown_${canonicalCommand}_subcommand`,
      received ? `Unknown ${canonicalCommand} subcommand: ${received}.` : `Missing ${canonicalCommand} subcommand.`,
      CLI_EXIT_USAGE,
      {
        location: `cli.${canonicalCommand}.subcommand`,
        suggestion: `Use one of: ${CONNECTOR_CONTEXT_ACTIONS.join(", ")}.`,
        safeNextStep: `Run ${usagePrefix(input)} list --json to inspect governed context, or ${input.binName} help ${canonicalCommand} --json for the command surface.`,
        details: {
          received,
          validSubcommands: [...CONNECTOR_CONTEXT_ACTIONS],
        },
      },
    ), {
      invokedCommand: invoked,
      subcommand: invoked === "connectors" ? "context" : received,
      ...(invoked === "connectors" ? { operation: received } : {}),
    });
    return CLI_EXIT_USAGE;
  }
  input.context.stderr.write([
    `Usage: ${usagePrefix(input)} ${CONNECTOR_CONTEXT_ACTIONS.join("|")} [options]`,
    "",
    "Examples:",
    `  ${usagePrefix(input)} list --json`,
    `  ${usagePrefix(input)} schema apple --json`,
    `  ${usagePrefix(input)} upsert apple_app_main --provider apple --kind app --set bundle_id=com.example.app --set sku=SKU123 --json`,
    `  ${usagePrefix(input)} link-secret revenuecat_api_v2 --field api_key --secret-ref secret://revenuecat/v2 --json`,
    `  ${usagePrefix(input)} defaults set --context revenuecat_api_v2 --provider revenuecat --scope provider:revenuecat --json`,
    `  ${usagePrefix(input)} doctor --json`,
    `  ${usagePrefix(input)} explain apple --operation apple.upload --env production --json`,
    `  ${usagePrefix(input)} export --provider apple --mode redacted --json`,
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
    if (data.records.length > 0) {
      input.context.stdout.write(`${formatCliTable(data.records.map((record) => ({
        id: record.id,
        provider: record.providerId,
        kind: String(record.kind),
        state: record.state,
        name: record.displayName,
      })))}\n`);
      return CLI_EXIT_OK;
    }
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

function exportConnectorContextRecord(record: ConnectorGovernedContextRecord, options: { includePrivate: boolean }) {
  const redacted = redactConnectorContextRecord(record, { includePrivate: options.includePrivate });
  return {
    id: redacted.id,
    providerId: redacted.providerId,
    kind: redacted.kind,
    displayName: redacted.displayName,
    state: redacted.state,
    ...(redacted.parentId ? { parentId: redacted.parentId } : {}),
    ...(redacted.resourceId ? { resourceId: redacted.resourceId } : {}),
    ...(redacted.principalId ? { principalId: redacted.principalId } : {}),
    ...(redacted.externalId ? { externalId: redacted.externalId } : {}),
    ...(redacted.scopes ? { scopes: redacted.scopes } : {}),
    ...(redacted.guidance ? { guidance: redacted.guidance } : {}),
    ...(redacted.policy ? { policy: redacted.policy } : {}),
    ...(redacted.desired ? { desired: redacted.desired } : {}),
    ...(redacted.observed ? { observed: redacted.observed } : {}),
    ...(redacted.verification ? { verification: redacted.verification } : {}),
    ...(redacted.source ? { source: redacted.source } : {}),
    ...(redacted.updatedAt ? { updatedAt: redacted.updatedAt } : {}),
    fieldEntries: Object.entries(redacted.fields).map(([name, field]) => ({
      name,
      sensitivity: field.sensitivity,
      ...(field.value !== undefined ? { value: field.value } : {}),
      ...(field.redacted ? { redacted: true } : {}),
      ...(field.secretRef ? { binding: { present: true, scheme: field.secretRef.startsWith("vault://") ? "vault" : "secret" } } : {}),
      ...(field.guidance ? { guidance: field.guidance } : {}),
      ...(field.policy ? { policy: field.policy } : {}),
    })),
  };
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

function isProviderListPayload(value: unknown): value is { providers: ReturnType<typeof listProviders>; records: Array<ReturnType<typeof redactConnectorContextRecord>> } {
  return typeof value === "object" && value !== null && "providers" in value && "records" in value;
}

function isDoctorPayload(value: unknown): value is { report: ReturnType<typeof buildConnectorContextDoctorReport> } {
  return typeof value === "object" && value !== null && "report" in value;
}

function parseOptionalState(value: string | undefined): ConnectorGovernedContextRecord["state"] | undefined {
  if (!value) return undefined;
  if (value === "active" || value === "paused" || value === "blocked" || value === "retired") return value;
  throw new CliHandledError("invalid_context_state", "Use one of: active, paused, blocked, retired.", CLI_EXIT_USAGE);
}

function parseScopes(value: string | undefined) {
  if (!value) return undefined;
  return value.split(",").map(parseScope);
}

function parseScope(value: string) {
  const [kind, id] = value.split(":", 2);
  const allowed = new Set(["global", "workspace", "project", "app", "environment", "provider", "operation", "agent", "role"]);
  if (!allowed.has(kind)) throw new CliHandledError("invalid_context_scope", `Invalid scope ${value}.`, CLI_EXIT_USAGE);
  return { kind: kind as never, ...(id ? { id } : {}) };
}

function parsePolicy(effect: string, reason: string | undefined) {
  if (effect !== "allow" && effect !== "deny" && effect !== "requires_approval") {
    throw new CliHandledError("invalid_context_policy", "Use policy allow, deny, or requires_approval.", CLI_EXIT_USAGE);
  }
  return { effect, reason: reason || `Policy ${effect}` } as const;
}

function parseJsonObjectFlag(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new CliHandledError("invalid_json_object", "Expected a valid JSON object.", CLI_EXIT_USAGE);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CliHandledError("invalid_json_object", "Expected a JSON object.", CLI_EXIT_USAGE);
  }
  return parsed as Record<string, unknown>;
}

function parseSource(value: string | undefined): ConnectorGovernedContextRecord["source"] | undefined {
  if (!value) return undefined;
  if (value === "manual" || value === "imported" || value === "provider_readonly" || value === "fixture") return value;
  throw new CliHandledError("invalid_context_source", "Use source manual, imported, provider_readonly, or fixture.", CLI_EXIT_USAGE);
}

function parseExportMode(value: string | undefined): "redacted" | "private-envelope" {
  if (!value || value === "redacted") return "redacted";
  if (value === "private-envelope" || value === "private_envelope") return "private-envelope";
  throw new CliHandledError("invalid_export_mode", "Use export mode redacted or private-envelope.", CLI_EXIT_USAGE);
}

function parseNonNegativeIntegerFlag(value: string | undefined, name: string): number {
  if (value === undefined) return 50;
  const parsed = parseStrictDecimalIntegerFlag(value, { allowNegative: false });
  if (parsed === undefined) {
    throw new CliHandledError(`invalid_${name}`, `--${name} must be a non-negative integer.`, CLI_EXIT_USAGE);
  }
  return parsed;
}

function parseDefaultPriorityFlag(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = parseStrictDecimalIntegerFlag(value, { allowNegative: true });
  if (parsed === undefined) {
    throw new CliHandledError("invalid_context_default_priority", "--priority must be an integer.", CLI_EXIT_USAGE, {
      location: "cli.accounts.defaults.priority",
      details: { flag: "--priority", value },
    });
  }
  return parsed;
}

function parseStrictDecimalIntegerFlag(value: string, options: { allowNegative: boolean }): number | undefined {
  const decimalIntegerPattern = options.allowNegative ? /^-?[0-9]+$/ : /^[0-9]+$/;
  if (!decimalIntegerPattern.test(value)) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return undefined;
  return parsed;
}
