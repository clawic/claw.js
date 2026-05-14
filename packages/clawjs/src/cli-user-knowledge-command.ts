import type { RuntimeAdapterId, UserCompileProfile, UserDomainId, UserEntityType, UserFactSensitivity, UserPackId, UserRecordType } from "@clawjs/core";

import type { CliContext } from "./index.ts";
import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { joinedPositionals, parseCsvFlag, readBooleanFlag } from "./cli-flag-parsers.ts";
import { cliErrorFromUnknown, writeCliError, writeJson } from "./cli-json.ts";
import { createCliClaw } from "./cli-claw-factory.ts";
import { parseSoulModulesFromSetFlags, parseUserFactValue, parseUserFieldsFromSetFlags, parseUserMetadataFlags } from "./cli-value-utils.ts";

export async function runUserKnowledgeCli(input: {
  group: string | undefined;
  command: string | undefined;
  subcommand: string | undefined;
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
}): Promise<number | null> {
  const { group, command, subcommand, positionals, flags, argv, context, wantsJson, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId } = input;
if (group === "soul") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
  const targetSoulId = subcommand || flags.id;
  const targetAgentId = flags.agent || flags["agent-id"] || agentId;

  try {
    if (command === "init") {
      const modules = parseSoulModulesFromSetFlags(argv);
      const spec = claw.soul.init({
        id: targetSoulId || "default",
        title: flags.title,
        description: flags.description,
        presetId: flags.preset || flags["preset-id"],
        ...(Object.keys(modules).length ? { modules } : {}),
      });
      if (wantsJson) writeJson(context.stdout, spec);
      else context.stdout.write(`initialized soul ${spec.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "inspect") {
      const result = claw.soul.inspect(targetSoulId, flags.agent ? targetAgentId : undefined);
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(`${targetSoulId ? result.resolved?.title ?? "not found" : `${result.state.specs.length} souls`}\n`);
      return targetSoulId && !result.resolved ? CLI_EXIT_FAILURE : CLI_EXIT_OK;
    }

    if (command === "validate") {
      const spec = targetSoulId ? claw.soul.resolve({ soulId: targetSoulId }) : claw.soul.resolve({ agentId: targetAgentId });
      const result = claw.soul.validate(spec);
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(result.ok ? "valid\n" : `${result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}\n`);
      return result.ok ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
    }

    if (command === "preview") {
      const result = claw.soul.preview({
        ...(targetSoulId ? { soulId: targetSoulId } : {}),
        agentId: targetAgentId,
      });
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(result.markdown);
      return CLI_EXIT_OK;
    }

    if (command === "compile") {
      const result = claw.soul.compile({
        ...(targetSoulId ? { soulId: targetSoulId } : {}),
        agentId: targetAgentId,
      });
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(`compiled ${result.soulId} to ${result.targetFile}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "assign") {
      const soulId = targetSoulId || flags["soul-id"];
      if (!soulId || !targetAgentId) {
        context.stderr.write("Usage: claw soul assign <soul-id> --agent ID [--compile]\n");
        return CLI_EXIT_USAGE;
      }
      const assignment = claw.soul.assign({
        soulId,
        agentId: targetAgentId,
      });
      const compiled = readBooleanFlag(argv, flags, "compile", false)
        ? claw.soul.compile({ agentId: targetAgentId })
        : null;
      if (wantsJson) writeJson(context.stdout, { assignment, compiled });
      else context.stdout.write(`assigned ${assignment.soulId} to ${assignment.agentId}\n`);
      return CLI_EXIT_OK;
    }
  } catch (error) {
    context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return CLI_EXIT_FAILURE;
  }

  context.stderr.write("Usage: claw soul init|validate|preview|compile|assign|inspect ...\n");
  return CLI_EXIT_USAGE;
}

if (group === "user") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
  const targetUserId = flags.user || flags["user-id"];
  const targetAgentId = flags.agent || flags["agent-id"] || agentId;
  const metadata = parseUserMetadataFlags(flags);

  try {
    if (command === "init") {
      const user = claw.user.init({
        id: subcommand || targetUserId || "user",
        displayName: flags.name || flags["display-name"] || flags.title,
        ...(readBooleanFlag(argv, flags, "default", false) ? { isDefault: true } : {}),
      });
      if (wantsJson) writeJson(context.stdout, user);
      else context.stdout.write(`initialized user ${user.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "list") {
      const users = claw.user.list();
      if (wantsJson) writeJson(context.stdout, { users });
      else context.stdout.write(`${users.map((user) => `${user.id} ${user.displayName}${user.isDefault ? " default" : ""}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "get" || command === "inspect") {
      const id = subcommand || targetUserId;
      const result = command === "inspect"
        ? claw.user.inspect(id, flags.agent ? targetAgentId : undefined)
        : { user: id ? claw.user.get(id) : claw.user.resolve({ userId: targetUserId, agentId: flags.agent ? targetAgentId : undefined }) };
      if (wantsJson) writeJson(context.stdout, result);
      else if (command === "inspect") context.stdout.write(`${id ? (result as ReturnType<typeof claw.user.inspect>).resolved?.displayName ?? "not found" : `${(result as ReturnType<typeof claw.user.inspect>).state.specs.length} users`}\n`);
      else context.stdout.write(`${((result as { user: { id: string; displayName: string } | null }).user)?.id ?? "not found"}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "pack") {
      const action = subcommand || "list";
      const packId = (positionals[3] || flags.id || flags.pack) as UserPackId | undefined;
      if (action === "list") {
        const packs = claw.user.packs(targetUserId);
        if (wantsJson) writeJson(context.stdout, { packs });
        else context.stdout.write(`${packs.map((pack) => `${pack.enabled ? "*" : "-"} ${pack.id} v${pack.schemaVersion}`).join("\n")}\n`);
        return CLI_EXIT_OK;
      }
      if (!packId || (action !== "enable" && action !== "disable")) {
        context.stderr.write("Usage: claw user pack list|enable|disable [pack-id] [--user ID]\n");
        return CLI_EXIT_USAGE;
      }
      const pack = action === "enable"
        ? claw.user.enablePack({ userId: targetUserId, id: packId })
        : claw.user.disablePack({ userId: targetUserId, id: packId });
      if (wantsJson) writeJson(context.stdout, pack);
      else context.stdout.write(`${pack.enabled ? "enabled" : "disabled"} ${pack.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "domains") {
      const action = subcommand || "list";
      const domainId = (positionals[3] || flags.id || flags.domain) as UserDomainId | undefined;
      if (action === "list") {
        const domains = claw.user.domains(targetUserId);
        if (wantsJson) writeJson(context.stdout, { domains });
        else context.stdout.write(`${domains.map((domain) => `${domain.enabled ? "*" : "-"} ${domain.id} ${domain.sensitivity}`).join("\n")}\n`);
        return CLI_EXIT_OK;
      }
      if (action === "inspect") {
        const domains = claw.user.domains(targetUserId);
        const domain = domainId ? domains.find((entry) => entry.id === domainId) : domains;
        if (wantsJson) writeJson(context.stdout, domain);
        else context.stdout.write(`${Array.isArray(domain) ? domain.map((entry) => entry.id).join("\n") : domain ? `${domain.id} ${domain.pack}` : "not found"}\n`);
        return domain ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
      }
      if (!domainId || (action !== "enable" && action !== "disable")) {
        context.stderr.write("Usage: claw user domains list|enable|disable|inspect [domain-id] [--user ID]\n");
        return CLI_EXIT_USAGE;
      }
      const domain = action === "enable" ? claw.user.enableDomain({ userId: targetUserId, id: domainId }) : claw.user.disableDomain({ userId: targetUserId, id: domainId });
      if (wantsJson) writeJson(context.stdout, domain);
      else context.stdout.write(`${domain.enabled ? "enabled" : "disabled"} ${domain.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "wizard") {
      const domain = (subcommand || flags.domain) as UserPackId | UserDomainId | undefined;
      const title = flags.title || joinedPositionals(positionals, 3);
      if (!domain || !title) {
        context.stderr.write("Usage: claw user wizard <domain> --title TEXT [--set key=value ...] [--user ID]\n");
        return CLI_EXIT_USAGE;
      }
      const proposal = claw.user.wizard({
        userId: targetUserId,
        domain,
        title,
        fields: parseUserFieldsFromSetFlags(argv),
        ...metadata,
      });
      if (wantsJson) writeJson(context.stdout, proposal);
      else context.stdout.write(`proposed ${proposal.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "entity") {
      const action = subcommand || "list";
      if (action === "list") {
        const entities = claw.user.listEntities({
          userId: targetUserId,
          ...(flags.type ? { type: flags.type as UserEntityType } : {}),
        });
        if (wantsJson) writeJson(context.stdout, { entities });
        else context.stdout.write(`${entities.map((entity) => `${entity.id} ${entity.type} ${entity.title}`).join("\n")}\n`);
        return CLI_EXIT_OK;
      }
      if (action === "get") {
        const entityId = positionals[3] || flags.id;
        if (!entityId) {
          context.stderr.write("Usage: claw user entity get <id> [--user ID]\n");
          return CLI_EXIT_USAGE;
        }
        const entity = claw.user.getEntity(entityId, targetUserId);
        if (wantsJson) writeJson(context.stdout, entity);
        else context.stdout.write(`${entity?.id ?? "not found"}\n`);
        return entity ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
      }
      if (action === "add") {
        const type = (positionals[3] || flags.type) as UserEntityType | undefined;
        const title = flags.title || joinedPositionals(positionals, 4);
        if (!type || !title) {
          context.stderr.write("Usage: claw user entity add <entity-type> --title TEXT [--set key=value ...] [--user ID]\n");
          return CLI_EXIT_USAGE;
        }
        const entity = claw.user.addEntity({
          userId: targetUserId,
          type,
          title,
          fields: parseUserFieldsFromSetFlags(argv),
          ...metadata,
        });
        if (wantsJson) writeJson(context.stdout, entity);
        else context.stdout.write(`added ${entity.type} ${entity.id}\n`);
        return CLI_EXIT_OK;
      }
      context.stderr.write("Usage: claw user entity add|get|list ...\n");
      return CLI_EXIT_USAGE;
    }

    if (command === "link") {
      const from = subcommand || flags.from;
      const relation = positionals[3] || flags.relation;
      const to = positionals[4] || flags.to;
      if (!from || !relation || !to) {
        context.stderr.write("Usage: claw user link <from-entity-id> <relation> <to-entity-id> [--user ID]\n");
        return CLI_EXIT_USAGE;
      }
      const link = claw.user.link({
        userId: targetUserId,
        from,
        relation,
        to,
        ...metadata,
      });
      if (wantsJson) writeJson(context.stdout, link);
      else context.stdout.write(`linked ${link.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "query") {
      const result = claw.user.query({
        userId: targetUserId,
        ...(flags.domain ? { domain: flags.domain as UserPackId | UserDomainId } : {}),
        ...(flags.type ? { type: flags.type } : {}),
        ...(flags.status ? { status: flags.status } : {}),
        ...(flags.sensitivity ? { sensitivity: flags.sensitivity as UserFactSensitivity } : {}),
        ...(flags.source ? { source: flags.source } : {}),
        ...(flags.date ? { date: flags.date } : {}),
        ...(flags.text ? { text: flags.text } : {}),
      });
      if (wantsJson) writeJson(context.stdout, result);
      else {
        const rows = [
          ...result.facts.map((fact) => `fact ${fact.facet}.${fact.key} ${JSON.stringify(fact.value)}`),
          ...result.records.map((record) => `record ${record.type} ${record.id} ${record.title}`),
          ...result.customFacts.map((fact) => `custom ${fact.id} ${fact.title}`),
          ...result.proposals.map((proposal) => `proposal ${proposal.status} ${proposal.id}`),
          ...result.entities.map((entity) => `entity ${entity.type} ${entity.id} ${entity.title}`),
          ...result.links.map((link) => `link ${link.id} ${link.from} ${link.relation} ${link.to}`),
        ];
        context.stdout.write(`${rows.join("\n")}\n`);
      }
      return CLI_EXIT_OK;
    }

    if (command === "review") {
      const action = subcommand || "list";
      const proposalId = positionals[3] || flags.id;
      if (action === "list") {
        const proposals = claw.user.review.list({ userId: targetUserId, ...(flags.status ? { status: flags.status as "pending" | "verified" | "rejected" } : {}) });
        if (wantsJson) writeJson(context.stdout, { proposals });
        else context.stdout.write(`${proposals.map((proposal) => `${proposal.status} ${proposal.id} ${proposal.title ?? proposal.path ?? proposal.recordType ?? proposal.kind}`).join("\n")}\n`);
        return CLI_EXIT_OK;
      }
      if (!proposalId && action !== "approve-many") {
        context.stderr.write("Usage: claw user review list|show|approve|reject|edit|approve-many [proposal-id]\n");
        return CLI_EXIT_USAGE;
      }
      if (action === "show") {
        const proposal = claw.user.review.show(proposalId, targetUserId);
        if (wantsJson) writeJson(context.stdout, proposal);
        else context.stdout.write(`${proposal.status} ${proposal.id}\n`);
        return CLI_EXIT_OK;
      }
      if (action === "approve") {
        const proposal = claw.user.review.approve(proposalId, targetUserId);
        if (wantsJson) writeJson(context.stdout, proposal);
        else context.stdout.write(`approved ${proposal.id}\n`);
        return CLI_EXIT_OK;
      }
      if (action === "reject") {
        const proposal = claw.user.review.reject(proposalId, targetUserId, flags.reason || flags.notes);
        if (wantsJson) writeJson(context.stdout, proposal);
        else context.stdout.write(`rejected ${proposal.id}\n`);
        return CLI_EXIT_OK;
      }
      if (action === "edit") {
        const patch = {
          ...(flags.path ? { path: flags.path } : {}),
          ...(flags.value !== undefined ? { value: parseUserFactValue(flags.value, "proposal value") } : {}),
          ...(flags["record-type"] || flags.type ? { recordType: (flags["record-type"] || flags.type) as UserRecordType } : {}),
          ...(flags.title ? { title: flags.title } : {}),
          ...(flags.domain ? { domain: flags.domain as UserDomainId } : {}),
          ...(flags.source ? { source: flags.source } : {}),
          ...(flags.sensitivity ? { sensitivity: flags.sensitivity as UserFactSensitivity } : {}),
          ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
          ...(flags.notes ? { notes: flags.notes } : {}),
          ...(flags.visibility ? { visibility: flags.visibility as "agent" | "public" | "private" } : {}),
          ...(argv.includes("--set") ? { fields: parseUserFieldsFromSetFlags(argv) } : {}),
        };
        const proposal = claw.user.review.edit(proposalId, patch, targetUserId);
        if (wantsJson) writeJson(context.stdout, proposal);
        else context.stdout.write(`edited ${proposal.id}\n`);
        return CLI_EXIT_OK;
      }
      if (action === "approve-many") {
        const ids = parseCsvFlag(flags.ids || joinedPositionals(positionals, 3));
        if (ids.length === 0) {
          context.stderr.write("Usage: claw user review approve-many <id,id> [--user ID]\n");
          return CLI_EXIT_USAGE;
        }
        const proposals = claw.user.review.approveMany(ids, targetUserId);
        if (wantsJson) writeJson(context.stdout, { proposals });
        else context.stdout.write(`${proposals.map((proposal) => `approved ${proposal.id}`).join("\n")}\n`);
        return CLI_EXIT_OK;
      }
      context.stderr.write("Usage: claw user review list|show|approve|reject|edit|approve-many [proposal-id]\n");
      return CLI_EXIT_USAGE;
    }

    if (command === "classify") {
      const text = subcommand || flags.text || joinedPositionals(positionals, 2);
      if (!text) {
        context.stderr.write("Usage: claw user classify <text>\n");
        return CLI_EXIT_USAGE;
      }
      const result = claw.user.classify(text);
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(`${result.target} ${result.confidence} ${result.reason}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "extract") {
      const action = subcommand;
      const source = flags.source || flags.text || joinedPositionals(positionals, 3);
      if (action !== "memory" || !source) {
        context.stderr.write("Usage: claw user extract memory --source TEXT [--user ID]\n");
        return CLI_EXIT_USAGE;
      }
      const proposals = claw.user.extractMemory({ userId: targetUserId, source });
      if (wantsJson) writeJson(context.stdout, { proposals });
      else context.stdout.write(`${proposals.map((proposal) => `proposed ${proposal.id}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "merge") {
      const action = subcommand || "propose";
      if (action === "propose") {
        const proposals = claw.user.merge.propose({ userId: targetUserId, ...(flags.source || flags.from ? { sourceId: flags.source || flags.from } : {}), ...(flags.target || flags.to ? { targetId: flags.target || flags.to } : {}) });
        if (wantsJson) writeJson(context.stdout, { proposals });
        else context.stdout.write(`${proposals.map((proposal) => `merge ${proposal.id} ${proposal.sourceId} -> ${proposal.targetId}`).join("\n")}\n`);
        return CLI_EXIT_OK;
      }
      const mergeId = positionals[3] || flags.id;
      if (!mergeId || (action !== "approve" && action !== "reject")) {
        context.stderr.write("Usage: claw user merge propose|approve|reject [merge-id]\n");
        return CLI_EXIT_USAGE;
      }
      const proposal = action === "approve" ? claw.user.merge.approve(mergeId, targetUserId) : claw.user.merge.reject(mergeId, targetUserId);
      if (wantsJson) writeJson(context.stdout, proposal);
      else context.stdout.write(`${proposal.status} ${proposal.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "set") {
      const factPath = subcommand || flags.path;
      const value = parseUserFactValue(flags.value ?? joinedPositionals(positionals, 3), "user value");
      if (!factPath) {
        context.stderr.write("Usage: claw user set <facet.key> <value> [--user ID]\n");
        return CLI_EXIT_USAGE;
      }
      const fact = claw.user.set({
        userId: targetUserId,
        path: factPath,
        value,
        ...metadata,
      });
      if (wantsJson) writeJson(context.stdout, fact);
      else context.stdout.write(`set ${factPath}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "add") {
      const type = (subcommand || flags.type) as UserRecordType | undefined;
      const title = flags.title || joinedPositionals(positionals, 3);
      if (!type || !title) {
        context.stderr.write("Usage: claw user add <record-type> --title TEXT [--set key=value ...] [--user ID]\n");
        return CLI_EXIT_USAGE;
      }
      const record = claw.user.add({
        userId: targetUserId,
        type,
        title,
        fields: parseUserFieldsFromSetFlags(argv),
        ...metadata,
      });
      if (wantsJson) writeJson(context.stdout, record);
      else context.stdout.write(`added ${record.type} ${record.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "supersede") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw user supersede <id> [--value VALUE|--title TEXT --set key=value]\n");
        return CLI_EXIT_USAGE;
      }
      const result = claw.user.supersede(id, {
        userId: targetUserId,
        ...(flags.value !== undefined ? { value: parseUserFactValue(flags.value, "replacement value") } : {}),
        ...(flags.title ? { title: flags.title } : {}),
        ...(argv.includes("--set") ? { fields: parseUserFieldsFromSetFlags(argv) } : {}),
        ...(flags.notes ? { notes: flags.notes } : {}),
        ...(flags["valid-from"] ? { validFrom: flags["valid-from"] } : {}),
        ...(flags.visibility ? { visibility: flags.visibility as "agent" | "public" | "private" } : {}),
      });
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(`superseded ${id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "propose") {
      const proposalPath = subcommand || flags.path;
      const recordType = flags["record-type"] || flags.type;
      const value = flags.value !== undefined || positionals[3] !== undefined ? parseUserFactValue(flags.value ?? joinedPositionals(positionals, 3), "proposal value") : undefined;
      const proposal = claw.user.propose({
        userId: targetUserId,
        ...(proposalPath ? { path: proposalPath } : {}),
        ...(value !== undefined ? { value } : {}),
        ...(recordType ? { recordType: recordType as UserRecordType } : {}),
        ...(flags.title ? { title: flags.title } : {}),
        fields: parseUserFieldsFromSetFlags(argv),
        ...metadata,
      });
      if (wantsJson) writeJson(context.stdout, proposal);
      else context.stdout.write(`proposed ${proposal.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "verify") {
      const proposalId = subcommand || flags.id;
      if (!proposalId) {
        context.stderr.write("Usage: claw user verify <proposal-id> [--user ID]\n");
        return CLI_EXIT_USAGE;
      }
      const proposal = claw.user.verify(proposalId, targetUserId);
      if (wantsJson) writeJson(context.stdout, proposal);
      else context.stdout.write(`verified ${proposal.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw user delete <id> [--user ID]\n");
        return CLI_EXIT_USAGE;
      }
      const result = claw.user.delete(id, targetUserId);
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(`${result.deleted ? "deleted" : "not found"} ${result.id}\n`);
      return result.deleted ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
    }

    if (command === "validate") {
      const spec = claw.user.resolve({ userId: subcommand || targetUserId, agentId: flags.agent ? targetAgentId : undefined });
      const result = claw.user.validate(spec);
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(result.ok ? "valid\n" : `${result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}\n`);
      return result.ok ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
    }

    if (command === "preview") {
      const result = claw.user.preview({
        userId: subcommand || targetUserId,
        agentId: targetAgentId,
        ...(flags.profile ? { profile: flags.profile as UserCompileProfile } : {}),
      });
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(result.markdown);
      return CLI_EXIT_OK;
    }

    if (command === "compile") {
      const result = claw.user.compile({
        userId: subcommand || targetUserId,
        agentId: targetAgentId,
        ...(flags.profile ? { profile: flags.profile as UserCompileProfile } : {}),
      });
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(`compiled ${result.userId} to ${result.targetFile}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "assign") {
      const userId = subcommand || targetUserId;
      if (!userId || !targetAgentId) {
        context.stderr.write("Usage: claw user assign <user-id> --agent ID [--compile]\n");
        return CLI_EXIT_USAGE;
      }
      const assignment = claw.user.assign({ userId, agentId: targetAgentId });
      const compiled = readBooleanFlag(argv, flags, "compile", false)
        ? claw.user.compile({ agentId: targetAgentId })
        : null;
      if (wantsJson) writeJson(context.stdout, { assignment, compiled });
      else context.stdout.write(`assigned ${assignment.userId} to ${assignment.agentId}\n`);
      return CLI_EXIT_OK;
    }
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) writeCliError(context.stdout, handled);
    else context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }

  context.stderr.write("Usage: claw user init|set|add|propose|verify|review|domains|pack|wizard|entity|link|query|delete|list|get|inspect|validate|preview|compile|assign\n");
  return CLI_EXIT_USAGE;
}
  return null;
}
