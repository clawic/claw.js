import { clawPersistentSurfaceRegistry, findClawPersistentSurfaceNode, listClawPersistentSurfaceNodes, withSurfaceChildren } from "@clawjs/core";
import type { ClawPersistentSurfaceNode } from "@clawjs/core";

interface CliContext {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

const CLI_EXIT_OK = 0;
const CLI_EXIT_FAILURE = 1;
const CLI_EXIT_USAGE = 64;

class InspectCliError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(code: string, message: string, exitCode = CLI_EXIT_FAILURE) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

function writeJson(stream: NodeJS.WritableStream, payload: unknown): void {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function writeCliError(stream: NodeJS.WritableStream, error: InspectCliError): void {
  writeJson(stream, { error: { code: error.code, message: error.message } });
}

function cliErrorFromUnknown(error: unknown): InspectCliError {
  return error instanceof InspectCliError
    ? error
    : new InspectCliError("internal_error", error instanceof Error ? error.message : String(error));
}
interface InspectCliInput {
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}

function inspectNodes(): ClawPersistentSurfaceNode[] {
  return withSurfaceChildren(clawPersistentSurfaceRegistry.nodes);
}

function inspectPathToId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized === "/") return "";
  if (normalized.startsWith("/database/")) return `claw.database.${normalized.split("/").filter(Boolean).slice(1).join(".")}`;
  if (normalized.startsWith("/storage/workspace")) return `claw.workspace${normalized.split("/").filter(Boolean).slice(2).join(".") ? `.${normalized.split("/").filter(Boolean).slice(2).join(".")}` : ""}`;
  if (normalized.startsWith("/storage/global")) return `claw.global${normalized.split("/").filter(Boolean).slice(2).join(".") ? `.${normalized.split("/").filter(Boolean).slice(2).join(".")}` : ""}`;
  if (normalized.startsWith("/storage/clawix")) return `clawix.home${normalized.split("/").filter(Boolean).slice(2).join(".") ? `.${normalized.split("/").filter(Boolean).slice(2).join(".")}` : ""}`;
  if (normalized.startsWith("/prefs/")) return normalized.split("/").filter(Boolean).join(".");
  return normalized.startsWith("/") ? normalized.slice(1).replace(/\//g, ".") : normalized;
}

function inspectFind(value: string): ClawPersistentSurfaceNode | undefined {
  const id = inspectPathToId(value);
  if (!id) return undefined;
  return findClawPersistentSurfaceNode(id) ?? inspectNodes().find((node) => node.path === value || node.key === value);
}

function inspectList(value: string | undefined): ClawPersistentSurfaceNode[] {
  if (!value || value === "/") return inspectNodes().filter((node) => !node.parentId);
  const node = inspectFind(value);
  if (!node) return [];
  return listClawPersistentSurfaceNodes(node.id);
}

function inspectText(nodes: ClawPersistentSurfaceNode[]): string {
  return nodes.map((node) => {
    const locator = node.path ?? node.key ?? node.name;
    return `${node.id}\t${node.kind}\t${node.owner}\t${locator}`;
  }).join("\n");
}

function renderInspectMarkdown(): string {
  const nodes = inspectNodes();
  const lines = [
    "# Claw persistent surface",
    "",
    "Generated from `claw inspect render --format markdown`. Do not edit by hand.",
    "",
    "## Tree",
    "",
    "```mermaid",
    renderInspectMermaid(),
    "```",
    "",
    "## Nodes",
    "",
    "| ID | Kind | Owner | Path / Key |",
    "| --- | --- | --- | --- |",
  ];
  for (const node of nodes) {
    lines.push(`| \`${node.id}\` | ${node.kind} | ${node.owner} | \`${node.path ?? node.key ?? ""}\` |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderInspectMermaid(): string {
  const nodes = inspectNodes();
  const lines = ["flowchart TD"];
  for (const node of nodes) {
    const label = `${node.name}\\n${node.kind}`;
    lines.push(`  ${mermaidId(node.id)}["${label.replace(/"/g, "'")}"]`);
    if (node.parentId) lines.push(`  ${mermaidId(node.parentId)} --> ${mermaidId(node.id)}`);
  }
  return lines.join("\n");
}

function mermaidId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

async function runInspectCliUnsafe(input: InspectCliInput): Promise<number> {
  const [, command = "tree", target] = input.positionals;
  if (command === "tree") {
    const payload = { version: clawPersistentSurfaceRegistry.version, nodes: inspectNodes() };
    if (input.wantsJson) writeJson(input.context.stdout, payload);
    else input.context.stdout.write(`${inspectText(payload.nodes)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "list") {
    const nodes = inspectList(target ?? "/");
    if (nodes.length === 0 && target && target !== "/") {
      throw new InspectCliError("inspect_not_found", `No persistent surface node found for ${target}.`, CLI_EXIT_USAGE);
    }
    if (input.wantsJson) writeJson(input.context.stdout, nodes);
    else input.context.stdout.write(`${inspectText(nodes)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "show") {
    if (!target) throw new InspectCliError("usage_error", `Usage: ${input.binName} inspect show <id-or-path> [--json]`, CLI_EXIT_USAGE);
    const node = inspectFind(target);
    if (!node) throw new InspectCliError("inspect_not_found", `No persistent surface node found for ${target}.`, CLI_EXIT_USAGE);
    if (input.wantsJson) writeJson(input.context.stdout, node);
    else input.context.stdout.write(`${inspectText([node])}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "database") {
    const nodes = inspectNodes().filter((node) => node.kind === "database" || node.kind === "sidecar" || node.databaseId);
    if (input.wantsJson) writeJson(input.context.stdout, nodes);
    else input.context.stdout.write(`${inspectText(nodes)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "storage") {
    const nodes = inspectNodes().filter((node) => ["root", "folder", "file", "socket", "statusFile", "legacyPath", "externalReadOnlySource"].includes(node.kind));
    if (input.wantsJson) writeJson(input.context.stdout, nodes);
    else input.context.stdout.write(`${inspectText(nodes)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "prefs") {
    const nodes = inspectNodes().filter((node) => node.kind === "preferenceKey" || node.kind === "appStorageKey" || node.kind === "browserStorageKey");
    if (input.wantsJson) writeJson(input.context.stdout, nodes);
    else input.context.stdout.write(`${inspectText(nodes)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "render") {
    const format = input.flags.format ?? "markdown";
    if (format === "mermaid") {
      input.context.stdout.write(`${renderInspectMermaid()}\n`);
      return CLI_EXIT_OK;
    }
    if (format === "markdown") {
      input.context.stdout.write(renderInspectMarkdown());
      return CLI_EXIT_OK;
    }
    throw new InspectCliError("usage_error", `Unsupported inspect render format: ${format}`, CLI_EXIT_USAGE);
  }
  throw new InspectCliError("usage_error", `Usage: ${input.binName} inspect tree|list|show|database|storage|prefs|render`, CLI_EXIT_USAGE);
}

export async function runInspectCli(input: InspectCliInput): Promise<number> {
  try {
    return await runInspectCliUnsafe(input);
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (input.wantsJson) writeCliError(input.context.stdout, handled);
    else input.context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }
}
