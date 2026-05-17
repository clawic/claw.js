#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  DEFAULT_SEARCH_BUDGETS,
  SearchStore,
  createFrameworkSearchSourceManifest,
  createRootSearchFederator,
} from "../packages/clawjs-search/src/index.ts";

type LabOptions = {
  items: number;
  queries: number;
  dbPath?: string;
  keep: boolean;
  json: boolean;
};

type Metric = {
  name: string;
  valueMs: number;
  budgetMs?: number;
  pass?: boolean;
};

const options = parseArgs(process.argv.slice(2));
const tempDir = options.dbPath ? undefined : fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-scale-lab-"));
const dbPath = options.dbPath ? path.resolve(options.dbPath) : path.join(tempDir ?? os.tmpdir(), "search.sqlite");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const metrics: Metric[] = [];
const store = new SearchStore(dbPath);
const interleavedQueryDurations: number[] = [];

try {
  store.registerSource(createFrameworkSearchSourceManifest({
    id: "lab.items",
    domain: "lab",
    name: "Search scale lab",
    resultTypes: ["lab-item", "fragment"],
  }));

  const startedIngest = performance.now();
  const interleavedEvery = Math.max(100, Math.floor(options.items / Math.max(1, options.queries)));
  const ingestBatchSize = 5000;
  let ingestBatch: Parameters<SearchStore["upsertDocuments"]>[0] = [];
  const hotQuery = "hotneedle42";
  const flushBatch = () => {
    if (ingestBatch.length === 0) return;
    store.upsertDocuments(ingestBatch);
    ingestBatch = [];
  };
  for (let i = 0; i < options.items; i += 1) {
    const bucket = i % 1000;
    const hot = bucket === 42;
    const token = hot ? hotQuery : `coldneedle${bucket}`;
    ingestBatch.push({
      id: `lab.items:${i}`,
      source: "lab.items",
      shard: hot ? "hot" : "cold",
      domain: "lab",
      type: "lab-item",
      resourceId: `item-${i}`,
      title: `Scale item ${i} ${token}`,
      subtitle: `bucket ${bucket}`,
      snippet: `Synthetic Search scale row ${bucket}`,
      body: `framework search scale lab exact ${token} hot shard cold shard item ${i}`,
      updatedAt: new Date(1_800_000_000_000 + i).toISOString(),
      rankingHints: { frecency: hot ? 1 : 0.1 },
      fragments: [
        {
          id: `lab.items:${i}:fragment`,
          title: `Fragment ${i}`,
          body: `fragment body ${token} backfill cursor watermark`,
        },
      ],
    });
    if (ingestBatch.length >= ingestBatchSize) flushBatch();
    if (i > 100 && i % interleavedEvery === 0) {
      flushBatch();
      const queryStarted = performance.now();
      const output = store.query({ query: hotQuery, domains: ["lab"], shards: ["hot"], limit: 10 });
      interleavedQueryDurations.push(performance.now() - queryStarted);
      if (output.results.length === 0) throw new Error("scale lab interleaved query returned no results");
    }
  }
  flushBatch();
  metrics.push({ name: "ingest_total", valueMs: performance.now() - startedIngest });
  if (interleavedQueryDurations.length > 0) {
    const interleavedP95 = percentile(interleavedQueryDurations, 0.95);
    metrics.push({
      name: "interleaved_backfill_query_p95",
      valueMs: interleavedP95,
      budgetMs: DEFAULT_SEARCH_BUDGETS.hotMs,
      pass: interleavedP95 <= DEFAULT_SEARCH_BUDGETS.hotMs,
    });
  }

  const queryDurations: number[] = [];
  for (let i = 0; i < options.queries; i += 1) {
    const queryStarted = performance.now();
    const output = store.query({ query: hotQuery, domains: ["lab"], shards: ["hot"], limit: 10 });
    queryDurations.push(performance.now() - queryStarted);
    if (output.results.length === 0) throw new Error("scale lab query returned no results");
  }

  const hotP95 = percentile(queryDurations, 0.95);
  metrics.push({
    name: "hot_query_p95",
    valueMs: hotP95,
    budgetMs: DEFAULT_SEARCH_BUDGETS.hotMs,
    pass: hotP95 <= DEFAULT_SEARCH_BUDGETS.hotMs,
  });

  const federator = createRootSearchFederator();
  federator.register({
    manifest: createFrameworkSearchSourceManifest({
      id: "lab.fast",
      domain: "lab",
      name: "Fast lab source",
      resultTypes: ["lab-item"],
    }),
    query: () => store.query({ query: hotQuery, domains: ["lab"], shards: ["hot"], limit: 10 }).results,
  });
  const globalStarted = performance.now();
  const globalOutput = await federator.query({ query: hotQuery, domains: ["lab"], shards: ["hot"], limit: 10 });
  const globalMs = performance.now() - globalStarted;
  if (globalOutput.results.length === 0) throw new Error("scale lab Root Search query returned no results");
  metrics.push({
    name: "root_first_batch",
    valueMs: globalMs,
    budgetMs: DEFAULT_SEARCH_BUDGETS.globalFirstBatchMs,
    pass: globalMs <= DEFAULT_SEARCH_BUDGETS.globalFirstBatchMs,
  });

  const report = {
    ok: metrics.every((metric) => metric.pass !== false),
    items: options.items,
    queries: options.queries,
    dbPath,
    budgets: DEFAULT_SEARCH_BUDGETS,
    metrics,
    scaleTargets: {
      oneMillion: "run with --items 1000000",
      tenMillion: "run with --items 10000000",
    },
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`Search scale lab items=${report.items} db=${report.dbPath}\n`);
    for (const metric of metrics) {
      const budget = metric.budgetMs === undefined ? "" : ` budget=${metric.budgetMs.toFixed(2)}ms pass=${String(metric.pass)}`;
      process.stdout.write(`${metric.name}=${metric.valueMs.toFixed(2)}ms${budget}\n`);
    }
  }

  if (!report.ok) process.exitCode = 1;
} finally {
  store.close();
  if (!options.keep && tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
}

function parseArgs(args: string[]): LabOptions {
  const options: LabOptions = { items: 10_000, queries: 20, keep: false, json: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--items") options.items = Number(readValue(args, ++i, arg));
    else if (arg === "--queries") options.queries = Number(readValue(args, ++i, arg));
    else if (arg === "--db") options.dbPath = readValue(args, ++i, arg);
    else if (arg === "--keep") options.keep = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help") {
      process.stdout.write("Usage: npm run search:scale-lab -- [--items 10000] [--queries 20] [--db path] [--keep] [--json]\n");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(options.items) || options.items <= 0) throw new Error("--items must be a positive integer");
  if (!Number.isInteger(options.queries) || options.queries <= 0) throw new Error("--queries must be a positive integer");
  return options;
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? 0;
}
