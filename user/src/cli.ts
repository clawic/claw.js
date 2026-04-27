#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { startServer } from "./server";
import { UserService } from "./service";
import { seedUser } from "./seed";

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq > 2) {
      flags[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[token.slice(2)] = "true";
      continue;
    }
    flags[token.slice(2)] = next;
    index += 1;
  }
  return flags;
}

function positionals(argv: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      values.push(token);
      continue;
    }
    if (token.includes("=")) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) index += 1;
  }
  return values;
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: user <command> [options]",
      "",
      "Commands:",
      "  user serve [--host HOST] [--port PORT] [--workspace DIR]",
      "  user sources [--workspace DIR]",
      "  user list [--workspace DIR]",
      "  user show <id> [--workspace DIR]",
      "  user seed [--id ID] [--workspace DIR]",
      "",
    ].join("\n") + "\n"
  );
}

function workspaceFromFlags(flags: Record<string, string>): string {
  if (flags.workspace) return path.resolve(flags.workspace);
  if (process.env.CLAWJS_OPEN_WORKSPACE) return process.env.CLAWJS_OPEN_WORKSPACE;
  const markers = [".memory", ".clawjs", "relay.sqlite", "AGENTS.md", ".data"];
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (markers.some((m) => fs.existsSync(path.join(dir, m)))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const argv = process.argv.slice(2);

if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

const flags = parseFlags(argv);
const args = positionals(argv);
const command = args[0];

try {
  if (command === "serve") {
    const workspace = workspaceFromFlags(flags);
    const host = flags.host || "127.0.0.1";
    const port = Number(flags.port || "21979");
    const service = new UserService(workspace);
    const server = startServer(service, host, port);
    const shutdown = () => {
      server.close(() => {
        service.close();
        process.exit(0);
      });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } else if (command === "sources") {
    const service = new UserService(workspaceFromFlags(flags));
    process.stdout.write(JSON.stringify(service.listSources(), null, 2) + "\n");
    service.close();
  } else if (command === "list") {
    const service = new UserService(workspaceFromFlags(flags));
    process.stdout.write(JSON.stringify(service.listUsers(), null, 2) + "\n");
    service.close();
  } else if (command === "show") {
    const id = args[1];
    if (!id) {
      process.stderr.write("user show <id>\n");
      process.exit(2);
    }
    const service = new UserService(workspaceFromFlags(flags));
    process.stdout.write(JSON.stringify(service.getUserBundle(id), null, 2) + "\n");
    service.close();
  } else if (command === "seed") {
    const workspace = workspaceFromFlags(flags);
    const id = flags.id || args[1] || "test-user-001";
    const reports = seedUser(workspace, id);
    process.stdout.write(JSON.stringify({ workspace, userId: id, reports }, null, 2) + "\n");
  } else {
    process.stderr.write(`Unknown command: ${command}\n`);
    printHelp();
    process.exit(2);
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}
