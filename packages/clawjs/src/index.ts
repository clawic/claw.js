// @ts-nocheck
import fs from "fs";
import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { buildCodexCommand, buildSetDefaultModelCommand, createClaw, createLocalLibraryStore, createCodeLedger, createCodeGlobalIndex, startCodeServer, discoverWorkspaces, getRuntimeAdapter, normalizeLibraryId } from "@clawjs/claw";
import type { ClawInstance, TelegramSendMediaInput, TelegramSendMessageInput, VoiceNoteStatus } from "@clawjs/claw";
import { createWorkspaceClaw } from "@clawjs/workspace";
import type { WorkspaceClawInstance } from "@clawjs/workspace";
import { clawDenseDataOsRegistry, resolveBuiltinCollectionName, resolveClawPersistentSurfacePath, semanticPlanSchema } from "@clawjs/core";
import type { ClawDomain, CommitmentKind, CommitmentStatus, ContextPackPurpose, ContextPackStatus, JudgmentImpact, JudgmentStatus, LearningEvidenceSentiment, LearningKind, LearningPromotionTarget, LearningStatus, LearningTarget, MediaDirection, MediaKind, MediaListInput, MediaOrigin, OutcomeResult, OutcomeStatus, RuntimeAdapterId, SemanticPlan, UserCompileProfile, UserDomainId, UserEntityType, UserFactSensitivity, UserPackId, UserRecordType } from "@clawjs/core";
import { runMagicDbCli } from "./database-magic.ts";
import { runMemoryCli } from "./memory-local.ts";
import { runChatCli, runProviderCli } from "./chat.ts";
import {
  addProjectIntegration,
  collectProjectSnapshot,
  generateProjectResource,
  locateProjectRoot,
  readProjectConfig,
  type ClawIntegrationType,
  type ClawProjectType,
  type ClawResourceType,
} from "./project.ts";
import {
  createPackageName,
  createPascalCase,
  createTitle,
  detectPackageManager,
  scaffoldProject,
  type SupportedPackageManager,
} from "./scaffold.ts";
import { runSlidesCli } from "./slides.ts";
import { runStyleCli } from "./styles/index.ts";
import { runTemplateCli } from "./templates/index.ts";
import { runReferenceCli } from "./references/index.ts";
import { runV1DataCli } from "./v1-data.ts";
import { CLI_USAGE, DEFAULT_CLI_BIN, REMOVED_RUNTIME_COMMANDS, REMOVED_V1_CRUD_COMMANDS, buildCliUsage, buildCommandHelp, normalizePublicCliArgv, relatedCliMatches, removedPublicCommandMessage } from "./cli-surface.ts";
import { inferBrokerDeclaredFields } from "./broker-http.ts";
import { runInspectCli } from "./inspect-cli.ts";
import { CLI_TEMPLATE_ROOT } from "./cli-constants.ts";
import { COMMITMENT_KINDS, COMMITMENT_STATUSES, CONTEXT_PURPOSES, CONTEXT_STATUSES, JUDGMENT_IMPACTS, JUDGMENT_STATUSES, LEARNING_KINDS, LEARNING_PROMOTION_TARGETS, LEARNING_SENTIMENTS, LEARNING_STATUSES, LEARNING_TARGETS, OUTCOME_RESULTS, OUTCOME_STATUSES } from "./cli-knowledge-constants.ts";
import {
  LEGACY_TELEGRAM_CODEX_PROCESSOR_ID,
  TELEGRAM_CODEX_BOT_COMMANDS,
  TELEGRAM_TOPIC_ICON_PRESETS,
  type TelegramTopicIconPreset,
} from "./cli-telegram-codex-constants.ts";
import { parseImageOperation, parseImageProvenance, parseImageType } from "./cli-image-parsers.ts";
import { buildImageSharedInput, buildMediaListInput, buildMediaMetadata } from "./cli-media-utils.ts";
import { CODEX_AGENT_ID, normalizeTelegramCodexAccount, registerCodexAgentProcessor, resolveCodexRuntimeAdapterId, resolveTelegramCodexListenerOptions, runTelegramCodexProcessor } from "./cli-telegram-codex.ts";
import { OPEN_SURFACES, buildOpenUsage, openSurfaceRows, resolveOpenSurface, surfacePrimaryClawUrl, type OpenSurface, type OpenSurfaceState } from "./cli-open-surfaces.ts";
import { currentCliEntryPath, openBrowser, openStateDir, openStatePath, readOpenState, repoRootFromCliPackage, writeOpenState } from "./cli-open-state.ts";
import { buildSurfaceCommand, ensureSurfaceBuild, prepareOpenSurface } from "./cli-open-runtime.ts";
import { portIsOpen, probeHttpServer, processIsAlive, waitForUrl, writeProgress } from "./cli-process-utils.ts";
import { CLAW_DOMAINS_BEGIN, CLAW_DOMAINS_END, parseSurfacePortOverrides, surfaceTargetPort } from "./cli-domains-config.ts";
import { runDomainsCli } from "./cli-domains-command.ts";
import { hostRegistryOptions, runHostCli } from "./cli-host-command.ts";
import { runDirectHostDomainCli, runHostForwardCli, runSystemCapabilitiesCli } from "./cli-host-forward.ts";
import { runSystemCli } from "./cli-system-command.ts";
import { runNetworkCli } from "./cli-network-command.ts";
import { createCliClaw, createCliWorkspaceClaw } from "./cli-claw-factory.ts";
import { parseRuleHints, parseRuleReferences } from "./cli-rule-utils.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
export { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { cliErrorFromUnknown, setCliJsonMetaProvider, writeCommandJsonError, writeCommandJsonOk, writeJsonLine } from "./cli-json.ts"; import { installCliRuntimeMetaProvider } from "./cli-runtime-meta.ts";
import { runOpenServerCommand } from "./cli-open-server.ts";
import { runCollectionsCli } from "./cli-collections-command.ts";
import { collectFlagValues, extractPositionals, formatCliTable, joinedPositionals, parseCsvFlag, parseFlags, parseJsonFlag, readBooleanFlag } from "./cli-flag-parsers.ts";
import { inferAudioExtension, inferMimeTypeFromPath, parseContextBlock, parseInferenceMessages, pathSafeBasename, readJsonFile, resolveRuntimeAdapterId, timelineRange, type GenerationCliMediaKind } from "./cli-runtime-utils.ts";
import { runTemporalCli } from "./cli-temporal-command.ts";
import { parsePreviewShareMode, resolvePreviewTargetUrl, runCloudflarePreviewShare, runLanPreviewShare, runTailscalePreviewShare } from "./cli-preview-share.ts";
import { parseLooseCliValue, parseObjectFlag, parseSetFlags, parseSkillParamsFlag, parseSkillScopeFlag, parseSoulModulesFromSetFlags, parseUserFactValue, parseUserFieldsFromSetFlags, parseUserMetadataFlags, readAllStdin } from "./cli-value-utils.ts";
import { assertAllowedLocalFlags, coreProductivityCollection, mergeCoreDbInput, pickCoreTitle, singularCoreCollection } from "./cli-productivity-utils.ts";
import { runCoreProductivityDbCli } from "./cli-productivity-command.ts";
import { runPrimaryProductivityCli } from "./cli-productivity-primary-command.ts";
import { runExtendedProductivityCli } from "./cli-productivity-extended-command.ts";
import { runCodeCli } from "./cli-code-command.ts";
import { runPlanCli } from "./cli-plan-command.ts";
import { runKnowledgeTailCli } from "./cli-knowledge-tail-command.ts";
import { isSearchAdminCommand, runCliDiscoverySearch, runSearchAdminCli, runSearchQueryCli, runSearchRebuildCli } from "./cli-search-command.ts"; import { runGuidanceResourcesCli } from "./cli-guidance-resources-command.ts";
import { runNeedsCli } from "./cli-needs-command.ts";
import { runCommandsCli } from "./cli-commands-command.ts";
import { runEvolutionCli } from "./cli-evolution-command.ts";
import { runSafetyCli } from "./cli-safety-command.ts";
import { enabledModuleIdsForConfig, hasModuleConfigForCli, readEffectiveModuleConfigForCli, requiredModuleForCliGroup, runModulesCli, runSetupCli } from "./cli-modules-command.ts";
import { runConnectorContextCli } from "./cli-connector-context-command.ts";
import { runProjectManifestCli } from "./cli-project-command.ts";
import { runGatewayCli, runNodesCli, runRemoteCli, runSyncCli } from "./cli-remote-sync-command.ts";
import { isMacControlCliRoot, runMacControlCli } from "./cli-mac-control-command.ts";
import { runPublicPortalShortcut, writeMissingSubcommandJsonHelp, writePublicPortalHelpOnly } from "./cli-public-portal-routes.ts";
import { handleUnknownCliCommand } from "./cli-unknown-command.ts";
import { channelListenerPaths, isProcessRunning, readListenerPid, readTail, waitForListenerPid } from "./cli-channel-listener.ts";
import {
  buildFallbackSemanticPlan,
  createDelegationGraphForPlan,
  evaluatePlanPolicy,
  formatPlan,
  nowIso,
  planId,
  readAgentPlanState,
  statusFromDecision,
  writeAgentPlanState,
  type AgentPlanPolicyRule,
  type AgentPlanRecord,
} from "./cli-agent-plan.ts";
export { CLI_USAGE, DEFAULT_CLI_BIN, buildCliUsage } from "./cli-surface.ts";
export interface CliContext {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  stdin?: NodeJS.ReadableStream;
  cwd: string;
  binName?: string;
  runCommand?: (command: string, args: string[], options: { cwd: string }) => Promise<void>;
}
type CliMediaShare = { id: string; url: string };
type CliMediaClaw = ClawInstance & {
  media: {
    register(input: { name?: string; mimeType?: string; kind?: MediaKind; filePath?: string; sourceText?: string; origin?: MediaOrigin; direction?: MediaDirection; agentId?: string; workspaceId?: string; projectId?: string; metadata?: Record<string, unknown> }): { mediaId: string; kind: string; name: string };
    list(input?: MediaListInput): Array<{ mediaId: string; kind: string; name: string }>;
    search(input: MediaListInput & { query: string }): Array<{ mediaId: string; kind: string; name: string }>;
    get(mediaId: string): { name: string } | null;
    download(mediaId: string): { media: { name: string }; buffer: Buffer } | null;
    share: {
      create(input: { mediaId?: string; label?: string; legalLabel?: string; approvalId?: string; filters?: MediaListInput; expiresAt?: string | null; ttlMs?: number }): Promise<CliMediaShare>;
      list(): CliMediaShare[];
      revoke(id: string): Promise<boolean>;
      resolveGallery(id: string): { items: Array<{ mediaId: string; name: string }> } | null;
    };
  };
};

const REMOVED_CONTENT_PORTAL_COMMANDS = new Set(["posts", "campaigns", "publications"]);
const DENSE_FOUNDATION_OPTIONAL_GROUPS = [
  "dense-fixture",
  "dense-fixtures",
  "accounting",
  "appliance-maintenance",
  "batch-record",
  "canonical-operation",
  "canonical-operations",
  "concept",
  "concept-mapping",
  "concept-mappings",
  "construction",
  "data-gap",
  "data-gaps",
  "domain-intent",
  "domain-intents",
  "domain-pack",
  "domain-packs",
  ["domain", "prof" + "ile"].join("-"),
  ["domain", "prof" + "iles"].join("-"),
  "domain-role",
  "domain-roles",
  "domain-system",
  "domain-systems",
  "encounter",
  "evidence-source",
  "evidence-sources",
  "erp",
  "health",
  "instrument",
  "instrument-item",
  "instrument-items",
  "instrument-response",
  "instrument-responses",
  "iot",
  "lab",
  "lab-result",
  "lab-results",
  "labs",
  "legal",
  "lot-release",
  "medication",
  "patient",
  "patients",
  "pharma",
  "product-bom",
  "property-offer",
  "provenance-event",
  "provenance-events",
  "purchase-order-line-item",
  "quality-gap",
  "quality-gaps",
  "relation",
  "relations",
  "semantic-view",
  "semantic-views",
  "symptom",
  "thing",
  "things",
  ["typed", "prof" + "ile"].join("-"),
  ["typed", "prof" + "iles"].join("-"),
  "unit",
  "units",
  "universal-relation",
  "universal-relations",
  "vehicle-insurance-policy",
  "vehicle-maintenance",
  "vocabularies",
  "vocabulary",
];
const DENSE_DATA_OPTIONAL_GROUPS = new Set([
  ...DENSE_FOUNDATION_OPTIONAL_GROUPS,
  ...clawDenseDataOsRegistry.systems.flatMap((system) => [
    system.canonicalCommand,
    ...system.aliases,
    ...system.centers.flatMap((center) => [center.commandNoun, ...center.commandAliases]),
  ]),
]);

async function runOptionalDenseDataCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
}): Promise<number | null> {
  const modulePath = [".", "cli-dense-data-command.ts"].join("/");
  try {
    const optionalPack = await import("@clawjs/domain-pack-dense-data") as { runDenseDataCli?: (packInput: unknown) => Promise<number | null> };
    if (typeof optionalPack.runDenseDataCli === "function") {
      return await optionalPack.runDenseDataCli(input);
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException & { code?: string }).code;
    if (code !== "ERR_MODULE_NOT_FOUND" && code !== "MODULE_NOT_FOUND") throw error;
  }
  try {
    const { runDenseDataCli } = await import(modulePath) as typeof import("./cli-dense-data-command.ts");
    return await runDenseDataCli(input);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException & { code?: string }).code;
    if (code !== "ERR_MODULE_NOT_FOUND" && code !== "MODULE_NOT_FOUND") throw error;
    const moduleId = requiredModuleForCliGroup(input.positionals[0])?.id ?? input.positionals[0] ?? "domain";
    throw new CliHandledError(
      "optional_pack_missing",
      `This domain command needs optional pack @clawjs/domain-pack-dense-data. Review it with \`${input.binName} modules install ${moduleId}\` and install the pack explicitly before using deep domain commands.`,
      CLI_EXIT_USAGE,
    );
  }
}

function isClawDomainConfigured(flags: Record<string, string>): boolean {
  if (process.env.CLAW_DOMAINS_ACTIVE === "1") return true;
  if (process.env.CLAW_DOMAINS_ACTIVE === "0") return false;
  const hostsFile = flags["domains-hosts-file"] || flags["hosts-file"] || "/etc/hosts";
  try {
    const content = fs.readFileSync(hostsFile, "utf8");
    return content.includes(CLAW_DOMAINS_BEGIN) && content.includes(CLAW_DOMAINS_END);
  } catch {
    return false;
  }
}
async function ensureDomainSurfaceRunning(surface: OpenSurface, flags: Record<string, string>, workspace: string): Promise<URL> {
  const port = surfaceTargetPort(surface, flags);
  const targetUrl = new URL(`http://127.0.0.1:${port}`);
  if (await probeHttpServer(targetUrl)) return targetUrl;
  if (flags["no-auto-start"] !== undefined || flags["auto-start"] === "false") return targetUrl;
  const result = spawnSync(process.execPath, [
    currentCliEntryPath(),
    "open",
    surface.id,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--workspace",
    workspace,
    "--domains-hosts-file",
    path.join(os.tmpdir(), "claw-domains-disabled-hosts"),
    "--no-browser",
    "--json",
  ], {
    cwd: repoRootFromCliPackage(),
    encoding: "utf8",
    env: {
      ...process.env,
      CLAW_DOMAINS_ACTIVE: "0",
    },
  });
  if (result.status !== 0) {
    throw new CliHandledError("domain_surface_start_failed", result.stdout || result.stderr || `Failed to start ${surface.id}.`);
  }
  return targetUrl;
}

async function runOpenCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number> {
  const surfaceName = input.positionals[1];
  if (!surfaceName || surfaceName === "list") {
    if (input.wantsJson) {
      writeCommandJsonOk(input.context.stdout, "open", { dashboards: openSurfaceRows(isClawDomainConfigured(input.flags)) }, { subcommand: "list" });
    } else {
      input.context.stdout.write(`${formatCliTable(openSurfaceRows(isClawDomainConfigured(input.flags)))}\n`);
    }
    return CLI_EXIT_OK;
  }
  if (surfaceName === "help" || input.argv.includes("--help") || input.argv.includes("-h")) {
    input.context.stdout.write(`${buildOpenUsage(input.binName)}\n`);
    return CLI_EXIT_OK;
  }

  const surface = resolveOpenSurface(surfaceName);
  if (!surface) {
    throw new CliHandledError("unknown_dashboard", `Unknown dashboard: ${surfaceName}`, CLI_EXIT_USAGE);
  }

  const host = input.flags.host ?? "127.0.0.1";
  const port = input.flags.port ? Number(input.flags.port) : surface.port;
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new CliHandledError("invalid_port", `Invalid port: ${input.flags.port}`, CLI_EXIT_USAGE);
  }

  const workspace = path.resolve(input.context.cwd, input.flags.workspace ?? ".");
  const directUrl = `http://${host}:${port}`;
  const useClawDomain = isClawDomainConfigured(input.flags) && host === "127.0.0.1" && port === surface.port;
  const url = useClawDomain ? surfacePrimaryClawUrl(surface) : directUrl;
  const statePath = openStatePath(surface.id, host, port);
  const state = readOpenState(statePath);
  if (state && state.surface === surface.id && state.host === host && state.port === port && processIsAlive(state.pid)) {
    if (await waitForUrl(state.targetUrl || state.url, 1_000)) {
      const outputUrl = useClawDomain ? surfacePrimaryClawUrl(surface) : state.url;
      if (!input.argv.includes("--no-browser") && !readBooleanFlag(input.argv, input.flags, "no-browser", false)) openBrowser(outputUrl);
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "open", { reused: true, surface: surface.id, url: outputUrl, pid: state.pid }, { subcommand: surface.id });
      else input.context.stdout.write(`${outputUrl}\n`);
      return CLI_EXIT_OK;
    }
  }
  if (state) {
    fs.rmSync(statePath, { force: true });
  }

  if (await portIsOpen(host, port)) {
    throw new CliHandledError("port_in_use", `${directUrl} is already in use. Use --port to choose another port.`);
  }

  ensureSurfaceBuild(surface);
  prepareOpenSurface(surface, workspace);
  const command = buildSurfaceCommand(surface, { host, port, workspace });
  const child = spawn(command.command, command.args, {
    cwd: command.cwd,
    env: command.env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  if (!child.pid) {
    throw new CliHandledError("dashboard_start_failed", `Failed to start ${surface.id} dashboard.`);
  }

  const nextState: OpenSurfaceState = {
    surface: surface.id,
    pid: child.pid,
    host,
    port,
    url,
    targetUrl: directUrl,
    workspace,
    startedAt: new Date().toISOString(),
  };
  writeOpenState(statePath, nextState);

  const ready = await waitForUrl(directUrl);
  if (!ready) {
    throw new CliHandledError("dashboard_start_timeout", `${surface.id} dashboard did not become ready at ${directUrl}.`);
  }

  const browserUrl = surface.id === "storage" && fs.existsSync(path.join(openStateDir(), `storage-token-${host}-${port}.txt`))
    ? `${url}?token=${encodeURIComponent(fs.readFileSync(path.join(openStateDir(), `storage-token-${host}-${port}.txt`), "utf8").trim())}&bucket=workspace`
    : url;
  if (!input.argv.includes("--no-browser") && !readBooleanFlag(input.argv, input.flags, "no-browser", false)) openBrowser(browserUrl);
  if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "open", { reused: false, surface: surface.id, url, pid: child.pid }, { subcommand: surface.id });
  else input.context.stdout.write(`${url}\n`);
  return CLI_EXIT_OK;
}

const HOST_FORWARD_DOMAINS = new Set<ClawDomain>([
  "agents",
  "skills",
  "design",
  "sessions",
  "projects",
  "memory",
  "files",
  "productivity",
  "calendar",
  "contacts",
  "reminders",
  "mail",
  "notes",
  "messages",
  "browser",
  "terminal",
  "voice",
  "models",
  "services",
  "database",
  "connectors",
  "integrations",
  "system",
  "secrets",
  "mini_apps",
]);

function runForegroundProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
  },
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => options.stdout.write(chunk));
    child.stderr?.on("data", (chunk) => options.stderr.write(chunk));
    child.on("error", (error) => {
      options.stderr.write(`${error.message}\n`);
      resolve(CLI_EXIT_FAILURE);
    });
    child.on("close", (exitCode) => resolve(exitCode ?? CLI_EXIT_FAILURE));
  });
}
function resolveCliPackageVersion(): string | null {
  try {
    const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version?: string };
    return packageJson.version ?? null;
  } catch {
    return null;
  }
}

function resolveRelayBaseUrl(flags: Record<string, string>): string {
  const raw = flags["relay-url"] ?? process.env.CLAW_RELAY_URL ?? process.env.RELAY_URL ?? "";
  if (!raw.trim()) {
    throw new Error("--relay-url is required");
  }
  const trimmed = raw.trim().replace(/\/$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function requireRelayBrowserConfig(flags: Record<string, string>): {
  baseUrl: string;
  accessToken: string;
  tenantId: string;
  agentId: string;
  workspaceId: string;
} {
  const accessToken = (flags["access-token"] ?? process.env.CLAW_RELAY_ACCESS_TOKEN ?? "").trim();
  const tenantId = (flags["tenant-id"] ?? process.env.CLAW_RELAY_TENANT_ID ?? "").trim();
  const agentId = (flags["agent-id"] ?? process.env.CLAW_RELAY_AGENT_ID ?? "").trim();
  const workspaceId = (flags["workspace-id"] ?? process.env.CLAW_RELAY_WORKSPACE_ID ?? "").trim();
  if (!accessToken) throw new Error("--access-token is required");
  if (!tenantId) throw new Error("--tenant-id is required");
  if (!agentId) throw new Error("--agent-id is required");
  if (!workspaceId) throw new Error("--workspace-id is required");
  return {
    baseUrl: resolveRelayBaseUrl(flags),
    accessToken,
    tenantId,
    agentId,
    workspaceId,
  };
}

async function relayBrowserRequest<T>(
  flags: Record<string, string>,
  input: {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
  },
): Promise<T> {
  const { baseUrl, accessToken } = requireRelayBrowserConfig(flags);
  const response = await fetch(`${baseUrl}${input.path}`, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Relay browser request failed: ${response.status}`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

function parsePackageManager(value: string | undefined): SupportedPackageManager {
  if (!value || value === "npm") return "npm";
  if (value === "pnpm") return "pnpm";
  throw new CliHandledError("invalid_enum", `Invalid package manager "${value}". Allowed values: npm, pnpm.`, CLI_EXIT_USAGE);
}

function resolveTemplateName(type: ClawProjectType, value: string | undefined): string {
  if (value?.trim()) return value.trim();
  if (type === "app") return "next";
  return "node";
}

function resolveTemplateDirectory(type: ClawProjectType, templateName: string): string {
  const templateDir = path.join(CLI_TEMPLATE_ROOT, type);
  if (type === "app" && templateName !== "next") {
    throw new Error(`Unsupported template for ${type}: ${templateName}`);
  }
  if (type !== "app" && templateName !== "node") {
    throw new Error(`Unsupported template for ${type}: ${templateName}`);
  }
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Missing CLI template for ${type}.`);
  }
  return templateDir;
}

function buildScaffoldNextSteps(type: ClawProjectType, packageManager: SupportedPackageManager): string[] {
  if (type === "agent") {
    return [
      `${packageManager} run claw:init`,
      `${packageManager} run agent:report`,
      `${packageManager} run agent:reply -- "Say hello"`,
    ];
  }
  if (type === "skill") {
    return [
      `${packageManager} test`,
      `${packageManager} run skill:check`,
    ];
  }
  if (type === "plugin") {
    return [
      `${packageManager} test`,
      `${packageManager} run plugin:check`,
    ];
  }
  if (type === "workspace") {
    return [
      `${packageManager} run claw:init`,
      `${packageManager} run claw:info`,
    ];
  }
  return [
    `${packageManager} run claw:init`,
    `${packageManager} run dev`,
  ];
}

function buildScaffoldCompletionNote(type: ClawProjectType): string {
  if (type === "workspace") {
    return "The generated workspace is intentionally minimal. Add capabilities over time with `claw generate` and `claw add`.";
  }
  if (type === "skill") {
    return "The generated package is intentionally narrow: one skill, one contract, one harness, ready to reuse across agents.";
  }
  if (type === "plugin") {
    return "The generated package is broader than a skill: it combines config, hooks, runtime support metadata, and bundled logic in one distributable plugin.";
  }
  return "The generated project uses the demo adapter by default. Switch scripts and helpers to openclaw when you want a real runtime.";
}

function registerGeneratedSkillInLibrary(input: {
  id: string;
  title: string;
  sourcePath: string;
  flags: Record<string, string>;
}): void {
  const store = createLocalLibraryStore({ rootDir: input.flags["library-dir"] });
  const assetId = normalizeLibraryId(input.id, "skill");
  const existing = store.get(assetId);
  const payload = {
    title: input.title,
    source: {
      source: "local",
      path: input.sourcePath,
    },
  };
  if (existing) {
    store.update(assetId, payload);
    return;
  }
  store.create({
    id: assetId,
    kind: "skill",
    title: input.title,
    tags: parseCsvFlag(input.flags.tags),
    source: payload.source,
  });
}

function resolveProjectRootOrThrow(startDir: string, explicitProject?: string): string {
  const root = explicitProject ? path.resolve(startDir, explicitProject) : locateProjectRoot(startDir);
  if (!root) {
    throw new Error("No Claw project found. Run `claw new ...` first or pass --project to a folder that contains claw.project.json.");
  }
  if (!readProjectConfig(root)) {
    throw new Error(`Missing or invalid claw.project.json at ${root}.`);
  }
  return root;
}

async function runCliUnsafe(argv: string[], context: CliContext): Promise<number> {
  const binName = context.binName?.trim() || DEFAULT_CLI_BIN;
  argv = normalizePublicCliArgv(argv, context.stderr, binName);
  const positionals = extractPositionals(argv);
  const [group, command, subcommand] = positionals;
  const wantsJson = argv.includes("--json");
  const flags = parseFlags(argv);
  const usage = buildCliUsage(binName, { all: argv.includes("--all") });
  const wantsHelp = argv.includes("--help") || argv.includes("-h");
  const writeRootJson = (payload: unknown, canonicalCommand = group === "db" ? "database" : group === "provider" ? "providers" : group === "style" ? "styles" : group === "template" ? "templates" : group === "ref" ? "references" : group === "image" ? "images" : group ?? "claw") => writeCommandJsonOk(context.stdout, canonicalCommand, payload, { invokedCommand: group ?? canonicalCommand, subcommand: command ?? null, ...(subcommand ? { operation: subcommand } : {}) });
  const writeRootJsonError = (error: unknown, canonicalCommand = group === "db" ? "database" : group === "provider" ? "providers" : group === "style" ? "styles" : group === "template" ? "templates" : group === "ref" ? "references" : group === "image" ? "images" : group ?? "claw", extraMeta: Record<string, unknown> = {}) => writeCommandJsonError(context.stdout, canonicalCommand, error, { invokedCommand: group ?? canonicalCommand, subcommand: command ?? null, ...(subcommand ? { operation: subcommand } : {}), ...extraMeta });
  const writeRemovedJsonOrText = (canonicalCommand: string, message: string): number => { if (wantsJson) writeRootJsonError(new CliHandledError("removed_public_command", message, CLI_EXIT_USAGE), canonicalCommand); else context.stderr.write(`${message}\n`); return CLI_EXIT_USAGE; };

  const removedMessage = group ? removedPublicCommandMessage(group, binName) : null;
  if (removedMessage) {
    if (wantsJson) writeRootJsonError(new CliHandledError("removed_public_command", removedMessage, CLI_EXIT_USAGE), group, { related: relatedCliMatches(group, { limit: 12 }) });
    else context.stderr.write(`${removedMessage}\n`);
    return CLI_EXIT_USAGE;
  }

  if ((group === "runtime" || group === "monitor") && command && REMOVED_RUNTIME_COMMANDS.has(command)) {
    const detail = group === "runtime"
      ? "Runtime is limited to adapters and setup."
      : "Monitor is limited to health, uptime, incidents, metrics and dashboards.";
    return writeRemovedJsonOrText(group, `\`${binName} ${group} ${command}\` is not part of the public Claw CLI surface. ${detail}`);
  }

  if ((group === "business" || group === "social") && command && REMOVED_V1_CRUD_COMMANDS.has(command)) {
    return writeRemovedJsonOrText(group, `\`${binName} ${group} ${command}\` is removed pre-v1 CRUD and is not part of the public Claw CLI surface. Use the ${group} portal help to pick a supported route.`);
  }

  if (group === "content" && command && REMOVED_V1_CRUD_COMMANDS.has(command)) {
    return writeRemovedJsonOrText("content", `\`${binName} content ${command}\` is removed pre-v1 CRUD and is not part of the public Claw CLI surface. Use content brand, destination, campaign, entry, approval, or publish commands.`);
  }
  if (group === "content" && command && REMOVED_CONTENT_PORTAL_COMMANDS.has(command)) {
    return writeRemovedJsonOrText("content", `\`${binName} content ${command}\` is removed pre-v1 portal shorthand and is not part of the public Claw CLI surface. Use content brand, destination, campaign, entry, approval, or publish commands.`);
  }

  if (wantsHelp || group === "help") {
    if (!group || group === "help") {
      context.stdout.write(`${usage}\n`);
      return CLI_EXIT_OK;
    }
    const commandHelp = buildCommandHelp(binName, group);
    context.stdout.write(`${commandHelp ?? usage}\n`);
    return CLI_EXIT_OK;
  }

  const missingSubcommandJsonExit = writeMissingSubcommandJsonHelp({ group, command, wantsJson, context, binName, usage });
  if (missingSubcommandJsonExit !== null) return missingSubcommandJsonExit;

  if (group === "__open-server") {
    return await runOpenServerCommand({ positionals, flags, context });
  }

  if (group === "setup") {
    return await runSetupCli({ positionals, flags, argv, context, wantsJson });
  }

  if (group === "modules") {
    return await runModulesCli({ positionals, flags, argv, context, wantsJson });
  }

  if (group === "open") {
    return await runOpenCli({ argv, positionals, flags, context, wantsJson, binName });
  }

  if (group === "inspect") {
    return await runInspectCli({ argv, positionals, flags, context, wantsJson, binName });
  }

  if (group === "domains") {
    return await runDomainsCli({ argv, positionals, flags, context, wantsJson, binName, invokedCommand: "domains", ensureDomainSurfaceRunning });
  }

  if (group === "host" && command === "domains") {
    return await runDomainsCli({ argv: ["domains", ...argv.slice(2)], positionals: ["domains", ...positionals.slice(2)], flags, context, wantsJson, binName, invokedCommand: "host domains", ensureDomainSurfaceRunning });
  }

  if (group === "host" && (command === "services" || command === "permissions" || command === "capabilities")) {
    return await runHostForwardCli({
      domain: "system",
      resource: command,
      action: subcommand || "list",
      flags,
      context,
      wantsJson,
    });
  }

  if (group === "host") {
    return await runHostCli({ argv, positionals, flags, context, wantsJson, binName, ensureDomainSurfaceRunning });
  }

  if (group === "system" && command === "capabilities") {
    return await runSystemCapabilitiesCli({ positionals, flags, context, wantsJson, binName });
  }

  if (group === "system") {
    return await runSystemCli({ argv, positionals, flags, context, wantsJson, binName, workspaceRoot: flags.workspace || context.cwd });
  }

  if (group === "network") {
    return await runNetworkCli({ argv, positionals, flags, context, wantsJson, binName, workspaceRoot: flags.workspace || context.cwd });
  }

  if (group === "collections") return await runCollectionsCli({ argv, positionals, flags, context, wantsJson, runCli: runCliUnsafe });
  if (group === "records") return await runCliUnsafe(["db", ...argv.slice(1)], context);
  if (group === "needs") return await runNeedsCli({ positionals, flags, argv, context, wantsJson, binName, workspaceRoot: flags.workspace || context.cwd });
  if (group === "commands") return await runCommandsCli({ positionals, flags, argv, context, wantsJson, binName, workspaceRoot: flags.workspace || context.cwd });
  if (group === "evolution") return await runEvolutionCli({ positionals, flags, context, wantsJson, binName });
  if (group === "safety") return await runSafetyCli({ positionals, flags, context, wantsJson, binName });
  const connectorContextExit = await runConnectorContextCli({ group, command, subcommand, positionals, flags, argv, context, wantsJson, binName });
  if (connectorContextExit !== null) return connectorContextExit;
  const projectManifestExit = await runProjectManifestCli({ argv, positionals, flags, context, wantsJson, binName });
  if (projectManifestExit !== null) return projectManifestExit;
  if (group === "remote") return await runRemoteCli({ positionals, flags, context, wantsJson, binName });
  if (group === "sync") return await runSyncCli({ positionals, flags, context, wantsJson, binName });
  if (group === "nodes") return await runNodesCli({ positionals, flags, context, wantsJson, binName });
  if (group === "gateway") return await runGatewayCli({ positionals, flags, context, wantsJson, binName });
  if (isMacControlCliRoot(group)) return await runMacControlCli({ argv, positionals, flags, context, wantsJson, binName });

  const portalShortcutExit = await runPublicPortalShortcut({ group, command, subcommand, argv, flags, context, runCli: runCliUnsafe });
  if (portalShortcutExit !== null) return portalShortcutExit;

  const gatedModule = requiredModuleForCliGroup(group);
  if (gatedModule && command) {
    const enabledModules = enabledModuleIdsForConfig(readEffectiveModuleConfigForCli(flags, context.cwd));
    if (!enabledModules.has(gatedModule.id)) {
      const installHint = gatedModule.requiresExplicitInstall ? ` If this area needs its optional pack, review it with \`${binName} modules install ${gatedModule.id}\`.` : "";
      const message = `\`${binName} ${group}\` is available but not enabled. Enable it with \`${binName} modules enable ${gatedModule.id}\` before using this ${gatedModule.kind}.${installHint}`;
      const error = new CliHandledError("module_not_enabled", message, CLI_EXIT_USAGE);
      if (wantsJson) writeRootJsonError(error, group, { requiredModule: gatedModule.id });
      else context.stderr.write(`${message}\n`);
      return CLI_EXIT_USAGE;
    }
  }

  if (group && command && DENSE_DATA_OPTIONAL_GROUPS.has(group)) {
    const denseDataShortcutExit = await runOptionalDenseDataCli({ argv, positionals, flags, context, wantsJson, binName, workspaceRoot: flags.workspace || context.cwd });
    if (denseDataShortcutExit !== null) return denseDataShortcutExit;
  }

  if (["runtime", "monitor", "infra", "ops"].includes(group ?? "") && command) {
    const v1DataExitCode = await runV1DataCli({
      argv,
      positionals,
      flags,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      binName,
      cwd: context.cwd,
    });
    if (v1DataExitCode !== null) return v1DataExitCode;
  }

  if (group === "diagnostics") {
    return await runCliUnsafe(["doctor", ...argv.slice(1)], context);
  }

  const portalHelpOnlyExit = writePublicPortalHelpOnly({ group, command, subcommand, wantsJson, context, binName, usage });
  if (portalHelpOnlyExit !== null) return portalHelpOnlyExit;

  if (group === "chat") {
    return await runChatCli({ argv, positionals, flags, wantsJson, context: { stdout: context.stdout, stderr: context.stderr, cwd: context.cwd, binName } });
  }

  if (group === "provider") {
    return await runProviderCli({ argv, positionals, flags, wantsJson, context: { stdout: context.stdout, stderr: context.stderr, cwd: context.cwd, binName } });
  }

  if (group === "database" && wantsHelp) {
    try {
      const { runDelegatedDatabaseCli } = await import("./cli-delegated-domains.ts");
      return await runDelegatedDatabaseCli(argv, flags, context);
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeRootJsonError(handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "db" && wantsHelp) {
    return await runMagicDbCli({
      argv,
      positionals,
      flags,
      workspaceRoot: flags.workspace || context.cwd,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      binName,
    });
  }

  if (group === "knowledge" && (command === "memory" || command === "memories")) {
    const memoryWorkspaceRoot = flags.workspace || context.cwd;
    const memoryWorkspaceId = flags["workspace-id"] || pathSafeBasename(memoryWorkspaceRoot);
    const memoryAgentId = flags["agent-id"] || memoryWorkspaceId;
    const memoryRuntimeAdapterId = resolveRuntimeAdapterId(flags);
    return await runMemoryCli({
      argv: ["knowledge", ...argv.slice(2)],
      positionals: ["knowledge", ...positionals.slice(2)],
      flags,
      workspaceRoot: memoryWorkspaceRoot,
      workspaceId: memoryWorkspaceId,
      agentId: memoryAgentId,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      binName,
      runtime: {
        list: async () => {
          const claw = await createCliClaw(memoryRuntimeAdapterId, flags, memoryWorkspaceRoot, flags["app-id"] || "clawjs-app", memoryWorkspaceId, memoryAgentId);
          return await claw.memory.list();
        },
        search: async (query) => {
          const claw = await createCliClaw(memoryRuntimeAdapterId, flags, memoryWorkspaceRoot, flags["app-id"] || "clawjs-app", memoryWorkspaceId, memoryAgentId);
          return await claw.memory.search(query);
        },
      },
    });
  }
  if (group === "code") {
    return await runCodeCli({ positionals, flags, argv, context, wantsJson, binName });
  }
  if (group === "search" && isSearchAdminCommand(command)) {
    return await runSearchAdminCli({ positionals, flags, argv, context, wantsJson, binName, usage });
  }
  if (group === "search" && command !== "query" && command !== "rebuild") {
    return await runCliDiscoverySearch({ positionals, flags, context, wantsJson, binName, usage });
  }
  if (group === "search" && command === "query") {
    return await runSearchQueryCli({ positionals, flags, context, wantsJson, binName });
  }
  if (group === "search" && command === "rebuild") {
    return await runSearchRebuildCli({ flags, argv, context, wantsJson });
  }
  const workspaceRoot = flags.workspace || context.cwd;
  const appId = flags["app-id"] || "clawjs-app";
  const workspaceId = flags["workspace-id"] || pathSafeBasename(workspaceRoot);
  const agentId = flags["agent-id"] || workspaceId;
  const runtimeAdapterId = resolveRuntimeAdapterId(flags);
  const earlyTemporalResult = await runTemporalCli({
    argv,
    group,
    command,
    subcommand,
    positionals,
    flags,
    context,
    wantsJson,
    runtimeAdapterId,
    workspaceRoot,
    appId,
    workspaceId,
    agentId,
  });
  if (earlyTemporalResult !== null) return earlyTemporalResult;

  {
    const v1DataExitCode = await runV1DataCli({
      argv,
      positionals,
      flags,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      binName,
      cwd: context.cwd,
    });
    if (v1DataExitCode !== null) return v1DataExitCode;
  }

  const removedPublicCommand = group ? removedPublicCommandMessage(group, binName) : null;
  if (removedPublicCommand) {
    throw new CliHandledError("removed_public_command", removedPublicCommand, CLI_EXIT_USAGE);
  }

  if (group === "runtime" && command && REMOVED_RUNTIME_COMMANDS.has(command)) {
    throw new CliHandledError(
      "removed_public_command",
      `\`${binName} runtime ${command}\` is not part of the public Claw CLI surface. Runtime is limited to adapter setup/status/install/uninstall/repair.`,
      CLI_EXIT_USAGE,
    );
  }

  if ((group === "business" || group === "social") && command && REMOVED_V1_CRUD_COMMANDS.has(command)) {
    throw new CliHandledError(
      "removed_public_command",
      `\`${binName} ${group} ${command}\` was removed pre-v1 CRUD and is not part of the public Claw CLI surface. Use \`${binName} ${group} --help\` for the portal.`,
      CLI_EXIT_USAGE,
    );
  }

  if (group === "content" && command && REMOVED_V1_CRUD_COMMANDS.has(command)) {
    throw new CliHandledError(
      "removed_public_command",
      `\`${binName} content ${command}\` was removed pre-v1 CRUD and is not part of the public Claw CLI surface. Use content brand, destination, campaign, entry, approval, or publish commands.`,
      CLI_EXIT_USAGE,
    );
  }
  if (group === "content" && command && REMOVED_CONTENT_PORTAL_COMMANDS.has(command)) {
    throw new CliHandledError(
      "removed_public_command",
      `\`${binName} content ${command}\` was removed pre-v1 portal shorthand and is not part of the public Claw CLI surface. Use content brand, destination, campaign, entry, approval, or publish commands.`,
      CLI_EXIT_USAGE,
    );
  }

  if (group === "capabilities") {
    return await runSystemCapabilitiesCli({ positionals: ["system", "capabilities", command ?? "list", ...positionals.slice(2)], flags, context, wantsJson, binName });
  }

  if (group === "permissions") {
    return await runHostForwardCli({
      domain: "system",
      resource: "permissions",
      action: command ?? "list",
      flags,
      context,
      wantsJson,
      extraArguments: {
        ...(subcommand ? { subject: subcommand } : {}),
      },
    });
  }

  if (group === "diagnostics") {
    return await runCliUnsafe(["doctor", ...argv.slice(1)], context);
  }

  if (wantsHelp && group) {
    const commandHelp = buildCommandHelp(binName, group);
    if (commandHelp) {
      context.stdout.write(`${commandHelp}\n`);
      return CLI_EXIT_OK;
    }
  }

  assertAllowedLocalFlags(group, argv);

  if (group === "database") {
    try {
      const { runDelegatedDatabaseCli } = await import("./cli-delegated-domains.ts");
      return await runDelegatedDatabaseCli(argv, flags, context);
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeRootJsonError(handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "db") {
    const dbWorkspaceRoot = flags.workspace || context.cwd;
    const dbCollection = coreProductivityCollection(positionals[1]);
    if (dbCollection && !flags.url) {
      return await runCoreProductivityDbCli({
        argv,
        positionals,
        flags,
        workspaceRoot: dbWorkspaceRoot,
        stdout: context.stdout,
        stderr: context.stderr,
        wantsJson,
        appId: flags["app-id"] || "clawjs-app",
        workspaceId: flags["workspace-id"] || pathSafeBasename(dbWorkspaceRoot),
        agentId: flags["agent-id"] || flags["workspace-id"] || pathSafeBasename(dbWorkspaceRoot),
        contextCwd: context.cwd,
      });
    }
    return await runMagicDbCli({
      argv,
      positionals,
      flags,
      workspaceRoot: dbWorkspaceRoot,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      binName,
    });
  }

  if (group === "content") {
    try {
      const { runDelegatedContentCli } = await import("./cli-delegated-domains.ts");
      return await runDelegatedContentCli(argv, flags, context);
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "erp") {
    try {
      const { runDelegatedErpCli } = await import("./cli-delegated-domains.ts");
      return await runDelegatedErpCli(argv, flags, context);
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "iot") {
    try {
      const { runDelegatedIotCli } = await import("./cli-delegated-domains.ts");
      return await runDelegatedIotCli(argv, flags, context);
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "notify" && command === "send") {
    try {
      const claw = await createCliClaw(resolveRuntimeAdapterId(flags), flags, context.cwd, "notify-cli", "notify-cli", "notify-cli");
      const input = {
        approvalId: flags["approval-id"] ?? flags["host-approval-id"] ?? "",
        ...(flags["legal-label"] ? { legalLabel: flags["legal-label"] } : {}),
        ...(flags["idempotency-key"] ? { idempotencyKey: flags["idempotency-key"] } : {}),
        ...(flags.priority ? { priority: flags.priority as "passive" | "normal" | "time-sensitive" | "critical" } : {}),
        ...(parseJsonFlag<Record<string, unknown>>(flags["audience-json"], "--audience-json") ? { audience: parseJsonFlag<Record<string, unknown>>(flags["audience-json"], "--audience-json") } : {}),
        context: parseJsonFlag<Record<string, unknown>>(flags["context-json"], "--context-json")
          ?? {
            tenantId: flags["tenant-id"] ?? "",
            ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
            ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
            ...(flags["workspace-id"] ? { workspaceId: flags["workspace-id"] } : {}),
            ...(flags["event-type"] ? { eventType: flags["event-type"] } : {}),
            ...(flags.severity ? { severity: flags.severity } : {}),
          },
        delivery: parseJsonFlag<Record<string, unknown>>(flags["delivery-json"], "--delivery-json")
          ?? {
            ...(flags.mode ? { mode: flags.mode } : {}),
            ...(flags.title ? { title: flags.title } : {}),
            ...(flags.body ? { body: flags.body } : {}),
            ...(flags["target-client-app-id"] ? { targetClientAppId: flags["target-client-app-id"] } : {}),
          },
        ...(parseJsonFlag<Record<string, unknown>>(flags["receipt-policy-json"], "--receipt-policy-json")
          ? { receiptPolicy: parseJsonFlag<Record<string, unknown>>(flags["receipt-policy-json"], "--receipt-policy-json") }
          : {}),
      } as unknown as Parameters<typeof claw.notify.send>[0];
      const payload = await claw.notify.send(input);
      if (wantsJson) {
        writeRootJson(payload);
      } else {
        context.stdout.write(`${payload.notification.id}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "notify" && command === "cancel") {
    try {
      const notificationId = subcommand || flags["notification-id"];
      if (!notificationId) {
        context.stderr.write(`Usage: ${binName} notify cancel <notification-id> --notify-url URL --notify-source-token TOKEN\n`);
        return CLI_EXIT_USAGE;
      }
      const claw = await createCliClaw(resolveRuntimeAdapterId(flags), flags, context.cwd, "notify-cli", "notify-cli", "notify-cli");
      const payload = await claw.notify.cancel(notificationId);
      if (wantsJson) {
        writeRootJson(payload);
      } else {
        context.stdout.write(`${payload.notification.status}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "notify" && command === "subscriptions" && subcommand === "upsert") {
    try {
      const claw = await createCliClaw(resolveRuntimeAdapterId(flags), flags, context.cwd, "notify-cli", "notify-cli", "notify-cli");
      const payload = await claw.notify.subscriptions.upsert({
        ...(flags.id ? { id: flags.id } : {}),
        ...(flags["source-app-id"] ? { sourceAppId: flags["source-app-id"] } : {}),
        ...(flags["client-app-id"] ? { clientAppId: flags["client-app-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        ...(flags["workspace-id"] ? { workspaceId: flags["workspace-id"] } : {}),
        ...(flags["event-type"] ? { eventType: flags["event-type"] } : {}),
        ...(flags.severity ? { severity: flags.severity } : {}),
        ...(flags["min-priority"] ? { minPriority: flags["min-priority"] as "passive" | "normal" | "time-sensitive" | "critical" } : {}),
        ...(flags.action ? { action: flags.action as "allow" | "mute" } : {}),
        ...(readBooleanFlag(argv, flags, "installation-scoped", false) ? { installationScoped: true } : {}),
      });
      if (wantsJson) {
        writeRootJson(payload);
      } else {
        context.stdout.write(`${payload.subscription.id}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "notify" && command === "subscriptions" && subcommand === "delete") {
    try {
      const id = extractPositionals(argv)[3] || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} notify subscriptions delete <id> --notify-url URL --notify-client-token TOKEN\n`);
        return CLI_EXIT_USAGE;
      }
      const claw = await createCliClaw(resolveRuntimeAdapterId(flags), flags, context.cwd, "notify-cli", "notify-cli", "notify-cli");
      const payload = await claw.notify.subscriptions.remove(id);
      if (wantsJson) {
        writeRootJson(payload);
      } else {
        context.stdout.write(`${payload.ok}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  const runtimeAdapter = getRuntimeAdapter(runtimeAdapterId); const mediaGroup = group === "image" || group === "audio" || group === "video" ? group : null;
  await installCliRuntimeMetaProvider({ group, command, subcommand, argv, flags, cwd: context.cwd, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId });
  const guidanceResourcesResult = await runGuidanceResourcesCli({ group, command, subcommand, positionals, flags, argv, context, wantsJson, runtimeAdapterId, workspaceRoot, appId, workspaceId, agentId }); if (guidanceResourcesResult !== null) return guidanceResourcesResult;
  if (group === "report") return await (await import("./cli-report-command.ts")).runReportCli({ positionals, flags, argv, context, wantsJson, binName, workspaceRoot, agentId });
  if (group === "slides") {
    try {
      return await runSlidesCli({
        argv,
        positionals,
        flags,
        workspaceRoot,
        agentId,
        wantsJson,
        context: {
          stdout: context.stdout,
          stderr: context.stderr,
          cwd: context.cwd,
          binName,
        },
        registerOutput: async (input) => {
          const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
          const media = claw.media.register({
            name: input.name,
            mimeType: input.mimeType,
            kind: input.kind,
            filePath: input.filePath,
            origin: "generated",
            direction: "outbound",
            workspaceId,
            agentId,
            sourceText: input.sourceText,
            metadata: { feature: "slides" },
          });
          return { mediaId: media.mediaId };
        },
        createMediaShare: async (input) => {
          const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
          return await claw.media.share.create(input);
        },
      });
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeRootJsonError(handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "style") {
    try {
      return await runStyleCli({
        argv,
        positionals,
        flags,
        workspaceRoot,
        wantsJson,
        context: {
          stdout: context.stdout,
          stderr: context.stderr,
          cwd: context.cwd,
          binName,
        },
      });
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeRootJsonError(handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "template") {
    try {
      return await runTemplateCli({
        argv,
        positionals,
        flags,
        workspaceRoot,
        wantsJson,
        context: {
          stdout: context.stdout,
          stderr: context.stderr,
          cwd: context.cwd,
          binName,
        },
      });
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeRootJsonError(handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "ref") {
    try {
      return await runReferenceCli({
        argv,
        positionals,
        flags,
        workspaceRoot,
        wantsJson,
        context: {
          stdout: context.stdout,
          stderr: context.stderr,
          cwd: context.cwd,
          binName,
        },
      });
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeRootJsonError(handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "plan") {
    return await runPlanCli({ positionals, flags, argv, context, wantsJson, binName, workspaceRoot, agentId });
  }

  if (group === "new") {
    const type = command as ClawProjectType | undefined;
    const projectName = subcommand;
    const supportedTypes: ClawProjectType[] = ["app", "agent", "server", "workspace", "skill", "plugin"];
    if (!type || !supportedTypes.includes(type) || !projectName) {
      context.stderr.write(`Usage: ${binName} new app|agent|server|workspace|skill|plugin <name> [--dir PATH] [--template NAME] [--package-manager npm|pnpm] [--git] [--install] [--yes]\n`);
      return CLI_EXIT_USAGE;
    }

    const templateName = resolveTemplateName(type, flags.template);
    const targetPath = path.resolve(context.cwd, flags.dir || projectName);
    const slug = createPackageName(projectName, `claw-${type}`);
    const title = createTitle(slug, `Claw ${createPascalCase(type, "Project")}`);
    const packageManager = flags["package-manager"] || flags.pm
      ? parsePackageManager(flags["package-manager"] || flags.pm)
      : detectPackageManager();
    const install = readBooleanFlag(argv, flags, "install", !argv.includes("--no-install") && !argv.includes("--skip-install"));
    const git = readBooleanFlag(argv, flags, "git", false);

    try {
      const scaffoldContext = wantsJson ? { ...context, stdout: context.stderr } : context;
      await scaffoldProject({
        context: scaffoldContext,
        targetPath,
        templateDir: resolveTemplateDirectory(type, templateName),
        replacements: {
          "__APP_NAME__": slug,
          "__APP_SLUG__": slug,
          "__APP_TITLE__": title,
          "__APP_PASCAL__": createPascalCase(slug, "ClawProject"),
        },
        packageManager,
        install,
        git,
        successLabel: `${type} ${slug}`,
        nextSteps: buildScaffoldNextSteps(type, packageManager),
        completionNote: buildScaffoldCompletionNote(type),
      });
      let libraryAsset: unknown;
      if (type === "skill" && !argv.includes("--no-library")) {
        registerGeneratedSkillInLibrary({
          id: slug,
          title,
          sourcePath: targetPath,
          flags,
        });
        libraryAsset = { id: slug, path: targetPath };
      }
      if (wantsJson) {
        writeRootJson({
          ok: true,
          type,
          name: slug,
          targetPath,
          template: templateName,
          packageManager,
          install,
          git,
          ...(libraryAsset ? { libraryAsset } : {}),
        });
      }
      return CLI_EXIT_OK;
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeRootJsonError(handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "generate") {
    const resource = command as ClawResourceType | undefined;
    const resourceName = subcommand;
    const supportedResources: ClawResourceType[] = ["skill", "plugin", "provider", "channel", "command"];
    if (!resource || !supportedResources.includes(resource) || !resourceName) {
      context.stderr.write(`Usage: ${binName} generate skill|plugin|provider|channel|command <name> [--project PATH]\n`);
      return CLI_EXIT_USAGE;
    }

    try {
      const projectRoot = resolveProjectRootOrThrow(context.cwd, flags.project);
      const config = readProjectConfig(projectRoot);
      if (!config) {
        throw new Error(`Missing or invalid claw.project.json at ${projectRoot}.`);
      }
      const created = await generateProjectResource(projectRoot, config, resource, resourceName);
      let libraryAsset: unknown;
      if (resource === "skill" && !argv.includes("--no-library")) {
        registerGeneratedSkillInLibrary({
          id: created.id,
          title: createTitle(created.id, created.id),
          sourcePath: path.join(projectRoot, created.path),
          flags,
        });
        libraryAsset = { id: created.id, path: path.join(projectRoot, created.path) };
      }
      if (wantsJson) {
        writeRootJson({
          ok: true,
          projectRoot,
          resource,
          created,
          ...(libraryAsset ? { libraryAsset } : {}),
        });
      } else {
        context.stdout.write(`generated ${resource} ${created.id} -> ${created.path}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "add") {
    const integration = command as ClawIntegrationType | undefined;
    const supportedIntegrations: ClawIntegrationType[] = ["provider", "channel", "telegram", "scheduler", "memory", "workspace"];
    if (!integration || !supportedIntegrations.includes(integration)) {
      context.stderr.write(`Usage: ${binName} add provider|channel|telegram|scheduler|memory|workspace [name] [--project PATH]\n`);
      return CLI_EXIT_USAGE;
    }

    try {
      const projectRoot = resolveProjectRootOrThrow(context.cwd, flags.project);
      const config = readProjectConfig(projectRoot);
      if (!config) {
        throw new Error(`Missing or invalid claw.project.json at ${projectRoot}.`);
      }
      const packageManager = flags["package-manager"] || flags.pm
        ? parsePackageManager(flags["package-manager"] || flags.pm)
        : detectPackageManager();
      const result = await addProjectIntegration(projectRoot, config, integration, {
        name: subcommand || flags.name,
        packageManager,
        runCommand: context.runCommand,
      });
      if (wantsJson) {
        writeRootJson({
          ok: true,
          projectRoot,
          integration,
          ...result,
        });
      } else {
        context.stdout.write(`added ${integration} ${result.created.id} -> ${result.created.path}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "info") {
    try {
      const projectRoot = flags.project ? path.resolve(context.cwd, flags.project) : locateProjectRoot(context.cwd);
      const info: {
        projectRoot: string | null;
        project: unknown;
        packageJson: unknown;
        installedSdkVersion: string | null;
        workspace: unknown;
      } = projectRoot
        ? await collectProjectSnapshot(projectRoot) as {
          projectRoot: string | null;
          project: unknown;
          packageJson: unknown;
          installedSdkVersion: string | null;
          workspace: unknown;
        }
        : { projectRoot: null, project: null, packageJson: null, installedSdkVersion: null, workspace: null };
      const payload: {
        cli: { binName: string; package: string; version: string | null };
        projectRoot: string | null;
        project: unknown;
        packageJson: unknown;
        installedSdkVersion: string | null;
        workspace: unknown;
      } = {
        cli: {
          binName,
          package: "@clawjs/cli",
          version: resolveCliPackageVersion(),
        },
        ...info,
      };
      if (wantsJson) {
        writeRootJson(payload);
      } else {
        context.stdout.write(`cli: ${payload.cli.version ?? "unknown"}\n`);
        const project = (payload.project as { type?: string; name?: string; runtime?: { adapter?: string } } | null) ?? null;
        if (project) {
          context.stdout.write(`project: ${project.type ?? "unknown"} ${project.name ?? "unnamed"}\n`);
          context.stdout.write(`runtime: ${project.runtime?.adapter ?? "unknown"}\n`);
        } else {
          context.stdout.write("project: not detected\n");
        }
        const workspace = payload.workspace as { manifestPath?: string } | null;
        context.stdout.write(`workspace: ${workspace?.manifestPath ?? "not initialized"}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "runtime" && command === "status") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const status = await claw.runtime.status();
    if (wantsJson) {
      writeRootJson(status);
    } else {
      context.stdout.write(`runtime: ${status.runtimeName}\n`);
      context.stdout.write(`adapter: ${status.adapter}\n`);
      context.stdout.write(`cliAvailable: ${status.cliAvailable}\n`);
      context.stdout.write(`version: ${status.version ?? "unknown"}\n`);
    }
    return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "runtime" && command === "install") {
    const installer = flags.installer === "pnpm" ? "pnpm" : "npm";
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const installCommand = claw.runtime.installCommand(installer);
    if (argv.includes("--dry-run")) {
      if (wantsJson) {
        writeRootJson({ ...installCommand, plan: claw.runtime.installPlan(installer), adapter: runtimeAdapterId });
      } else {
        context.stdout.write(`${installCommand.command} ${installCommand.args.join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    await claw.runtime.install(installer, (event) => {
      if (!wantsJson) writeProgress(context.stdout, event);
    });
    if (wantsJson) writeRootJson({ ok: true, adapter: runtimeAdapterId });
    return CLI_EXIT_OK;
  }

  if (group === "runtime" && command === "uninstall") {
    const installer = flags.installer === "pnpm" ? "pnpm" : "npm";
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const uninstallCommand = claw.runtime.uninstallCommand(installer);
    if (argv.includes("--dry-run")) {
      if (wantsJson) {
        writeRootJson({ ...uninstallCommand, plan: claw.runtime.uninstallPlan(installer), adapter: runtimeAdapterId });
      } else {
        context.stdout.write(`${uninstallCommand.command} ${uninstallCommand.args.join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    await claw.runtime.uninstall(installer, (event) => {
      if (!wantsJson) writeProgress(context.stdout, event);
    });
    if (wantsJson) writeRootJson({ ok: true, adapter: runtimeAdapterId });
    return CLI_EXIT_OK;
  }

  if (group === "runtime" && command === "repair") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (argv.includes("--dry-run")) {
      if (wantsJson) {
        writeRootJson({ ...claw.runtime.repairCommand(), plan: claw.runtime.repairPlan(), adapter: runtimeAdapterId });
      } else {
        const commandSpec = claw.runtime.repairCommand();
        context.stdout.write(`${commandSpec.command} ${commandSpec.args.join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    await claw.runtime.repair((event) => {
      if (!wantsJson) writeProgress(context.stdout, event);
    });
    if (wantsJson) writeRootJson({ ok: true, adapter: runtimeAdapterId });
    return CLI_EXIT_OK;
  }

  if (group === "runtime" && command === "setup-workspace") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const setupCommand = claw.runtime.setupWorkspaceCommand();
    if (argv.includes("--dry-run")) {
      if (wantsJson) {
        writeRootJson({ ...setupCommand, plan: claw.runtime.setupWorkspacePlan(), adapter: runtimeAdapterId });
      } else {
        context.stdout.write(`${setupCommand.command} ${setupCommand.args.join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    await claw.runtime.setupWorkspace((event) => {
      if (!wantsJson) writeProgress(context.stdout, event);
    });
    if (wantsJson) {
      writeRootJson({ ok: true, ...setupCommand, adapter: runtimeAdapterId });
    } else {
      context.stdout.write("ok\n");
    }
    return CLI_EXIT_OK;
  }

  if (group === "compat") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (argv.includes("--refresh")) {
      const snapshot = await claw.compat.refresh();
      const status = await claw.runtime.status();
      const compat = runtimeAdapter.buildCompatReport(status);
      if (wantsJson) {
        writeRootJson({ compat, snapshot, adapter: runtimeAdapterId });
      } else {
        context.stdout.write(`degraded: ${compat.degraded}\n`);
        context.stdout.write(`snapshot: ${snapshot.runtimeVersion ?? "unknown"}\n`);
      }
      return compat.degraded ? CLI_EXIT_DEGRADED : CLI_EXIT_OK;
    }
    const status = await claw.runtime.status();
    const compat = runtimeAdapter.buildCompatReport(status);
    if (wantsJson) {
      writeRootJson({ compat, snapshot: claw.compat.read(), adapter: runtimeAdapterId });
    } else {
      context.stdout.write(`degraded: ${compat.degraded}\n`);
      if (compat.issues.length > 0) {
        context.stdout.write(`${compat.issues.join("\n")}\n`);
      }
    }
    return compat.degraded ? CLI_EXIT_DEGRADED : CLI_EXIT_OK;
  }

  if (group === "preview" && command === "share") {
    try {
      const targetUrl = resolvePreviewTargetUrl(flags);
      const mode = parsePreviewShareMode(flags.mode);
      const dryRun = argv.includes("--dry-run");
      if (mode === "lan") {
        return await runLanPreviewShare({ targetUrl, flags, stdout: context.stdout, wantsJson, dryRun });
      }
      if (mode === "tailscale") {
        return runTailscalePreviewShare({ targetUrl, flags, stdout: context.stdout, wantsJson, dryRun });
      }
      if (mode === "cloudflare") {
        return await runCloudflarePreviewShare({ targetUrl, flags, stdout: context.stdout, wantsJson, dryRun });
      }
      context.stderr.write(`Use ${binName} browser share for Relay-backed remote browser sessions.\n`);
      return CLI_EXIT_USAGE;
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeRootJsonError(handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "browser" && (command === "status" || command === "ensure" || command === "share")) {
    try {
      const relay = requireRelayBrowserConfig(flags);
      const browserPath = `/tenants/${relay.tenantId}/agents/${relay.agentId}/workspaces/${relay.workspaceId}/browser/session`;
      const payload = command === "status"
        ? await relayBrowserRequest<{
            session: Record<string, unknown>;
            sharePath: string;
            shareUrl: string;
          }>(flags, {
            method: "GET",
            path: browserPath,
          })
        : await relayBrowserRequest<{
            session: Record<string, unknown>;
            sharePath: string;
            shareUrl: string;
          }>(flags, {
            method: "POST",
            path: browserPath,
            ...(flags.url?.trim() ? { body: { initialUrl: flags.url.trim() } } : {}),
          });
      if (wantsJson) {
        writeRootJson(payload);
      } else if (command === "share") {
        context.stdout.write(`${payload.shareUrl}\n`);
      } else if (command === "status") {
        context.stdout.write(`${String((payload.session as { status?: string })?.status ?? "unknown")}\n`);
      } else {
        context.stdout.write(`${payload.shareUrl}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "doctor") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const doctor = await claw.doctor.run();
    const projectRoot = locateProjectRoot(context.cwd);
    const project = projectRoot ? readProjectConfig(projectRoot) : null;
    const payload = {
      ...doctor,
      cli: {
        package: "@clawjs/cli",
        version: resolveCliPackageVersion(),
        binName,
        projectRoot,
        projectType: project?.type ?? null,
      },
    };
    if (wantsJson) {
      writeRootJson(payload);
    } else {
      context.stdout.write(`ok: ${doctor.ok}\n`);
      if (project) {
        context.stdout.write(`project: ${project.type} ${project.name}\n`);
      }
      if (doctor.issues.length > 0) {
        context.stdout.write(`${doctor.issues.map((issue) => issue.message).join("\n")}\n`);
      }
    }
    return doctor.ok ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "workspace" && command === "init") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    await claw.workspace.init();
    const inspected = await claw.workspace.inspect();
    if (wantsJson) {
      writeRootJson({
        manifestPath: inspected.manifestPath,
        runtimeAdapter: runtimeAdapterId,
        canonicalPaths: claw.workspace.canonicalPaths(),
      });
    } else {
      context.stdout.write(`${inspected.manifestPath}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "workspace" && command === "attach") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const manifest = await claw.workspace.attach();
    if (wantsJson) {
      writeRootJson(manifest);
    } else {
      context.stdout.write(`${manifest?.workspaceId ?? "missing"}\n`);
    }
    return manifest ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "workspace" && command === "inspect") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const workspaceClaw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    const inspected = await claw.workspace.inspect();
    const productivity = await workspaceClaw.productivity.inspect();
    const hasLocalProductivityState = fs.existsSync(productivity.dataPath);
    if (wantsJson) {
      writeRootJson({ ...inspected, productivity });
    } else {
      context.stdout.write(`manifest: ${inspected.manifest ? "present" : "missing"}\n`);
      context.stdout.write(`compatSnapshot: ${inspected.compatSnapshot ? "present" : "missing"}\n`);
      context.stdout.write(`productivityDb: ${productivity.dataPath}\n`);
      context.stdout.write(`productivitySchema: ${productivity.schemaVersion}\n`);
    }
    return inspected.manifest || hasLocalProductivityState ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "workspace" && command === "discover") {
    const roots = flags.root ? [flags.root] : [workspaceRoot];
    const discovered = discoverWorkspaces({
      roots,
      ...(flags["max-depth"] ? { maxDepth: Number(flags["max-depth"]) } : {}),
    });
    if (wantsJson) {
      writeRootJson(discovered);
    } else {
      context.stdout.write(`${discovered.map((entry) => entry.rootDir).join("\n")}\n`);
    }
    return discovered.length > 0 ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "workspace" && command === "validate") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const validation = await claw.workspace.validate();
    if (wantsJson) {
      writeRootJson(validation);
    } else {
      context.stdout.write(`ok: ${validation.ok}\n`);
      if (validation.missingFiles.length > 0) {
        context.stdout.write(`missingFiles: ${validation.missingFiles.join(", ")}\n`);
      }
    }
    return validation.ok ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "workspace" && command === "reset") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const resetOptions = {
      removeManifest: readBooleanFlag(argv, flags, "remove-manifest", true),
      removeCompat: readBooleanFlag(argv, flags, "remove-compat", true),
      removeProjections: readBooleanFlag(argv, flags, "remove-projections", readBooleanFlag(argv, flags, "remove-bindings", true)),
      removeObserved: readBooleanFlag(argv, flags, "remove-observed", readBooleanFlag(argv, flags, "remove-state", true)),
      removeIntents: readBooleanFlag(argv, flags, "remove-intents", true),
      removeSessions: readBooleanFlag(argv, flags, "remove-sessions", true),
      removeAudit: readBooleanFlag(argv, flags, "remove-audit", true),
      removeBackups: readBooleanFlag(argv, flags, "remove-backups", false),
      removeLocks: readBooleanFlag(argv, flags, "remove-locks", false),
      removeRuntimeFiles: readBooleanFlag(argv, flags, "remove-runtime-files", false),
    };
    if (argv.includes("--dry-run")) {
      const plan = await claw.workspace.previewReset(resetOptions);
      if (wantsJson) {
        writeRootJson(plan);
      } else {
        context.stdout.write(`${plan.targets.map((target) => `${target.exists ? "remove" : "skip"} ${target.path}`).join("\n")}\n`);
      }
      return CLI_EXIT_OK;
    }
    const result = await claw.workspace.reset(resetOptions);
    if (wantsJson) {
      writeRootJson(result);
    } else {
      context.stdout.write(`removed=${result.removedPaths.length} preserved=${result.preservedPaths.length}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "workspace" && command === "repair") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const workspaceClaw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    const repaired = await claw.workspace.repair();
    const productivity = await workspaceClaw.productivity.repair();
    if (wantsJson) {
      writeRootJson({ ...repaired, productivity });
    } else {
      context.stdout.write(`createdDirectories=${repaired.createdDirectories.length} createdRuntimeFiles=${repaired.createdRuntimeFiles.length}\n`);
      context.stdout.write(`repairedRecords=${productivity.repairedRecords} reindexed=${productivity.reindexed}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "models" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const models = await claw.models.list();
    if (wantsJson) {
      writeRootJson(models);
    } else {
      context.stdout.write(`${models.map((model) => `${model.isDefault ? "*" : "-"} ${model.id}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "models" && command === "default") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const model = await claw.models.getDefault();
    if (wantsJson) {
      writeRootJson(model);
    } else {
      context.stdout.write(`${model?.modelId ?? "none"}\n`);
    }
    return model ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "models" && command === "set-default") {
    const target = flags.model;
    if (!target) {
      context.stderr.write("--model is required\n");
      return CLI_EXIT_USAGE;
    }
    if (argv.includes("--dry-run")) {
      if (runtimeAdapterId !== "openclaw") {
        const commandSpec = runtimeAdapterId === "zeroclaw"
          ? { command: "write-config", args: [`default_model=${target}`] }
          : { command: "picoclaw", args: ["model", target] };
        if (wantsJson) {
          writeRootJson({ ...commandSpec, modelId: target, adapter: runtimeAdapterId });
        } else {
          context.stdout.write(`${commandSpec.command} ${commandSpec.args.join(" ")}\n`);
        }
        return CLI_EXIT_OK;
      }
      const commandSpec = buildSetDefaultModelCommand(target, agentId);
      if (wantsJson) {
        writeRootJson({
          command: "openclaw",
          args: commandSpec.args,
          modelId: commandSpec.modelId,
          adapter: runtimeAdapterId,
        });
      } else {
        context.stdout.write(`openclaw ${commandSpec.args.join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const modelId = await claw.models.setDefault(target);
    if (wantsJson) {
      writeRootJson({ modelId, adapter: runtimeAdapterId });
    } else {
      context.stdout.write(`${modelId}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "providers" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const providers = await claw.providers.list();
    if (wantsJson) {
      writeRootJson(providers);
    } else {
      context.stdout.write(`${providers.map((provider) => `${provider.id}:${provider.local ? "local" : "remote"}`).join("\n")}\n`);
    }
    return providers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "providers" && command === "catalog") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const catalog = await claw.providers.catalog();
    if (wantsJson) {
      writeRootJson(catalog);
    } else {
      context.stdout.write(`${catalog.providers.map((provider) => provider.id).join("\n")}\n`);
    }
    return catalog.providers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "providers" && command === "auth-state") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const state = await claw.providers.authState();
    if (wantsJson) {
      writeRootJson(state);
    } else {
      context.stdout.write(`${Object.entries(state.providers).map(([provider, summary]) => `${provider}:${summary.hasAuth ? "ready" : "missing"}`).join("\n")}\n`);
    }
    return Object.keys(state.providers).length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "secrets" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const secrets = await claw.secrets.list(flags.search);
    if (wantsJson) {
      writeRootJson(secrets);
    } else {
      context.stdout.write(`${secrets.map((secret) => `${secret.name}${secret.typeId ? ` [${secret.typeId}]` : ""}`).join("\n")}\n`);
    }
    return secrets.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "secrets" && command === "describe") {
    const name = flags.name || flags.id;
    if (!name) {
      context.stderr.write("--name is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const secret = await claw.secrets.describe(name);
    if (wantsJson) {
      writeRootJson(secret);
    } else {
      context.stdout.write(`${secret ? `${secret.name}${secret.typeId ? ` [${secret.typeId}]` : ""}` : "missing"}\n`);
    }
    return secret ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "secrets" && command === "types") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const types = await claw.secrets.types(flags.search);
    if (wantsJson) {
      writeRootJson(types);
    } else {
      context.stdout.write(`${types.map((type) => `${type.typeId} ${type.label}`).join("\n")}\n`);
    }
    return types.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "secrets" && command === "capabilities") {
    const name = flags.name || flags.id;
    if (!name) {
      context.stderr.write("--name is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const payload = await claw.secrets.capabilities(name);
    if (wantsJson) {
      writeRootJson(payload);
    } else {
      context.stdout.write(`${payload.capabilities.map((entry) => `${entry.capability}:${entry.allowed ? "allow" : "deny"}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "secrets" && command === "broker" && subcommand === "http") {
    const url = flags.url;
    if (!url) {
      context.stderr.write("--url is required\n");
      return CLI_EXIT_USAGE;
    }
    const method = flags.method || "GET";
    const headers = parseJsonFlag<Record<string, string>>(flags["headers-json"], "--headers-json");
    const riskTier = flags["risk-tier"] || flags.risk;
    if (!riskTier) {
      context.stderr.write("--risk-tier is required\n");
      return CLI_EXIT_USAGE;
    }
    const body = flags.body;
    const declaredFields = inferBrokerDeclaredFields({ url, headers, body });
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const payload = await claw.secrets.brokerHttp({
      method,
      url,
      capability: "broker.http",
      agent: flags.agent || agentId || "claw-cli",
      riskTier: riskTier as "read" | "write" | "destructive" | "cost" | "system",
      declaredFields,
      ...(flags["approval-satisfied"] === "true" ? { approvalSatisfied: true } : {}),
      ...(headers ? { headers } : {}),
      ...(body ? { body } : {}),
    });
    if (wantsJson) {
      writeRootJson(payload);
    } else {
      context.stdout.write(`${payload.status}\n${payload.bodyText}\n`);
    }
    return payload.ok ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "secrets" && command === "leases" && subcommand === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const leases = await claw.secrets.leases();
    if (wantsJson) {
      writeRootJson(leases);
    } else {
      context.stdout.write(`${leases.map((lease) => `${lease.secretName} ${lease.mode} ${lease.revokedAt ? "revoked" : lease.consumedAt ? "consumed" : "active"}`).join("\n")}\n`);
    }
    return leases.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "auth" && command === "status") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const auth = await claw.auth.status();
    if (wantsJson) {
      writeRootJson(auth);
    } else {
      context.stdout.write(`${Object.values(auth).map((summary) => `${summary.provider}:${summary.authType ?? "none"}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "auth" && command === "login") {
    const provider = flags.provider || (runtimeAdapterId === "codex" ? "openai-codex" : undefined);
    if (!provider) {
      context.stderr.write("--provider is required\n");
      return CLI_EXIT_USAGE;
    }
    if (runtimeAdapterId === "codex" && readBooleanFlag(argv, flags, "force", false) && !argv.includes("--dry-run")) {
      const logoutCommand = buildCodexCommand(["logout"], {
        homeDir: flags["home-dir"],
        env: process.env,
      });
      const logoutExitCode = await runForegroundProcess(logoutCommand.command, logoutCommand.args, {
        cwd: workspaceRoot,
        env: logoutCommand.env,
        stdout: context.stdout,
        stderr: context.stderr,
      });
      if (logoutExitCode !== CLI_EXIT_OK) return logoutExitCode;
    }
    if (argv.includes("--dry-run")) {
      const launched = await runtimeAdapter.login(provider, {
        spawnDetachedPty(command, args) {
          return { pid: undefined, command, args };
        },
      }, {
        adapter: runtimeAdapterId,
        agentId,
        agentDir: flags["agent-dir"],
        cwd: workspaceRoot,
        setDefault: flags["set-default"] !== "false",
      } as never);
      if (wantsJson) {
        writeRootJson(launched);
      } else {
        context.stdout.write(`${launched.command ?? ""} ${(launched.args ?? []).join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const launched = await claw.auth.login(provider, {
      setDefault: flags["set-default"] !== "false",
    });
    if (wantsJson) {
      writeRootJson(launched);
    } else {
      context.stdout.write(
        launched.status === "reused"
          ? `${launched.provider} reused\n`
          : `${launched.provider} ${launched.pid ?? "unknown"}\n`,
      );
    }
    return CLI_EXIT_OK;
  }

  if (group === "auth" && command === "remove") {
    const provider = flags.provider || (runtimeAdapterId === "codex" ? "openai-codex" : undefined);
    if (!provider) {
      context.stderr.write("--provider is required\n");
      return CLI_EXIT_USAGE;
    }
    if (runtimeAdapterId === "codex") {
      const logoutCommand = buildCodexCommand(["logout"], {
        homeDir: flags["home-dir"],
        env: process.env,
      });
      return await runForegroundProcess(logoutCommand.command, logoutCommand.args, {
        cwd: workspaceRoot,
        env: logoutCommand.env,
        stdout: context.stdout,
        stderr: context.stderr,
      });
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const removed = claw.auth.removeProvider(provider);
    if (wantsJson) {
      writeRootJson({ removed });
    } else {
      context.stdout.write(`${removed}\n`);
    }
    return removed > 0 ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  const temporalResult = await runTemporalCli({
    argv,
    group,
    command,
    subcommand,
    positionals,
    flags,
    context,
    wantsJson,
    runtimeAdapterId,
    workspaceRoot,
    appId,
    workspaceId,
    agentId,
  });
  if (temporalResult !== null) return temporalResult;

  const hadModuleConfigBeforePrimaryUse = hasModuleConfigForCli(flags, context.cwd);
  const primaryProductivityResult = await runPrimaryProductivityCli({
    argv,
    group,
    command,
    subcommand,
    positionals,
    flags,
    context,
    wantsJson,
    binName,
    runtimeAdapterId,
    workspaceRoot,
    appId,
    workspaceId,
    agentId,
  });
  if (primaryProductivityResult !== null) {
    if (primaryProductivityResult === CLI_EXIT_OK && !hadModuleConfigBeforePrimaryUse && group && ["tasks", "notes", "projects", "people", "goals", "reminders", "deadlines", "work"].includes(group)) {
      context.stderr.write(`Tip: using minimal defaults. Run \`${binName} setup\` when you want to review capabilities and areas.\n`);
    }
    return primaryProductivityResult;
  }

  const extendedProductivityResult = await runExtendedProductivityCli({
    argv,
    group,
    command,
    subcommand,
    positionals,
    flags,
    context,
    wantsJson,
    runtimeAdapterId,
    workspaceRoot,
    appId,
    workspaceId,
    agentId,
  });
  if (extendedProductivityResult !== null) return extendedProductivityResult;

  const knowledgeTailExitCode = await runKnowledgeTailCli({
    group,
    command,
    subcommand,
    positionals,
    flags,
    argv,
    context,
    wantsJson,
    binName,
    workspaceRoot,
    appId,
    workspaceId,
    agentId,
    runtimeAdapterId,
    mediaGroup,
  });
  if (knowledgeTailExitCode !== null) return knowledgeTailExitCode;

  if (group && HOST_FORWARD_DOMAINS.has(group as ClawDomain)) {
    return await runDirectHostDomainCli({ positionals, flags, context, wantsJson });
  }

  const collectionAlias = group ? resolveBuiltinCollectionName(group) : undefined;
  if (collectionAlias) {
    const dbAction = command || "list";
    return await runMagicDbCli({
      argv: [group, dbAction, ...argv.slice(command ? 2 : 1)],
      positionals: [group, collectionAlias, dbAction, ...positionals.slice(command ? 2 : 1)],
      flags,
      workspaceRoot: flags.workspace || context.cwd,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      binName,
    });
  }

  return handleUnknownCliCommand({ group, positionals, context, wantsJson, usage });
}

export async function runCli(argv: string[], context: CliContext): Promise<number> {
  const wantsJson = argv.includes("--json");
  try {
    return await runCliUnsafe(argv, context);
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) {
      const [group, command, subcommand] = extractPositionals(argv); const canonicalCommand = group === "db" ? "database" : group === "provider" ? "providers" : group === "style" ? "styles" : group === "template" ? "templates" : group === "ref" ? "references" : group === "image" ? "images" : group ?? "claw";
      writeCommandJsonError(context.stdout, canonicalCommand, handled, { invokedCommand: group ?? canonicalCommand, subcommand: command ?? null, ...(subcommand ? { operation: subcommand } : {}) });
    } else {
      context.stderr.write(`${handled.message}\n`);
    }
    return handled.exitCode;
  } finally {
    setCliJsonMetaProvider(null);
  }
}
