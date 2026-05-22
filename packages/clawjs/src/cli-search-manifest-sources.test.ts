import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK } from "./index.ts";
import { runCliCapture, withPatchedEnv } from "./index-test-utils.ts";

test("search manifest roots use persistent surface routes", () => {
  const source = fs.readFileSync(new URL("./cli-search-slides-sheets-sources.ts", import.meta.url), "utf8");
  assert.equal(resolveClawPersistentSurfacePath("claw.workspace.sheets", "/Users/demo/project", "workbooks"), "/Users/demo/project/.claw/sheets/workbooks");
  assert.match(source, /resolveClawPersistentSurfacePath\("claw\.workspace\.slides", workspaceRoot, "decks"\)/);
  assert.match(source, /resolveClawPersistentSurfacePath\("claw\.workspace\.sheets", workspaceRoot, "workbooks"\)/);
  assert.equal(source.includes('path.join(path.resolve(flags.workspace ?? cwd), ".claw", "sheets", "workbooks")'), false);
});

test("sheets workbook CLI writes use persistent surface routes", () => {
  const source = fs.readFileSync(new URL("./v1-data-secondary-commands.ts", import.meta.url), "utf8");
  assert.match(source, /resolveClawPersistentSurfacePath\("claw\.workspace\.sheets", workspaceRoot, "workbooks"\)/);
  assert.equal(source.includes('path.join(workspaceRoot, ".claw", "sheets", "workbooks")'), false);
});

test("design resource CLI Search events use persistent data routes", () => {
  const sources = [
    fs.readFileSync(new URL("./references/cli.ts", import.meta.url), "utf8"),
    fs.readFileSync(new URL("./styles/cli.ts", import.meta.url), "utf8"),
    fs.readFileSync(new URL("./templates/cli.ts", import.meta.url), "utf8"),
  ];
  assert.equal(resolveClawPersistentSurfacePath("claw.workspace.data", "/Users/demo/project"), "/Users/demo/project/.claw/data");
  for (const source of sources) {
    assert.match(source, /resolveClawPersistentSurfacePath\("claw\.workspace\.data", options\.workspaceRoot\)/);
    assert.equal(source.includes('path.join(options.workspaceRoot, ".claw", "data")'), false);
  }
});

test("slides CLI Search events use persistent data routes", () => {
  const source = fs.readFileSync(new URL("./slides.ts", import.meta.url), "utf8");
  assert.match(source, /resolveClawPersistentSurfacePath\("claw\.workspace\.data", workspaceRoot\)/);
  assert.equal(source.includes('path.join(workspaceRoot, ".claw", "data")'), false);
});

test("search rebuild indexes slides.decks from slide manifests", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-slides-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const decksDir = path.join(workspaceRoot, ".claw", "slides", "decks");
  fs.mkdirSync(decksDir, { recursive: true });
  fs.writeFileSync(path.join(decksDir, "deck-quarterly.json"), `${JSON.stringify({
    schemaVersion: 1,
    id: "deck-quarterly",
    title: "Quarterly Revenue Plan",
    theme: "executive",
    author: { agentId: "agent:slides", name: "Slides agent" },
    metadata: {
      team: "finance",
      workflow: "slides-metadata-fragment-needle",
      credentials: { token: "slides-metadata-secret-never-index" },
    },
    outputs: [{ format: "pptx", path: "outputs/deck-quarterly/deck.pptx" }],
    slides: [
      {
        id: "slide-title",
        layout: "title",
        heading: "Quarterly revenue plan",
        subtitle: "North star targets",
        notes: "Presenter note for forecast review.",
      },
      {
        id: "slide-metrics",
        layout: "metric-grid",
        heading: "Forecast metrics",
        metrics: [{ label: "Expansion", value: "18%", detail: "net revenue retention", credentials: { token: "slides-content-secret-never-index" } }],
        bullets: ["Pipeline coverage", "Renewal risk"],
      },
    ],
    createdAt: "2026-05-17T00:00:00.000Z",
    updatedAt: "2026-05-17T00:10:00.000Z",
  }, null, 2)}\n`, "utf8");

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const rebuild = await runCliCapture(["search", "rebuild", "--source", "slides.decks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; pendingSources: string[]; indexedBySource: { "slides.decks": number } };
    };
    assert.equal(rebuildPayload.data.sources.includes("slides.decks"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("slides.decks"), false);
    assert.equal(rebuildPayload.data.indexedBySource["slides.decks"], 1);

    const query = await runCliCapture(["search", "query", "forecast expansion revenue", "--domains", "slides", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        results: Array<{ source: string; domain: string; title: string; metadata?: { theme?: string; layout?: string[]; outputFormat?: string[] }; fragments?: Array<{ title?: string; snippet?: string }> }>;
      };
    };
    const result = queryPayload.data.results.find((item) => item.source === "slides.decks");
    assert.equal(result?.domain, "slides");
    assert.equal(result?.title, "Quarterly Revenue Plan");
    assert.equal(result?.metadata?.theme, "executive");
    assert.equal(result?.metadata?.layout?.includes("metric-grid"), true);
    assert.equal(result?.metadata?.outputFormat?.includes("pptx"), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("slides-metadata-fragment-needle")), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "Forecast metrics"), true);
    const metadataQuery = await runCliCapture(["search", "query", "slides-metadata-fragment-needle", "--sources", "slides.decks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataQuery.code, CLI_EXIT_OK, metadataQuery.stderr || metadataQuery.stdout);
    const metadataQueryPayload = JSON.parse(metadataQuery.stdout) as {
      data: { results: Array<{ source: string; title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const metadataResult = metadataQueryPayload.data.results.find((entry) => entry.source === "slides.decks" && entry.title === "Quarterly Revenue Plan");
    assert.equal(metadataResult?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("slides-metadata-fragment-needle")), true);
    const metadataSecretQuery = await runCliCapture(["search", "query", "slides-metadata-secret-never-index", "--sources", "slides.decks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataSecretQuery.code, CLI_EXIT_DEGRADED, metadataSecretQuery.stderr || metadataSecretQuery.stdout);
    const metadataSecretQueryPayload = JSON.parse(metadataSecretQuery.stdout) as { data: { results: Array<{ source: string; title: string }> } };
    assert.equal(metadataSecretQueryPayload.data.results.some((entry) => entry.source === "slides.decks" && entry.title === "Quarterly Revenue Plan"), false);
    const contentSecretQuery = await runCliCapture(["search", "query", "slides-content-secret-never-index", "--sources", "slides.decks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(contentSecretQuery.code, CLI_EXIT_DEGRADED, contentSecretQuery.stderr || contentSecretQuery.stdout);
    const contentSecretQueryPayload = JSON.parse(contentSecretQuery.stdout) as { data: { results: Array<{ source: string; title: string }> } };
    assert.equal(contentSecretQueryPayload.data.results.some((entry) => entry.source === "slides.decks" && entry.title === "Quarterly Revenue Plan"), false);
  });
});

test("slides.decks event jobs refresh changed slide manifests", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-slides-events-"));
  const dataRoot = path.join(workspaceRoot, "data");

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const created = await runCliCapture(["slides", "create", "Event Driven Deck", "--theme", "executive", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK);
    const createdPayload = JSON.parse(created.stdout) as { deck: { id: string }; path: string };
    assert.equal(fs.existsSync(createdPayload.path), true);

    const added = await runCliCapture([
      "slides",
      "add",
      createdPayload.deck.id,
      "--layout",
      "title-bullets",
      "--heading",
      "Event refresh pipeline",
      "--bullet",
      "Slide deck Search queue",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(added.code, CLI_EXIT_OK);

    const jobs = await runCliCapture(["search", "jobs", "list", "--source", "slides.decks", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId?: string; shard?: string; payload?: Record<string, unknown> }> };
    };
    assert.equal(jobsPayload.data.items.length, 1);
    assert.equal(jobsPayload.data.items[0]?.source, "slides.decks");
    assert.equal(jobsPayload.data.items[0]?.operation, "upsert");
    assert.equal(jobsPayload.data.items[0]?.resourceId, createdPayload.deck.id);
    assert.equal(jobsPayload.data.items[0]?.shard, "hot");
    assert.equal(jobsPayload.data.items[0]?.payload?.eventDriven, true);
    assert.equal(jobsPayload.data.items[0]?.payload?.deckId, createdPayload.deck.id);
    assert.equal(jobsPayload.data.items[0]?.payload?.workspaceRoot, path.resolve(workspaceRoot));

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "slides.decks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.source, "slides.decks");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.operation, "upsert");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);

    const query = await runCliCapture(["search", "query", "Slide deck Search queue", "--domains", "slides", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: { results: Array<{ source: string; domain: string; title: string; resourceId?: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const result = queryPayload.data.results.find((item) => item.source === "slides.decks");
    assert.equal(result?.domain, "slides");
    assert.equal(result?.title, "Event Driven Deck");
    assert.equal(result?.resourceId, createdPayload.deck.id);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "Event refresh pipeline"), true);

    const deleted = await runCliCapture(["slides", "delete", createdPayload.deck.id, "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    assert.equal(fs.existsSync(createdPayload.path), false);
    const deleteJobs = await runCliCapture(["search", "jobs", "list", "--source", "slides.decks", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId?: string; payload?: Record<string, unknown> }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.resourceId === createdPayload.deck.id && job.operation === "delete");
    assert.equal(deleteJob?.source, "slides.decks");
    assert.equal(deleteJob?.payload?.deckId, createdPayload.deck.id);
    const slideDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "slides.decks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(slideDeleteRun.code, CLI_EXIT_OK);
    const slideDeleteRunItem = (JSON.parse(slideDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "slides.decks");
    assert.deepEqual({ source: slideDeleteRunItem?.source, operation: slideDeleteRunItem?.operation, status: slideDeleteRunItem?.status, indexed: slideDeleteRunItem?.indexed }, { source: "slides.decks", operation: "delete", status: "done", indexed: 1 });
    const afterSlideDelete = await runCliCapture(["search", "query", "Slide deck Search queue", "--sources", "slides.decks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterSlideDelete.code, CLI_EXIT_DEGRADED, afterSlideDelete.stderr || afterSlideDelete.stdout);
    const afterSlideDeletePayload = JSON.parse(afterSlideDelete.stdout) as any;
    assert.equal(afterSlideDeletePayload.data.results.some((entry: any) => entry.source === "slides.decks" && entry.resourceId === createdPayload.deck.id), false);
  });
});

test("search rebuild indexes sheets.workbooks from workbook manifests", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-sheets-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const workbooksDir = path.join(workspaceRoot, ".claw", "sheets", "workbooks");
  fs.mkdirSync(workbooksDir, { recursive: true });
  fs.writeFileSync(path.join(workbooksDir, "workbook-forecast.json"), `${JSON.stringify({
    id: "workbook-forecast",
    title: "Revenue Forecast Workbook",
    author: { agentId: "agent:sheets", name: "Sheets agent" },
    metadata: {
      team: "finance",
      workflow: "sheets-metadata-fragment-needle",
      credentials: { token: "sheets-metadata-secret-never-index" },
    },
    outputs: [{ format: "xlsx", path: "outputs/workbook-forecast/forecast.xlsx" }],
    sheets: [
      {
        id: "sheet-summary",
        name: "Summary",
        columns: ["Region", "Revenue", "Formula"],
        rows: [
          ["EMEA", "1200", "=SUM(B2:B4)"],
          ["AMER", "1800", "=SUM(B5:B7)"],
        ],
        notes: "Expansion forecast table.",
      },
      {
        id: "sheet-risks",
        name: "Renewal Risks",
        cells: [
          { address: "A1", value: "Customer", formula: "" },
          { address: "B2", value: "Contoso", formula: "=IF(C2>0.5,\"watch\",\"ok\")", credentials: { token: "sheets-content-secret-never-index" } },
        ],
      },
    ],
    updatedAt: "2026-05-17T00:15:00.000Z",
  }, null, 2)}\n`, "utf8");

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const rebuild = await runCliCapture(["search", "rebuild", "--source", "sheets.workbooks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; pendingSources: string[]; indexedBySource: { "sheets.workbooks": number } };
    };
    assert.equal(rebuildPayload.data.sources.includes("sheets.workbooks"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("sheets.workbooks"), false);
    assert.equal(rebuildPayload.data.indexedBySource["sheets.workbooks"], 1);

    const query = await runCliCapture(["search", "query", "emea expansion formula revenue", "--domains", "sheets", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        results: Array<{ source: string; domain: string; title: string; metadata?: { sheetName?: string[]; outputFormat?: string[] }; fragments?: Array<{ title?: string; snippet?: string }> }>;
      };
    };
    const result = queryPayload.data.results.find((item) => item.source === "sheets.workbooks");
    assert.equal(result?.domain, "sheets");
    assert.equal(result?.title, "Revenue Forecast Workbook");
    assert.equal(result?.metadata?.sheetName?.includes("Summary"), true);
    assert.equal(result?.metadata?.outputFormat?.includes("xlsx"), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("sheets-metadata-fragment-needle")), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "Summary"), true);
    const metadataQuery = await runCliCapture(["search", "query", "sheets-metadata-fragment-needle", "--sources", "sheets.workbooks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataQuery.code, CLI_EXIT_OK, metadataQuery.stderr || metadataQuery.stdout);
    const metadataQueryPayload = JSON.parse(metadataQuery.stdout) as {
      data: { results: Array<{ source: string; title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const metadataResult = metadataQueryPayload.data.results.find((entry) => entry.source === "sheets.workbooks" && entry.title === "Revenue Forecast Workbook");
    assert.equal(metadataResult?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("sheets-metadata-fragment-needle")), true);
    const metadataSecretQuery = await runCliCapture(["search", "query", "sheets-metadata-secret-never-index", "--sources", "sheets.workbooks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataSecretQuery.code, CLI_EXIT_DEGRADED, metadataSecretQuery.stderr || metadataSecretQuery.stdout);
    const metadataSecretQueryPayload = JSON.parse(metadataSecretQuery.stdout) as { data: { results: Array<{ source: string; title: string }> } };
    assert.equal(metadataSecretQueryPayload.data.results.some((entry) => entry.source === "sheets.workbooks" && entry.title === "Revenue Forecast Workbook"), false);
    const contentSecretQuery = await runCliCapture(["search", "query", "sheets-content-secret-never-index", "--sources", "sheets.workbooks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(contentSecretQuery.code, CLI_EXIT_DEGRADED, contentSecretQuery.stderr || contentSecretQuery.stdout);
    const contentSecretQueryPayload = JSON.parse(contentSecretQuery.stdout) as { data: { results: Array<{ source: string; title: string }> } };
    assert.equal(contentSecretQueryPayload.data.results.some((entry) => entry.source === "sheets.workbooks" && entry.title === "Revenue Forecast Workbook"), false);
  });
});

test("search rebuild indexes design.resources from style template and reference manifests", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-design-"));
  const dataRoot = path.join(workspaceRoot, "data");

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const style = await runCliCapture([
      "style",
      "create",
      "Aurora Brand System",
      "--description",
      "Cerulean motion tokens for launch screens",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(style.code, CLI_EXIT_OK);

    const template = await runCliCapture([
      "template",
      "create",
      "Aurora Launch Card",
      "--category",
      "card",
      "--description",
      "Launch card template with headline and metric slots",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(template.code, CLI_EXIT_OK);

    const reference = await runCliCapture([
      "ref",
      "add",
      "--type",
      "web",
      "--source",
      "https://example.invalid/aurora-reference",
      "--name",
      "Aurora Reference",
      "--description",
      "Benchmark visual reference for launch composition",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(reference.code, CLI_EXIT_OK);

    const rebuild = await runCliCapture(["search", "rebuild", "--source", "design.resources", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; pendingSources: string[]; indexedBySource: { "design.resources": number } };
    };
    assert.equal(rebuildPayload.data.sources.includes("design.resources"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("design.resources"), false);
    assert.equal(rebuildPayload.data.indexedBySource["design.resources"], 3);

    const query = await runCliCapture(["search", "query", "aurora", "--domains", "design", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "10"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        results: Array<{ source: string; domain: string; type: string; title: string; resourceId?: string; metadata?: { kind?: string; builtin?: boolean } }>;
      };
    };
    const kinds = new Set(queryPayload.data.results.filter((item) => item.source === "design.resources").map((item) => item.metadata?.kind ?? item.type));
    assert.equal(kinds.has("style"), true);
    assert.equal(kinds.has("template"), true);
    assert.equal(kinds.has("reference"), true);
  });
});

test("design.resources event jobs refresh changed workspace design manifests", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-design-events-"));
  const dataRoot = path.join(workspaceRoot, "data");

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const created = await runCliCapture([
      "style",
      "create",
      "Event Token Style",
      "--description",
      "Hot refresh sentinel for design resource events",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK);
    const createdPayload = JSON.parse(created.stdout) as { style: { id: string } };

    const jobs = await runCliCapture(["search", "jobs", "list", "--source", "design.resources", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId?: string; shard?: string; payload?: Record<string, unknown> }> };
    };
    assert.equal(jobsPayload.data.items.length, 1);
    assert.equal(jobsPayload.data.items[0]?.source, "design.resources");
    assert.equal(jobsPayload.data.items[0]?.operation, "upsert");
    assert.equal(jobsPayload.data.items[0]?.resourceId, `style:${createdPayload.style.id}`);
    assert.equal(jobsPayload.data.items[0]?.shard, "hot");
    assert.equal(jobsPayload.data.items[0]?.payload?.eventDriven, true);
    assert.equal(jobsPayload.data.items[0]?.payload?.workspaceRoot, path.resolve(workspaceRoot));

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "design.resources", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.source, "design.resources");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.operation, "upsert");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);

    const query = await runCliCapture(["search", "query", "event", "--domains", "design", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: { results: Array<{ source: string; domain: string; title: string; resourceId?: string; metadata?: { kind?: string } }> };
    };
    const result = queryPayload.data.results.find((item) => item.source === "design.resources");
    assert.equal(result?.domain, "design");
    assert.equal(result?.title, "Event Token Style");
    assert.equal(result?.resourceId, `style:${createdPayload.style.id}`);
    assert.equal(result?.metadata?.kind, "style");
  });
});

test("sheets.workbooks event jobs refresh changed workbook manifests", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-sheets-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const workbooksDir = path.join(workspaceRoot, ".claw", "sheets", "workbooks");
  fs.mkdirSync(workbooksDir, { recursive: true });
  const workbookId = "workbook-event-refresh";
  fs.writeFileSync(path.join(workbooksDir, `${workbookId}.json`), `${JSON.stringify({
    id: workbookId,
    title: "Event Workbook",
    author: { agentId: "agent:sheets", name: "Sheets agent" },
    sheets: [
      {
        id: "sheet-pipeline",
        name: "Pipeline",
        columns: ["Account", "Weighted ARR", "Formula"],
        rows: [
          ["Globex", "4200", "=B2*0.8"],
          ["Initech", "3100", "=B3*0.6"],
        ],
        notes: "Event-driven workbook refresh sentinel.",
      },
    ],
    updatedAt: "2026-05-18T00:00:00.000Z",
  }, null, 2)}\n`, "utf8");

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const scheduled = await runCliCapture(["search", "changes", "schedule", "upsert", "--source", "sheets.workbooks", "--workbook-id", workbookId, "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(scheduled.code, CLI_EXIT_OK, scheduled.stderr || scheduled.stdout);
    const scheduledPayload = JSON.parse(scheduled.stdout) as {
      data: { item?: { source: string; operation: string; resourceId?: string; shard?: string; payload?: { eventDriven?: boolean; workbookId?: string; workspaceRoot?: string } } };
    };
    assert.equal(scheduledPayload.data.item?.source, "sheets.workbooks");
    assert.equal(scheduledPayload.data.item?.operation, "upsert");
    assert.equal(scheduledPayload.data.item?.resourceId, workbookId);
    assert.equal(scheduledPayload.data.item?.shard, "hot");
    assert.equal(scheduledPayload.data.item?.payload?.eventDriven, true);
    assert.equal(scheduledPayload.data.item?.payload?.workbookId, workbookId);
    assert.equal(scheduledPayload.data.item?.payload?.workspaceRoot, path.resolve(workspaceRoot));

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "sheets.workbooks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.source, "sheets.workbooks");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.operation, "upsert");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);

    const query = await runCliCapture(["search", "query", "weighted workbook sentinel", "--domains", "sheets", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: { results: Array<{ source: string; domain: string; title: string; resourceId?: string; fragments?: Array<{ title?: string }> }> };
    };
    const result = queryPayload.data.results.find((item) => item.source === "sheets.workbooks");
    assert.equal(result?.domain, "sheets");
    assert.equal(result?.title, "Event Workbook");
    assert.equal(result?.resourceId, workbookId);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "Pipeline"), true);

    fs.unlinkSync(path.join(workbooksDir, `${workbookId}.json`));
    const deleted = await runCliCapture(["search", "changes", "schedule", "delete", "--source", "sheets.workbooks", "--workbook-id", workbookId, "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK, deleted.stderr || deleted.stdout);
    const deletedPayload = JSON.parse(deleted.stdout) as {
      data: { item?: { source: string; operation: string; resourceId?: string; payload?: { eventDriven?: boolean; workbookId?: string; workspaceRoot?: string } } };
    };
    assert.equal(deletedPayload.data.item?.source, "sheets.workbooks");
    assert.equal(deletedPayload.data.item?.operation, "delete");
    assert.equal(deletedPayload.data.item?.resourceId, workbookId);
    assert.equal(deletedPayload.data.item?.payload?.eventDriven, true);
    assert.equal(deletedPayload.data.item?.payload?.workbookId, workbookId);
    assert.equal(deletedPayload.data.item?.payload?.workspaceRoot, path.resolve(workspaceRoot));
    const sheetDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "sheets.workbooks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(sheetDeleteRun.code, CLI_EXIT_OK);
    const sheetDeleteRunItem = (JSON.parse(sheetDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "sheets.workbooks");
    assert.deepEqual({ source: sheetDeleteRunItem?.source, operation: sheetDeleteRunItem?.operation, status: sheetDeleteRunItem?.status, indexed: sheetDeleteRunItem?.indexed }, { source: "sheets.workbooks", operation: "delete", status: "done", indexed: 1 });
    const afterSheetDelete = await runCliCapture(["search", "query", "weighted workbook sentinel", "--sources", "sheets.workbooks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterSheetDelete.code, CLI_EXIT_DEGRADED, afterSheetDelete.stderr || afterSheetDelete.stdout);
    const afterSheetDeletePayload = JSON.parse(afterSheetDelete.stdout) as any;
    assert.equal(afterSheetDeletePayload.data.results.some((entry: any) => entry.source === "sheets.workbooks" && entry.resourceId === workbookId), false);
  });
});

test("sheets workbook writes enqueue and tombstone workbook search events", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-sheets-writes-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const workbookId = "workbook-cli-refresh";

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const created = await runCliCapture([
      "sheets",
      "workbook",
      "upsert",
      workbookId,
      "--title",
      "CLI Event Workbook",
      "--sheet",
      "Pipeline",
      "--columns",
      "Account,Weighted ARR,Formula",
      "--rows-json",
      JSON.stringify([["Globex", "4200", "=B2*0.8"]]),
      "--notes",
      "CLI workbook Search queue sentinel",
      "--metadata",
      JSON.stringify({ workflow: "sheets-cli-metadata-fragment-needle", credentials: { token: "sheets-cli-metadata-secret-never-index" } }),
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK, created.stderr || created.stdout);

    const jobs = await runCliCapture(["search", "jobs", "list", "--source", "sheets.workbooks", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId?: string; shard?: string; payload?: Record<string, unknown> }> };
    };
    const upsertJob = jobsPayload.data.items.find((job) => job.resourceId === workbookId && job.operation === "upsert");
    assert.equal(upsertJob?.source, "sheets.workbooks");
    assert.equal(upsertJob?.shard, "hot");
    assert.equal(upsertJob?.payload?.eventDriven, true);
    assert.equal(upsertJob?.payload?.workbookId, workbookId);
    assert.equal(upsertJob?.payload?.workspaceRoot, path.resolve(workspaceRoot));

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "sheets.workbooks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.source, "sheets.workbooks");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.operation, "upsert");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);

    const query = await runCliCapture(["search", "query", "CLI workbook Search queue sentinel", "--sources", "sheets.workbooks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK, query.stderr || query.stdout);
    const queryPayload = JSON.parse(query.stdout) as {
      data: { results: Array<{ source: string; domain: string; title: string; resourceId?: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const result = queryPayload.data.results.find((item) => item.source === "sheets.workbooks");
    assert.equal(result?.domain, "sheets");
    assert.equal(result?.title, "CLI Event Workbook");
    assert.equal(result?.resourceId, workbookId);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "Pipeline"), true);

    const metadataQuery = await runCliCapture(["search", "query", "sheets-cli-metadata-fragment-needle", "--sources", "sheets.workbooks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataQuery.code, CLI_EXIT_OK, metadataQuery.stderr || metadataQuery.stdout);
    assert.equal(metadataQuery.stdout.includes("sheets-cli-metadata-secret-never-index"), false);

    const deleted = await runCliCapture(["sheets", "workbook", "delete", workbookId, "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK, deleted.stderr || deleted.stdout);
    const deleteJobs = await runCliCapture(["search", "jobs", "list", "--source", "sheets.workbooks", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; priority: number; resourceId?: string; payload?: Record<string, unknown> }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.resourceId === workbookId && job.operation === "delete");
    assert.equal(deleteJob?.priority, 80);
    assert.equal(deleteJob?.payload?.eventDriven, true);
    assert.equal(deleteJob?.payload?.workbookId, workbookId);

    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "sheets.workbooks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunItem = (JSON.parse(deleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "sheets.workbooks");
    assert.deepEqual({ source: deleteRunItem?.source, operation: deleteRunItem?.operation, status: deleteRunItem?.status, indexed: deleteRunItem?.indexed }, { source: "sheets.workbooks", operation: "delete", status: "done", indexed: 1 });
    const afterDelete = await runCliCapture(["search", "query", "CLI workbook Search queue sentinel", "--sources", "sheets.workbooks", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterDelete.code, CLI_EXIT_DEGRADED, afterDelete.stderr || afterDelete.stdout);
    const afterDeletePayload = JSON.parse(afterDelete.stdout) as any;
    assert.equal(afterDeletePayload.data.results.some((entry: any) => entry.source === "sheets.workbooks" && entry.resourceId === workbookId), false);
  });
});
