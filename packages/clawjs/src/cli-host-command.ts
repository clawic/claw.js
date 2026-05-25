import path from "path";

import { activeHost, readHostRegistry, registerHost, resolveHostRegistryFile, useHost } from "./host-registry.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import { runDomainsCli } from "./cli-domains-command.ts";
import { applyAppStateTransaction, appStateRequestFromOperations, readAppStateProjection } from "./app-state-service.ts";
import { openMainDataStore } from "./v1-data-core.ts";
import type { OpenSurface } from "./cli-open-surfaces.ts";
import type { CliContext } from "./index.ts";

export function hostRegistryOptions(flags: Record<string, string>): { clawHome?: string } {
  return flags["claw-home"] ? { clawHome: path.resolve(flags["claw-home"]) } : {};
}

export async function runHostCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  ensureDomainSurfaceRunning: (surface: OpenSurface, flags: Record<string, string>, workspace: string) => Promise<URL>;
}): Promise<number> {
  const [, command, hostIdArg] = input.positionals;
  const options = hostRegistryOptions(input.flags);

  if (command === "app-state") {
    return runHostAppStateCli(input);
  }

  if (command === "domains") {
    return await runDomainsCli({
      argv: ["domains", ...input.argv.slice(2)],
      positionals: ["domains", ...input.positionals.slice(2)],
      flags: input.flags,
      context: input.context,
      wantsJson: input.wantsJson,
      binName: input.binName,
      invokedCommand: "host domains",
      ensureDomainSurfaceRunning: input.ensureDomainSurfaceRunning,
    });
  }

  if (command === "list" || !command) {
    const registry = readHostRegistry(options);
    if (input.wantsJson) {
      writeCommandJsonOk(input.context.stdout, "host", { ...registry, registryPath: resolveHostRegistryFile(options) }, { subcommand: "list" });
    } else {
      const rows = registry.hosts.map((host) => ({
        active: registry.activeHostId === host.id ? "*" : "",
        id: host.id,
        name: host.displayName,
        kind: host.kind,
        transport: host.endpoint?.transport ?? "-",
      }));
      input.context.stdout.write(rows.length ? `${formatCliTable(rows)}\n` : "No hosts registered.\n");
    }
    return CLI_EXIT_OK;
  }

  if (command === "register") {
    const id = input.flags.id ?? hostIdArg;
    const displayName = input.flags.name ?? input.flags["display-name"];
    const kind = input.flags.kind ?? "standalone";
    if (!id || !displayName) {
      throw new CliHandledError("usage_error", `Usage: ${input.binName} host register <id> --name NAME [--kind standalone|embedded|third_party] [--transport xpc --address NAME] [--use]`, CLI_EXIT_USAGE);
    }
    if (kind !== "standalone" && kind !== "embedded" && kind !== "third_party") {
      throw new CliHandledError("usage_error", "Host kind must be standalone, embedded, or third_party.", CLI_EXIT_USAGE);
    }
    const transport = input.flags.transport;
    const address = input.flags.address;
    if ((transport && !address) || (!transport && address)) {
      throw new CliHandledError("usage_error", "--transport and --address must be provided together.", CLI_EXIT_USAGE);
    }
    if (transport && transport !== "xpc" && transport !== "unix_socket" && transport !== "http" && transport !== "stdio") {
      throw new CliHandledError("usage_error", "Host transport must be xpc, unix_socket, http, or stdio.", CLI_EXIT_USAGE);
    }
    const endpoint = transport && address
      ? { transport: transport as "xpc" | "unix_socket" | "http" | "stdio", address }
      : undefined;
    const registry = registerHost({
      id,
      displayName,
      kind,
      ...(input.flags["bundle-id"] ? { bundleId: input.flags["bundle-id"] } : {}),
      ...(input.flags.executable ? { executablePath: path.resolve(input.flags.executable) } : {}),
      ...(input.flags["app-support-dir"] ? { appSupportDir: path.resolve(input.flags["app-support-dir"]) } : {}),
      ...(endpoint ? { endpoint } : {}),
    }, options, input.argv.includes("--use"));
    const host = registry.hosts.find((entry) => entry.id === id);
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "host", { host, registryPath: resolveHostRegistryFile(options), activeHostId: registry.activeHostId }, { subcommand: "register" });
    else input.context.stdout.write(`registered ${id}${registry.activeHostId === id ? " and set active" : ""}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "use") {
    const hostId = hostIdArg ?? input.flags.id;
    if (!hostId) throw new CliHandledError("usage_error", `Usage: ${input.binName} host use <id>`, CLI_EXIT_USAGE);
    const currentRegistry = readHostRegistry(options);
    if (!currentRegistry.hosts.some((host) => host.id === hostId)) {
      throw new CliHandledError("host_unavailable", `Host not registered: ${hostId}`, CLI_EXIT_DEGRADED);
    }
    const registry = useHost(hostId, options);
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "host", { activeHostId: registry.activeHostId, registryPath: resolveHostRegistryFile(options) }, { subcommand: "use" });
    else input.context.stdout.write(`active host: ${registry.activeHostId}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "status" || command === "doctor") {
    const registry = readHostRegistry(options);
    const host = hostIdArg ? registry.hosts.find((entry) => entry.id === hostIdArg) ?? null : activeHost(registry);
    const ok = !!host;
    if (input.wantsJson) {
      const data = { activeHostId: registry.activeHostId, host, registryPath: resolveHostRegistryFile(options) };
      const meta = { subcommand: command };
      if (ok) writeCommandJsonOk(input.context.stdout, "host", data, meta);
      else writeCommandJsonError(input.context.stdout, "host", new CliHandledError("host_unavailable", hostIdArg ? `Host not registered: ${hostIdArg}` : "No active host configured.", CLI_EXIT_DEGRADED), meta);
    } else if (host) {
      input.context.stdout.write(`host: ${host.id}\nname: ${host.displayName}\nkind: ${host.kind}\ntransport: ${host.endpoint?.transport ?? "not configured"}\n`);
    } else {
      input.context.stderr.write(hostIdArg ? `Host not registered: ${hostIdArg}\n` : "No active host configured.\n");
    }
    return ok ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  input.context.stderr.write(`Usage: ${input.binName} host list|register|use|status\n`);
  return CLI_EXIT_USAGE;
}

function runHostAppStateCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): number {
  const action = input.positionals[2] || "projection";
  const store = openMainDataStore();
  try {
    if (action === "projection" || action === "snapshot") {
      writeCommandJsonOk(input.context.stdout, "host", readAppStateProjection(store.sqlite, {
        sidebarLimit: Number(input.flags.limit ?? 200),
        receiptLimit: Number(input.flags["receipt-limit"] ?? 20),
      }), { subcommand: "host app-state projection" });
      return CLI_EXIT_OK;
    }
    if (action === "apply") {
      const rawRequest = input.flags.request
        ? JSON.parse(input.flags.request)
        : appStateRequestFromOperations(JSON.parse(input.flags.operations || "[]"), {
            requestId: input.flags["request-id"],
            hostId: input.flags["host-id"] ?? "host-cli",
          });
      const result = applyAppStateTransaction(store.sqlite, rawRequest);
      writeCommandJsonOk(input.context.stdout, "host", result, { subcommand: "host app-state apply" });
      return CLI_EXIT_OK;
    }
    input.context.stderr.write(`Usage: ${input.binName} host app-state apply|projection --json\n`);
    return CLI_EXIT_USAGE;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const receipt = typeof error === "object" && error && "receipt" in error ? (error as { receipt: unknown }).receipt : undefined;
    writeCommandJsonError(input.context.stdout, "host", new CliHandledError("app_state_apply_failed", message, CLI_EXIT_FAILURE), { subcommand: `host app-state ${action}`, receipt });
    return CLI_EXIT_FAILURE;
  } finally {
    store.close();
  }
}
