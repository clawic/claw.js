import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

import type { RuntimeAdapterId } from "@clawjs/core";
import type { TelegramSendMediaInput, TelegramSendMessageInput } from "@clawjs/claw";

import { CODEX_AGENT_ID, normalizeTelegramCodexAccount, registerCodexAgentProcessor, resolveCodexRuntimeAdapterId, resolveTelegramCodexListenerOptions, runTelegramCodexProcessor } from "./cli-telegram-codex.ts";
import { LEGACY_TELEGRAM_CODEX_PROCESSOR_ID, TELEGRAM_CODEX_BOT_COMMANDS } from "./cli-telegram-codex-constants.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { extractPositionals, parseCsvFlag, parseJsonFlag, readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";
import { createCliClaw } from "./cli-claw-factory.ts";
import { channelListenerPaths, isProcessRunning, readListenerPid, readTail, waitForListenerPid } from "./cli-channel-listener.ts";
import { currentCliEntryPath } from "./cli-open-state.ts";

type CliContext = { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream; cwd: string };

function parseNonNegativeNumberFlag(flags: Record<string, string>, name: string, code: string): number | undefined {
  const raw = flags[name];
  if (raw === undefined) return undefined;
  const value = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(value) || value < 0) {
    throw new CliHandledError(code, `--${name} must be a non-negative number.`, CLI_EXIT_USAGE, {
      location: `channels.flags.${name}`,
      suggestion: `Pass --${name} with a finite non-negative number, or omit it to use the default.`,
      safeNextStep: `Rerun the command with a valid --${name} value before changing channel bindings.`,
      details: { flag: `--${name}`, value: raw },
    });
  }
  return value;
}

function parseListenerNumberFlag(flags: Record<string, string>, name: string): number | undefined {
  const raw = flags[name];
  if (raw === undefined) return undefined;
  const value = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(value) || value < 0) {
    throw new CliHandledError("invalid_channel_listener_number", `--${name} must be a finite non-negative number.`, CLI_EXIT_USAGE, {
      location: `channels.flags.${name}`,
      suggestion: `Pass --${name} with a finite non-negative number, or omit it to use the default.`,
      safeNextStep: "Rerun the listener command with valid numeric timing flags before starting it.",
      details: { flag: `--${name}`, value: raw },
    });
  }
  return value;
}

function parsePositiveIntegerFlag(flags: Record<string, string>, name: string, code: string): number | undefined {
  const raw = flags[name];
  if (raw === undefined) return undefined;
  const value = Number(raw.trim());
  if (!raw.trim() || !Number.isSafeInteger(value) || value <= 0) {
    throw new CliHandledError(code, `--${name} must be a positive integer.`, CLI_EXIT_USAGE, {
      location: `telegram.flags.${name}`,
      suggestion: `Pass --${name} with a whole number greater than zero, or omit it to use the default.`,
      safeNextStep: `Rerun the Telegram command with a valid --${name} value before changing provider state.`,
      details: { flag: `--${name}`, value: raw },
    });
  }
  return value;
}

const CHANNEL_PERMISSION_VALUES = new Set(["read", "write", "ingest", "admin"]);

function parseChannelPermissions(flags: Record<string, string>): Array<"read" | "write" | "ingest" | "admin"> {
  const permissions = parseCsvFlag(flags.permissions || flags.permission);
  if (permissions.length === 0) {
    throw new CliHandledError("missing_channel_permissions", "--permissions is required", CLI_EXIT_USAGE, {
      location: "channels.flags.permissions",
      suggestion: "Pass --permissions with one or more of read, write, ingest, or admin.",
      safeNextStep: "Rerun the command with valid channel permissions before changing channel bindings.",
      details: { flag: "--permissions" },
    });
  }
  const invalid = permissions.find((permission) => !CHANNEL_PERMISSION_VALUES.has(permission));
  if (invalid) {
    throw new CliHandledError("invalid_channel_permission", "--permissions must contain only read, write, ingest, or admin.", CLI_EXIT_USAGE, {
      location: "channels.flags.permissions",
      suggestion: "Use a comma-separated list containing only read, write, ingest, or admin.",
      safeNextStep: "Rerun the command with valid channel permissions before changing channel bindings.",
      details: { flag: "--permissions", value: invalid },
    });
  }
  return permissions as Array<"read" | "write" | "ingest" | "admin">;
}

export async function runChannelTelegramCli(input: {
  group: string | undefined; command: string | undefined; subcommand: string | undefined; positionals: string[]; flags: Record<string, string>; argv: string[]; context: CliContext; wantsJson: boolean; binName: string; workspaceRoot: string; appId: string; workspaceId: string; agentId: string; runtimeAdapterId: RuntimeAdapterId;
}): Promise<number | null> {
  const { group, command, subcommand, positionals, flags, argv, context, wantsJson, binName, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId } = input;
  const writeChannelJson = (payload: unknown) => {
    const canonicalCommand = group === "telegram" ? "telegram" : "channels";
    const subcommandPath = [command, subcommand].filter(Boolean).join(".");
    writeCommandJsonOk(context.stdout, canonicalCommand, payload, {
      invokedCommand: group ?? canonicalCommand,
      subcommand: subcommandPath || null,
      ...(positionals[3] ? { operation: positionals.slice(3).join(".") } : {}),
    });
  };
if (group === "channels" && (command === "list" || command === "status")) {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const channels = await claw.channels.list();
  if (wantsJson) {
    writeChannelJson(channels);
  } else {
    context.stdout.write(`${channels.map((entry) => `${entry.id}:${entry.status}`).join("\n")}\n`);
  }
  return channels.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "channels" && command === "telegram" && subcommand === "setup") {
  const account = normalizeTelegramCodexAccount(flags);
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
  let accountRecord = claw.channels.accounts.get("telegram", account);
  if (flags["secret-name"] || flags.secret) {
    const secretName = flags["secret-name"] || flags.secret;
    const secret = await claw.telegram.provisionSecretReference({
      secretName,
      apiBaseUrl: flags["api-base-url"],
    });
    if (secret.status !== "configured") {
      if (wantsJson) writeChannelJson(secret);
      else context.stderr.write(`${secret.instructions.summary}\n`);
      return CLI_EXIT_DEGRADED;
    }
    accountRecord = await claw.channels.accounts.registerTelegramBot({
      accountId: account,
      label: flags.name,
      secretName,
      apiBaseUrl: flags["api-base-url"],
      webhookUrl: flags["webhook-url"],
      webhookSecretToken: flags["webhook-secret-token"],
      allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
      ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
    });
  }
  if (!accountRecord) {
    context.stderr.write("Telegram account is not configured. Pass --secret-name to set it up.\n");
    return CLI_EXIT_DEGRADED;
  }
  if (wantsJson) writeChannelJson(accountRecord);
  else context.stdout.write(`${accountRecord.id} ${accountRecord.status}\n`);
  return CLI_EXIT_OK;
}

if (group === "channels" && (command === "assign" || command === "unassign")) {
  const provider = flags.channel || flags.provider || "telegram";
  const account = flags.account;
  const assignedAgent = flags.agent || flags["agent-id"];
  if (!assignedAgent) {
    context.stderr.write("--agent is required\n");
    return CLI_EXIT_USAGE;
  }
  const targetId = flags["target-id"] || flags.target || flags["chat-id"];
  const assignmentRuntimeAdapterId = assignedAgent === CODEX_AGENT_ID ? resolveCodexRuntimeAdapterId(flags) : runtimeAdapterId;
  const claw = await createCliClaw(assignmentRuntimeAdapterId, flags, workspaceRoot, appId, workspaceId, assignedAgent, argv);
  if (command === "assign") {
    let processorId = assignedAgent;
    if (assignedAgent === CODEX_AGENT_ID) {
      registerCodexAgentProcessor({ claw, workspaceRoot, runtimeAdapterId: assignmentRuntimeAdapterId, flags });
    } else if (flags.processor) {
      processorId = flags.processor;
    }
    const binding = claw.channels.bindings.grant({
      agentId: assignedAgent,
      provider,
      accountId: account,
      targetId,
      permissions: ["read", "write", "ingest"],
      priority: parseNonNegativeNumberFlag(flags, "priority", "invalid_channel_priority") ?? 100,
      metadata: {
        assignmentType: "channel-agent",
        processorId,
        agentKind: assignedAgent,
      },
    });
    let commands: unknown = null;
    if (provider === "telegram" && assignedAgent === CODEX_AGENT_ID && claw.channels.accounts.get("telegram", account)) {
      commands = await claw.channels.commands.set("telegram", TELEGRAM_CODEX_BOT_COMMANDS, { accountId: account });
    }
    const payload = { assignment: binding, commands };
    if (wantsJson) writeChannelJson(payload);
    else context.stdout.write(`assigned ${provider}:${account || "default"} -> ${assignedAgent}\n`);
    return CLI_EXIT_OK;
  }
  const bindings = claw.channels.bindings.list({ agentId: assignedAgent, provider, accountId: account, ...(targetId ? { targetId } : {}) });
  const matching = bindings.filter((binding) => binding.metadata?.assignmentType === "channel-agent");
  for (const binding of matching) {
    claw.channels.bindings.revoke(binding.id);
  }
  if (wantsJson) writeChannelJson({ removed: matching.length });
  else context.stdout.write(`unassigned ${matching.length}\n`);
  return CLI_EXIT_OK;
}

if (group === "channels" && command === "assignments") {
  const assignmentsCommand = subcommand || "list";
  const provider = flags.channel || flags.provider;
  const account = flags.account;
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
  const assignments = claw.channels.bindings.list({ provider, accountId: account, agentId: flags.agent })
    .filter((binding) => binding.metadata?.assignmentType === "channel-agent")
    .map((binding) => {
      const processorId = typeof binding.metadata?.processorId === "string" ? binding.metadata.processorId : binding.agentId;
      const processor = claw.channels.processors.get(processorId);
      const listener = binding.provider ? claw.channels.listeners.get(binding.provider, binding.accountId) : null;
      const pid = listener?.pid;
      const running = isProcessRunning(pid);
      return {
        ...binding,
        processorId,
        processorRegistered: !!processor,
        listenerStatus: running ? "running" : listener?.status ?? "stopped",
        pid,
      };
    });
  if (assignmentsCommand === "list" || assignmentsCommand === "status") {
    if (wantsJson) writeChannelJson(assignments);
    else context.stdout.write(`${assignments.map((entry) => `${entry.provider ?? "*"}:${entry.accountId ?? "*"} -> ${entry.agentId} ${assignmentsCommand === "status" ? entry.listenerStatus : ""}`.trim()).join("\n")}\n`);
    return assignments.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }
  context.stderr.write(`Usage: ${binName} channels assignments list|status\n`);
  return CLI_EXIT_USAGE;
}

if (group === "channels" && command === "telegram" && subcommand === "codex") {
  const codexCommand = positionals[3] || "status";
  const codexSubcommand = positionals[4];
  const account = normalizeTelegramCodexAccount(flags);
  const listenerOptions = resolveTelegramCodexListenerOptions(flags);
  const provider = "telegram";
  const codexRuntimeAdapterId = resolveCodexRuntimeAdapterId(flags);

  const registerProcessor = (claw: Awaited<ReturnType<typeof createCliClaw>>) => {
    const processor = registerCodexAgentProcessor({ claw, workspaceRoot, runtimeAdapterId: codexRuntimeAdapterId, flags });
    registerCodexAgentProcessor({ claw, workspaceRoot, runtimeAdapterId: codexRuntimeAdapterId, flags, id: LEGACY_TELEGRAM_CODEX_PROCESSOR_ID });
    return processor;
  };

  const assignCodex = (claw: Awaited<ReturnType<typeof createCliClaw>>) => claw.channels.bindings.grant({
    agentId: CODEX_AGENT_ID,
    provider,
    accountId: account,
    permissions: ["read", "write", "ingest"],
    priority: 100,
    metadata: {
      assignmentType: "channel-agent",
      processorId: CODEX_AGENT_ID,
      agentKind: "codex",
    },
  });

  const syncCommands = async (claw: Awaited<ReturnType<typeof createCliClaw>>) => {
    const accountRecord = claw.channels.accounts.get(provider, account);
    if (!accountRecord) return null;
    return await claw.channels.commands.set(provider, TELEGRAM_CODEX_BOT_COMMANDS, { accountId: account });
  };

  const stopListener = async (claw: Awaited<ReturnType<typeof createCliClaw>>) => {
    const paths = channelListenerPaths(workspaceRoot, provider, account);
    fs.mkdirSync(paths.runDir, { recursive: true });
    fs.writeFileSync(paths.stopPath, `${Date.now()}\n`);
    const pid = readListenerPid(paths.pidPath) ?? claw.channels.listeners.get(provider, account)?.pid;
    const startedAt = Date.now();
    while (pid && isProcessRunning(pid) && Date.now() - startedAt < 5_000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (pid && isProcessRunning(pid)) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // already stopped
      }
    }
    return claw.channels.listeners.upsert({
      provider,
      accountId: account,
      processorId: CODEX_AGENT_ID,
      mode: "background",
      status: "stopped",
      pid,
      pidPath: paths.pidPath,
      stopPath: paths.stopPath,
      logPath: paths.logPath,
      stoppedAt: new Date().toISOString(),
    });
  };

  const startListener = async (claw: Awaited<ReturnType<typeof createCliClaw>>, options: { restart?: boolean } = {}) => {
    registerProcessor(claw);
    assignCodex(claw);
    await syncCommands(claw);
    if (options.restart) {
      await stopListener(claw);
    }
    const paths = channelListenerPaths(workspaceRoot, provider, account);
    const current = claw.channels.listeners.get(provider, account);
    const currentPid = current?.pid ?? readListenerPid(paths.pidPath);
    if (!options.restart && isProcessRunning(currentPid)) {
      return claw.channels.listeners.upsert({
        ...(current ?? {
          provider,
          accountId: account,
          processorId: CODEX_AGENT_ID,
          mode: "background" as const,
          startedAt: new Date().toISOString(),
        }),
        provider,
        accountId: account,
        processorId: CODEX_AGENT_ID,
        status: "running",
        pid: currentPid,
        pidPath: paths.pidPath,
        stopPath: paths.stopPath,
        logPath: paths.logPath,
        lastHeartbeatAt: new Date().toISOString(),
      });
    }
    fs.mkdirSync(paths.runDir, { recursive: true });
    fs.rmSync(paths.stopPath, { force: true });
    if (readBooleanFlag(argv, flags, "foreground", false)) {
      return await claw.channels.listen.run({
        provider,
        accountId: account,
        processorId: CODEX_AGENT_ID,
        intervalMs: listenerOptions.intervalMs,
        timeoutSeconds: listenerOptions.timeoutSeconds,
        processorTimeoutMs: listenerOptions.processorTimeoutMs,
        pidPath: paths.pidPath,
        stopPath: paths.stopPath,
        logPath: paths.logPath,
        mode: "foreground",
      });
    }
    const args = [
      currentCliEntryPath(),
      "channels",
      "listen",
      "run",
      "--provider",
      provider,
      "--workspace",
      workspaceRoot,
      "--runtime",
      codexRuntimeAdapterId,
      "--background",
      "--interval-ms",
      String(listenerOptions.intervalMs),
      "--timeout",
      String(listenerOptions.timeoutSeconds),
      "--processor-timeout-ms",
      String(listenerOptions.processorTimeoutMs),
    ];
    if (account) args.push("--account", account);
    const logFd = fs.openSync(paths.logPath, "a");
    const child = spawn(process.execPath, args, {
      cwd: context.cwd,
      env: process.env,
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    fs.closeSync(logFd);
    child.unref();
    const pid = await waitForListenerPid(paths.pidPath);
    return claw.channels.listeners.upsert({
      provider,
      accountId: account,
      processorId: CODEX_AGENT_ID,
      mode: "background",
      status: pid ? "running" : "stale",
      pid: pid ?? child.pid,
      pidPath: paths.pidPath,
      stopPath: paths.stopPath,
      logPath: paths.logPath,
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    });
  };

  const readStatus = async (claw: Awaited<ReturnType<typeof createCliClaw>>) => {
    const paths = channelListenerPaths(workspaceRoot, provider, account);
    const listener = claw.channels.listeners.get(provider, account);
    const pid = listener?.pid ?? readListenerPid(paths.pidPath);
    const running = isProcessRunning(pid);
    const processor = claw.channels.processors.get(CODEX_AGENT_ID) ?? claw.channels.processors.get(LEGACY_TELEGRAM_CODEX_PROCESSOR_ID);
    let commands: Array<{ command: string; description: string }> | null = null;
    try {
      commands = await claw.channels.commands.get(provider, { accountId: account });
    } catch {
      commands = null;
    }
    const commandsSynced = !!commands && TELEGRAM_CODEX_BOT_COMMANDS.every((expected) => (
      commands?.some((actual) => actual.command === expected.command && actual.description === expected.description)
    ));
    return {
      provider,
      accountId: account ?? "default",
      processorId: CODEX_AGENT_ID,
      processorRegistered: !!processor,
      listenerStatus: running ? "running" : listener?.status ?? "stopped",
      pid,
      commandsSynced,
      commandCount: commands?.length ?? 0,
      lastError: listener?.lastError,
      logPath: paths.logPath,
    };
  };

  if (codexCommand === "setup") {
    const claw = await createCliClaw(codexRuntimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
    let accountRecord = claw.channels.accounts.get(provider, account);
    if (flags["secret-name"] || flags.secret) {
      const secretName = flags["secret-name"] || flags.secret;
      const secret = await claw.telegram.provisionSecretReference({
        secretName,
        apiBaseUrl: flags["api-base-url"],
      });
      if (secret.status !== "configured") {
        if (wantsJson) writeChannelJson(secret);
        else context.stderr.write(`${secret.instructions.summary}\n`);
        return CLI_EXIT_DEGRADED;
      }
      accountRecord = await claw.channels.accounts.registerTelegramBot({
        accountId: account,
        label: flags.name,
        secretName,
        apiBaseUrl: flags["api-base-url"],
        webhookUrl: flags["webhook-url"],
        webhookSecretToken: flags["webhook-secret-token"],
        allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
        ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
      });
    }
    const processor = registerProcessor(claw);
    const assignment = assignCodex(claw);
    const commands = accountRecord ? await syncCommands(claw) : null;
    const shouldStart = readBooleanFlag(argv, flags, "start", false) || readBooleanFlag(argv, flags, "restart", false);
    const listener = shouldStart ? await startListener(claw, { restart: readBooleanFlag(argv, flags, "restart", false) }) : claw.channels.listeners.get(provider, account);
    const status = await readStatus(claw);
    const payload = { account: accountRecord, processor, assignment, commands, listener, status };
    if (wantsJson) writeChannelJson(payload);
    else context.stdout.write(`telegram codex setup ${status.listenerStatus} commands=${status.commandsSynced ? "synced" : "pending"}\n`);
    return CLI_EXIT_OK;
  }

  if (codexCommand === "start") {
    const claw = await createCliClaw(codexRuntimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
    const listener = await startListener(claw, { restart: readBooleanFlag(argv, flags, "restart", false) });
    if (wantsJson) writeChannelJson(listener);
    else context.stdout.write(`${listener.status} ${listener.pid ?? "unknown"}\n`);
    return listener.status === "running" ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (codexCommand === "stop") {
    const claw = await createCliClaw(codexRuntimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
    const listener = await stopListener(claw);
    if (wantsJson) writeChannelJson(listener);
    else context.stdout.write("stopped\n");
    return CLI_EXIT_OK;
  }

  if (codexCommand === "status" || !codexCommand) {
    const claw = await createCliClaw(codexRuntimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
    const status = await readStatus(claw);
    if (wantsJson) writeChannelJson(status);
    else context.stdout.write([
      `account=${status.accountId}`,
      `listener=${status.listenerStatus}`,
      `pid=${status.pid ?? "unknown"}`,
      `processor=${status.processorRegistered ? "registered" : "missing"}`,
      `commands=${status.commandsSynced ? "synced" : "pending"}`,
      ...(status.lastError ? [`lastError=${status.lastError}`] : []),
    ].join(" ") + "\n");
    return CLI_EXIT_OK;
  }

  if (codexCommand === "logs") {
    const paths = channelListenerPaths(workspaceRoot, provider, account);
    const lines = flags.lines ? Number(flags.lines) : 80;
    const output = readTail(paths.logPath, lines);
    if (wantsJson) writeChannelJson({ log: output, logPath: paths.logPath });
    else context.stdout.write(output ? `${output}\n` : "");
    return output ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (codexCommand === "commands" && codexSubcommand === "sync") {
    const claw = await createCliClaw(codexRuntimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
    const commands = await syncCommands(claw);
    if (!commands) {
      context.stderr.write("Telegram account is not configured. Run setup with --secret-name first.\n");
      return CLI_EXIT_DEGRADED;
    }
    if (wantsJson) writeChannelJson(commands);
    else context.stdout.write(`synced ${commands.length} commands\n`);
    return CLI_EXIT_OK;
  }

  context.stderr.write(`Usage: ${binName} channels telegram codex setup|start|stop|status|logs|commands sync\n`);
  return CLI_EXIT_USAGE;
}

if (group === "channels" && command === "telegram" && subcommand === "connect") {
  const secretName = flags["secret-name"] || flags.secret;
  if (!secretName) {
    context.stderr.write("--secret-name is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const secret = await claw.telegram.provisionSecretReference({
    secretName,
    apiBaseUrl: flags["api-base-url"],
  });
  if (secret.status !== "configured") {
    if (wantsJson) {
      writeChannelJson(secret);
    } else {
      context.stderr.write(`${secret.instructions.summary}\n`);
    }
    return CLI_EXIT_DEGRADED;
  }
  const account = await claw.channels.accounts.registerTelegramBot({
    accountId: flags.account,
    label: flags.name,
    secretName,
    apiBaseUrl: flags["api-base-url"],
    webhookUrl: flags["webhook-url"],
    webhookSecretToken: flags["webhook-secret-token"],
    allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
    ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
  });
  if (wantsJson) {
    writeChannelJson(account);
  } else {
    context.stdout.write(`${account.id} ${account.status}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "channels" && command === "processors") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  if (subcommand === "add" || subcommand === "register") {
    const id = flags.id || extractPositionals(argv)[3];
    const processorCommand = flags.command || flags.cmd;
    if (!id || !processorCommand) {
      context.stderr.write("--id and --command are required\n");
      return CLI_EXIT_USAGE;
    }
    const processor = claw.channels.processors.register({
      id,
      command: processorCommand,
      label: flags.name,
      cwd: flags.cwd,
      agentId: flags.agent || flags["agent-id"],
    });
    if (wantsJson) writeChannelJson(processor);
    else context.stdout.write(`${processor.id}\n`);
    return CLI_EXIT_OK;
  }
  if (subcommand === "list" || !subcommand) {
    const processors = claw.channels.processors.list();
    if (wantsJson) writeChannelJson(processors);
    else context.stdout.write(`${processors.map((entry) => `${entry.id} ${entry.command}`).join("\n")}\n`);
    return processors.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }
  if (subcommand === "remove") {
    const id = flags.id || extractPositionals(argv)[3];
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const removed = claw.channels.processors.remove(id);
    if (wantsJson) writeChannelJson({ removed });
    else context.stdout.write(`${removed}\n`);
    return removed ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }
}

if (group === "channels" && command === "listen") {
  const provider = flags.provider || flags.channel || "telegram";
  const account = flags.account;
  const paths = channelListenerPaths(workspaceRoot, provider, account);
  const intervalMs = parseListenerNumberFlag(flags, "interval-ms");
  const timeoutSeconds = parseListenerNumberFlag(flags, "timeout");
  const processorTimeoutMs = parseListenerNumberFlag(flags, "processor-timeout-ms");

  if (subcommand === "run") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const listener = await claw.channels.listen.run({
      provider,
      accountId: account,
      processorId: flags.processor,
      once: argv.includes("--once"),
      intervalMs,
      timeoutSeconds,
      processorTimeoutMs,
      pidPath: paths.pidPath,
      stopPath: paths.stopPath,
      logPath: paths.logPath,
      mode: readBooleanFlag(argv, flags, "background", false) ? "background" : "foreground",
    });
    if (wantsJson) writeChannelJson(listener);
    else context.stdout.write(`${listener.status}\n`);
    return CLI_EXIT_OK;
  }

  if (subcommand === "start") {
    fs.mkdirSync(paths.runDir, { recursive: true });
    fs.rmSync(paths.stopPath, { force: true });
    if (!readBooleanFlag(argv, flags, "background", false)) {
      const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
      const listener = await claw.channels.listen.run({
        provider,
        accountId: account,
        processorId: flags.processor,
        once: argv.includes("--once"),
        intervalMs,
        timeoutSeconds,
        processorTimeoutMs,
        pidPath: paths.pidPath,
        stopPath: paths.stopPath,
        logPath: paths.logPath,
        mode: "foreground",
      });
      if (wantsJson) writeChannelJson(listener);
      else context.stdout.write(`${listener.status}\n`);
      return CLI_EXIT_OK;
    }

    const entry = fileURLToPath(import.meta.url);
    const packagedBin = path.resolve(path.dirname(entry), "..", "bin", "claw.mjs");
    const cliEntry = fs.existsSync(packagedBin) ? packagedBin : entry;
    const args = [
      cliEntry,
      "channels",
      "listen",
      "run",
      "--provider",
      provider,
      "--workspace",
      workspaceRoot,
      "--runtime",
      runtimeAdapterId,
      "--background",
    ];
    if (account) args.push("--account", account);
    if (flags.processor) args.push("--processor", flags.processor);
    if (flags["interval-ms"]) args.push("--interval-ms", flags["interval-ms"]);
    if (flags.timeout) args.push("--timeout", flags.timeout);
    if (flags["processor-timeout-ms"]) args.push("--processor-timeout-ms", flags["processor-timeout-ms"]);
    const logFd = fs.openSync(paths.logPath, "a");
    const child = spawn(process.execPath, args, {
      cwd: context.cwd,
      env: process.env,
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    fs.closeSync(logFd);
    child.unref();
    const pid = await waitForListenerPid(paths.pidPath);
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const listener = claw.channels.listeners.upsert({
      provider,
      accountId: account,
      processorId: flags.processor,
      mode: "background",
      status: pid ? "running" : "stale",
      pid: pid ?? child.pid,
      pidPath: paths.pidPath,
      stopPath: paths.stopPath,
      logPath: paths.logPath,
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    });
    if (wantsJson) writeChannelJson(listener);
    else context.stdout.write(`${listener.status} ${listener.pid ?? "unknown"}\n`);
    return pid ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (subcommand === "status" || !subcommand) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const listener = claw.channels.listeners.get(provider, account);
    const pid = listener?.pid ?? readListenerPid(paths.pidPath);
    const running = isProcessRunning(pid);
    const normalized = listener
      ? claw.channels.listeners.upsert({
        ...listener,
        provider,
        accountId: account,
        mode: listener.mode,
        status: running ? listener.status === "stopped" ? "stopped" : "running" : listener.status === "stopped" ? "stopped" : "stale",
        pid,
      })
      : null;
    if (wantsJson) writeChannelJson(normalized ?? { provider, accountId: account ?? "default", status: running ? "running" : "stopped", pid });
    else context.stdout.write(`${normalized?.status ?? (running ? "running" : "stopped")} ${pid ?? "unknown"}\n`);
    return running ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (subcommand === "stop") {
    fs.mkdirSync(paths.runDir, { recursive: true });
    fs.writeFileSync(paths.stopPath, `${Date.now()}\n`);
    const pid = readListenerPid(paths.pidPath);
    const startedAt = Date.now();
    while (pid && isProcessRunning(pid) && Date.now() - startedAt < 5_000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (pid && isProcessRunning(pid)) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // already stopped
      }
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const listener = claw.channels.listeners.upsert({
      provider,
      accountId: account,
      processorId: flags.processor,
      mode: "background",
      status: "stopped",
      pid,
      pidPath: paths.pidPath,
      stopPath: paths.stopPath,
      logPath: paths.logPath,
      stoppedAt: new Date().toISOString(),
    });
    if (wantsJson) writeChannelJson(listener);
    else context.stdout.write("stopped\n");
    return CLI_EXIT_OK;
  }

  if (subcommand === "logs") {
    const lines = flags.lines ? Number(flags.lines) : 80;
    const output = readTail(paths.logPath, lines);
    if (wantsJson) writeChannelJson({ log: output });
    else context.stdout.write(output ? `${output}\n` : "");
    return output ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }
}

if (group === "channels" && command === "codex-processor") {
  if (subcommand && subcommand !== "run") {
    context.stderr.write(`Usage: ${binName} channels codex-processor run --runtime codex --workspace PATH\n`);
    return CLI_EXIT_USAGE;
  }
  return await runTelegramCodexProcessor({
    context,
    flags,
    argv,
    workspaceRoot,
    appId,
    workspaceId,
    agentId,
    runtimeAdapterId,
    createCliClaw,
  });
}

if (group === "channels" && command === "accounts" && subcommand === "add") {
  const provider = extractPositionals(argv)[3] || flags.provider || flags.channel;
  if (provider !== "telegram") {
    context.stderr.write("only telegram accounts are supported\n");
    return CLI_EXIT_USAGE;
  }
  const secretName = flags["secret-name"] || flags.secret;
  if (!secretName) {
    context.stderr.write("--secret-name is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const account = await claw.channels.accounts.registerTelegramBot({
    accountId: flags.account,
    label: flags.name,
    secretName,
    apiBaseUrl: flags["api-base-url"],
    webhookUrl: flags["webhook-url"],
    webhookSecretToken: flags["webhook-secret-token"],
    allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
    ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
  });
  if (wantsJson) {
    writeChannelJson(account);
  } else {
    context.stdout.write(`${account.id} ${account.status}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "channels" && command === "accounts" && (subcommand === "list" || subcommand === "status")) {
  const provider = flags.provider || flags.channel;
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const accounts = subcommand === "status"
    ? await claw.channels.accounts.status(provider)
    : claw.channels.accounts.list(provider);
  if (wantsJson) {
    writeChannelJson(accounts);
  } else {
    context.stdout.write(`${accounts.map((entry) => `${entry.id}:${entry.status}`).join("\n")}\n`);
  }
  return accounts.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "channels" && command === "accounts" && subcommand === "remove") {
  const provider = flags.provider || flags.channel || extractPositionals(argv)[3];
  if (!provider) {
    context.stderr.write("--provider is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const accounts = await claw.channels.accounts.remove(provider, flags.account);
  if (wantsJson) {
    writeChannelJson(accounts);
  } else {
    context.stdout.write(`${accounts.map((entry) => entry.id).join("\n")}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "channels" && command === "targets" && subcommand === "register") {
  const provider = flags.provider || flags.channel || "telegram";
  const targetId = flags["target-id"] || flags.target || flags["chat-id"];
  if (!targetId) {
    context.stderr.write("--target-id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const target = claw.channels.targets.register({
    provider,
    accountId: flags.account,
    targetId,
    kind: (flags.kind as "dm" | "group" | "supergroup" | "channel" | "topic" | "unknown" | undefined) ?? "unknown",
    label: flags.label || flags.title || flags.username,
    title: flags.title,
    username: flags.username,
    parentTargetId: flags["parent-target-id"],
    threadId: flags["thread-id"] || flags["message-thread-id"],
  });
  if (wantsJson) {
    writeChannelJson(target);
  } else {
    context.stdout.write(`${target.id}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "channels" && command === "targets" && subcommand === "list") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const targets = claw.channels.targets.list({
    provider: flags.provider || flags.channel,
    accountId: flags.account,
    query: flags.query,
  });
  if (wantsJson) {
    writeChannelJson(targets);
  } else {
    context.stdout.write(`${targets.map((entry) => `${entry.id} ${entry.label ?? ""}`.trim()).join("\n")}\n`);
  }
  return targets.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "channels" && command === "targets" && (subcommand === "inspect" || subcommand === "get")) {
  const provider = flags.provider || flags.channel || "telegram";
  const targetId = flags["target-id"] || flags.target || flags["chat-id"] || extractPositionals(argv)[3];
  if (!targetId) {
    context.stderr.write("--target-id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const target = claw.channels.targets.get(provider, flags.account, targetId, flags["thread-id"] || flags["message-thread-id"]);
  if (wantsJson) {
    writeChannelJson(target ?? { targetId, found: false });
  } else if (target) {
    context.stdout.write(`${target.id} ${target.kind}${target.metadata?.instructions ? " instructions" : ""}\n`);
  }
  return target ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "channels" && command === "targets" && (subcommand === "update" || subcommand === "set")) {
  const provider = flags.provider || flags.channel || "telegram";
  const targetId = flags["target-id"] || flags.target || flags["chat-id"] || extractPositionals(argv)[3];
  if (!targetId) {
    context.stderr.write("--target-id is required\n");
    return CLI_EXIT_USAGE;
  }
  const threadId = flags["thread-id"] || flags["message-thread-id"];
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const existing = claw.channels.targets.get(provider, flags.account, targetId, threadId);
  const metadata = parseJsonFlag<Record<string, unknown>>(flags.metadata, "--metadata") ?? {};
  if (flags.instructions !== undefined) metadata.instructions = flags.instructions;
  const target = claw.channels.targets.register({
    provider,
    accountId: flags.account,
    targetId,
    kind: (flags.kind as "dm" | "group" | "supergroup" | "channel" | "topic" | "unknown" | undefined) ?? existing?.kind ?? (threadId ? "topic" : "unknown"),
    label: flags.label || flags.title || flags.username || existing?.label,
    title: flags.title || existing?.title,
    username: flags.username || existing?.username,
    parentTargetId: flags["parent-target-id"] || existing?.parentTargetId,
    threadId: threadId ?? existing?.threadId,
    metadata: {
      ...(existing?.metadata ?? {}),
      ...metadata,
    },
  });
  if (wantsJson) {
    writeChannelJson(target);
  } else {
    context.stdout.write(`${target.id}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "channels" && command === "permissions" && subcommand === "grant") {
  if (!flags.agent) {
    context.stderr.write("--agent is required\n");
    return CLI_EXIT_USAGE;
  }
  const permissions = parseChannelPermissions(flags);
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const binding = claw.channels.bindings.grant({
    agentId: flags.agent,
    provider: flags.provider || flags.channel,
    accountId: flags.account,
    targetId: flags["target-id"] || flags.target || flags["chat-id"],
    permissions,
    ...(flags.priority !== undefined ? { priority: parseNonNegativeNumberFlag(flags, "priority", "invalid_channel_priority") } : {}),
  });
  if (wantsJson) {
    writeChannelJson(binding);
  } else {
    context.stdout.write(`${binding.id}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "channels" && command === "permissions" && subcommand === "list") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const bindings = claw.channels.bindings.list({
    agentId: flags.agent,
    provider: flags.provider || flags.channel,
    accountId: flags.account,
    targetId: flags["target-id"] || flags.target || flags["chat-id"],
  });
  if (wantsJson) {
    writeChannelJson(bindings);
  } else {
    context.stdout.write(`${bindings.map((entry) => `${entry.id} ${entry.permissions.join(",")}`).join("\n")}\n`);
  }
  return bindings.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "channels" && command === "permissions" && subcommand === "revoke") {
  const id = flags.id || extractPositionals(argv)[3];
  if (!id) {
    context.stderr.write("--id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const removed = claw.channels.bindings.revoke(id);
  if (wantsJson) {
    writeChannelJson({ removed });
  } else {
    context.stdout.write(`${removed}\n`);
  }
  return removed ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "channels" && command === "messages" && subcommand === "send") {
  const targetId = flags["target-id"] || flags.target || flags["chat-id"];
  if (!targetId) {
    context.stderr.write("--target-id is required\n");
    return CLI_EXIT_USAGE;
  }
  if (!flags.text && !flags.media) {
    context.stderr.write("--text or --media is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const message = await claw.channels.messages.send({
    provider: flags.provider || flags.channel || "telegram",
    accountId: flags.account,
    targetId,
    text: flags.text,
    media: flags.media,
    mediaType: flags["media-type"] as "photo" | "video" | "document" | "audio" | "animation" | undefined,
    threadId: flags["thread-id"] || flags["message-thread-id"],
    parseMode: flags["parse-mode"] as "HTML" | "Markdown" | "MarkdownV2" | undefined,
    agentId: flags.agent,
  });
  if (wantsJson) {
    writeChannelJson(message);
  } else {
    context.stdout.write(`${message.id}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "channels" && command === "messages" && subcommand === "sync") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const messages = await claw.channels.messages.sync({
    provider: flags.provider || flags.channel || "telegram",
    accountId: flags.account,
    ...(flags.limit ? { limit: Number(flags.limit) } : {}),
    ...(flags.timeout ? { timeoutSeconds: Number(flags.timeout) } : {}),
  });
  if (wantsJson) {
    writeChannelJson(messages);
  } else {
    context.stdout.write(`${messages.map((entry) => entry.id).join("\n")}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "channels" && command === "messages" && subcommand === "read") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const messages = claw.channels.messages.read({
    provider: flags.provider || flags.channel,
    accountId: flags.account,
    targetId: flags["target-id"] || flags.target || flags["chat-id"],
    agentId: flags.agent,
    ...(flags.limit ? { limit: Number(flags.limit) } : {}),
  });
  if (wantsJson) {
    writeChannelJson(messages);
  } else {
    context.stdout.write(`${messages.map((entry) => `${entry.id} ${entry.text ?? ""}`.trim()).join("\n")}\n`);
  }
  return messages.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "channels" && command === "commands" && (subcommand === "set" || subcommand === "get")) {
  const provider = (flags.provider || flags.channel || "telegram") as "telegram";
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const result = subcommand === "set"
    ? await claw.channels.commands.set(provider, parseJsonFlag<Array<{ command: string; description: string }>>(flags.commands, "--commands") ?? [], { accountId: flags.account })
    : await claw.channels.commands.get(provider, { accountId: flags.account });
  if (wantsJson) {
    writeChannelJson(result);
  } else {
    context.stdout.write(`${result.map((entry) => `${entry.command}: ${entry.description}`).join("\n")}\n`);
  }
  return result.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "telegram" && command === "connect") {
  const secretName = flags["secret-name"];
  if (!secretName) {
    context.stderr.write("--secret-name is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const status = await claw.telegram.connectBot({
    secretName,
    apiBaseUrl: flags["api-base-url"],
    webhookUrl: flags["webhook-url"],
    webhookSecretToken: flags["webhook-secret-token"],
    allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
    ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
  });
  if (wantsJson) {
    writeChannelJson(status);
  } else {
    context.stdout.write(`${status.channel.status} ${status.transport.mode}\n`);
  }
  return status.channel.status === "connected" ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "telegram" && command === "status") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const status = await claw.telegram.status();
  if (wantsJson) {
    writeChannelJson(status);
  } else {
    context.stdout.write(`status: ${status.channel.status}\n`);
    context.stdout.write(`mode: ${status.transport.mode}\n`);
    context.stdout.write(`bot: ${status.botProfile?.username ?? "unknown"}\n`);
  }
  return status.channel.status === "connected" ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "telegram" && command === "webhook" && subcommand === "set") {
  const url = flags.url || flags["webhook-url"];
  if (!url) {
    context.stderr.write("--url is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const status = await claw.telegram.configureWebhook({
    url,
    secretToken: flags["webhook-secret-token"],
    allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
    ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
    ...(flags["max-connections"] !== undefined ? { maxConnections: parsePositiveIntegerFlag(flags, "max-connections", "invalid_telegram_max_connections") } : {}),
    ...(flags["ip-address"] ? { ipAddress: flags["ip-address"] } : {}),
  });
  if (wantsJson) {
    writeChannelJson(status);
  } else {
    context.stdout.write(`${status.transport.webhook?.url ?? "configured"}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "telegram" && command === "webhook" && subcommand === "clear") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const status = await claw.telegram.disableWebhook({
    ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
  });
  if (wantsJson) {
    writeChannelJson(status);
  } else {
    context.stdout.write(`${status.transport.mode}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "telegram" && command === "polling" && subcommand === "start") {
  const limit = parsePositiveIntegerFlag(flags, "limit", "invalid_telegram_polling_limit");
  const timeoutSeconds = parsePositiveIntegerFlag(flags, "timeout", "invalid_telegram_polling_timeout");
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const status = await claw.telegram.startPolling({
    ...(limit !== undefined ? { limit } : {}),
    ...(timeoutSeconds !== undefined ? { timeoutSeconds } : {}),
    ...(flags["allowed-updates"] ? { allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates") } : {}),
    ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
  });
  if (wantsJson) {
    writeChannelJson(status);
  } else {
    context.stdout.write(`${status.transport.mode}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "telegram" && command === "polling" && subcommand === "stop") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const status = await claw.telegram.stopPolling();
  if (wantsJson) {
    writeChannelJson(status);
  } else {
    context.stdout.write(`${status.transport.active}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "telegram" && command === "commands" && subcommand === "set") {
  const commands = parseJsonFlag<Array<{ command: string; description: string }>>(flags.commands, "--commands");
  if (!commands) {
    context.stderr.write("--commands is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const saved = await claw.telegram.setCommands(commands);
  if (wantsJson) {
    writeChannelJson(saved);
  } else {
    context.stdout.write(`${saved.map((entry) => entry.command).join("\n")}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "telegram" && command === "commands" && subcommand === "get") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const commands = await claw.telegram.getCommands();
  if (wantsJson) {
    writeChannelJson(commands);
  } else {
    context.stdout.write(`${commands.map((entry) => `${entry.command}: ${entry.description}`).join("\n")}\n`);
  }
  return commands.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "telegram" && command === "chats" && subcommand === "list") {
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const chats = await claw.telegram.listChats(flags.query);
  if (wantsJson) {
    writeChannelJson(chats);
  } else {
    context.stdout.write(`${chats.map((entry) => `${entry.id} ${entry.title ?? entry.username ?? entry.firstName ?? ""}`.trim()).join("\n")}\n`);
  }
  return chats.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

if (group === "telegram" && command === "chats" && subcommand === "inspect") {
  const chatId = flags["chat-id"];
  if (!chatId) {
    context.stderr.write("--chat-id is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const chat = await claw.telegram.getChat(chatId);
  if (wantsJson) {
    writeChannelJson(chat);
  } else {
    context.stdout.write(`${chat.id} ${chat.type}\n`);
  }
  return CLI_EXIT_OK;
}

if (group === "telegram" && command === "send") {
  const chatId = flags["chat-id"];
  if (!chatId) {
    context.stderr.write("--chat-id is required\n");
    return CLI_EXIT_USAGE;
  }
  if (!flags.media && !flags.text) {
    context.stderr.write("--text or --media is required\n");
    return CLI_EXIT_USAGE;
  }
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
  const response = flags.media
    ? await claw.telegram.sendMedia({
      type: (flags.type as TelegramSendMediaInput["type"] | undefined) ?? "photo",
      chatId,
      media: flags.media,
      caption: flags.caption,
      ...(flags["parse-mode"] ? { parseMode: flags["parse-mode"] as TelegramSendMediaInput["parseMode"] } : {}),
      ...(flags["reply-to-message-id"] ? { replyToMessageId: Number(flags["reply-to-message-id"]) } : {}),
      ...(flags["message-thread-id"] ? { messageThreadId: Number(flags["message-thread-id"]) } : {}),
    })
    : await claw.telegram.sendMessage({
      chatId,
      text: flags.text ?? "",
      ...(flags["parse-mode"] ? { parseMode: flags["parse-mode"] as TelegramSendMessageInput["parseMode"] } : {}),
      ...(flags["reply-to-message-id"] ? { replyToMessageId: Number(flags["reply-to-message-id"]) } : {}),
      ...(flags["message-thread-id"] ? { messageThreadId: Number(flags["message-thread-id"]) } : {}),
    });
  if (wantsJson) {
    writeChannelJson(response);
  } else {
    context.stdout.write("ok\n");
  }
  return CLI_EXIT_OK;
}
  return null;
}
