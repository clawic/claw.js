import { buildDatabaseApp, DatabaseApiClient } from "@clawjs/database";

import { CLI_EXIT_FAILURE, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonError } from "./cli-json.ts";

type Writable = NodeJS.WritableStream;

function buildDatabaseAdvancedUsage(binName = "claw"): string {
  return [
    "Advanced database admin commands:",
    `  ${binName} database serve [--host HOST] [--port PORT]`,
    `  ${binName} database login --url URL --email EMAIL --password PASSWORD`,
    `  ${binName} database namespace list|create`,
    `  ${binName} database collection list|create|update`,
    `  ${binName} database record list|create|update|delete`,
    `  ${binName} database token list|create|revoke`,
    `  ${binName} database file list|upload|delete`,
    "",
    "This is the low-level admin surface. Use `claw db ...` for local-first CRUD.",
  ].join("\n");
}

export async function runEmbeddedDatabaseCli(input: {
  argv: string[];
  flags: Record<string, string>;
  stdout: Writable;
  stderr: Writable;
}): Promise<number> {
  const { argv, flags, stdout, stderr } = input;
  const wantsJson = argv.includes("--json");
  const positionals = extractPositionals(argv);
  const [group, command, subcommand] = positionals;
  const wantsHelp = argv.includes("--help") || argv.includes("-h");

  const write = (payload: unknown) => {
    if (wantsJson) {
      stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      return;
    }
    stdout.write(`${typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)}\n`);
  };

  if (wantsHelp || !group) {
    stdout.write(`${buildDatabaseAdvancedUsage()}\n`);
    return wantsHelp ? 0 : 64;
  }

  try {
    if (group === "serve") {
      const port = parsePortFlag(flags.port);
      const { app } = buildDatabaseApp({
        config: {
          ...(flags.host ? { host: flags.host } : {}),
          ...(hasFlag(flags, "port") ? { port } : {}),
          ...(flags["data-dir"] ? { dataDir: flags["data-dir"] } : {}),
          ...(flags["db-path"] ? { dbPath: flags["db-path"] } : {}),
          ...(flags["files-dir"] ? { filesDir: flags["files-dir"] } : {}),
          ...(flags.secret ? { jwtSecret: flags.secret } : {}),
        },
      });
      const address = await app.listen({
        host: flags.host ?? "127.0.0.1",
        port,
      });
      stdout.write(`${address}\n`);
      return 0;
    }

    const baseUrl = flags.url ?? "http://127.0.0.1:4510";
    const client = new DatabaseApiClient({
      baseUrl,
      token: flags.token,
    });

    const parseCsvFlag = (value: string | undefined): string[] => (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);

    if (group === "login") {
      write(await client.login(flags.email ?? "", flags.password ?? ""));
      return 0;
    }

    if (group === "namespace" && command === "list") {
      write(await client.listNamespaces());
      return 0;
    }

    if (group === "namespace" && command === "create") {
      write(await client.createNamespace({
        id: flags.id,
        displayName: flags["display-name"] ?? subcommand ?? "",
      }));
      return 0;
    }

    if (group === "collection" && command === "list") {
      write(await client.listCollections(flags.namespace ?? ""));
      return 0;
    }

    if (group === "collection" && command === "create") {
      write(await client.createCollection(flags.namespace ?? "", {
        name: flags.name ?? subcommand ?? "",
        displayName: flags["display-name"],
        fields: parseJsonFlag(flags.fields, "fields", []),
        indexes: parseJsonFlag(flags.indexes, "indexes", []),
      }));
      return 0;
    }

    if (group === "collection" && command === "update") {
      write(await client.updateCollection(flags.namespace ?? "", flags.name ?? subcommand ?? "", {
        displayName: flags["display-name"],
        ...(hasFlag(flags, "fields") ? { fields: parseJsonFlag(flags.fields, "fields", []) } : {}),
        ...(hasFlag(flags, "indexes") ? { indexes: parseJsonFlag(flags.indexes, "indexes", []) } : {}),
      }));
      return 0;
    }

    if (group === "record" && command === "list") {
      write(await client.listRecords(flags.namespace ?? "", flags.collection ?? "", {
        filter: flags.filter,
        sort: flags.sort,
      }));
      return 0;
    }

    if (group === "record" && command === "create") {
      write(await client.createRecord(flags.namespace ?? "", flags.collection ?? "", parseJsonFlag(flags.data, "data", {})));
      return 0;
    }

    if (group === "record" && command === "update") {
      write(await client.updateRecord(flags.namespace ?? "", flags.collection ?? "", flags.id ?? subcommand ?? "", parseJsonFlag(flags.data, "data", {})));
      return 0;
    }

    if (group === "record" && command === "delete") {
      write(await client.deleteRecord(flags.namespace ?? "", flags.collection ?? "", flags.id ?? subcommand ?? ""));
      return 0;
    }

    if (group === "token" && command === "list") {
      write(await client.listTokens(flags.namespace ?? ""));
      return 0;
    }

    if (group === "token" && command === "create") {
      write(await client.createToken(flags.namespace ?? "", {
        label: flags.label ?? "token",
        collectionName: flags.collection,
        operations: parseCsvFlag(flags.operations),
      }));
      return 0;
    }

    if (group === "token" && command === "revoke") {
      write(await client.revokeToken(flags.namespace ?? "", flags.id ?? subcommand ?? ""));
      return 0;
    }

    if (group === "file" && command === "list") {
      write(await client.listFiles(flags.namespace ?? ""));
      return 0;
    }

    if (group === "file" && command === "upload") {
      write(await client.uploadFile({
        namespaceId: flags.namespace ?? "",
        filePath: flags.file ?? "",
        collectionName: flags.collection,
        recordId: flags["record-id"],
      }));
      return 0;
    }

    if (group === "file" && command === "delete") {
      write(await client.deleteFile(flags.id ?? subcommand ?? ""));
      return 0;
    }

    stderr.write("Unknown command.\n");
    return 64;
  } catch (error) {
    const handled = databaseCliError(error);
    const serviceHint = "The low-level `claw database ...` admin surface requires `claw database serve` or --url pointing at a running database service. For the local agent-facing catalog, use `claw collections list --json`.";
    if (wantsJson) {
      writeCommandJsonError(stdout, "database", handled, {
        invokedCommand: "database",
        subcommand: [group, command].filter(Boolean).join(".") || null,
        ...(handled.code === "database_service_unavailable" ? { hint: serviceHint } : {}),
        suggestedCommands: [
          "claw collections list --json",
          "claw collections <collection> schema --json",
          "claw database serve",
        ],
      });
    } else {
      stderr.write(`${handled.message}\n`);
    }
    return handled.exitCode;
  }
}

function hasFlag(flags: Record<string, string>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(flags, name);
}

function parsePortFlag(value: string | undefined): number {
  if (value === undefined) return 4510;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new CliHandledError("invalid_database_port", "--port must be a decimal TCP port from 1 to 65535.", CLI_EXIT_USAGE);
  }
  const port = Number(trimmed);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new CliHandledError("invalid_database_port", "--port must be a decimal TCP port from 1 to 65535.", CLI_EXIT_USAGE);
  }
  return port;
}

function parseJsonFlag<T>(value: string | undefined, name: string, fallback: T): T {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    throw new CliHandledError(
      `invalid_database_${name}_json`,
      `Invalid JSON for --${name}: ${error instanceof Error ? error.message : "parse error"}`,
      CLI_EXIT_USAGE,
    );
  }
}

function databaseCliError(error: unknown): CliHandledError {
  if (error instanceof CliHandledError) return error;
  const originalMessage = error instanceof Error ? error.message : String(error);
  const serviceHint = "The low-level `claw database ...` admin surface requires `claw database serve` or --url pointing at a running database service. For the local agent-facing catalog, use `claw collections list --json`.";
  return new CliHandledError(
    "database_service_unavailable",
    `${originalMessage}. ${serviceHint}`,
    CLI_EXIT_FAILURE,
  );
}

function extractPositionals(argv: string[]): string[] {
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    if (token.includes("=")) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      index += 1;
    }
  }
  return positionals;
}
