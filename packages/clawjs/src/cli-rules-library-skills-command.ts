import type { RuntimeAdapterId } from "@clawjs/core";

import type { CliContext } from "./index.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { parseCsvFlag, readBooleanFlag } from "./cli-flag-parsers.ts";
import { cliErrorFromUnknown, writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import { createCliClaw } from "./cli-claw-factory.ts";
import { parseRuleReferences } from "./cli-rule-utils.ts";
import { parseSkillParamsFlag, parseSkillScopeFlag, readAllStdin } from "./cli-value-utils.ts";

export async function runRulesLibrarySkillsCli(input: {
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
  const writeSurfaceJson = (payload: unknown) => {
    const canonicalCommand = group === "init-skills-builtins" ? "skills" : group ?? "skills";
    writeCommandJsonOk(context.stdout, canonicalCommand, payload, {
      invokedCommand: group ?? canonicalCommand,
      subcommand: command ?? null,
      ...(subcommand ? { operation: subcommand } : {}),
    });
  };
  const writeSurfaceJsonError = (error: unknown) => {
    const canonicalCommand = group === "init-skills-builtins" ? "skills" : group ?? "skills";
    writeCommandJsonError(context.stdout, canonicalCommand, error, {
      invokedCommand: group ?? canonicalCommand,
      subcommand: command ?? null,
      ...(subcommand ? { operation: subcommand } : {}),
    });
  };
if (group === "rules") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
  const scopeId = flags.scope || flags["scope-id"];

  try {
    if (command === "status") {
      const status = claw.rules.status();
      if (wantsJson) writeSurfaceJson(status);
      else context.stdout.write(`rules ${status.rules} active ${status.active} pending ${status.pending}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "list") {
      const rules = claw.rules.list({
        ...(flags.status ? { status: flags.status as "pending" | "active" | "archived" } : {}),
        ...(scopeId ? { scopeId } : {}),
      });
      if (wantsJson) writeSurfaceJson({ rules });
      else context.stdout.write(`${rules.map((rule) => `${rule.status} ${rule.kind} ${rule.id} ${rule.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "get" || command === "inspect") {
      const id = subcommand || flags.id;
      const rule = id ? claw.rules.get(id) : null;
      if (!rule) throw new CliHandledError("not_found", `Rule not found: ${id ?? ""}`, CLI_EXIT_FAILURE);
      if (wantsJson) writeSurfaceJson(rule);
      else context.stdout.write(`${rule.status} ${rule.kind} ${rule.id}\n${rule.content}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "scopes") {
      if (flags.name || flags.kind || flags.id) {
        if (!flags.name || !flags.kind) {
          context.stderr.write("Usage: claw rules scopes --id ID --kind KIND --name TEXT [--parent ID] [--aliases a,b]\n");
          return CLI_EXIT_USAGE;
        }
        const scope = claw.rules.upsertScope({
          id: flags.id,
          kind: flags.kind,
          name: flags.name,
          parentId: flags.parent,
          aliases: parseCsvFlag(flags.aliases),
        });
        if (wantsJson) writeSurfaceJson(scope);
        else context.stdout.write(`scope ${scope.id}\n`);
        return CLI_EXIT_OK;
      }
      const scopes = claw.rules.scopes();
      if (wantsJson) writeSurfaceJson({ scopes });
      else context.stdout.write(`${scopes.map((scope) => `${scope.kind} ${scope.id} ${scope.name}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "propose") {
      if (!scopeId || !flags.title || !flags.content) {
        context.stderr.write("Usage: claw rules propose --scope ID --title TEXT --content TEXT [--kind directive|default|resource]\n");
        return CLI_EXIT_USAGE;
      }
      const rule = claw.rules.propose({
        id: flags.id,
        title: flags.title,
        kind: (flags.kind as "directive" | "default" | "resource" | undefined) ?? "directive",
        status: (flags.status as "pending" | "active" | "archived" | undefined) ?? "pending",
        scopeId,
        content: flags.content,
        aliases: parseCsvFlag(flags.aliases),
        priority: parseIntegerFlag(flags.priority, "priority", "invalid_rules_priority", "cli.rules.priority"),
        key: flags.key,
        references: parseRuleReferences(flags.reference || flags.references),
        agentIds: parseCsvFlag(flags.agent || flags.agents),
        channelIds: parseCsvFlag(flags.channel || flags.channels),
        applyWhen: {
          keywords: parseCsvFlag(flags.keywords),
          taskTypes: parseCsvFlag(flags["task-types"] || flags.task),
          outputFormats: parseCsvFlag(flags["output-formats"] || flags.output),
          domains: parseCsvFlag(flags.domains || flags.domain),
          services: parseCsvFlag(flags.services || flags.service),
          projects: parseCsvFlag(flags.projects || flags.project),
          agents: parseCsvFlag(flags.agents),
          channels: parseCsvFlag(flags.channels),
        },
        source: flags.source,
      });
      if (wantsJson) writeSurfaceJson(rule);
      else context.stdout.write(`proposed ${rule.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "approve" || command === "archive") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw rules ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const rule = command === "approve" ? claw.rules.approve(id) : claw.rules.archive(id);
      if (wantsJson) writeSurfaceJson(rule);
      else context.stdout.write(`${rule.status} ${rule.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "compile") {
      const prompt = subcommand || flags.prompt || flags.text || "";
      if (!prompt.trim()) {
        context.stderr.write("Usage: claw rules compile <prompt> [--brand BRAND] [--output-format website] [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const limit = parsePositiveIntegerFlag(flags.limit, "limit", "invalid_rules_compile_limit", "cli.rules.limit");
      const result = claw.rules.compile({
        prompt,
        user: flags.user,
        organization: flags.organization || flags.org,
        brand: flags.brand,
        client: flags.client,
        project: flags.project,
        domain: flags.domain,
        service: flags.service,
        taskType: flags["task-type"] || flags.task,
        outputFormat: flags["output-format"] || flags.output,
        agent: flags.agent,
        channel: flags.channel,
        ...(limit !== undefined ? { limit } : {}),
      });
      if (wantsJson) writeSurfaceJson(result);
      else context.stdout.write(result.prompt ? `${result.prompt}\n` : "No applicable rules.\n");
      return CLI_EXIT_OK;
    }
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) writeSurfaceJsonError(handled);
    else context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }

  context.stderr.write("Usage: claw rules status|list|get|propose|approve|archive|scopes|compile\n");
  return CLI_EXIT_USAGE;
}

if (group === "library") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const targetAgentId = flags.agent || agentId;
  const targetWorkspaceId = flags.workspaceId || flags["workspace-id"] || workspaceId;
  const tags = parseCsvFlag(flags.tags);
  const requiredSecrets = parseCsvFlag(flags["required-secret"] || flags["required-secrets"]).map((name) => ({ name }));
  const availableSecrets = parseCsvFlag(flags.secret || flags.secrets);

  try {
    if (command === "list") {
      const assets = claw.library.list();
      if (wantsJson) writeSurfaceJson({ assets });
      else context.stdout.write(`${assets.map((asset) => `${asset.kind} ${asset.id} ${asset.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "inspect") {
      const asset = subcommand ? claw.library.get(subcommand) : null;
      if (!asset) throw new CliHandledError("not_found", `Library asset not found: ${subcommand ?? ""}`, CLI_EXIT_FAILURE);
      if (wantsJson) writeSurfaceJson(asset);
      else context.stdout.write(`${asset.kind} ${asset.id}\n${asset.title}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "create") {
      const id = subcommand || flags.id;
      const kind = flags.kind as "skill" | "instruction" | "bundle" | undefined;
      if (!kind || !["skill", "instruction", "bundle"].includes(kind)) {
        context.stderr.write("Usage: claw library create <id> --kind skill|instruction|bundle [--title TEXT] [--content TEXT] [--projection agents|soul|identity|tools] [--ref REF] [--assets a,b]\n");
        return CLI_EXIT_USAGE;
      }
      const asset = claw.library.create({
        ...(id ? { id } : {}),
        kind,
        title: flags.title,
        description: flags.description,
        tags,
        version: flags.version,
        requiredSecrets,
        autoApplyTags: parseCsvFlag(flags["auto-apply-tags"]),
        ...(flags["context-capsule"] ? {
          context: {
            capsule: flags["context-capsule"],
            priority: parseIntegerFlag(flags["context-priority"], "context-priority", "invalid_library_context_priority", "cli.library.contextPriority") ?? 100,
            ...(flags["context-read-when"] ? { readWhen: parseCsvFlag(flags["context-read-when"]) } : {}),
          },
        } : {}),
        ...(kind === "skill" ? { source: { source: flags.source, installRef: flags.ref, path: flags.path } } : {}),
        ...(kind === "instruction" ? {
          content: flags.content ?? "",
          projection: {
            target: (flags.projection || "agents") as "soul" | "identity" | "agents" | "tools" | "heartbeat" | "user",
            ...(flags["block-id"] ? { blockId: flags["block-id"] } : {}),
          },
        } : {}),
        ...(kind === "bundle" ? { bundleAssetIds: parseCsvFlag(flags.assets) } : {}),
      });
      if (wantsJson) writeSurfaceJson(asset);
      else context.stdout.write(`created ${asset.kind} ${asset.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw library update <id> [--title TEXT] [--content TEXT] [--tags a,b]\n");
        return CLI_EXIT_USAGE;
      }
      const asset = claw.library.update(id, {
        ...(flags.title !== undefined ? { title: flags.title } : {}),
        ...(flags.description !== undefined ? { description: flags.description } : {}),
        ...(flags.tags !== undefined ? { tags } : {}),
        ...(flags.version !== undefined ? { version: flags.version } : {}),
        ...(flags["context-capsule"] !== undefined ? {
          context: {
            capsule: flags["context-capsule"],
            priority: parseIntegerFlag(flags["context-priority"], "context-priority", "invalid_library_context_priority", "cli.library.contextPriority") ?? 100,
            ...(flags["context-read-when"] ? { readWhen: parseCsvFlag(flags["context-read-when"]) } : {}),
          },
        } : {}),
        ...(flags.content !== undefined ? { content: flags.content } : {}),
        ...(flags["required-secret"] !== undefined || flags["required-secrets"] !== undefined ? { requiredSecrets } : {}),
        ...(flags["auto-apply-tags"] !== undefined ? { autoApplyTags: parseCsvFlag(flags["auto-apply-tags"]) } : {}),
        ...(flags.assets !== undefined ? { bundleAssetIds: parseCsvFlag(flags.assets) } : {}),
      });
      if (wantsJson) writeSurfaceJson(asset);
      else context.stdout.write(`updated ${asset.kind} ${asset.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "remove") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw library remove <id>\n");
        return CLI_EXIT_USAGE;
      }
      const removed = claw.library.remove(id);
      if (wantsJson) writeSurfaceJson({ removed });
      else context.stdout.write(`${removed ? "removed" : "not found"} ${id}\n`);
      return removed ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }

    if (command === "import-skill") {
      const ref = subcommand || flags.ref || "";
      const asset = claw.library.importSkill(ref, {
        id: flags.id,
        title: flags.title,
        source: flags.source,
        path: flags.path,
        tags,
        ...(flags["context-capsule"] ? {
          context: {
            capsule: flags["context-capsule"],
            priority: parseIntegerFlag(flags["context-priority"], "context-priority", "invalid_library_context_priority", "cli.library.contextPriority") ?? 100,
            ...(flags["context-read-when"] ? { readWhen: parseCsvFlag(flags["context-read-when"]) } : {}),
          },
        } : {}),
      });
      if (wantsJson) writeSurfaceJson(asset);
      else context.stdout.write(`imported skill ${asset.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "assign" || command === "unassign") {
      const assetId = subcommand || flags.id;
      const assignmentWorkspaceId = flags["target-workspace"];
      const targetId = flags.agent || assignmentWorkspaceId || "";
      if (!assetId || !targetId) {
        context.stderr.write(`Usage: claw library ${command} <asset> --agent ID|--target-workspace ID [--exclude]\n`);
        return CLI_EXIT_USAGE;
      }
      const payload = {
        assetId,
        scope: assignmentWorkspaceId ? "workspace" as const : "agent" as const,
        targetId,
        mode: readBooleanFlag(argv, flags, "exclude", false) ? "exclude" as const : "include" as const,
      };
      const result = command === "assign" ? claw.library.assign(payload) : claw.library.unassign(payload);
      if (wantsJson) writeSurfaceJson(result);
      else context.stdout.write(`${command === "assign" ? "assigned" : "unassigned"} ${assetId}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "resolve" || command === "sync") {
      const input = {
        agentId: targetAgentId,
        workspaceId: targetWorkspaceId,
        tags,
        availableSecrets,
        ...(readBooleanFlag(argv, flags, "allow-missing-secrets", false) ? { allowMissingSecrets: true } : {}),
      };
      if (command === "sync") {
        const result = await claw.library.sync(input);
        if (wantsJson) writeSurfaceJson(result);
        else context.stdout.write(`synced ${result.resolved.assets.length} library assets\n`);
      } else {
        const result = claw.library.resolve(input);
        if (wantsJson) writeSurfaceJson(result);
        else context.stdout.write(`${result.assets.map((asset) => `${asset.kind} ${asset.id}`).join("\n")}\n`);
      }
      return CLI_EXIT_OK;
    }
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) writeSurfaceJsonError(handled);
    else context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }

  context.stderr.write("Usage: claw library list|inspect|create|update|remove|import-skill|assign|unassign|resolve|sync\n");
  return CLI_EXIT_USAGE;
}

if (group === "skills" && command === "list") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const filter: { kinds?: ("personality" | "procedure" | "snippet" | "role")[]; scope?: "global" | "project" | "tag" | "session"; tags?: string[]; builtin?: boolean } = {};
  if (flags.kind) filter.kinds = [flags.kind as "personality" | "procedure" | "snippet" | "role"];
  if (flags.scope) filter.scope = flags.scope as "global" | "project" | "tag" | "session";
  if (flags.tag) filter.tags = String(flags.tag).split(",").map((t) => t.trim()).filter(Boolean);
  const skills = claw.skills.listV2(filter);
  if (wantsJson) writeSurfaceJson(skills);
  else context.stdout.write(`${skills.map((entry) => `${entry.kind}\t${entry.slug}\t${entry.name}`).join("\n")}\n`);
  return skills.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "skills" && (command === "view" || command === "show") && subcommand) {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const spec = claw.skills.get(subcommand);
  if (!spec) {
    context.stderr.write(`Skill not found: ${subcommand}\n`);
    return CLI_EXIT_FAILURE;
  }
  if (wantsJson) writeSurfaceJson(spec);
  else context.stdout.write(`${spec.kind} ${spec.slug}\n${spec.name}\n${spec.description}\n\n${spec.body}\n`);
  return CLI_EXIT_OK;
}

if (group === "skills" && command === "create" && subcommand) {
  const slug = subcommand;
  const kind = (flags.kind || "procedure") as "personality" | "procedure" | "snippet" | "role";
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  let body = flags.body || flags.content;
  if (!body && readBooleanFlag(argv, flags, "from-stdin", false)) {
    body = await readAllStdin(process.stdin);
  }
  const tags = flags.tags ? flags.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
  const syncTo = flags["sync-to"] ? flags["sync-to"].split(",").map((t) => t.trim()).filter(Boolean) : undefined;
  const spec = claw.skills.create({
    slug,
    kind,
    name: flags.name,
    description: flags.description,
    body,
    tags,
    syncTo,
  });
  if (wantsJson) writeSurfaceJson(spec);
  else context.stdout.write(`created ${spec.kind}/${spec.slug}\n`);
  return CLI_EXIT_OK;
}

if (group === "skills" && command === "remove" && subcommand) {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const ok = claw.skills.removeV2(subcommand);
  if (wantsJson) writeSurfaceJson({ removed: ok });
  else context.stdout.write(ok ? `removed ${subcommand}\n` : `not found: ${subcommand}\n`);
  return ok ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (group === "skills" && command === "activate" && subcommand) {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const scope = parseSkillScopeFlag(flags.scope || "global");
  const assignment = claw.skills.activate(subcommand, scope);
  if (wantsJson) writeSurfaceJson(assignment);
  else context.stdout.write(`activated ${subcommand} scope=${scope.kind}\n`);
  return CLI_EXIT_OK;
}

if (group === "skills" && command === "deactivate" && subcommand) {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const scope = parseSkillScopeFlag(flags.scope || "global");
  const removed = claw.skills.deactivate(subcommand, scope);
  if (wantsJson) writeSurfaceJson({ removed });
  else context.stdout.write(removed ? `deactivated ${subcommand}\n` : `not active: ${subcommand}\n`);
  return removed ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

if (group === "skills" && command === "compile") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const slugs = (flags.slugs ? flags.slugs.split(",") : positionals.slice(2)).map((s) => s.trim()).filter(Boolean);
  const slugList = slugs.length > 0 ? slugs : claw.skills.resolveActive({ projectId: flags.project, sessionId: flags.session }).map((s) => s.slug);
  const text = claw.skills.compile(slugList);
  if (wantsJson) writeSurfaceJson({ slugs: slugList, prompt: text });
  else context.stdout.write(`${text}\n`);
  return CLI_EXIT_OK;
}

if (group === "skills" && command === "instantiate" && subcommand) {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const params = parseSkillParamsFlag(flags.params);
  const spec = claw.skills.instantiate(subcommand, params, {
    saveAs: flags["save-as"],
    freeze: readBooleanFlag(argv, flags, "freeze", false),
  });
  if (wantsJson) writeSurfaceJson(spec);
  else context.stdout.write(`instantiated ${spec.slug} (template=${subcommand})\n`);
  return CLI_EXIT_OK;
}

if (group === "skills" && command === "freeze" && subcommand) {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const spec = claw.skills.freeze(subcommand);
  if (wantsJson) writeSurfaceJson(spec);
  else context.stdout.write(`frozen ${spec.slug}\n`);
  return CLI_EXIT_OK;
}

if (group === "skills" && (command === "init-builtins" || command === "init")) {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const report = claw.skills.initBuiltins();
  if (wantsJson) writeSurfaceJson(report);
  else context.stdout.write(`personalities=${report.personalitiesCreated} procedures=${report.proceduresCreated} skipped=${report.skipped}\n`);
  return CLI_EXIT_OK;
}

if (group === "init-skills-builtins") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const report = claw.skills.initBuiltins();
  if (wantsJson) writeSurfaceJson(report);
  else context.stdout.write(`personalities=${report.personalitiesCreated} procedures=${report.proceduresCreated} skipped=${report.skipped}\n`);
  return CLI_EXIT_OK;
}

if (group === "skills" && command === "import") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const dirs = flags.from ? [flags.from] : flags.dirs ? flags.dirs.split(",").map((d) => d.trim()).filter(Boolean) : undefined;
  const report = await claw.skills.importExternal({ dirs });
  if (wantsJson) writeSurfaceJson(report);
  else context.stdout.write(`imported=${report.imported.length} skipped=${report.skipped.length} warnings=${report.warnings.length}\n`);
  return CLI_EXIT_OK;
}

if (group === "skills" && command === "sources") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const sources = await claw.skills.sources();
  if (wantsJson) {
    writeSurfaceJson(sources);
  } else {
    context.stdout.write(`${sources.map((entry) => {
      const caps = Object.entries(entry.capabilities)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
        .join(",");
      return `${entry.status === "ready" ? "*" : "-"} ${entry.id} ${entry.status}${caps ? ` ${caps}` : ""}`;
    }).join("\n")}\n`);
  }
  return sources.some((entry) => entry.status === "ready") ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "skills" && command === "search") {
  const query = flags.query;
  if (!query) {
    context.stderr.write("--query is required\n");
    return CLI_EXIT_USAGE;
  }
  const limit = parsePositiveIntegerFlag(flags.limit, "limit", "invalid_skills_search_limit");
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const result = await claw.skills.search(query, {
    source: flags.source,
    ...(limit !== undefined ? { limit } : {}),
  });
  if (wantsJson) {
    writeSurfaceJson(result);
  } else {
    if (result.entries.length === 0) {
      context.stdout.write("no matches\n");
    } else {
      context.stdout.write(`${result.entries.map((entry) => {
        const summary = entry.summary ? ` ${entry.summary}` : "";
        return `${entry.source}:${entry.slug} ${entry.label}${summary}`;
      }).join("\n")}\n`);
    }
    if (result.omittedSources?.length) {
      context.stdout.write(`${result.omittedSources.map((entry) => `omitted ${entry.source}: ${entry.reason}`).join("\n")}\n`);
    }
  }
  return result.entries.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "skills" && (command === "sync" || command === "inspect")) {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  if (command === "sync") {
    const targets = flags.target && flags.target !== "all" ? flags.target.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
    const report = await claw.skills.syncV2({ targets });
    if (wantsJson) writeSurfaceJson(report);
    else context.stdout.write(`synced=${report.synced.length} removed=${report.removed.length} warnings=${report.warnings.length}\n`);
    return CLI_EXIT_OK;
  }
  const skills = claw.skills.listV2();
  if (wantsJson) {
    writeSurfaceJson(skills);
  } else {
    context.stdout.write(`${skills.map((entry) => entry.slug).join("\n")}\n`);
  }
  return skills.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "skills" && command === "install") {
  const ref = subcommand;
  if (!ref) {
    context.stderr.write("Usage: claw skills install <ref> [--source clawhub|skills.sh] [--json]\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const result = await claw.skills.install(ref, {
    source: flags.source,
  });
  if (wantsJson) {
    writeSurfaceJson(result);
  } else {
    const synced = result.syncedSkills ? ` synced=${result.syncedSkills.length}` : "";
    context.stdout.write(`installed ${result.source}:${result.slug} visibility=${result.runtimeVisibility}${synced}\n`);
    if (result.installedPaths?.length) {
      context.stdout.write(`${result.installedPaths.join("\n")}\n`);
    }
    if (result.warnings?.length) {
      context.stdout.write(`${result.warnings.join("\n")}\n`);
    }
  }
  return CLI_EXIT_OK;
}
  return null;
}

function parsePositiveIntegerFlag(value: string | undefined, name: string, code: string, location = `cli.skills.${name}`): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CliHandledError(code, `--${name} must be a positive integer.`, CLI_EXIT_USAGE, {
      location,
      details: { flag: `--${name}`, value },
    });
  }
  return parsed;
}

function parseIntegerFlag(value: string | undefined, name: string, code: string, location: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!value.trim() || !Number.isInteger(parsed)) {
    throw new CliHandledError(code, `--${name} must be an integer.`, CLI_EXIT_USAGE, {
      location,
      details: { flag: `--${name}`, value },
    });
  }
  return parsed;
}
