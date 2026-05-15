import fs from "fs";
import path from "path";

import { clawPersistentSurfaceRegistry, findClawPersistentSurfaceNode, listClawCliAliases, listClawCliCommands, resolveClawCliCommand, searchClawCliRegistry, withSurfaceChildren } from "@clawjs/core";
import type { ClawPersistentSurfaceNode, ClawPersistentSurfaceRegistry } from "@clawjs/core";
import { v1MainSchemaSurfaceNodes } from "./v1-data-surface.ts";
import { writeJsonError, writeJsonOk, type CliJsonMeta } from "./cli-json.ts";
import { CliHandledError } from "./cli-errors.ts";

interface CliContext {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
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

function cliErrorFromUnknown(error: unknown): InspectCliError {
  return error instanceof InspectCliError
    ? error
    : new InspectCliError("internal_error", error instanceof Error ? error.message : String(error));
}
interface InspectCliInput {
  argv?: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}

function inspectNodes(): ClawPersistentSurfaceNode[] {
  return withSurfaceChildren([...clawPersistentSurfaceRegistry.nodes, ...v1MainSchemaSurfaceNodes]);
}

function inspectRegistry(input: InspectCliInput): ClawPersistentSurfaceRegistry {
  const nodes = [...clawPersistentSurfaceRegistry.nodes, ...v1MainSchemaSurfaceNodes];
  for (const manifestPath of manifestPaths(input.flags)) {
    const manifest = readManifest(manifestPath, input.context.cwd);
    nodes.push(...manifest.nodes);
  }
  return {
    version: clawPersistentSurfaceRegistry.version,
    nodes,
  };
}

function manifestPaths(flags: Record<string, string>): string[] {
  const raw = flags.manifest || process.env.CLAW_INSPECT_MANIFEST || "";
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function readManifest(manifestPath: string, cwd: string): ClawPersistentSurfaceRegistry {
  const absolutePath = path.resolve(cwd, manifestPath);
  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as ClawPersistentSurfaceRegistry;
    if (!Array.isArray(parsed.nodes)) {
      throw new Error("manifest does not contain a nodes array");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new InspectCliError("inspect_manifest_error", `Could not read inspect manifest ${manifestPath}: ${message}`, CLI_EXIT_USAGE);
  }
}

function defaultCodebaseManifestPaths(cwd: string): string[] {
  const candidates = [
    "docs/codebase-manifest.json",
    "../Clawix/clawix/docs/codebase-manifest.json",
  ];
  return candidates.filter((manifestPath) => fs.existsSync(path.resolve(cwd, manifestPath)));
}

function codebaseManifestPaths(input: InspectCliInput): string[] {
  const raw = input.flags["codebase-manifest"] || process.env.CLAW_CODEBASE_MANIFEST || "";
  if (raw) return raw.split(",").map((value) => value.trim()).filter(Boolean);
  return defaultCodebaseManifestPaths(input.context.cwd);
}

function readOneCodebaseManifest(manifestPath: string, cwd: string): Record<string, unknown> {
  const absolutePath = path.resolve(cwd, manifestPath);
  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("manifest must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new InspectCliError("inspect_codebase_manifest_error", `Could not read codebase manifest ${manifestPath}: ${message}`, CLI_EXIT_USAGE);
  }
}

function readCodebaseManifest(input: InspectCliInput): unknown {
  const manifestPaths = codebaseManifestPaths(input);
  if (manifestPaths.length === 0) {
    throw new InspectCliError("inspect_codebase_manifest_error", "Could not find a codebase manifest. Run `node scripts/codebase-manifest.mjs --write` to create the ignored local manifest, or pass --codebase-manifest <path>.", CLI_EXIT_USAGE);
  }
  const manifests = manifestPaths.map((manifestPath) => ({
    manifestPath,
    manifest: readOneCodebaseManifest(manifestPath, input.context.cwd),
  }));
  if (manifests.length === 1) return manifests[0].manifest;
  return combineCodebaseManifests(manifests);
}

function codebaseSummaryFromFiles(files: Array<Record<string, unknown>>) {
  const summary = {
    files: files.length,
    tests: 0,
    entrypoints: 0,
    languages: {
      typescript: 0,
      javascript: 0,
      swift: 0,
    },
  };
  for (const file of files) {
    if (file.test === true) summary.tests += 1;
    if (file.entrypoint === true) summary.entrypoints += 1;
    if (file.language === "typescript") summary.languages.typescript += 1;
    if (file.language === "javascript") summary.languages.javascript += 1;
    if (file.language === "swift") summary.languages.swift += 1;
  }
  return summary;
}

function declarationMatchesSymbol(file: Record<string, unknown>, symbol: string): boolean {
  const declarations = Array.isArray(file.declarations) ? file.declarations : [];
  const exports = Array.isArray(file.exports) ? file.exports : [];
  return declarations.some((entry) => typeof entry === "object" && entry !== null && (entry as { name?: unknown }).name === symbol)
    || exports.includes(symbol);
}

function filterCodebaseManifest(manifest: unknown, input: InspectCliInput): unknown {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return manifest;
  const manifestObject = manifest as Record<string, unknown>;
  const files = Array.isArray(manifestObject.files) ? manifestObject.files as Array<Record<string, unknown>> : [];
  const wantsSummary = input.argv?.includes("--summary") || input.flags.summary === "true";
  const pathPrefix = input.flags["path-prefix"];
  const symbol = input.flags.symbol;
  const language = input.flags.language;
  const tests = input.flags.tests;
  const limit = input.flags.limit ? Number(input.flags.limit) : undefined;
  const hasFilters = !!(pathPrefix || symbol || language || tests !== undefined || Number.isFinite(limit));
  if (!wantsSummary && !hasFilters) return manifest;

  let filteredFiles = files;
  if (pathPrefix) filteredFiles = filteredFiles.filter((file) => typeof file.path === "string" && file.path.startsWith(pathPrefix));
  if (symbol) filteredFiles = filteredFiles.filter((file) => declarationMatchesSymbol(file, symbol));
  if (language) filteredFiles = filteredFiles.filter((file) => file.language === language);
  if (tests !== undefined) {
    const wantsTests = tests === "true";
    filteredFiles = filteredFiles.filter((file) => file.test === wantsTests);
  }
  const totalMatched = filteredFiles.length;
  if (Number.isFinite(limit)) filteredFiles = filteredFiles.slice(0, Math.max(0, limit!));

  const filter = {
    ...(pathPrefix ? { pathPrefix } : {}),
    ...(symbol ? { symbol } : {}),
    ...(language ? { language } : {}),
    ...(tests !== undefined ? { tests: tests === "true" } : {}),
    ...(Number.isFinite(limit) ? { limit } : {}),
    totalMatched,
    returned: wantsSummary ? 0 : filteredFiles.length,
  };
  const base = {
    ...manifestObject,
    summary: hasFilters ? codebaseSummaryFromFiles(filteredFiles) : manifestObject.summary,
    filter,
  };
  if (wantsSummary) {
    const { files: _files, ...manifestWithoutFiles } = manifestObject as typeof manifestObject & { files?: unknown };
    return {
      ...manifestWithoutFiles,
      summary: hasFilters ? codebaseSummaryFromFiles(filteredFiles) : manifestObject.summary,
      filter,
    };
  }
  return {
    ...base,
    files: filteredFiles,
  };
}

function combineCodebaseManifests(entries: Array<{ manifestPath: string; manifest: Record<string, unknown> }>): unknown {
  const files = [];
  const summary = {
    files: 0,
    tests: 0,
    entrypoints: 0,
    languages: {
      typescript: 0,
      javascript: 0,
      swift: 0,
    },
  };
  const astCoverage: Record<string, unknown> = {};
  for (const entry of entries) {
    const manifest = entry.manifest as {
      repository?: unknown;
      root?: unknown;
      astCoverage?: Record<string, unknown>;
      summary?: {
        files?: unknown;
        tests?: unknown;
        entrypoints?: unknown;
        languages?: Record<string, unknown>;
      };
      files?: Array<Record<string, unknown>>;
    };
    const repository = typeof manifest.repository === "string" ? manifest.repository : path.basename(path.dirname(path.dirname(entry.manifestPath))) || "repository";
    if (manifest.astCoverage && typeof manifest.astCoverage === "object") {
      Object.assign(astCoverage, manifest.astCoverage);
    }
    const manifestSummary = manifest.summary ?? {};
    summary.files += typeof manifestSummary.files === "number" ? manifestSummary.files : 0;
    summary.tests += typeof manifestSummary.tests === "number" ? manifestSummary.tests : 0;
    summary.entrypoints += typeof manifestSummary.entrypoints === "number" ? manifestSummary.entrypoints : 0;
    const languages = manifestSummary.languages ?? {};
    summary.languages.typescript += typeof languages.typescript === "number" ? languages.typescript : 0;
    summary.languages.javascript += typeof languages.javascript === "number" ? languages.javascript : 0;
    summary.languages.swift += typeof languages.swift === "number" ? languages.swift : 0;
    for (const file of Array.isArray(manifest.files) ? manifest.files : []) {
      files.push({
        ...file,
        repository,
        manifestPath: entry.manifestPath,
      });
    }
  }
  return {
    schemaVersion: 1,
    scope: "workspace",
    summary,
    astCoverage,
    manifests: entries.map((entry) => ({
      manifestPath: entry.manifestPath,
      repository: typeof entry.manifest.repository === "string" ? entry.manifest.repository : undefined,
      root: entry.manifest.root,
      summary: entry.manifest.summary,
      astCoverage: entry.manifest.astCoverage,
    })),
    files,
  };
}

function readConnectorCatalog(input: InspectCliInput): unknown {
  const configuredPath = input.flags["connector-catalog"] || input.flags.catalog || process.env.CLAW_CONNECTOR_CATALOG_PATH || "";
  const candidates = configuredPath
    ? [configuredPath]
    : ["packages/clawjs-integrations/fixtures/started-provider-runtime-catalog.json"];
  for (const catalogPath of candidates) {
    const absolutePath = path.resolve(input.context.cwd, catalogPath);
    if (!fs.existsSync(absolutePath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("catalog must be a JSON object");
      }
      return summarizeConnectorCatalog(parsed, catalogPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InspectCliError("inspect_connector_catalog_error", `Could not read connector catalog ${catalogPath}: ${message}`, CLI_EXIT_USAGE);
    }
  }
  return {
    catalogPath: configuredPath || null,
    support: {
      state: "external_pending",
      reason: "No connector catalog path was configured and the default local fixture is unavailable.",
    },
    apps: [],
    summary: {
      apps: 0,
      operations: 0,
      supportedOperations: 0,
      completeExternalSchemas: 0,
    },
  };
}

function summarizeConnectorCatalog(input: unknown, catalogPath: string): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("catalog must be a JSON object");
  }
  const catalog = input as { version?: unknown; apps?: unknown };
  const apps = Array.isArray(catalog.apps) ? catalog.apps.filter(isRecord).map((app) => {
    const operations = Array.isArray(app.operations) ? app.operations.filter(isRecord).map((operation) => ({
      id: typeof operation.id === "string" ? operation.id : "",
      kind: typeof operation.kind === "string" ? operation.kind : "",
      name: typeof operation.name === "string" ? operation.name : "",
      support: isRecord(operation.support) ? operation.support : null,
      externalSchema: isRecord(operation.externalSchema) ? {
        status: operation.externalSchema.status,
        source: operation.externalSchema.source,
        providerVersion: operation.externalSchema.providerVersion,
        hasInputSchema: isJsonObject(operation.externalSchema.inputSchema),
        hasOutputSchema: isJsonObject(operation.externalSchema.outputSchema),
        evidence: Array.isArray(operation.externalSchema.evidence) ? operation.externalSchema.evidence.filter((item) => typeof item === "string") : [],
      } : null,
      executionPolicy: isRecord(operation.executionPolicy) ? operation.executionPolicy : null,
    })) : [];
    return {
      id: typeof app.id === "string" ? app.id : "",
      name: typeof app.name === "string" ? app.name : "",
      support: isRecord(app.support) ? app.support : null,
      operations,
    };
  }) : [];
  const operations = apps.flatMap((app) => app.operations);
  return {
    catalogPath,
    version: catalog.version,
    apps,
    summary: {
      apps: apps.length,
      operations: operations.length,
      supportedOperations: operations.filter((operation) => operation.support && (operation.support as { state?: unknown }).state === "supported").length,
      completeExternalSchemas: operations.filter((operation) => operation.externalSchema?.status === "complete").length,
      authRequiredOperations: operations.filter((operation) => operation.executionPolicy && (operation.executionPolicy as { requiresAuth?: unknown }).requiresAuth === true).length,
      hostRequiredOperations: operations.filter((operation) => operation.executionPolicy && (operation.executionPolicy as { requiresHostApproval?: unknown }).requiresHostApproval === true).length,
      costRiskOperations: operations.filter((operation) => operation.executionPolicy && (operation.executionPolicy as { costRisk?: unknown }).costRisk === true).length,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonObject(value: unknown): boolean {
  return Boolean(value) && typeof value === "object";
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

function inspectFind(value: string, nodes = inspectNodes()): ClawPersistentSurfaceNode | undefined {
  const id = inspectPathToId(value);
  if (!id) return undefined;
  return findClawPersistentSurfaceNode(id) ?? nodes.find((node) => node.id === id || node.path === value || node.key === value);
}

function inspectList(value: string | undefined, nodes = inspectNodes()): ClawPersistentSurfaceNode[] {
  if (!value || value === "/") return nodes.filter((node) => !node.parentId);
  const node = inspectFind(value, nodes);
  if (!node) return [];
  return withSurfaceChildren(nodes).filter((candidate) => candidate.parentId === node.id);
}

function inspectText(nodes: ClawPersistentSurfaceNode[]): string {
  return nodes.map((node) => {
    const locator = node.path ?? node.route ?? node.key ?? node.value ?? node.name;
    return `${node.id}\t${node.kind}\t${node.owner}\t${node.surfaceClass ?? "persistent"}\t${formatSurfaceParity(node)}\t${locator}`;
  }).join("\n");
}

function formatSurfaceParity(node: ClawPersistentSurfaceNode): string {
  const human = node.humanSurfaces?.join("+") ?? "-";
  const programmatic = node.programmaticSurfaces?.join("+") ?? "-";
  const gaps = node.surfaceGaps?.map((gap) => `${gap.surface}:${gap.status}`).join(",") ?? "-";
  return `human=${human};programmatic=${programmatic};gaps=${gaps}`;
}

function inspectJsonMeta(subcommand: string, extra: CliJsonMeta = {}): CliJsonMeta {
  return {
    schemaVersion: 1,
    canonicalCommand: "inspect",
    subcommand,
    ...extra,
  };
}

function renderInspectMarkdown(nodes = inspectNodes()): string {
  const lines = [
    "# Claw stable surface",
    "",
    "Generated from `claw inspect render --format markdown`. Do not edit by hand.",
    "Use `claw inspect --manifest <path>` or `CLAW_INSPECT_MANIFEST=path[,path...]` to fuse static manifests from other language builders during inspection.",
    "`claw inspect why <surface>` explains the docs, ADRs, tests, and source backing a CLI command or registered surface.",
    "",
    "## Tree",
    "",
    "```mermaid",
    renderInspectMermaid(nodes),
    "```",
    "",
    "## Nodes",
    "",
    "| ID | Kind | Surface | Owner | Human | Programmatic | Gaps | Path / Key / Value |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const node of nodes) {
    const gaps = node.surfaceGaps?.map((gap) => `${gap.surface}:${gap.status}`).join("<br>") ?? "";
    lines.push(`| \`${node.id}\` | ${node.kind} | ${node.surfaceClass ?? "persistent"} | ${node.owner} | ${node.humanSurfaces?.join(", ") ?? ""} | ${node.programmaticSurfaces?.join(", ") ?? ""} | ${gaps} | \`${node.path ?? node.route ?? node.key ?? node.value ?? ""}\` |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderInspectMermaid(nodes = inspectNodes()): string {
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
  const registry = inspectRegistry(input);
  const nodes = withSurfaceChildren(registry.nodes);
  const selectByKinds = (kinds: string[]) => nodes.filter((node) => kinds.includes(node.kind));
  const selectBySurface = (surfaceClass: string) => nodes.filter((node) => node.surfaceClass === surfaceClass);
  if (command === "tree") {
    const payload = { version: registry.version, nodes };
    if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(payload.nodes)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "list") {
    const listed = inspectList(target ?? "/", nodes);
    if (listed.length === 0 && target && target !== "/") {
      throw new InspectCliError("inspect_not_found", `No persistent surface node found for ${target}.`, CLI_EXIT_USAGE);
    }
    if (input.wantsJson) writeJsonOk(input.context.stdout, listed, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(listed)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "show") {
    if (!target) throw new InspectCliError("usage_error", `Usage: ${input.binName} inspect show <id-or-path> [--json]`, CLI_EXIT_USAGE);
    const node = inspectFind(target, nodes);
    if (!node) throw new InspectCliError("inspect_not_found", `No persistent surface node found for ${target}.`, CLI_EXIT_USAGE);
    if (input.wantsJson) writeJsonOk(input.context.stdout, node, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText([node])}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "database") {
    const selected = nodes.filter((node) => node.kind === "database" || node.kind === "sidecar" || node.databaseId);
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "storage") {
    const selected = nodes.filter((node) => ["root", "folder", "file", "socket", "statusFile", "legacyPath", "externalReadOnlySource"].includes(node.kind));
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "prefs") {
    const selected = nodes.filter((node) => node.kind === "preferenceKey" || node.kind === "appStorageKey" || node.kind === "browserStorageKey");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "contracts" || command === "stable" || command === "compat") {
    const selected = nodes.filter((node) => node.surfaceClass && node.surfaceClass !== "persistent");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "apis") {
    const selected = selectByKinds(["apiRoute", "privateApiRoute", "apiMethod", "apiParameter", "webhook", "webhookEvent", "deepLink", "hostname", "port"]);
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "private-apis") {
    const selected = selectByKinds(["privateApiRoute"]);
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "env") {
    const selected = selectByKinds(["envVar", "envOverride"]);
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "packages") {
    const selected = selectBySurface("package");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "native") {
    const selected = selectBySurface("native");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "formats") {
    const selected = selectBySurface("format");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "provider-mappings") {
    const selected = selectByKinds(["externalDependency", "externalMapping"]);
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "protocols") {
    const selected = selectBySurface("protocol");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "events") {
    const selected = selectBySurface("event");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "schemas") {
    const selected = selectBySurface("schema");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "ids") {
    const selected = selectBySurface("id");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "cli") {
    const selected = selectBySurface("cli");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "surfaces" || command === "surface-parity") {
    const selected = nodes.filter((node) => node.humanSurfaces?.length || node.programmaticSurfaces?.length || node.surfaceGaps?.length);
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "commands") {
    const includeAdvanced = "all" in input.flags || input.flags.all === "true";
    const commands = listClawCliCommands({ includeAdvanced });
    if (input.wantsJson) {
      writeJsonOk(input.context.stdout, {
        version: registry.version,
        includeAdvanced,
        commands,
      }, inspectJsonMeta(command));
    } else {
      input.context.stdout.write(`${commands.map((entry) => `${entry.name}\t${entry.kind}\t${entry.support.state}\t${entry.securityPolicy}\t${entry.summary}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }
  if (command === "codebase") {
    const manifest = filterCodebaseManifest(readCodebaseManifest(input), input);
    if (input.wantsJson) writeJsonOk(input.context.stdout, manifest, inspectJsonMeta(command));
    else {
      const summary = (manifest as { summary?: { files?: number; tests?: number; entrypoints?: number } }).summary ?? {};
      input.context.stdout.write(`files\t${summary.files ?? 0}\ntests\t${summary.tests ?? 0}\nentrypoints\t${summary.entrypoints ?? 0}\n`);
    }
    return CLI_EXIT_OK;
  }
  if (command === "connectors") {
    const catalog = readConnectorCatalog(input);
    if (input.wantsJson) writeJsonOk(input.context.stdout, catalog, inspectJsonMeta(command));
    else {
      const summary = (catalog as { summary?: { apps?: number; operations?: number; supportedOperations?: number; completeExternalSchemas?: number } }).summary ?? {};
      input.context.stdout.write(`apps=${summary.apps ?? 0} operations=${summary.operations ?? 0} supported=${summary.supportedOperations ?? 0} completeExternalSchemas=${summary.completeExternalSchemas ?? 0}\n`);
    }
    return CLI_EXIT_OK;
  }
  if (command === "aliases") {
    const aliases = listClawCliAliases();
    if (input.wantsJson) writeJsonOk(input.context.stdout, {
      version: registry.version,
      aliases,
    }, inspectJsonMeta(command));
    else input.context.stdout.write(`${aliases.map((alias) => `${alias.alias}\t${alias.canonicalName}\t${alias.source}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "why") {
    if (!target) throw new InspectCliError("usage_error", `Usage: ${input.binName} inspect why <command-or-id> [--json]`, CLI_EXIT_USAGE);
    const cliCommand = resolveClawCliCommand(target);
    if (cliCommand) {
      const payload = {
        type: "cliCommand",
        name: cliCommand.name,
        canonicalName: cliCommand.target ?? cliCommand.name,
        kind: cliCommand.kind,
        summary: cliCommand.summary,
        support: cliCommand.support,
        securityPolicy: cliCommand.securityPolicy,
        schemaVersion: cliCommand.schemaVersion,
        jsonSchemaId: cliCommand.jsonSchemaId,
        docs: cliCommand.docs,
        adrs: cliCommand.adrs,
        tests: cliCommand.tests,
        source: cliCommand.source,
      };
      if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command, { canonicalName: payload.canonicalName }));
      else {
        input.context.stdout.write([
          `${payload.name}\t${payload.kind}\t${payload.securityPolicy}`,
          `docs\t${payload.docs.join(", ")}`,
          `adrs\t${payload.adrs.join(", ")}`,
          `tests\t${payload.tests.join(", ")}`,
          `source\t${payload.source.file}${payload.source.symbol ? `#${payload.source.symbol}` : ""}`,
        ].join("\n") + "\n");
      }
      return CLI_EXIT_OK;
    }
    const node = inspectFind(target, nodes);
    if (node) {
      const payload = {
        type: "surfaceNode",
        id: node.id,
        name: node.name,
        kind: node.kind,
        surfaceClass: node.surfaceClass ?? "persistent",
        source: node.source,
        notes: node.notes,
        warnings: node.warnings ?? [],
      };
      if (input.wantsJson) writeJsonOk(input.context.stdout, payload, inspectJsonMeta(command, { surfaceId: node.id }));
      else input.context.stdout.write(`${node.id}\t${node.kind}\t${node.source?.file ?? "source-unregistered"}\n${node.notes ?? ""}\n`);
      return CLI_EXIT_OK;
    }
    const related = searchClawCliRegistry(target, { limit: 5 });
    throw new InspectCliError("inspect_not_found", `No CLI command or persistent surface node found for ${target}.${related.length ? ` Related: ${related.map((entry) => entry.name).join(", ")}` : ""}`, CLI_EXIT_USAGE);
  }
  if (command === "external") {
    const selected = selectBySurface("external");
    if (input.wantsJson) writeJsonOk(input.context.stdout, selected, inspectJsonMeta(command));
    else input.context.stdout.write(`${inspectText(selected)}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "render") {
    const format = input.flags.format ?? "markdown";
    if (format === "mermaid") {
      input.context.stdout.write(`${renderInspectMermaid(nodes)}\n`);
      return CLI_EXIT_OK;
    }
    if (format === "markdown") {
      input.context.stdout.write(renderInspectMarkdown(nodes));
      return CLI_EXIT_OK;
    }
    throw new InspectCliError("usage_error", `Unsupported inspect render format: ${format}`, CLI_EXIT_USAGE);
  }
  throw new InspectCliError("usage_error", `Usage: ${input.binName} inspect tree|list|show|why|commands|codebase|connectors|aliases|database|storage|prefs|contracts|apis|protocols|events|schemas|ids|cli|surfaces|external|render`, CLI_EXIT_USAGE);
}

export async function runInspectCli(input: InspectCliInput): Promise<number> {
  try {
    return await runInspectCliUnsafe(input);
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (input.wantsJson) writeJsonError(input.context.stdout, new CliHandledError(handled.code, handled.message, handled.exitCode), inspectJsonMeta(input.positionals[1] ?? "tree"));
    else input.context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }
}
