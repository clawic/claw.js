import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  INSTRUCTION_ACTIONS,
  INSTRUCTION_ACTIVATIONS,
  INSTRUCTION_BODY_FIELDS,
  INSTRUCTION_PRIORITY_DEFAULT,
  INSTRUCTION_PROVENANCES,
  INSTRUCTION_SEVERITIES,
  INSTRUCTION_STATES,
  INSTRUCTION_TARGET_AXES,
  INSTRUCTION_TRIGGER_BASES,
  INSTRUCTION_INPUT_KINDS,
  clawInstructionsSchemaVersion,
  describeInstructionTarget,
  isInstructionTrigger,
  resolveInstructionsForEvent,
  validateInstructionShape,
  type ClawInstruction,
  type InstructionBodyField,
  type InstructionTarget,
  type InstructionTrigger,
} from "@clawjs/core/catalogs";
import { listMaterializedSeedInstructions } from "@clawjs/core/catalogs";
import type { DatabaseServiceStore } from "@clawjs/database";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { listPluginMaterializedSeedInstructions } from "./cli-instructions-plugin-seeds.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import { openMainDataStore, resolveClawjsDataRoot } from "./v1-data-core.ts";

const NAMESPACE = "main";
const COLLECTION = "instructions";
const CANONICAL_COMMAND = "instructions";
const INSTRUCTIONS_SCHEMA_VERSION = 1;

const SUBCOMMANDS = [
  "list",
  "show",
  "search",
  "read",
  "docs",
  "graph",
  "add",
  "edit",
  "rm",
  "approve",
  "propose",
  "where",
  "reconcile",
] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

const SUBCOMMAND_SET = new Set<string>(SUBCOMMANDS);

export interface InstructionsCliInput {
  positionals: string[];
  flags: Record<string, string>;
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    cwd: string;
  };
  wantsJson: boolean;
  binName: string;
}

interface InstructionsRow {
  id: string;
  schemaVersion: number;
  targetAlias?: string;
  targetFamily?: string;
  targetCommand?: string;
  targetSubcommand?: string;
  targetCollection?: string;
  targetAction?: string;
  trigger: InstructionTrigger;
  activation: ClawInstruction["activation"];
  priority: number;
  severity: ClawInstruction["severity"];
  useWhen?: string;
  useNot?: string;
  readPolicy?: string;
  writePolicy?: string;
  before?: string;
  after?: string;
  forbid?: string;
  notes?: string;
  provenance: ClawInstruction["provenance"];
  state: ClawInstruction["state"];
  confidence?: number;
  proposedFrom?: string;
  source?: string;
  validations?: ClawInstruction["validations"];
  createdAt: string;
  updatedAt: string;
}

type CandidateKind = "rule" | "guidance" | "cli_instruction" | "instruction_document" | "agent_file";

interface InstructionCandidate {
  ref: string;
  kind: CandidateKind;
  title: string;
  priority: number;
  severity?: string;
  whenToRead?: string;
  appliesWhen?: string;
  useNot?: string;
  summaryAvailable: boolean;
  reasons: string[];
  readCommands: string[];
  resourceId?: string;
  path?: string;
  score: number;
}

interface InstructionDocumentFrontmatter {
  schemaVersion: number;
  id: string;
  title: string;
  summary?: string;
  tags: string[];
  appliesWhen?: string;
  doesNotApplyWhen?: string;
  priority: number;
  status: "active" | "archived";
  relatedRules: string[];
  relatedGuidance: string[];
  requiresRead: string[];
  routes: Array<{ when: string; read: string; unless?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

interface InstructionDocument {
  frontmatter: InstructionDocumentFrontmatter;
  body: string;
  path: string;
  resourceId: string;
}

interface RuleRecordLite {
  id: string;
  title?: string;
  content?: string;
  status?: string;
  kind?: string;
  priority?: number;
  applyWhen?: Record<string, string[]>;
  references?: Array<{ kind?: string; ref?: string; label?: string }>;
}

interface GuidanceRecordLite {
  id: string;
  title?: string;
  capsule?: string;
  details?: string;
  status?: string;
  severity?: string;
  priority?: number;
  applyWhen?: Record<string, string[]>;
  resourceIds?: string[];
  commands?: string[];
}

const DOCS_SUBCOMMANDS = ["create", "edit", "list", "archive", "versions"] as const;

function usage(binName: string): string {
  return [
    `Usage: ${binName} instructions <${SUBCOMMANDS.join("|")}> [options]`,
    "",
    "Subcommands:",
    `  list                                  list instructions matching filters`,
    `  show <id>                             show one instruction`,
    `  search <terms>                        search unified instruction governance candidates`,
    `  read <ref>                             read a summary, section, or full managed/external instruction`,
    `  docs create|edit|list|archive|versions manage Markdown instruction documents`,
    `  graph <ref>                            show instruction document/rule/guidance relationships`,
    `  add --target.command=X ...            add a user-authored instruction`,
    `  edit <id> --field=value ...           edit fields of an instruction`,
    `  rm <id>                               delete an instruction`,
    `  approve <id>                          promote a proposed instruction to active`,
    `  propose --from=<ev> ...               add an agent-proposed instruction (state=proposed)`,
    `  where <command> [<action>]            show seeds + overrides applicable to a target`,
    `  reconcile                             reconcile claw.global.root/instructions/manifest.yaml`,
    "",
    "Common flags:",
    "  --json                                emit a machine-readable envelope",
    "  --target.<axis>=<value>               filter or set a target axis (alias/family/command/subcommand/collection/action)",
    "  --trigger=<value>                     filter or set the trigger (surface-action/session-start/user-turn/input-kind:*/pre-tool-call/post-tool-call/correction-detected)",
    "  --state=proposed|active|archived      filter or set state",
  ].join("\n");
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function stableHash(value: string, length = 10): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function slugify(value: string, fallback = "instruction"): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/[./]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || fallback;
}

function normalizeSearchText(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function splitTerms(value: string): string[] {
  return [...new Set(normalizeSearchText(value).split(" ").filter(Boolean))];
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function docsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveClawjsDataRoot(env), "instructions", "docs");
}

function docsVersionsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveClawjsDataRoot(env), "instructions", "docs", ".versions");
}

function managedDocPathFor(titleOrId: string, id?: string): string {
  const slug = slugify(titleOrId);
  const suffix = stableHash(id ?? titleOrId, 8);
  return path.join(docsRoot(), `${slug}-${suffix}.md`);
}

function deterministicResourceId(value: string): string {
  return `res_${stableHash(path.resolve(value), 18)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function renderFrontmatterValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "number") return String(value);
  return JSON.stringify(value ?? "");
}

function renderInstructionDocument(document: InstructionDocument): string {
  const fm = document.frontmatter;
  return [
    "---",
    `schemaVersion: ${renderFrontmatterValue(fm.schemaVersion)}`,
    `id: ${renderFrontmatterValue(fm.id)}`,
    `title: ${renderFrontmatterValue(fm.title)}`,
    `summary: ${renderFrontmatterValue(fm.summary ?? "")}`,
    `tags: ${renderFrontmatterValue(fm.tags)}`,
    `appliesWhen: ${renderFrontmatterValue(fm.appliesWhen ?? "")}`,
    `doesNotApplyWhen: ${renderFrontmatterValue(fm.doesNotApplyWhen ?? "")}`,
    `priority: ${renderFrontmatterValue(fm.priority)}`,
    `status: ${renderFrontmatterValue(fm.status)}`,
    `relatedRules: ${renderFrontmatterValue(fm.relatedRules)}`,
    `relatedGuidance: ${renderFrontmatterValue(fm.relatedGuidance)}`,
    `requiresRead: ${renderFrontmatterValue(fm.requiresRead)}`,
    `routes: ${renderFrontmatterValue(fm.routes)}`,
    `createdAt: ${renderFrontmatterValue(fm.createdAt ?? nowIso())}`,
    `updatedAt: ${renderFrontmatterValue(fm.updatedAt ?? nowIso())}`,
    "---",
    "",
    document.body.trimEnd(),
    "",
  ].join("\n");
}

function parseYamlValue(raw: string): unknown {
  const value = raw.trim();
  if (value.length === 0) return "";
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}")) || (value.startsWith('"') && value.endsWith('"'))) {
    try {
      return JSON.parse(value);
    } catch {
      return value.replace(/^"|"$/g, "");
    }
  }
  return value;
}

function parseInlineFrontmatter(markdown: string, filePath: string): InstructionDocument {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const raw: Record<string, unknown> = {};
  let body = markdown;
  if (match) {
    body = markdown.slice(match[0].length);
    for (const line of match[1].split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const pair = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
      if (pair) raw[pair[1]] = parseYamlValue(pair[2]);
    }
  }
  const stringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
  const routes = Array.isArray(raw.routes)
    ? raw.routes.filter((entry): entry is { when: string; read: string; unless?: string } =>
      typeof entry === "object" && entry !== null && typeof (entry as { when?: unknown }).when === "string" && typeof (entry as { read?: unknown }).read === "string")
    : [];
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : path.basename(filePath, path.extname(filePath));
  const id = typeof raw.id === "string" && raw.id.trim() ? slugify(raw.id) : slugify(title);
  return {
    frontmatter: {
      schemaVersion: 1,
      id,
      title,
      summary: typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : undefined,
      tags: stringArray(raw.tags),
      appliesWhen: typeof raw.appliesWhen === "string" && raw.appliesWhen.trim() ? raw.appliesWhen.trim() : undefined,
      doesNotApplyWhen: typeof raw.doesNotApplyWhen === "string" && raw.doesNotApplyWhen.trim() ? raw.doesNotApplyWhen.trim() : undefined,
      priority: typeof raw.priority === "number" && Number.isFinite(raw.priority) ? raw.priority : 50,
      status: raw.status === "archived" ? "archived" : "active",
      relatedRules: stringArray(raw.relatedRules),
      relatedGuidance: stringArray(raw.relatedGuidance),
      requiresRead: stringArray(raw.requiresRead),
      routes,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    },
    body,
    path: filePath,
    resourceId: deterministicResourceId(filePath),
  };
}

function listManagedDocs(): InstructionDocument[] {
  const root = docsRoot();
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join(root, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .map((filePath) => parseInlineFrontmatter(fs.readFileSync(filePath, "utf8"), filePath));
}

function normalizeInstructionRef(ref: string): string {
  return ref.trim().replace(/^instruction:/, "doc:");
}

function findManagedDoc(ref: string): InstructionDocument | undefined {
  const normalized = normalizeInstructionRef(ref);
  return listManagedDocs().find((doc) =>
    `doc:${doc.frontmatter.id}` === normalized
    || doc.frontmatter.id === normalized
    || path.resolve(doc.path) === path.resolve(expandHome(ref.replace(/^file:/, ""))));
}

function snapshotDocVersion(document: InstructionDocument, reason: string): string {
  const root = path.join(docsVersionsRoot(), document.frontmatter.id);
  fs.mkdirSync(root, { recursive: true });
  const stamp = nowIso().replace(/[:.]/g, "-");
  const content = renderInstructionDocument(document);
  const versionPath = path.join(root, `${stamp}-${reason}-${stableHash(content, 8)}.md`);
  fs.writeFileSync(versionPath, content);
  return versionPath;
}

function readJsonFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function rulesRoot(flags: Record<string, string>, env: NodeJS.ProcessEnv = process.env): string {
  const configured = flags["rules-dir"] || env.CLAW_RULES_DIR;
  if (configured) return expandHome(configured);
  const clawHome = env.CLAW_HOME ? expandHome(env.CLAW_HOME) : path.join(os.homedir(), ".claw");
  return path.join(clawHome, "rules");
}

function guidanceRoot(flags: Record<string, string>, env: NodeJS.ProcessEnv = process.env): string {
  const configured = flags["guidance-dir"] || env.CLAW_GUIDANCE_DIR;
  if (configured) return expandHome(configured);
  const clawHome = env.CLAW_HOME ? expandHome(env.CLAW_HOME) : path.join(os.homedir(), ".claw");
  return path.join(clawHome, "guidance");
}

function listRules(flags: Record<string, string>): RuleRecordLite[] {
  const state = readJsonFile(path.join(rulesRoot(flags), "rules.json"));
  const rules = (state && typeof state === "object" && Array.isArray((state as { rules?: unknown }).rules))
    ? (state as { rules: unknown[] }).rules
    : [];
  return rules.filter((entry): entry is RuleRecordLite => typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string");
}

function listGuidance(flags: Record<string, string>): GuidanceRecordLite[] {
  const state = readJsonFile(path.join(guidanceRoot(flags), "guidance.json"));
  const records = (state && typeof state === "object" && Array.isArray((state as { records?: unknown }).records))
    ? (state as { records: unknown[] }).records
    : [];
  return records.filter((entry): entry is GuidanceRecordLite => typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string");
}

function ancestors(start: string): string[] {
  const result: string[] = [];
  let current = path.resolve(start);
  while (true) {
    result.push(current);
    const next = path.dirname(current);
    if (next === current) return result;
    current = next;
  }
}

function listAgentFiles(cwd: string): InstructionDocument[] {
  const fileNames = ["AGENTS.md", "agents.md", "CLAUDE.md"];
  const seen = new Set<string>();
  const docs: InstructionDocument[] = [];
  for (const dir of ancestors(cwd)) {
    for (const fileName of fileNames) {
      const filePath = path.join(dir, fileName);
      if (seen.has(filePath) || !fs.existsSync(filePath)) continue;
      seen.add(filePath);
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > 512 * 1024) continue;
      const parsed = parseInlineFrontmatter(fs.readFileSync(filePath, "utf8"), filePath);
      parsed.frontmatter.id = `agent-file-${stableHash(filePath, 10)}`;
      parsed.frontmatter.title = fileName;
      parsed.frontmatter.summary ??= `${fileName} instructions at ${dir}`;
      parsed.frontmatter.appliesWhen ??= `Working inside ${dir}`;
      docs.push(parsed);
    }
  }
  return docs;
}

function candidateText(candidate: Omit<InstructionCandidate, "score" | "reasons" | "readCommands" | "summaryAvailable">, extra = ""): string {
  return normalizeSearchText([
    candidate.ref,
    candidate.kind,
    candidate.title,
    candidate.severity,
    candidate.whenToRead,
    candidate.appliesWhen,
    candidate.useNot,
    candidate.path,
    extra,
  ].filter(Boolean).join(" "));
}

function scoreText(text: string, terms: string[], weights: { title?: string; tags?: string[]; priority?: number } = {}): { score: number; reasons: string[] } {
  if (terms.length === 0) return { score: 1, reasons: ["empty-query"] };
  const reasons: string[] = [];
  let score = 0;
  const normalizedTitle = normalizeSearchText(weights.title);
  const normalizedTags = (weights.tags ?? []).map(normalizeSearchText);
  for (const term of terms) {
    if (normalizedTitle === term || normalizedTitle.includes(term)) {
      score += 12;
      reasons.push(`title:${term}`);
    }
    if (normalizedTags.some((tag) => tag === term || tag.includes(term))) {
      score += 10;
      reasons.push(`tag:${term}`);
    }
    if (text.includes(term)) {
      score += 3;
      reasons.push(`term:${term}`);
    }
  }
  if (reasons.length === 0) return { score: 0, reasons: [] };
  score += Math.max(0, Math.min(100, weights.priority ?? 50)) / 100;
  return { score, reasons: [...new Set(reasons)] };
}

function docSections(markdown: string): Array<{ title: string; slug: string; content: string }> {
  const lines = markdown.split(/\r?\n/);
  const sections: Array<{ title: string; slug: string; content: string[] }> = [];
  let current: { title: string; slug: string; content: string[] } | undefined;
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      current = { title: heading[2].trim(), slug: slugify(heading[2]), content: [line] };
      sections.push(current);
      continue;
    }
    current?.content.push(line);
  }
  return sections.map((section) => ({ ...section, content: section.content.join("\n").trim() }));
}

function parseInstructionRoutes(raw: string): Array<{ when: string; read: string; unless?: string }> {
  const normalizeRoute = (entry: unknown): { when: string; read: string; unless?: string } | undefined => {
    if (typeof entry !== "object" || entry === null) return undefined;
    const route = entry as { when?: unknown; read?: unknown; unless?: unknown };
    if (typeof route.when !== "string" || typeof route.read !== "string") return undefined;
    const parsed: { when: string; read: string; unless?: string } = {
      when: route.when.trim(),
      read: route.read.trim(),
    };
    if (typeof route.unless === "string" && route.unless.trim()) parsed.unless = route.unless.trim();
    return parsed.when && parsed.read ? parsed : undefined;
  };

  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new CliHandledError("invalid_routes", "--routes must be JSON or comma-separated when=>read pairs.", CLI_EXIT_USAGE);
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    const routes = entries.map(normalizeRoute).filter((entry): entry is { when: string; read: string; unless?: string } => Boolean(entry));
    if (routes.length !== entries.length) {
      throw new CliHandledError("invalid_routes", "Each route must include string fields when and read.", CLI_EXIT_USAGE);
    }
    return routes;
  }

  return trimmed.split(",").map((entry) => {
    const [when, read] = entry.split("=>").map((part) => part?.trim());
    if (!when || !read) {
      throw new CliHandledError("invalid_routes", "--routes pairs must use when=>read.", CLI_EXIT_USAGE);
    }
    return { when, read };
  });
}

function publicDocView(document: InstructionDocument): Record<string, unknown> {
  return {
    ...document.frontmatter,
    ref: `doc:${document.frontmatter.id}`,
    path: document.path,
    resourceId: document.resourceId,
  };
}

function parseFlagValue(flags: Record<string, string>, name: string): string | undefined {
  const raw = flags[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseTargetFromFlags(flags: Record<string, string>): InstructionTarget {
  const target: InstructionTarget = {};
  for (const axis of INSTRUCTION_TARGET_AXES) {
    const value = parseFlagValue(flags, `target.${axis}`);
    if (value === undefined) continue;
    if (axis === "action") {
      if (!(INSTRUCTION_ACTIONS as string[]).includes(value)) {
        throw new CliHandledError(
          "invalid_action",
          `Unknown target.action ${value}. Expected one of: ${INSTRUCTION_ACTIONS.join(", ")}.`,
          CLI_EXIT_USAGE,
        );
      }
      target.action = value as InstructionTarget["action"];
      continue;
    }
    target[axis] = value;
  }
  return target;
}

function parseBodyFromFlags(flags: Record<string, string>): Partial<Record<InstructionBodyField, string>> {
  const body: Partial<Record<InstructionBodyField, string>> = {};
  for (const field of INSTRUCTION_BODY_FIELDS) {
    const value = parseFlagValue(flags, dashCase(field)) ?? parseFlagValue(flags, field);
    if (value === undefined) continue;
    body[field] = value;
  }
  return body;
}

function dashCase(value: string): string {
  return value.replace(/([A-Z])/g, "-$1").toLowerCase();
}

function rowFromInstruction(instruction: ClawInstruction): Omit<InstructionsRow, "id" | "createdAt" | "updatedAt"> {
  return {
    schemaVersion: instruction.schemaVersion,
    targetAlias: instruction.target.alias,
    targetFamily: instruction.target.family,
    targetCommand: instruction.target.command,
    targetSubcommand: instruction.target.subcommand,
    targetCollection: instruction.target.collection,
    targetAction: instruction.target.action,
    trigger: instruction.trigger,
    activation: instruction.activation,
    priority: instruction.priority,
    severity: instruction.severity,
    useWhen: instruction.useWhen,
    useNot: instruction.useNot,
    readPolicy: instruction.readPolicy,
    writePolicy: instruction.writePolicy,
    before: instruction.before,
    after: instruction.after,
    forbid: instruction.forbid,
    notes: instruction.notes,
    provenance: instruction.provenance,
    state: instruction.state,
    confidence: instruction.confidence,
    proposedFrom: instruction.proposedFrom,
    source: instruction.source,
    validations: instruction.validations,
  };
}

function manifestPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveClawjsDataRoot(env), "instructions", "manifest.yaml");
}

function parseManifestScalar(raw: string): unknown {
  const value = raw.trim();
  if (value.length === 0) return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
  return value;
}

function parseInstructionsManifest(content: string): ClawInstruction[] {
  const lines = content.split(/\r?\n/);
  const instructions: Array<Record<string, unknown> & { target?: Record<string, unknown> }> = [];
  let schemaVersion: number | undefined;
  let inInstructions = false;
  let current: (Record<string, unknown> & { target?: Record<string, unknown> }) | undefined;
  let inTarget = false;

  for (const [index, line] of lines.entries()) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const indent = line.match(/^ */)?.[0].length ?? 0;
    const trimmed = line.trim();
    if (indent === 0) {
      inTarget = false;
      if (trimmed === "instructions:") {
        inInstructions = true;
        continue;
      }
      const match = trimmed.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
      if (!match) throw new CliHandledError("invalid_manifest", `Invalid manifest line ${index + 1}: ${trimmed}`, CLI_EXIT_USAGE);
      if (match[1] === "schemaVersion") schemaVersion = parseManifestScalar(match[2]) as number;
      continue;
    }
    if (!inInstructions) {
      throw new CliHandledError("invalid_manifest", `Unexpected nested manifest line ${index + 1}: ${trimmed}`, CLI_EXIT_USAGE);
    }
    if (indent === 2 && trimmed.startsWith("- ")) {
      current = {};
      instructions.push(current);
      inTarget = false;
      const rest = trimmed.slice(2).trim();
      if (rest.length > 0) {
        const match = rest.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
        if (!match) throw new CliHandledError("invalid_manifest", `Invalid instruction line ${index + 1}: ${trimmed}`, CLI_EXIT_USAGE);
        current[match[1]] = parseManifestScalar(match[2]);
      }
      continue;
    }
    if (!current) {
      throw new CliHandledError("invalid_manifest", `Manifest field before instruction at line ${index + 1}.`, CLI_EXIT_USAGE);
    }
    if (indent === 4 && trimmed === "target:") {
      current.target = {};
      inTarget = true;
      continue;
    }
    const match = trimmed.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!match) throw new CliHandledError("invalid_manifest", `Invalid manifest line ${index + 1}: ${trimmed}`, CLI_EXIT_USAGE);
    if (indent === 6 && inTarget) {
      current.target ??= {};
      current.target[match[1]] = parseManifestScalar(match[2]);
    } else if (indent === 4) {
      inTarget = false;
      current[match[1]] = parseManifestScalar(match[2]);
    } else {
      throw new CliHandledError("invalid_manifest", `Unsupported indentation at line ${index + 1}.`, CLI_EXIT_USAGE);
    }
  }

  if (schemaVersion !== INSTRUCTIONS_SCHEMA_VERSION) {
    throw new CliHandledError("invalid_manifest", "Manifest schemaVersion must be 1.", CLI_EXIT_USAGE);
  }
  return instructions.map((entry, index) => {
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      throw new CliHandledError("invalid_manifest", `Instruction ${index + 1} must declare id.`, CLI_EXIT_USAGE);
    }
    const instruction: ClawInstruction = {
      id: entry.id,
      schemaVersion: INSTRUCTIONS_SCHEMA_VERSION,
      target: (entry.target ?? {}) as InstructionTarget,
      trigger: (entry.trigger as InstructionTrigger | undefined) ?? "surface-action",
      activation: (entry.activation as ClawInstruction["activation"] | undefined) ?? "on",
      priority: typeof entry.priority === "number" ? entry.priority : INSTRUCTION_PRIORITY_DEFAULT,
      severity: (entry.severity as ClawInstruction["severity"] | undefined) ?? "info",
      useWhen: typeof entry.useWhen === "string" ? entry.useWhen : undefined,
      useNot: typeof entry.useNot === "string" ? entry.useNot : undefined,
      readPolicy: typeof entry.readPolicy === "string" ? entry.readPolicy : undefined,
      writePolicy: typeof entry.writePolicy === "string" ? entry.writePolicy : undefined,
      before: typeof entry.before === "string" ? entry.before : undefined,
      after: typeof entry.after === "string" ? entry.after : undefined,
      forbid: typeof entry.forbid === "string" ? entry.forbid : undefined,
      notes: typeof entry.notes === "string" ? entry.notes : undefined,
      provenance: "user",
      state: (entry.state as ClawInstruction["state"] | undefined) ?? "active",
      source: `manifest:${entry.id}`,
      validations: Array.isArray(entry.validations) ? entry.validations as ClawInstruction["validations"] : undefined,
      createdAt: "",
      updatedAt: "",
    };
    const validation = validateInstructionShape(instruction);
    if (!validation.ok) {
      throw new CliHandledError(
        "invalid_manifest",
        `Manifest instruction ${entry.id} failed validation: ${validation.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ")}`,
        CLI_EXIT_USAGE,
      );
    }
    return instruction;
  });
}

function managedManifestKey(instruction: ClawInstruction): string | undefined {
  if (instruction.provenance !== "user") return undefined;
  if (typeof instruction.source !== "string" || !instruction.source.startsWith("manifest:")) return undefined;
  return instruction.source.slice("manifest:".length);
}

function sameManifestInstruction(current: ClawInstruction, next: ClawInstruction): boolean {
  const a = rowFromInstruction(current);
  const b = rowFromInstruction(next);
  return JSON.stringify(a) === JSON.stringify(b);
}

function instructionFromRow(row: Record<string, unknown>, fallbackId?: string): ClawInstruction {
  const target: InstructionTarget = {};
  if (typeof row.targetAlias === "string") target.alias = row.targetAlias;
  if (typeof row.targetFamily === "string") target.family = row.targetFamily;
  if (typeof row.targetCommand === "string") target.command = row.targetCommand;
  if (typeof row.targetSubcommand === "string") target.subcommand = row.targetSubcommand;
  if (typeof row.targetCollection === "string") target.collection = row.targetCollection;
  if (typeof row.targetAction === "string") target.action = row.targetAction as InstructionTarget["action"];

  return {
    id: typeof row.id === "string" ? row.id : fallbackId ?? "",
    schemaVersion: clawInstructionsSchemaVersion,
    target,
    trigger: (row.trigger as InstructionTrigger) ?? "surface-action",
    activation: (row.activation as ClawInstruction["activation"]) ?? "on",
    priority: typeof row.priority === "number" ? row.priority : INSTRUCTION_PRIORITY_DEFAULT,
    severity: (row.severity as ClawInstruction["severity"]) ?? "info",
    useWhen: typeof row.useWhen === "string" ? row.useWhen : undefined,
    useNot: typeof row.useNot === "string" ? row.useNot : undefined,
    readPolicy: typeof row.readPolicy === "string" ? row.readPolicy : undefined,
    writePolicy: typeof row.writePolicy === "string" ? row.writePolicy : undefined,
    before: typeof row.before === "string" ? row.before : undefined,
    after: typeof row.after === "string" ? row.after : undefined,
    forbid: typeof row.forbid === "string" ? row.forbid : undefined,
    notes: typeof row.notes === "string" ? row.notes : undefined,
    provenance: (row.provenance as ClawInstruction["provenance"]) ?? "user",
    state: (row.state as ClawInstruction["state"]) ?? "active",
    confidence: typeof row.confidence === "number" ? row.confidence : undefined,
    proposedFrom: typeof row.proposedFrom === "string" ? row.proposedFrom : undefined,
    source: typeof row.source === "string" ? row.source : undefined,
    validations: Array.isArray(row.validations) ? row.validations as ClawInstruction["validations"] : undefined,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
  };
}

function publicInstructionView(instruction: ClawInstruction): Record<string, unknown> {
  return {
    id: instruction.id,
    schemaVersion: instruction.schemaVersion,
    target: instruction.target,
    trigger: instruction.trigger,
    activation: instruction.activation,
    priority: instruction.priority,
    severity: instruction.severity,
    useWhen: instruction.useWhen,
    useNot: instruction.useNot,
    readPolicy: instruction.readPolicy,
    writePolicy: instruction.writePolicy,
    before: instruction.before,
    after: instruction.after,
    forbid: instruction.forbid,
    notes: instruction.notes,
    provenance: instruction.provenance,
    state: instruction.state,
    confidence: instruction.confidence,
    proposedFrom: instruction.proposedFrom,
    source: instruction.source,
    validations: instruction.validations,
    createdAt: instruction.createdAt,
    updatedAt: instruction.updatedAt,
  };
}

interface FilterOptions {
  target: InstructionTarget;
  trigger?: InstructionTrigger;
  state?: ClawInstruction["state"];
  provenance?: ClawInstruction["provenance"];
}

function rowMatchesFilter(row: ClawInstruction, filter: FilterOptions): boolean {
  for (const axis of INSTRUCTION_TARGET_AXES) {
    const expected = filter.target[axis];
    if (expected === undefined) continue;
    if (row.target[axis] !== expected) return false;
  }
  if (filter.trigger && row.trigger !== filter.trigger) return false;
  if (filter.state && row.state !== filter.state) return false;
  if (filter.provenance && row.provenance !== filter.provenance) return false;
  return true;
}

function listStoredInstructions(store: DatabaseServiceStore): ClawInstruction[] {
  const { items } = store.listRecords(NAMESPACE, COLLECTION, { limit: 10_000 });
  return items.map((envelope) => instructionFromRow(envelope as Record<string, unknown>, envelope.id));
}

function parseFilter(flags: Record<string, string>): FilterOptions {
  const filter: FilterOptions = { target: parseTargetFromFlags(flags) };
  const trigger = parseFlagValue(flags, "trigger");
  if (trigger !== undefined) {
    if (!isInstructionTrigger(trigger)) {
      throw new CliHandledError(
        "invalid_trigger",
        `Unknown trigger ${trigger}. Expected one of: ${listKnownTriggers().join(", ")}.`,
        CLI_EXIT_USAGE,
      );
    }
    filter.trigger = trigger;
  }
  const state = parseFlagValue(flags, "state");
  if (state !== undefined) {
    if (!(INSTRUCTION_STATES as string[]).includes(state)) {
      throw new CliHandledError(
        "invalid_state",
        `Unknown state ${state}. Expected one of: ${INSTRUCTION_STATES.join(", ")}.`,
        CLI_EXIT_USAGE,
      );
    }
    filter.state = state as ClawInstruction["state"];
  }
  const provenance = parseFlagValue(flags, "provenance");
  if (provenance !== undefined) {
    if (!(INSTRUCTION_PROVENANCES as string[]).includes(provenance)) {
      throw new CliHandledError(
        "invalid_provenance",
        `Unknown provenance ${provenance}. Expected one of: ${INSTRUCTION_PROVENANCES.join(", ")}.`,
        CLI_EXIT_USAGE,
      );
    }
    filter.provenance = provenance as ClawInstruction["provenance"];
  }
  return filter;
}

function listKnownTriggers(): string[] {
  const base = [...INSTRUCTION_TRIGGER_BASES];
  const inputKinds = INSTRUCTION_INPUT_KINDS.map((kind) => `input-kind:${kind}`);
  return [...base, ...inputKinds];
}

interface CreateOptions {
  state: ClawInstruction["state"];
  provenance: ClawInstruction["provenance"];
  proposedFrom?: string;
}

function createInstruction(
  store: DatabaseServiceStore,
  flags: Record<string, string>,
  options: CreateOptions,
): ClawInstruction {
  const target = parseTargetFromFlags(flags);
  const trigger = (parseFlagValue(flags, "trigger") ?? "surface-action") as InstructionTrigger;
  if (!isInstructionTrigger(trigger)) {
    throw new CliHandledError(
      "invalid_trigger",
      `Unknown trigger ${trigger}. Expected one of: ${listKnownTriggers().join(", ")}.`,
      CLI_EXIT_USAGE,
    );
  }
  const activation = (parseFlagValue(flags, "activation") ?? "on") as ClawInstruction["activation"];
  if (!(INSTRUCTION_ACTIVATIONS as string[]).includes(activation)) {
    throw new CliHandledError("invalid_activation", `Unknown activation ${activation}.`, CLI_EXIT_USAGE);
  }
  const severity = (parseFlagValue(flags, "severity") ?? "info") as ClawInstruction["severity"];
  if (!(INSTRUCTION_SEVERITIES as string[]).includes(severity)) {
    throw new CliHandledError("invalid_severity", `Unknown severity ${severity}.`, CLI_EXIT_USAGE);
  }
  const priorityRaw = parseFlagValue(flags, "priority");
  let priority = INSTRUCTION_PRIORITY_DEFAULT;
  if (priorityRaw !== undefined) {
    const parsed = Number.parseInt(priorityRaw, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      throw new CliHandledError("invalid_priority", `--priority must be an integer in [0, 100].`, CLI_EXIT_USAGE);
    }
    priority = parsed;
  }
  const body = parseBodyFromFlags(flags);
  const confidenceRaw = parseFlagValue(flags, "confidence");
  let confidence: number | undefined;
  if (confidenceRaw !== undefined) {
    const parsed = Number.parseFloat(confidenceRaw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new CliHandledError("invalid_confidence", `--confidence must be a number in [0, 1].`, CLI_EXIT_USAGE);
    }
    confidence = parsed;
  }

  const draft: ClawInstruction = {
    id: `ins_${randomUUID()}`,
    schemaVersion: INSTRUCTIONS_SCHEMA_VERSION,
    target,
    trigger,
    activation,
    priority,
    severity,
    ...body,
    provenance: options.provenance,
    state: options.state,
    confidence,
    proposedFrom: options.proposedFrom,
    createdAt: "",
    updatedAt: "",
  };

  const validation = validateInstructionShape(draft);
  if (!validation.ok) {
    throw new CliHandledError(
      "invalid_instruction",
      `Instruction validation failed: ${validation.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ")}`,
      CLI_EXIT_USAGE,
    );
  }
  const payload = rowFromInstruction(draft);
  const envelope = store.createRecord(NAMESPACE, COLLECTION, payload as Record<string, unknown>);
  return instructionFromRow(envelope as Record<string, unknown>, envelope.id);
}

function findInstruction(store: DatabaseServiceStore, id: string): ClawInstruction | null {
  const envelope = store.getRecord(NAMESPACE, COLLECTION, id);
  if (!envelope) return null;
  return instructionFromRow(envelope as Record<string, unknown>, envelope.id);
}

function applyEditFlags(instruction: ClawInstruction, flags: Record<string, string>): ClawInstruction {
  const next: ClawInstruction = { ...instruction, target: { ...instruction.target } };
  const targetOverrides = parseTargetFromFlags(flags);
  for (const axis of INSTRUCTION_TARGET_AXES) {
    if (targetOverrides[axis] !== undefined) {
      (next.target[axis] as typeof targetOverrides[typeof axis]) = targetOverrides[axis] as never;
    }
  }
  const triggerFlag = parseFlagValue(flags, "trigger");
  if (triggerFlag !== undefined) {
    if (!isInstructionTrigger(triggerFlag)) {
      throw new CliHandledError("invalid_trigger", `Unknown trigger ${triggerFlag}.`, CLI_EXIT_USAGE);
    }
    next.trigger = triggerFlag;
  }
  const activationFlag = parseFlagValue(flags, "activation");
  if (activationFlag !== undefined) {
    if (!(INSTRUCTION_ACTIVATIONS as string[]).includes(activationFlag)) {
      throw new CliHandledError("invalid_activation", `Unknown activation ${activationFlag}.`, CLI_EXIT_USAGE);
    }
    next.activation = activationFlag as ClawInstruction["activation"];
  }
  const severityFlag = parseFlagValue(flags, "severity");
  if (severityFlag !== undefined) {
    if (!(INSTRUCTION_SEVERITIES as string[]).includes(severityFlag)) {
      throw new CliHandledError("invalid_severity", `Unknown severity ${severityFlag}.`, CLI_EXIT_USAGE);
    }
    next.severity = severityFlag as ClawInstruction["severity"];
  }
  const priorityFlag = parseFlagValue(flags, "priority");
  if (priorityFlag !== undefined) {
    const parsed = Number.parseInt(priorityFlag, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      throw new CliHandledError("invalid_priority", `--priority must be an integer in [0, 100].`, CLI_EXIT_USAGE);
    }
    next.priority = parsed;
  }
  const body = parseBodyFromFlags(flags);
  for (const field of INSTRUCTION_BODY_FIELDS) {
    if (body[field] !== undefined) {
      next[field] = body[field];
    }
  }
  const stateFlag = parseFlagValue(flags, "state");
  if (stateFlag !== undefined) {
    if (!(INSTRUCTION_STATES as string[]).includes(stateFlag)) {
      throw new CliHandledError("invalid_state", `Unknown state ${stateFlag}.`, CLI_EXIT_USAGE);
    }
    next.state = stateFlag as ClawInstruction["state"];
  }
  const validation = validateInstructionShape(next);
  if (!validation.ok) {
    throw new CliHandledError(
      "invalid_instruction",
      `Instruction validation failed: ${validation.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ")}`,
      CLI_EXIT_USAGE,
    );
  }
  return next;
}

function runWhere(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[2];
  if (!command) {
    throw new CliHandledError("missing_command", `Usage: ${input.binName} instructions where <command> [<action>]`, CLI_EXIT_USAGE);
  }
  const action = input.positionals[3];
  if (action !== undefined && !(INSTRUCTION_ACTIONS as string[]).includes(action)) {
    throw new CliHandledError("invalid_action", `Unknown action ${action}.`, CLI_EXIT_USAGE);
  }
  const trigger: InstructionTrigger = (parseFlagValue(input.flags, "trigger") as InstructionTrigger) || "surface-action";
  if (!isInstructionTrigger(trigger)) {
    throw new CliHandledError("invalid_trigger", `Unknown trigger ${trigger}.`, CLI_EXIT_USAGE);
  }
  const target: InstructionTarget = { command };
  if (action) target.action = action as InstructionTarget["action"];

  const overrides = listStoredInstructions(store);
  const seeds = listMaterializedSeedInstructions();
  const pluginSeeds = listPluginMaterializedSeedInstructions(input.context.cwd);
  const all = [...seeds, ...pluginSeeds, ...overrides];
  const resolved = resolveInstructionsForEvent(all, { target, trigger });

  const payload = {
    target,
    trigger,
    appliedCount: resolved.length,
    rules: resolved.map((rule) => ({
      id: rule.id,
      source: rule.source ?? null,
      provenance: rule.provenance,
      severity: rule.severity,
      priority: rule.priority,
      target: rule.target,
      trigger: rule.trigger,
      useWhen: rule.useWhen,
      useNot: rule.useNot,
      readPolicy: rule.readPolicy,
      writePolicy: rule.writePolicy,
      before: rule.before,
      after: rule.after,
      forbid: rule.forbid,
      notes: rule.notes,
    })),
  };

  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, payload, { canonicalCommand: CANONICAL_COMMAND, operation: "where" });
    return CLI_EXIT_OK;
  }

  const lines: string[] = [
    `Instructions applicable to ${describeInstructionTarget(target)} on trigger=${trigger}: ${resolved.length}`,
    "",
  ];
  for (const rule of resolved) {
    lines.push(`- [${rule.severity}/${rule.priority}] ${rule.id} ${rule.source ? `(${rule.source})` : ""}`);
    for (const field of INSTRUCTION_BODY_FIELDS) {
      const value = rule[field];
      if (typeof value === "string" && value.length > 0) {
        lines.push(`    ${field}: ${value}`);
      }
    }
  }
  input.context.stdout.write(`${lines.join("\n")}\n`);
  return CLI_EXIT_OK;
}

function runReconcile(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const pathToManifest = manifestPath();
  if (!fs.existsSync(pathToManifest)) {
    throw new CliHandledError(
      "manifest_not_found",
      `Instruction manifest not found at ${pathToManifest}.`,
      CLI_EXIT_FAILURE,
    );
  }
  const desired = parseInstructionsManifest(fs.readFileSync(pathToManifest, "utf8"));
  const desiredById = new Map(desired.map((instruction) => [instruction.id, instruction]));
  if (desiredById.size !== desired.length) {
    throw new CliHandledError("invalid_manifest", "Manifest instruction ids must be unique.", CLI_EXIT_USAGE);
  }

  const live = listStoredInstructions(store);
  const liveById = new Map(live.map((instruction) => [instruction.id, instruction]));
  const managedByKey = new Map<string, ClawInstruction>();
  for (const instruction of live) {
    const key = managedManifestKey(instruction);
    if (key) managedByKey.set(key, instruction);
  }

  let added = 0;
  let updated = 0;
  let archived = 0;
  let unchanged = 0;

  for (const instruction of desired) {
    const current = liveById.get(instruction.id);
    if (current && managedManifestKey(current) !== instruction.id) {
      throw new CliHandledError(
        "manifest_id_conflict",
        `Instruction id ${instruction.id} already exists outside manifest management.`,
        CLI_EXIT_USAGE,
      );
    }
    const payload = rowFromInstruction(instruction);
    if (!current) {
      store.putRecord({
        namespaceId: NAMESPACE,
        collectionName: COLLECTION,
        recordId: instruction.id,
        payload: payload as Record<string, unknown>,
      });
      added += 1;
    } else if (sameManifestInstruction(current, instruction)) {
      unchanged += 1;
    } else {
      store.putRecord({
        namespaceId: NAMESPACE,
        collectionName: COLLECTION,
        recordId: instruction.id,
        payload: payload as Record<string, unknown>,
        createdAt: current.createdAt,
      });
      updated += 1;
    }
  }

  for (const [key, instruction] of managedByKey) {
    if (desiredById.has(key) || instruction.state === "archived") continue;
    const next: ClawInstruction = { ...instruction, state: "archived" };
    store.putRecord({
      namespaceId: NAMESPACE,
      collectionName: COLLECTION,
      recordId: instruction.id,
      payload: rowFromInstruction(next) as Record<string, unknown>,
      createdAt: instruction.createdAt,
    });
    archived += 1;
  }

  const payload = {
    manifestPath: pathToManifest,
    counts: { added, updated, archived, unchanged },
  };
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, payload, { canonicalCommand: CANONICAL_COMMAND, operation: "reconcile" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(
    `Reconciled instructions manifest: added ${added}, updated ${updated}, archived ${archived}, unchanged ${unchanged}\n`,
  );
  return CLI_EXIT_OK;
}

function buildCliInstructionCandidates(input: InstructionsCliInput, store: DatabaseServiceStore, terms: string[]): InstructionCandidate[] {
  const all = [
    ...listMaterializedSeedInstructions(),
    ...listPluginMaterializedSeedInstructions(input.context.cwd),
    ...listStoredInstructions(store),
  ].filter((instruction) => instruction.state === "active" && instruction.activation !== "off");
  return all.flatMap((instruction) => {
    const title = instruction.source ?? instruction.id;
    const text = candidateText({
      ref: `cli_instruction:${instruction.id}`,
      kind: "cli_instruction",
      title,
      priority: instruction.priority,
      severity: instruction.severity,
      whenToRead: instruction.before,
      appliesWhen: instruction.useWhen,
      useNot: instruction.useNot,
    }, [
      describeInstructionTarget(instruction.target),
      instruction.readPolicy,
      instruction.writePolicy,
      instruction.forbid,
      instruction.notes,
      instruction.trigger,
    ].filter(Boolean).join(" "));
    const scored = scoreText(text, terms, { title, priority: instruction.priority });
    if (scored.score <= 0) return [];
    return [{
      ref: `cli_instruction:${instruction.id}`,
      kind: "cli_instruction" as const,
      title,
      priority: instruction.priority,
      severity: instruction.severity,
      whenToRead: instruction.before,
      appliesWhen: instruction.useWhen,
      useNot: instruction.useNot,
      summaryAvailable: false,
      reasons: scored.reasons,
      readCommands: [`${input.binName} instructions show ${instruction.id} --json`],
      score: scored.score,
    }];
  });
}

function buildRuleCandidates(input: InstructionsCliInput, terms: string[]): InstructionCandidate[] {
  return listRules(input.flags).flatMap((rule) => {
    if (rule.status && rule.status !== "active") return [];
    const tags = Object.values(rule.applyWhen ?? {}).flat();
    const title = rule.title ?? rule.id;
    const text = candidateText({
      ref: `rule:${rule.id}`,
      kind: "rule",
      title,
      priority: rule.priority ?? 100,
      severity: rule.kind,
      appliesWhen: tags.join(", "),
    }, [
      rule.content,
      rule.references?.map((ref) => `${ref.kind}:${ref.label ?? ref.ref}`).join(" "),
    ].filter(Boolean).join(" "));
    const scored = scoreText(text, terms, { title, tags, priority: rule.priority ?? 100 });
    if (scored.score <= 0) return [];
    return [{
      ref: `rule:${rule.id}`,
      kind: "rule" as const,
      title,
      priority: rule.priority ?? 100,
      severity: rule.kind,
      appliesWhen: tags.length ? tags.join(", ") : undefined,
      summaryAvailable: false,
      reasons: scored.reasons,
      readCommands: [`${input.binName} rules inspect ${rule.id} --json`],
      score: scored.score + 2,
    }];
  });
}

function buildGuidanceCandidates(input: InstructionsCliInput, terms: string[]): InstructionCandidate[] {
  return listGuidance(input.flags).flatMap((record) => {
    if (record.status && record.status !== "active") return [];
    const tags = Object.values(record.applyWhen ?? {}).flat();
    const title = record.title ?? record.id;
    const text = candidateText({
      ref: `guidance:${record.id}`,
      kind: "guidance",
      title,
      priority: record.priority ?? 100,
      severity: record.severity,
      whenToRead: record.capsule,
      appliesWhen: tags.join(", "),
    }, [
      record.details,
      record.resourceIds?.join(" "),
      record.commands?.join(" "),
    ].filter(Boolean).join(" "));
    const scored = scoreText(text, terms, { title, tags, priority: record.priority ?? 100 });
    if (scored.score <= 0) return [];
    return [{
      ref: `guidance:${record.id}`,
      kind: "guidance" as const,
      title,
      priority: record.priority ?? 100,
      severity: record.severity,
      whenToRead: record.capsule,
      appliesWhen: tags.length ? tags.join(", ") : undefined,
      summaryAvailable: Boolean(record.details),
      reasons: scored.reasons,
      readCommands: record.commands?.length ? record.commands : [`${input.binName} guidance show ${record.id} --json`],
      resourceId: record.resourceIds?.[0],
      score: scored.score + 1,
    }];
  });
}

function buildDocumentCandidates(input: InstructionsCliInput, terms: string[]): InstructionCandidate[] {
  return listManagedDocs().flatMap((document) => {
    if (document.frontmatter.status !== "active") return [];
    const sections = docSections(document.body).map((section) => section.title).join(" ");
    const text = candidateText({
      ref: `doc:${document.frontmatter.id}`,
      kind: "instruction_document",
      title: document.frontmatter.title,
      priority: document.frontmatter.priority,
      whenToRead: document.frontmatter.appliesWhen,
      appliesWhen: document.frontmatter.appliesWhen,
      useNot: document.frontmatter.doesNotApplyWhen,
      path: document.path,
    }, [
      document.frontmatter.summary,
      document.frontmatter.tags.join(" "),
      document.frontmatter.requiresRead.join(" "),
      document.frontmatter.relatedRules.join(" "),
      document.frontmatter.relatedGuidance.join(" "),
      document.frontmatter.routes.map((route) => `${route.when} ${route.read} ${route.unless ?? ""}`).join(" "),
      sections,
    ].filter(Boolean).join(" "));
    const scored = scoreText(text, terms, {
      title: document.frontmatter.title,
      tags: document.frontmatter.tags,
      priority: document.frontmatter.priority,
    });
    if (scored.score <= 0) return [];
    return [{
      ref: `doc:${document.frontmatter.id}`,
      kind: "instruction_document" as const,
      title: document.frontmatter.title,
      priority: document.frontmatter.priority,
      whenToRead: document.frontmatter.appliesWhen,
      appliesWhen: document.frontmatter.appliesWhen,
      useNot: document.frontmatter.doesNotApplyWhen,
      summaryAvailable: Boolean(document.frontmatter.summary),
      reasons: scored.reasons,
      readCommands: [`${input.binName} instructions read doc:${document.frontmatter.id} --summary --json`],
      resourceId: document.resourceId,
      path: document.path,
      score: scored.score + 1.5,
    }];
  });
}

function buildAgentFileCandidates(input: InstructionsCliInput, terms: string[]): InstructionCandidate[] {
  return listAgentFiles(input.context.cwd).flatMap((document) => {
    const sections = docSections(document.body).map((section) => section.title).join(" ");
    const text = candidateText({
      ref: `agent_file:${document.resourceId}`,
      kind: "agent_file",
      title: document.frontmatter.title,
      priority: 75,
      whenToRead: document.frontmatter.appliesWhen,
      appliesWhen: document.frontmatter.appliesWhen,
      path: document.path,
    }, [
      document.frontmatter.summary,
      sections,
      path.basename(path.dirname(document.path)),
    ].filter(Boolean).join(" "));
    const scored = scoreText(text, terms, { title: document.frontmatter.title, priority: 75 });
    if (scored.score <= 0) return [];
    return [{
      ref: `agent_file:${document.resourceId}`,
      kind: "agent_file" as const,
      title: document.frontmatter.title,
      priority: 75,
      whenToRead: document.frontmatter.appliesWhen,
      appliesWhen: document.frontmatter.appliesWhen,
      summaryAvailable: Boolean(document.frontmatter.summary),
      reasons: scored.reasons,
      readCommands: [`${input.binName} instructions read agent_file:${document.resourceId} --summary --json`],
      resourceId: document.resourceId,
      path: document.path,
      score: scored.score,
    }];
  });
}

function runUnifiedSearch(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const query = input.positionals.slice(2).join(" ") || parseFlagValue(input.flags, "query") || parseFlagValue(input.flags, "task") || "";
  const terms = splitTerms(query);
  const limit = Math.max(1, Math.min(100, Number.parseInt(parseFlagValue(input.flags, "limit") ?? "20", 10) || 20));
  const candidates = [
    ...buildRuleCandidates(input, terms),
    ...buildGuidanceCandidates(input, terms),
    ...buildCliInstructionCandidates(input, store, terms),
    ...buildDocumentCandidates(input, terms),
    ...buildAgentFileCandidates(input, terms),
  ]
    .filter((candidate) => terms.length === 0 || candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.priority - left.priority || left.title.localeCompare(right.title))
    .slice(0, limit);
  const payload = {
    query,
    total: candidates.length,
    items: candidates.map(({ score, ...candidate }) => ({ ...candidate, score })),
    insertion: "recommend_only",
    note: "Search returns typed governance/instruction candidates. It does not inject long documents or compile prompt context.",
  };
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, payload, { canonicalCommand: CANONICAL_COMMAND, operation: "search" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${candidates.map((item) => `${item.kind}\t${item.ref}\t${item.title}`).join("\n")}\n`);
  return CLI_EXIT_OK;
}

function findReadableDocument(input: InstructionsCliInput, ref: string): InstructionDocument | undefined {
  const normalized = normalizeInstructionRef(ref);
  const managed = findManagedDoc(normalized);
  if (managed) return managed;
  const agentFiles = listAgentFiles(input.context.cwd);
  if (normalized.startsWith("agent_file:")) {
    const resourceId = normalized.slice("agent_file:".length);
    return agentFiles.find((document) => document.resourceId === resourceId);
  }
  if (normalized.startsWith("file:")) {
    const filePath = expandHome(normalized.slice("file:".length));
    if (fs.existsSync(filePath)) return parseInlineFrontmatter(fs.readFileSync(filePath, "utf8"), filePath);
  }
  return agentFiles.find((document) => path.resolve(document.path) === path.resolve(expandHome(ref)));
}

function runRead(input: InstructionsCliInput): number {
  const ref = input.positionals[2] || parseFlagValue(input.flags, "ref");
  if (!ref) throw new CliHandledError("missing_ref", `Usage: ${input.binName} instructions read <ref> [--summary|--section name|--full]`, CLI_EXIT_USAGE);
  const document = findReadableDocument(input, ref);
  if (!document) throw new CliHandledError("not_found", `Instruction reference not found: ${ref}`, CLI_EXIT_FAILURE);
  const section = parseFlagValue(input.flags, "section");
  const full = input.flags.full === "true" || input.flags.full === "1";
  const summary = input.flags.summary === "true" || input.flags.summary === "1" || (!section && !full);
  let payload: Record<string, unknown>;
  if (section) {
    const normalized = slugify(section);
    const found = docSections(document.body).find((entry) => entry.slug === normalized || normalizeSearchText(entry.title) === normalizeSearchText(section));
    if (!found) throw new CliHandledError("section_not_found", `Section ${section} not found in ${ref}.`, CLI_EXIT_FAILURE);
    payload = { ...publicDocView(document), section: found.title, content: found.content };
  } else if (full) {
    payload = { ...publicDocView(document), body: document.body };
  } else if (summary) {
    payload = {
      ...publicDocView(document),
      body: undefined,
      content: undefined,
      summary: document.frontmatter.summary ?? "",
      availableSections: docSections(document.body).map((entry) => entry.title),
    };
  } else {
    payload = publicDocView(document);
  }
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, payload, { canonicalCommand: CANONICAL_COMMAND, operation: "read" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return CLI_EXIT_OK;
}

function parseDocInput(input: InstructionsCliInput, current?: InstructionDocument): InstructionDocument {
  const title = parseFlagValue(input.flags, "title") ?? current?.frontmatter.title;
  if (!title) throw new CliHandledError("missing_title", `Usage: ${input.binName} instructions docs create --title TEXT [--content TEXT]`, CLI_EXIT_USAGE);
  const id = slugify(parseFlagValue(input.flags, "id") ?? current?.frontmatter.id ?? title);
  const now = nowIso();
  const priority = Number.parseInt(parseFlagValue(input.flags, "priority") ?? String(current?.frontmatter.priority ?? 50), 10);
  if (!Number.isFinite(priority) || priority < 0 || priority > 100) {
    throw new CliHandledError("invalid_priority", `--priority must be an integer in [0, 100].`, CLI_EXIT_USAGE);
  }
  const routesRaw = parseFlagValue(input.flags, "routes");
  const routes = routesRaw === undefined
    ? current?.frontmatter.routes ?? []
    : parseInstructionRoutes(routesRaw);
  const contentFile = parseFlagValue(input.flags, "file") ?? parseFlagValue(input.flags, "from-file");
  const content = contentFile
    ? fs.readFileSync(expandHome(contentFile), "utf8")
    : parseFlagValue(input.flags, "content") ?? parseFlagValue(input.flags, "body") ?? current?.body ?? "";
  const docPath = current?.path ?? managedDocPathFor(title, id);
  return {
    frontmatter: {
      schemaVersion: 1,
      id,
      title,
      summary: parseFlagValue(input.flags, "summary") ?? current?.frontmatter.summary,
      tags: input.flags.tags !== undefined ? parseCsv(input.flags.tags) : current?.frontmatter.tags ?? [],
      appliesWhen: parseFlagValue(input.flags, "applies-when") ?? parseFlagValue(input.flags, "appliesWhen") ?? current?.frontmatter.appliesWhen,
      doesNotApplyWhen: parseFlagValue(input.flags, "does-not-apply-when") ?? parseFlagValue(input.flags, "doesNotApplyWhen") ?? current?.frontmatter.doesNotApplyWhen,
      priority,
      status: current?.frontmatter.status ?? "active",
      relatedRules: input.flags["related-rules"] !== undefined ? parseCsv(input.flags["related-rules"]) : current?.frontmatter.relatedRules ?? [],
      relatedGuidance: input.flags["related-guidance"] !== undefined ? parseCsv(input.flags["related-guidance"]) : current?.frontmatter.relatedGuidance ?? [],
      requiresRead: input.flags["requires-read"] !== undefined ? parseCsv(input.flags["requires-read"]) : current?.frontmatter.requiresRead ?? [],
      routes,
      createdAt: current?.frontmatter.createdAt ?? now,
      updatedAt: now,
    },
    body: content,
    path: docPath,
    resourceId: deterministicResourceId(docPath),
  };
}

function runDocs(input: InstructionsCliInput): number {
  const command = input.positionals[2];
  if (!command || !(DOCS_SUBCOMMANDS as readonly string[]).includes(command)) {
    throw new CliHandledError("invalid_docs_subcommand", `Usage: ${input.binName} instructions docs ${DOCS_SUBCOMMANDS.join("|")}`, CLI_EXIT_USAGE);
  }
  if (command === "list") {
    const docs = listManagedDocs();
    const payload = { total: docs.length, items: docs.map(publicDocView) };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, payload, { canonicalCommand: CANONICAL_COMMAND, operation: "docs list" });
    else input.context.stdout.write(`${docs.map((doc) => `${doc.frontmatter.status}\t${doc.frontmatter.id}\t${doc.frontmatter.title}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "create") {
    const document = parseDocInput(input);
    if (fs.existsSync(document.path)) throw new CliHandledError("doc_exists", `Instruction document already exists: ${document.path}`, CLI_EXIT_USAGE);
    fs.mkdirSync(path.dirname(document.path), { recursive: true });
    fs.writeFileSync(document.path, renderInstructionDocument(document));
    const versionPath = snapshotDocVersion(document, "create");
    const payload = { document: publicDocView(document), versionPath };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, payload, { canonicalCommand: CANONICAL_COMMAND, operation: "docs create" });
    else input.context.stdout.write(`${document.frontmatter.id}\n`);
    return CLI_EXIT_OK;
  }
  const ref = input.positionals[3] || parseFlagValue(input.flags, "id") || parseFlagValue(input.flags, "ref");
  if (!ref) throw new CliHandledError("missing_doc_ref", `Usage: ${input.binName} instructions docs ${command} <id>`, CLI_EXIT_USAGE);
  const current = findManagedDoc(ref);
  if (!current) throw new CliHandledError("not_found", `Instruction document not found: ${ref}`, CLI_EXIT_FAILURE);
  if (command === "versions") {
    const root = path.join(docsVersionsRoot(), current.frontmatter.id);
    const versions = fs.existsSync(root)
      ? fs.readdirSync(root).filter((name) => name.endsWith(".md")).map((name) => path.join(root, name)).sort()
      : [];
    const payload = { ref: `doc:${current.frontmatter.id}`, versions };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, payload, { canonicalCommand: CANONICAL_COMMAND, operation: "docs versions" });
    else input.context.stdout.write(`${versions.join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "archive") {
    const next = { ...current, frontmatter: { ...current.frontmatter, status: "archived" as const, updatedAt: nowIso() } };
    fs.writeFileSync(next.path, renderInstructionDocument(next));
    const versionPath = snapshotDocVersion(next, "archive");
    const payload = { document: publicDocView(next), versionPath };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, payload, { canonicalCommand: CANONICAL_COMMAND, operation: "docs archive" });
    else input.context.stdout.write(`${next.frontmatter.id} archived\n`);
    return CLI_EXIT_OK;
  }
  const next = parseDocInput(input, current);
  fs.writeFileSync(next.path, renderInstructionDocument(next));
  const versionPath = snapshotDocVersion(next, "edit");
  const payload = { document: publicDocView(next), versionPath };
  if (input.wantsJson) writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, payload, { canonicalCommand: CANONICAL_COMMAND, operation: "docs edit" });
  else input.context.stdout.write(`${next.frontmatter.id} updated\n`);
  return CLI_EXIT_OK;
}

function runGraph(input: InstructionsCliInput): number {
  const ref = input.positionals[2] || parseFlagValue(input.flags, "ref");
  if (!ref) throw new CliHandledError("missing_ref", `Usage: ${input.binName} instructions graph <ref>`, CLI_EXIT_USAGE);
  const document = findManagedDoc(ref);
  if (!document) throw new CliHandledError("not_found", `Instruction graph currently supports managed docs; not found: ${ref}`, CLI_EXIT_FAILURE);
  const relatedRules = new Set(document.frontmatter.relatedRules);
  const relatedGuidance = new Set(document.frontmatter.relatedGuidance);
  for (const rule of listRules(input.flags)) {
    if (rule.references?.some((reference) => reference.ref === document.frontmatter.id || reference.ref === `instruction:${document.frontmatter.id}` || reference.ref === `doc:${document.frontmatter.id}`)) {
      relatedRules.add(rule.id);
    }
  }
  for (const guidance of listGuidance(input.flags)) {
    if (guidance.resourceIds?.includes(document.resourceId) || guidance.commands?.some((command) => command.includes(document.frontmatter.id))) {
      relatedGuidance.add(guidance.id);
    }
  }
  const relationCount = document.frontmatter.requiresRead.length + document.frontmatter.routes.length + relatedRules.size + relatedGuidance.size;
  const payload = {
    ref: `doc:${document.frontmatter.id}`,
    title: document.frontmatter.title,
    resourceId: document.resourceId,
    path: document.path,
    relatedRules: [...relatedRules].sort(),
    relatedGuidance: [...relatedGuidance].sort(),
    requiresRead: document.frontmatter.requiresRead,
    routes: document.frontmatter.routes,
    density: {
      relationCount,
      tooDense: relationCount > 12,
    },
  };
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, payload, { canonicalCommand: CANONICAL_COMMAND, operation: "graph" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return CLI_EXIT_OK;
}

function runList(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const filter = parseFilter(input.flags);
  const all = listStoredInstructions(store);
  const matches = all.filter((row) => rowMatchesFilter(row, filter));
  const payload = {
    total: matches.length,
    items: matches.map(publicInstructionView),
  };
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, payload, { canonicalCommand: CANONICAL_COMMAND, operation: "list" });
    return CLI_EXIT_OK;
  }
  if (matches.length === 0) {
    input.context.stdout.write("No instructions stored.\n");
    return CLI_EXIT_OK;
  }
  const lines = matches.map((row) =>
    `${row.id}\t[${row.state}/${row.severity}/${row.priority}]\t${describeInstructionTarget(row.target)}\ttrigger=${row.trigger}\tprov=${row.provenance}`,
  );
  input.context.stdout.write(`${lines.join("\n")}\n`);
  return CLI_EXIT_OK;
}

function runShow(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const id = input.positionals[2];
  if (!id) {
    throw new CliHandledError("missing_id", `Usage: ${input.binName} instructions show <id>`, CLI_EXIT_USAGE);
  }
  const instruction = findInstruction(store, id);
  if (!instruction) {
    throw new CliHandledError("not_found", `Instruction ${id} not found.`, CLI_EXIT_FAILURE);
  }
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, publicInstructionView(instruction), { canonicalCommand: CANONICAL_COMMAND, operation: "show" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${JSON.stringify(publicInstructionView(instruction), null, 2)}\n`);
  return CLI_EXIT_OK;
}

function runAdd(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const instruction = createInstruction(store, input.flags, { state: "active", provenance: "user" });
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, publicInstructionView(instruction), { canonicalCommand: CANONICAL_COMMAND, operation: "add" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${instruction.id}\n`);
  return CLI_EXIT_OK;
}

function runPropose(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const proposedFrom = parseFlagValue(input.flags, "from");
  if (!proposedFrom) {
    throw new CliHandledError("missing_from", `Usage: ${input.binName} instructions propose --from=<evidence-id> ...`, CLI_EXIT_USAGE);
  }
  const flagsWithProvenance = { ...input.flags, provenance: "agent" };
  const instruction = createInstruction(store, flagsWithProvenance, {
    state: "proposed",
    provenance: "agent",
    proposedFrom,
  });
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, publicInstructionView(instruction), { canonicalCommand: CANONICAL_COMMAND, operation: "propose" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${instruction.id} (proposed)\n`);
  return CLI_EXIT_OK;
}

function runEdit(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const id = input.positionals[2];
  if (!id) {
    throw new CliHandledError("missing_id", `Usage: ${input.binName} instructions edit <id> [--field=value ...]`, CLI_EXIT_USAGE);
  }
  const current = findInstruction(store, id);
  if (!current) {
    throw new CliHandledError("not_found", `Instruction ${id} not found.`, CLI_EXIT_FAILURE);
  }
  const next = applyEditFlags(current, input.flags);
  const payload = rowFromInstruction(next);
  const envelope = store.updateRecord(NAMESPACE, COLLECTION, id, payload as Record<string, unknown>);
  const updated = instructionFromRow(envelope as Record<string, unknown>, envelope.id);
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, publicInstructionView(updated), { canonicalCommand: CANONICAL_COMMAND, operation: "edit" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${updated.id} updated\n`);
  return CLI_EXIT_OK;
}

function runRm(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const id = input.positionals[2];
  if (!id) {
    throw new CliHandledError("missing_id", `Usage: ${input.binName} instructions rm <id>`, CLI_EXIT_USAGE);
  }
  const current = findInstruction(store, id);
  if (!current) {
    throw new CliHandledError("not_found", `Instruction ${id} not found.`, CLI_EXIT_FAILURE);
  }
  store.deleteRecord(NAMESPACE, COLLECTION, id);
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, { id, deleted: true }, { canonicalCommand: CANONICAL_COMMAND, operation: "rm" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${id} deleted\n`);
  return CLI_EXIT_OK;
}

function runApprove(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const id = input.positionals[2];
  if (!id) {
    throw new CliHandledError("missing_id", `Usage: ${input.binName} instructions approve <id>`, CLI_EXIT_USAGE);
  }
  const current = findInstruction(store, id);
  if (!current) {
    throw new CliHandledError("not_found", `Instruction ${id} not found.`, CLI_EXIT_FAILURE);
  }
  if (current.state !== "proposed") {
    throw new CliHandledError(
      "not_proposed",
      `Instruction ${id} is in state ${current.state}; only proposed instructions can be approved.`,
      CLI_EXIT_USAGE,
    );
  }
  const next: ClawInstruction = { ...current, state: "active" };
  const payload = rowFromInstruction(next);
  const envelope = store.updateRecord(NAMESPACE, COLLECTION, id, payload as Record<string, unknown>);
  const updated = instructionFromRow(envelope as Record<string, unknown>, envelope.id);
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, publicInstructionView(updated), { canonicalCommand: CANONICAL_COMMAND, operation: "approve" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${updated.id} approved\n`);
  return CLI_EXIT_OK;
}

export async function runInstructionsCli(input: InstructionsCliInput): Promise<number> {
  const sub = input.positionals[1];
  if (!sub || !SUBCOMMAND_SET.has(sub)) {
    input.context.stderr.write(`${usage(input.binName)}\n`);
    return CLI_EXIT_USAGE;
  }
  const action = sub as Subcommand;

  let store: DatabaseServiceStore | undefined;
  try {
    store = openMainDataStore();
    switch (action) {
      case "list":
        return runList(input, store);
      case "show":
        return runShow(input, store);
      case "search":
        return runUnifiedSearch(input, store);
      case "read":
        return runRead(input);
      case "docs":
        return runDocs(input);
      case "graph":
        return runGraph(input);
      case "add":
        return runAdd(input, store);
      case "edit":
        return runEdit(input, store);
      case "rm":
        return runRm(input, store);
      case "approve":
        return runApprove(input, store);
      case "propose":
        return runPropose(input, store);
      case "where":
        return runWhere(input, store);
      case "reconcile":
        return runReconcile(input, store);
    }
    return CLI_EXIT_USAGE;
  } catch (error) {
    if (input.wantsJson) {
      writeCommandJsonError(input.context.stdout, CANONICAL_COMMAND, error, { canonicalCommand: CANONICAL_COMMAND, operation: action });
      return error instanceof CliHandledError ? error.exitCode : CLI_EXIT_FAILURE;
    }
    if (error instanceof CliHandledError) {
      input.context.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }
    input.context.stderr.write(`${(error as Error).message}\n`);
    return CLI_EXIT_FAILURE;
  } finally {
    store?.close();
  }
}
