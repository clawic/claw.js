#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import Database from "better-sqlite3";

import {
  DEFAULT_SEARCH_BUDGETS,
  SearchStore,
  createFrameworkSearchSourceManifest,
  createRootSearchFederator,
} from "../packages/clawjs-search/src/index.ts";
import { SessionsServiceStore } from "../packages/clawjs-sessions/src/store.ts";
import { seedRealisticSessionsFixture } from "../packages/clawjs-sessions/src/realistic-fixtures.ts";
import { SkillsStore } from "../packages/clawjs-node/src/skills-v2/store.ts";
import { listRuntimeAdapters } from "../packages/clawjs-node/src/runtime/adapters/registry.ts";
import { listClawProfessionalRecordsAcceptanceFixtureRecords } from "../packages/clawjs-core/src/dense-data-fixtures.ts";

type Profile = "smoke" | "medium" | "heavy";
type WorkloadName = "search" | "sessions" | "skills" | "runtimes" | "dense" | "attachments";

type Metric = {
  name: string;
  valueMs: number;
  budgetMs?: number;
  pass?: boolean;
};

type WorkloadReport = {
  name: WorkloadName;
  ok: boolean;
  counts: Record<string, number>;
  metrics: Metric[];
  skipped?: boolean;
  reason?: string;
};

type DiskPreflight = {
  checked: boolean;
  path: string;
  availableBytes?: number;
  estimatedRequiredBytes?: number;
  fixedOverheadBytes?: number;
  pass?: boolean;
};

type CleanupReport = {
  keep: boolean;
  status: "removed" | "kept" | "failed" | "not_created";
  error?: string;
};

type ScaleLabReport = {
  ok: boolean;
  profile: Profile;
  workloads: WorkloadReport[];
  counts: ScaleCounts;
  tempRoot: string;
  estimatedDiskBytes: number;
  actualDiskBytes: number;
  durationMs: number;
  diskPreflight: DiskPreflight;
  cleanup: CleanupReport;
  lock: { path: string; acquired: boolean };
  skipped: string[];
  externalPending: string[];
  reason?: string;
};

type ScaleCounts = {
  searchItems: number;
  searchQueries: number;
  sessions: number;
  messagesPerSession: number;
  skills: number;
  runtimeMultiplier: number;
  denseMultiplier: number;
  attachments: number;
  blobBytes: number;
};

type Options = {
  profile: Profile;
  workloads: WorkloadName[];
  reportPath?: string;
  keep: boolean;
  json: boolean;
  diskCheck: boolean;
  lockPath: string;
  tempRoot?: string;
  counts: ScaleCounts;
};

const ALL_WORKLOADS: WorkloadName[] = ["search", "sessions", "skills", "runtimes", "dense", "attachments"];

const PROFILE_COUNTS: Record<Profile, ScaleCounts> = {
  smoke: {
    searchItems: 1_000,
    searchQueries: 5,
    sessions: 60,
    messagesPerSession: 8,
    skills: 60,
    runtimeMultiplier: 8,
    denseMultiplier: 2,
    attachments: 30,
    blobBytes: 1_024,
  },
  medium: {
    searchItems: 2_500,
    searchQueries: 15,
    sessions: 250,
    messagesPerSession: 16,
    skills: 100,
    runtimeMultiplier: 25,
    denseMultiplier: 6,
    attachments: 80,
    blobBytes: 4_096,
  },
  heavy: {
    searchItems: 100_000,
    searchQueries: 50,
    sessions: 2_000,
    messagesPerSession: 40,
    skills: 1_000,
    runtimeMultiplier: 200,
    denseMultiplier: 50,
    attachments: 500,
    blobBytes: 8_192,
  },
};

const PROFILE_MAX_DURATION_MS: Record<Profile, number> = {
  smoke: 30_000,
  medium: 180_000,
  heavy: 900_000,
};

const options = parseArgs(process.argv.slice(2));
const started = performance.now();
let lockFd: number | null = null;
let tempRoot = "";
let cleanup: CleanupReport = { keep: options.keep, status: "not_created" };
let report: ScaleLabReport | null = null;

try {
  if (options.profile === "heavy" && process.env.CLAW_SCALE_LAB_HEAVY !== "1") {
    tempRoot = options.tempRoot ? path.resolve(options.tempRoot) : "";
    report = buildEarlyReport("heavy_requires_opt_in", options, tempRoot, { checked: false, path: tempRoot || os.tmpdir() }, started, cleanup);
    process.exitCode = 2;
  } else {
    tempRoot = options.tempRoot ? path.resolve(options.tempRoot) : fs.mkdtempSync(path.join(os.tmpdir(), "claw-scale-lab-"));
    fs.mkdirSync(tempRoot, { recursive: true });
    const diskPreflight = buildDiskPreflight(tempRoot, options);
    if (diskPreflight.checked && diskPreflight.pass === false) {
      report = buildEarlyReport("insufficient_disk", options, tempRoot, diskPreflight, started, cleanup);
      report.actualDiskBytes = directorySize(tempRoot);
      process.exitCode = 1;
    } else {
      lockFd = acquireLock(options.lockPath);
      const workloads: WorkloadReport[] = [];
      const envRoot = path.join(tempRoot, "home");
      fs.mkdirSync(envRoot, { recursive: true });
      const previousEnv = captureEnv();
      process.env.CLAW_HOME = envRoot;
      process.env.CLAW_DATA_DIR = path.join(envRoot, "data");
      process.env.CLAW_DATABASE_DB_PATH = path.join(envRoot, "data", "core.sqlite");
      process.env.CLAW_DB_PATH = process.env.CLAW_DATABASE_DB_PATH;
      try {
        for (const workload of options.workloads) {
          assertDurationBudget(started, options.profile);
          workloads.push(await runWorkload(workload, tempRoot, options.counts));
        }
      } finally {
        restoreEnv(previousEnv);
      }
      report = {
        ok: workloads.every((workload) => workload.ok),
        profile: options.profile,
        workloads,
        counts: options.counts,
        tempRoot,
        estimatedDiskBytes: estimateRequiredBytes(options.counts),
        actualDiskBytes: directorySize(tempRoot),
        durationMs: performance.now() - started,
        diskPreflight,
        cleanup,
        lock: { path: options.lockPath, acquired: true },
        skipped: workloads.filter((workload) => workload.skipped).map((workload) => workload.name),
        externalPending: [
          "signed-host UI baseline",
          "physical-device validation",
          "live provider validation",
        ],
      };
      if (!report.ok) process.exitCode = 1;
    }
  }
} catch (error) {
  const reason = error instanceof Error && error.message === "lock_unavailable" ? "lock_unavailable" : "scale_lab_failed";
  report = buildEarlyReport(reason, options, tempRoot, { checked: false, path: tempRoot || os.tmpdir() }, started, cleanup, error);
  if (lockFd !== null) report.lock.acquired = true;
  process.exitCode = reason === "lock_unavailable" ? 2 : 1;
} finally {
  if (lockFd !== null) releaseLock(lockFd, options.lockPath);
  cleanup = cleanupTempRoot(tempRoot, options.keep);
  if (report) {
    report.cleanup = cleanup;
    report.actualDiskBytes = tempRoot && fs.existsSync(tempRoot) ? directorySize(tempRoot) : report.actualDiskBytes;
    writeReport(report, options);
  }
}

async function runWorkload(name: WorkloadName, root: string, counts: ScaleCounts): Promise<WorkloadReport> {
  if (name === "search") return runSearchWorkload(root, counts);
  if (name === "sessions") return runSessionsWorkload(root, counts);
  if (name === "skills") return runSkillsWorkload(root, counts);
  if (name === "runtimes") return runRuntimesWorkload(counts);
  if (name === "dense") return runDenseWorkload(root, counts);
  return runAttachmentsWorkload(root, counts);
}

async function runSearchWorkload(root: string, counts: ScaleCounts): Promise<WorkloadReport> {
  const store = new SearchStore(path.join(root, "search", "search.sqlite"));
  const metrics: Metric[] = [];
  const hotQuery = "hotneedle42";
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "scale.lab.search",
      domain: "scale",
      name: "Scale Lab Search",
      resultTypes: ["scale-item", "fragment"],
    }));
    const ingestStarted = performance.now();
    const batchSize = 1_000;
    let batch: Parameters<SearchStore["upsertDocuments"]>[0] = [];
    const flush = () => {
      if (batch.length === 0) return;
      store.upsertDocuments(batch);
      batch = [];
    };
    for (let i = 0; i < counts.searchItems; i += 1) {
      const hot = i % 10 === 0;
      const token = hot ? hotQuery : `coldneedle${i % 200}`;
      batch.push({
        id: `scale.search:${i}`,
        source: "scale.lab.search",
        shard: hot ? "hot" : "cold",
        domain: "scale",
        type: "scale-item",
        resourceId: `search-item-${i}`,
        title: `Scale search item ${i} ${token}`,
        snippet: `Synthetic search row ${i}`,
        body: `Synthetic scale lab document ${i} token ${token}`,
        updatedAt: new Date(1_800_000_000_000 + i).toISOString(),
        rankingHints: { frecency: hot ? 1 : 0.1 },
        fragments: [{ id: `scale.search:${i}:fragment`, body: `fragment ${token} ${i}` }],
      });
      if (batch.length >= batchSize) flush();
    }
    flush();
    metrics.push({ name: "ingest_total", valueMs: performance.now() - ingestStarted });

    const queryDurations: number[] = [];
    for (let i = 0; i < counts.searchQueries; i += 1) {
      const queryStarted = performance.now();
      const output = store.query({ query: hotQuery, domains: ["scale"], shards: ["hot"], limit: 10 });
      queryDurations.push(performance.now() - queryStarted);
      if (output.results.length === 0) throw new Error("search workload returned no results");
    }
    const p95 = percentile(queryDurations, 0.95);
    metrics.push({ name: "hot_query_p95", valueMs: p95, budgetMs: DEFAULT_SEARCH_BUDGETS.hotMs, pass: p95 <= DEFAULT_SEARCH_BUDGETS.hotMs });

    const federator = createRootSearchFederator();
    federator.register({
      manifest: createFrameworkSearchSourceManifest({ id: "scale.lab.fast", domain: "scale", name: "Scale Lab Fast", resultTypes: ["scale-item"] }),
      query: () => store.query({ query: hotQuery, domains: ["scale"], shards: ["hot"], limit: 10 }).results,
    });
    const firstBatchStarted = performance.now();
    const rootOutput = await federator.query({ query: hotQuery, domains: ["scale"], shards: ["hot"], limit: 10 });
    const firstBatchMs = performance.now() - firstBatchStarted;
    if (rootOutput.results.length === 0) throw new Error("root search workload returned no results");
    metrics.push({ name: "root_first_batch", valueMs: firstBatchMs, budgetMs: DEFAULT_SEARCH_BUDGETS.globalFirstBatchMs, pass: firstBatchMs <= DEFAULT_SEARCH_BUDGETS.globalFirstBatchMs });
    return okWorkload("search", { items: counts.searchItems, queries: counts.searchQueries }, metrics);
  } finally {
    store.close();
  }
}

function runSessionsWorkload(root: string, counts: ScaleCounts): WorkloadReport {
  const store = new SessionsServiceStore(path.join(root, "sessions", "sessions.sqlite"));
  const metrics: Metric[] = [];
  try {
    const ingestStarted = performance.now();
    const seeded = seedRealisticSessionsFixture(store, {
      profile: options.profile === "heavy" ? "heavy" : options.profile === "medium" ? "large" : "smoke",
      sessionCount: counts.sessions,
      projectCount: Math.max(4, Math.min(200, Math.ceil(counts.sessions / 25))),
      longSessionMessageCount: counts.messagesPerSession,
      workspaceRoot: path.join(root, "projects"),
      rebuildProjections: counts.sessions <= 250,
    });
    metrics.push({ name: "ingest_total", valueMs: performance.now() - ingestStarted });

    const sidebarStarted = performance.now();
    const sidebar = store.sidebarBootstrap({ recentLimit: 100 });
    const sidebarMs = performance.now() - sidebarStarted;
    metrics.push({ name: "sidebar_bootstrap", valueMs: sidebarMs, budgetMs: 100, pass: sidebarMs <= 100 });
    if (sidebar.totalActiveVisible === 0) throw new Error("sessions workload produced no sidebar sessions");

    const listStarted = performance.now();
    const listed = store.listSessions({ limit: 100, offset: Math.max(0, Math.floor(counts.sessions / 4)) });
    const listMs = performance.now() - listStarted;
    metrics.push({ name: "list_window", valueMs: listMs, budgetMs: 75, pass: listMs <= 75 });
    if (listed.items.length === 0) throw new Error("sessions workload list returned no items");

    const searchStarted = performance.now();
    const hits = store.searchMessages({ query: "Regression Packet", limit: 25 });
    const searchMs = performance.now() - searchStarted;
    metrics.push({ name: "fts_search", valueMs: searchMs, budgetMs: 150, pass: searchMs <= 150 });
    if (hits.length === 0) throw new Error("sessions workload search returned no hits");

    const eventSearchStarted = performance.now();
    const eventHits = store.searchSessionEvents({ query: "fixture query completed", eventKind: "tool_output", limit: 25 });
    const eventSearchMs = performance.now() - eventSearchStarted;
    metrics.push({ name: "event_fts_search", valueMs: eventSearchMs, budgetMs: 150, pass: eventSearchMs <= 150 });
    if (seeded.coverage.toolEvents > 0 && eventHits.length === 0) throw new Error("sessions workload event search returned no hits");

    if (seeded.staleProjectionSessionIds.length > 0) {
      const staleMeta = store.getProjectionMeta(seeded.staleProjectionSessionIds[0]!);
      if (staleMeta?.projectionStatus !== "stale") throw new Error("sessions workload did not preserve recoverable corruption projection state");
    }

    const exportStarted = performance.now();
    const trajectories = store.exportTrajectories({ limit: 25, messageLimit: 25 });
    const exportMs = performance.now() - exportStarted;
    metrics.push({ name: "bounded_export", valueMs: exportMs, budgetMs: 150, pass: exportMs <= 150 });
    if (trajectories.length === 0) throw new Error("sessions workload export returned no trajectories");

    return okWorkload("sessions", {
      sessions: seeded.sessionsSeeded,
      messages: seeded.messagesSeeded,
      events: seeded.eventsSeeded,
      longChats: seeded.coverage.longChats,
      markdownHeavyMessages: seeded.coverage.markdownHeavyMessages,
      attachments: seeded.coverage.conversationsWithAttachments,
      toolEvents: seeded.coverage.toolEvents,
      providerErrors: seeded.coverage.providerErrors,
      recoverableCorruptions: seeded.coverage.recoverableCorruptions,
    }, metrics);
  } finally {
    store.close();
  }
}

function runSkillsWorkload(root: string, counts: ScaleCounts): WorkloadReport {
  const store = new SkillsStore({ homeDir: path.join(root, "skills-home"), env: { CLAW_HOME: path.join(root, "skills-home") } });
  const metrics: Metric[] = [];
  const startedCreate = performance.now();
  const kinds = ["procedure", "snippet", "role", "personality"] as const;
  for (let i = 0; i < counts.skills; i += 1) {
    const kind = kinds[i % kinds.length];
    store.create({
      kind,
      slug: `scale-skill-${i}`,
      name: `scale-skill-${i}`,
      description: `Synthetic scale lab skill ${i}`,
      tags: ["scale-lab", i % 5 === 0 ? "hot" : "cold"],
      body: `# Scale Skill ${i}\n\nSynthetic skill body hotneedle-skill-${i % 13}.\n\n${"Use fixtures only.\n".repeat(8)}`,
    });
  }
  metrics.push({ name: "create_total", valueMs: performance.now() - startedCreate });

  const listStarted = performance.now();
  const listed = store.list();
  const listMs = performance.now() - listStarted;
  metrics.push({ name: "list_all", valueMs: listMs, budgetMs: 200, pass: listMs <= 200 });
  if (listed.length !== counts.skills) throw new Error(`skills workload expected ${counts.skills}, got ${listed.length}`);

  const searchStarted = performance.now();
  const hits = store.search("hot scale-lab", { tags: ["scale-lab"] });
  const searchMs = performance.now() - searchStarted;
  metrics.push({ name: "search", valueMs: searchMs, budgetMs: 200, pass: searchMs <= 200 });
  if (hits.length === 0) throw new Error("skills workload search returned no hits");

  return okWorkload("skills", { skills: counts.skills }, metrics);
}

function runRuntimesWorkload(counts: ScaleCounts): WorkloadReport {
  const metrics: Metric[] = [];
  const adapters = listRuntimeAdapters();
  const snapshots = [];
  const started = performance.now();
  for (let i = 0; i < counts.runtimeMultiplier; i += 1) {
    for (const adapter of adapters) {
      snapshots.push({
        id: `${adapter.id}:${i}`,
        adapterId: adapter.id,
        runtimeName: adapter.runtimeName,
        stability: adapter.stability,
        supportLevel: adapter.supportLevel,
        workspaceFiles: adapter.workspaceFiles.length,
        synthetic: true,
      });
    }
  }
  metrics.push({ name: "snapshot_materialize", valueMs: performance.now() - started, budgetMs: 75, pass: performance.now() - started <= 75 });

  const queryStarted = performance.now();
  const productionLike = snapshots.filter((snapshot) => snapshot.supportLevel === "production" || snapshot.stability === "stable");
  const queryMs = performance.now() - queryStarted;
  metrics.push({ name: "capability_filter", valueMs: queryMs, budgetMs: 25, pass: queryMs <= 25 });
  if (snapshots.length === 0) throw new Error("runtime workload produced no snapshots");

  return okWorkload("runtimes", { adapters: adapters.length, snapshots: snapshots.length, productionLike: productionLike.length }, metrics);
}

function runDenseWorkload(root: string, counts: ScaleCounts): WorkloadReport {
  const denseRoot = path.join(root, "dense");
  fs.mkdirSync(denseRoot, { recursive: true });
  const db = new Database(path.join(denseRoot, "dense.sqlite"));
  const fixtureRecords = listClawProfessionalRecordsAcceptanceFixtureRecords();
  const metrics: Metric[] = [];
  try {
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_records (
        collection_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(collection_name, record_id)
      );
      CREATE INDEX IF NOT EXISTS workspace_records_collection_updated_idx
        ON workspace_records(collection_name, updated_at DESC);
    `);
    const insert = db.prepare(`
      INSERT INTO workspace_records (collection_name, record_id, payload_json, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    const ingestStarted = performance.now();
    const tx = db.transaction(() => {
      for (let copy = 0; copy < counts.denseMultiplier; copy += 1) {
        for (const record of fixtureRecords) {
          insert.run(record.collectionName, `${record.id}_${copy}`, JSON.stringify({ ...record.data, syntheticCopy: copy }), 1_800_000_000_000 + copy);
        }
      }
    });
    tx();
    metrics.push({ name: "insert_total", valueMs: performance.now() - ingestStarted });

    const queryStarted = performance.now();
    const rows = db.prepare("SELECT record_id, payload_json FROM workspace_records WHERE collection_name = ? ORDER BY updated_at DESC LIMIT 50").all("quality_gaps") as Array<{ record_id: string; payload_json: string }>;
    const queryMs = performance.now() - queryStarted;
    metrics.push({ name: "collection_window", valueMs: queryMs, budgetMs: 75, pass: queryMs <= 75 });
    if (rows.length === 0) throw new Error("dense workload returned no quality gap rows");

    return okWorkload("dense", { baseRecords: fixtureRecords.length, records: fixtureRecords.length * counts.denseMultiplier }, metrics);
  } finally {
    db.close();
  }
}

function runAttachmentsWorkload(root: string, counts: ScaleCounts): WorkloadReport {
  const metrics: Metric[] = [];
  const attachmentRoot = path.join(root, "attachments", "blobs");
  fs.mkdirSync(attachmentRoot, { recursive: true });
  const metadata = [];
  const blob = Buffer.alloc(counts.blobBytes, "a");
  const writeStarted = performance.now();
  for (let i = 0; i < counts.attachments; i += 1) {
    const kind = i % 3 === 0 ? "image-metadata" : i % 3 === 1 ? "document-metadata" : "generic-metadata";
    const blobPath = path.join(attachmentRoot, `attachment-${i}.bin`);
    fs.writeFileSync(blobPath, blob);
    metadata.push({ id: `attachment-${i}`, kind, blobBytes: counts.blobBytes, path: blobPath, synthetic: true });
  }
  metrics.push({ name: "blob_write_total", valueMs: performance.now() - writeStarted });

  const readStarted = performance.now();
  const totalBytes = metadata.reduce((sum, item) => sum + fs.statSync(item.path).size, 0);
  const readMs = performance.now() - readStarted;
  metrics.push({ name: "metadata_scan", valueMs: readMs, budgetMs: 75, pass: readMs <= 75 });
  if (totalBytes !== counts.attachments * counts.blobBytes) throw new Error("attachment byte count mismatch");

  return okWorkload("attachments", { attachments: counts.attachments, totalBytes }, metrics);
}

function okWorkload(name: WorkloadName, counts: Record<string, number>, metrics: Metric[]): WorkloadReport {
  return { name, ok: metrics.every((metric) => metric.pass !== false), counts, metrics };
}

function parseArgs(args: string[]): Options {
  let profile: Profile = "smoke";
  let workloads = ALL_WORKLOADS;
  const counts: ScaleCounts = { ...PROFILE_COUNTS.smoke };
  const options: Omit<Options, "profile" | "workloads" | "counts"> = {
    keep: false,
    json: false,
    diskCheck: true,
    lockPath: path.join(os.tmpdir(), "claw-scale-lab.lock"),
  };
  const overrides: Partial<Record<keyof ScaleCounts, number>> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--profile") profile = parseProfile(readValue(args, ++i, arg));
    else if (arg === "--workload" || arg === "--workloads") workloads = parseWorkloads(readValue(args, ++i, arg));
    else if (arg === "--report") options.reportPath = readValue(args, ++i, arg);
    else if (arg === "--temp-root") options.tempRoot = readValue(args, ++i, arg);
    else if (arg === "--lock") options.lockPath = path.resolve(readValue(args, ++i, arg));
    else if (arg === "--keep") options.keep = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--no-disk-check") options.diskCheck = false;
    else if (arg === "--search-items") overrides.searchItems = parsePositiveInt(readValue(args, ++i, arg), arg);
    else if (arg === "--search-queries") overrides.searchQueries = parsePositiveInt(readValue(args, ++i, arg), arg);
    else if (arg === "--sessions") overrides.sessions = parsePositiveInt(readValue(args, ++i, arg), arg);
    else if (arg === "--messages-per-session") overrides.messagesPerSession = parsePositiveInt(readValue(args, ++i, arg), arg);
    else if (arg === "--skills") overrides.skills = parsePositiveInt(readValue(args, ++i, arg), arg);
    else if (arg === "--runtime-multiplier") overrides.runtimeMultiplier = parsePositiveInt(readValue(args, ++i, arg), arg);
    else if (arg === "--dense-multiplier") overrides.denseMultiplier = parsePositiveInt(readValue(args, ++i, arg), arg);
    else if (arg === "--attachments") overrides.attachments = parsePositiveInt(readValue(args, ++i, arg), arg);
    else if (arg === "--blob-bytes") overrides.blobBytes = parsePositiveInt(readValue(args, ++i, arg), arg);
    else if (arg === "--help") {
      process.stdout.write("Usage: npm run scale:lab -- [--profile smoke|medium|heavy] [--workload all|search,sessions,skills,runtimes,dense,attachments] [--json] [--report path] [--keep]\n");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return {
    ...options,
    profile,
    workloads,
    counts: { ...PROFILE_COUNTS[profile], ...overrides },
  };
}

function parseProfile(value: string): Profile {
  if (value === "smoke" || value === "medium" || value === "heavy") return value;
  throw new Error("--profile must be smoke, medium, or heavy");
}

function parseWorkloads(value: string): WorkloadName[] {
  if (value === "all") return ALL_WORKLOADS;
  const requested = value.split(",").map((item) => item.trim()).filter(Boolean);
  const invalid = requested.filter((item) => !ALL_WORKLOADS.includes(item as WorkloadName));
  if (invalid.length > 0) throw new Error(`Unknown workload: ${invalid.join(",")}`);
  return requested as WorkloadName[];
}

function buildDiskPreflight(directory: string, options: Options): DiskPreflight {
  if (!options.diskCheck) return { checked: false, path: directory };
  const fixedOverheadBytes = options.profile === "heavy" ? 2 * 1024 ** 3 : 512 * 1024 ** 2;
  const estimatedRequiredBytes = estimateRequiredBytes(options.counts, fixedOverheadBytes);
  const stat = fs.statfsSync(directory);
  const availableBytes = Number(stat.bavail) * Number(stat.bsize);
  return {
    checked: true,
    path: directory,
    availableBytes,
    estimatedRequiredBytes,
    fixedOverheadBytes,
    pass: availableBytes >= estimatedRequiredBytes,
  };
}

function estimateRequiredBytes(counts: ScaleCounts, fixedOverheadBytes = 512 * 1024 ** 2): number {
  return fixedOverheadBytes
    + counts.searchItems * 2_048
    + counts.sessions * counts.messagesPerSession * 1_536
    + counts.skills * 8_192
    + counts.runtimeMultiplier * 8_192
    + counts.denseMultiplier * 512_000
    + counts.attachments * counts.blobBytes * 2;
}

function acquireLock(lockPath: string): number {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    const fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    return fd;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("lock_unavailable");
    throw error;
  }
}

function releaseLock(fd: number, lockPath: string): void {
  try { fs.closeSync(fd); } catch { /* ignore */ }
  try { fs.rmSync(lockPath, { force: true }); } catch { /* ignore */ }
}

function cleanupTempRoot(root: string, keep: boolean): CleanupReport {
  if (!root) return { keep, status: "not_created" };
  if (keep) return { keep, status: "kept" };
  try {
    fs.rmSync(root, { recursive: true, force: true });
    return { keep, status: "removed" };
  } catch (error) {
    return { keep, status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

function buildEarlyReport(
  reason: string,
  options: Options,
  root: string,
  diskPreflight: DiskPreflight,
  started: number,
  cleanup: CleanupReport,
  error?: unknown,
): ScaleLabReport {
  return {
    ok: false,
    profile: options.profile,
    workloads: [],
    counts: options.counts,
    tempRoot: root,
    estimatedDiskBytes: estimateRequiredBytes(options.counts),
    actualDiskBytes: root && fs.existsSync(root) ? directorySize(root) : 0,
    durationMs: performance.now() - started,
    diskPreflight,
    cleanup,
    lock: { path: options.lockPath, acquired: false },
    skipped: options.workloads,
    externalPending: [],
    reason: error instanceof Error && error.message !== reason ? `${reason}: ${error.message}` : reason,
  };
}

function writeReport(report: ScaleLabReport, options: Options): void {
  if (options.reportPath) writeReportFile(report, options.reportPath);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Scale lab profile=${report.profile} ok=${String(report.ok)} duration=${report.durationMs.toFixed(2)}ms temp=${report.tempRoot}\n`);
  if (report.reason) process.stdout.write(`reason=${report.reason}\n`);
  for (const workload of report.workloads) {
    process.stdout.write(`${workload.name}: ok=${String(workload.ok)} counts=${JSON.stringify(workload.counts)}\n`);
    for (const metric of workload.metrics) {
      const budget = metric.budgetMs === undefined ? "" : ` budget=${metric.budgetMs.toFixed(2)}ms pass=${String(metric.pass)}`;
      process.stdout.write(`  ${metric.name}=${metric.valueMs.toFixed(2)}ms${budget}\n`);
    }
  }
}

function writeReportFile(report: ScaleLabReport, reportPath: string): void {
  fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function captureEnv(): Record<string, string | undefined> {
  return {
    CLAW_HOME: process.env.CLAW_HOME,
    CLAW_DATA_DIR: process.env.CLAW_DATA_DIR,
    CLAW_DATABASE_DB_PATH: process.env.CLAW_DATABASE_DB_PATH,
    CLAW_DB_PATH: process.env.CLAW_DB_PATH,
  };
}

function restoreEnv(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function assertDurationBudget(started: number, profile: Profile): void {
  const elapsed = performance.now() - started;
  if (elapsed > PROFILE_MAX_DURATION_MS[profile]) throw new Error(`duration_budget_exceeded:${Math.round(elapsed)}ms`);
}

function directorySize(root: string): number {
  if (!root || !fs.existsSync(root)) return 0;
  let total = 0;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) total += directorySize(fullPath);
    else if (entry.isFile()) total += fs.statSync(fullPath).size;
  }
  return total;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? 0;
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}
