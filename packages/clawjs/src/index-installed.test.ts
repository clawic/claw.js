import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "fs";
import os from "os";
import path from "path";

import { resolveClawPersistentSurfacePath } from "@clawjs/core";

import {
  assertCliPackageBinSurface,
  packWorkspacePackage,
  runCommand,
  runInstalledClaw,
  runInstalledClawProcess,
  useIsolatedClawDataRoot,
} from "./index-test-utils.ts";

function parseInstalledClawData<T>(binPath: string, cwd: string, args: string[]): T {
  const payload = JSON.parse(runInstalledClaw(binPath, cwd, args)) as unknown;
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function cliItems<T>(payload: T[] | { items?: T[] }): T[] {
  return Array.isArray(payload) ? payload : payload.items ?? [];
}

test("published CLI package does not depend on the retired Index package", () => {
  const cliPackageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "packages/clawjs/package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const indexLauncher = fs.readFileSync(path.resolve(process.cwd(), "packages/clawjs/bin/index-server-launcher.mjs"), "utf8");

  assert.equal(cliPackageJson.dependencies?.["@clawjs/index"], undefined);
  for (const heavyDependency of ["better-sqlite3", "@clawjs/claw", "@clawjs/database", "@clawjs/search", "@clawjs/runtime", "@clawjs/signals", "@clawjs/workspace", "@clawjs/local-data", "@clawjs/domain-pack-dense-data"]) {
    assert.equal(cliPackageJson.dependencies?.[heavyDependency], undefined, `${heavyDependency} must not be a base CLI dependency`);
  }
  assert.equal(indexLauncher.includes('import("@clawjs/index")'), false);
});

test("published CLI base install runs safe commands without native local data packs", { concurrency: false }, async (t) => {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-thin-packages-"));
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-thin-installed-"));
  const packageRoots = {
    core: path.resolve(process.cwd(), "packages/clawjs-core"),
    cli: path.resolve(process.cwd(), "packages/clawjs"),
  };

  let tarballs: string[];
  try {
    tarballs = [
      packWorkspacePackage(packageRoots.core, packDir),
      packWorkspacePackage(packageRoots.cli, packDir),
    ];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      assertCliPackageBinSurface(packageRoots.cli);
      t.diagnostic("External npm process is unavailable in this Node test environment; verified CLI package bin surface directly.");
      return;
    }
    throw error;
  }

  runCommand("npm", ["init", "-y"], { cwd: installRoot });
  runCommand("npm", ["install", "--prefer-offline", ...tarballs], { cwd: installRoot });

  const binPath = path.join(installRoot, "node_modules", "@clawjs", "cli", "bin", "claw.mjs");
  assert.equal(fs.existsSync(path.join(installRoot, "node_modules", "better-sqlite3")), false);
  for (const heavyPackage of ["claw", "database", "search", "runtime", "workspace", "signals", "local-data", "domain-pack-dense-data"]) {
    assert.equal(fs.existsSync(path.join(installRoot, "node_modules", "@clawjs", heavyPackage)), false, `${heavyPackage} must not install with base CLI`);
  }

  assert.match(runInstalledClaw(binPath, installRoot, ["--help"]), /Safe base commands/);
  const modules = parseInstalledClawData<{ modules: Array<{ id: string; optionalPack?: string }> }>(binPath, installRoot, ["modules", "list", "--available", "--json"]);
  assert.equal(modules.modules.some((module) => module.id === "local-data" && module.optionalPack === "@clawjs/local-data"), true);
  const setup = parseInstalledClawData<{ applied: boolean; mode: string }>(binPath, installRoot, ["setup", "--details", "--json"]);
  assert.equal(setup.applied, false);
  assert.equal(setup.mode, "minimal");
  const inspect = parseInstalledClawData<Array<{ value: string }>>(binPath, installRoot, ["inspect", "commands", "--json"]);
  assert.equal(inspect.some((entry) => entry.value === "modules"), true);

  const missingLocalData = spawnSync(process.execPath, [binPath, "tasks", "create", "Thin task", "--json"], {
    cwd: installRoot,
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(missingLocalData.status, 64);
  assert.equal(JSON.parse(missingLocalData.stdout).error.code, "optional_pack_missing");
});

test("published CLI tarballs install with npm and manage local-first productivity zero-config from the real binary", { concurrency: false, timeout: 90_000 }, async (t) => {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-packages-"));
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-installed-"));
  const dataRoot = useIsolatedClawDataRoot(t, installRoot);
  const packageRoots = {
    core: path.resolve(process.cwd(), "packages/clawjs-core"),
    claw: path.resolve(process.cwd(), "packages/clawjs-node"),
    workspace: path.resolve(process.cwd(), "packages/clawjs-workspace"),
    database: path.resolve(process.cwd(), "packages/clawjs-database"),
    localData: path.resolve(process.cwd(), "packages/clawjs-local-data"),
    search: path.resolve(process.cwd(), "packages/clawjs-search"),
    signalsCore: path.resolve(process.cwd(), "packages/signals-core"),
    signals: path.resolve(process.cwd(), "packages/signals"),
    marketplace: path.resolve(process.cwd(), "packages/marketplace"),
    profile: path.resolve(process.cwd(), "packages/clawjs-profile"),
    audio: path.resolve(process.cwd(), "packages/clawjs-audio"),
    index: path.resolve(process.cwd(), "packages/clawjs-index"),
    sessions: path.resolve(process.cwd(), "packages/clawjs-sessions"),
    cli: path.resolve(process.cwd(), "packages/clawjs"),
    professionalRecordsPack: path.resolve(process.cwd(), "packages/clawjs-domain-pack-dense-data"), // @clawjs/domain-pack-dense-data
  };
  assert.equal(JSON.parse(fs.readFileSync(path.join(packageRoots.professionalRecordsPack, "package.json"), "utf8")).name, "@clawjs/domain-pack-dense-data");

  let tarballs: string[];
  let professionalRecordsPackTarball = "";
  let searchTarball = "";
  let signalsCoreTarball = "";
  let signalsTarball = "";
  try {
    searchTarball = packWorkspacePackage(packageRoots.search, packDir);
    signalsCoreTarball = packWorkspacePackage(packageRoots.signalsCore, packDir);
    signalsTarball = packWorkspacePackage(packageRoots.signals, packDir);
    tarballs = [
      packWorkspacePackage(packageRoots.core, packDir),
      packWorkspacePackage(packageRoots.claw, packDir),
      packWorkspacePackage(packageRoots.workspace, packDir),
      packWorkspacePackage(packageRoots.database, packDir),
      packWorkspacePackage(packageRoots.localData, packDir),
      searchTarball,
      signalsCoreTarball,
      signalsTarball,
      packWorkspacePackage(packageRoots.marketplace, packDir),
      packWorkspacePackage(packageRoots.profile, packDir),
      packWorkspacePackage(packageRoots.audio, packDir),
      packWorkspacePackage(packageRoots.index, packDir),
      packWorkspacePackage(packageRoots.sessions, packDir),
      packWorkspacePackage(packageRoots.cli, packDir),
    ];
    professionalRecordsPackTarball = packWorkspacePackage(packageRoots.professionalRecordsPack, packDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      assertCliPackageBinSurface(packageRoots.cli);
      t.diagnostic("External npm process is unavailable in this Node test environment; verified CLI package bin surface directly.");
      return;
    }
    throw error;
  }

  runCommand("npm", ["init", "-y"], { cwd: installRoot });
  runCommand("npm", ["install", "--prefer-offline", ...tarballs], { cwd: installRoot });

  const binPath = path.join(installRoot, "node_modules", "@clawjs", "cli", "bin", "claw.mjs");
  assert.equal(fs.existsSync(binPath), true);

  const installedCliDist = fs.readdirSync(path.join(installRoot, "node_modules", "@clawjs", "cli", "dist"));
  assert.equal(installedCliDist.some((fileName) => fileName.startsWith("cli-dense-data-command")), false);

  const inactiveDenseCommand = spawnSync(process.execPath, [binPath, "patient", "list", "--json"], {
    cwd: installRoot,
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(inactiveDenseCommand.status, 64);
  assert.equal(JSON.parse(inactiveDenseCommand.stdout).error.code, "module_not_enabled");

  parseInstalledClawData(binPath, installRoot, [
    "modules",
    "enable",
    "health",
    "--json",
  ]);
  const missingDensePack = spawnSync(process.execPath, [binPath, "patient", "list", "--json"], {
    cwd: installRoot,
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(missingDensePack.status, 64);
  assert.equal(JSON.parse(missingDensePack.stdout).error.code, "optional_pack_missing");

  runCommand("npm", ["install", "--prefer-offline", professionalRecordsPackTarball, searchTarball, signalsCoreTarball, signalsTarball], { cwd: installRoot });
  const densePackCommand = spawnSync(process.execPath, [binPath, "patient", "list", "--json"], {
    cwd: installRoot,
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(densePackCommand.status, 0, densePackCommand.stderr || densePackCommand.stdout);
  const densePackPayload = JSON.parse(densePackCommand.stdout) as { ok: boolean; data: unknown[] };
  assert.equal(densePackPayload.ok, true);
  assert.equal(Array.isArray(densePackPayload.data), true);

  const magicDbTask = runInstalledClawProcess(binPath, installRoot, [
    "db",
    "task",
    "Magic fallback",
  ]);
  assert.match(magicDbTask.stderr, /Using local database for this project/);
  assert.match(magicDbTask.stdout, /Created task \S+ "Magic fallback"/);

  const magicDbLead = parseInstalledClawData<{ title: string; metadata?: { website?: string } }>(binPath, installRoot, [
    "db",
    "leads",
    "--set",
    "name=Ada",
    "--set",
    "website=https://ada.dev",
    "--set",
    "companyId=company_ada",
    "--json",
  ]);
  assert.equal(magicDbLead.title, "Ada");
  assert.equal(magicDbLead.metadata?.website, "https://ada.dev");

  const magicAliasTask = parseInstalledClawData(binPath, installRoot, [
    "tasks",
    "create",
    "Alias task",
    "--json",
  ]) as { id: string; title: string };
  assert.equal(magicAliasTask.title, "Alias task");

  const listedTasks = parseInstalledClawData(binPath, installRoot, [
    "db",
    "tasks",
    "list",
    "--json",
  ]) as Array<{ id: string; title?: string }>;
  assert.equal(listedTasks.some((item) => item.title === "Alias task"), true);
  assert.equal(listedTasks.some((item) => item.title === "Magic fallback"), true);

  const magicSchema = parseInstalledClawData(binPath, installRoot, [
    "db",
    "leads",
    "schema",
    "--json",
  ]) as { exists: boolean; collection: { name: string } };
  assert.equal(magicSchema.exists, true);
  assert.equal(magicSchema.collection.name, "leads");

  assert.equal(fs.existsSync(path.join(dataRoot, "core.sqlite")), true);
  assert.equal(fs.existsSync(resolveClawPersistentSurfacePath("claw.workspace.data", installRoot, "database.sqlite")), false);
  assert.equal(fs.existsSync(resolveClawPersistentSurfacePath("claw.workspace", installRoot, "workspace.manifest.json")), false);

  const area = parseInstalledClawData(binPath, installRoot, [
    "areas",
    "create",
    "Personal Ops",
    "--status",
    "active",
    "--json",
  ]) as { id: string; status: string; name: string };
  assert.equal(area.status, "active");
  assert.equal(area.name, "Personal Ops");

  const project = parseInstalledClawData(binPath, installRoot, [
    "projects",
    "create",
    "Ship CLI",
    "--area-id",
    area.id,
    "--status",
    "in_progress",
    "--status-category",
    "active",
    "--review-at",
    "2026-04-20T09:00:00.000Z",
    "--json",
  ]) as { id: string; areaId?: string; name: string; statusCategory?: string; reviewAt?: string };
  assert.equal(project.areaId, area.id);
  assert.equal(project.statusCategory, "active");
  assert.equal(project.reviewAt, "2026-04-20T09:00:00.000Z");

  const todayList = parseInstalledClawData(binPath, installRoot, [
    "lists",
    "create",
    "Today",
    "--kind",
    "today",
    "--rank",
    "1",
    "--json",
  ]) as { id: string; kind: string; title: string };
  assert.equal(todayList.kind, "today");

  const upcomingList = parseInstalledClawData(binPath, installRoot, [
    "lists",
    "create",
    "Upcoming",
    "--kind",
    "upcoming",
    "--json",
  ]) as { id: string; kind: string };
  assert.equal(upcomingList.kind, "upcoming");

  const section = parseInstalledClawData(binPath, installRoot, [
    "sections",
    "create",
    "Next",
    "--list-id",
    todayList.id,
    "--project-id",
    project.id,
    "--rank",
    "10",
    "--json",
  ]) as { id: string; listId?: string; projectId?: string; rank?: number };
  assert.equal(section.listId, todayList.id);
  assert.equal(section.projectId, project.id);
  assert.equal(section.rank, 10);

  const savedView = parseInstalledClawData(binPath, installRoot, [
    "saved-views",
    "create",
    "Due today",
    "--domain",
    "tasks",
    "--query",
    "today",
    "--favorite",
    "true",
    "--json",
  ]) as { id: string; domain: string; favorite?: boolean };
  assert.equal(savedView.domain, "tasks");
  assert.equal(savedView.favorite, true);

  const goal = parseInstalledClawData(binPath, installRoot, [
    "goals",
    "create",
    "CLI daily workflow",
    "--area-id",
    area.id,
    "--project-id",
    project.id,
    "--review-cadence",
    "weekly",
    "--json",
  ]) as { id: string; areaId?: string; projectId?: string };
  assert.equal(goal.areaId, area.id);
  assert.equal(goal.projectId, project.id);

  const milestone = parseInstalledClawData(binPath, installRoot, [
    "milestones",
    "create",
    "Beta ready",
    "--area-id",
    area.id,
    "--project-id",
    project.id,
    "--goal-id",
    goal.id,
    "--status",
    "active",
    "--target-date",
    "2026-04-18T17:00:00.000Z",
    "--json",
  ]) as { id: string; projectId?: string };
  assert.equal(milestone.projectId, project.id);

  const task = parseInstalledClawData(binPath, installRoot, [
    "tasks",
    "create",
    "Ship CLI",
    "--area-id",
    area.id,
    "--list-id",
    todayList.id,
    "--section-id",
    section.id,
    "--project-id",
    project.id,
    "--goal-id",
    goal.id,
    "--type",
    "task",
    "--rank",
    "100",
    "--start-at",
    "2026-04-17T09:00:00.000Z",
    "--due-at",
    "2026-04-17T12:00:00.000Z",
    "--deadline-at",
    "2026-04-18T18:00:00.000Z",
    "--recurrence-rule",
    "FREQ=WEEKLY;BYDAY=FR",
    "--estimate-minutes",
    "30",
    "--story-points",
    "3",
    "--checklist-json",
    '[{"text":"pack tarballs"},{"text":"publish npm"}]',
    "--json",
  ]) as { id: string; areaId?: string; listId?: string; sectionId?: string; projectId?: string; goalId?: string; estimateMinutes?: number; storyPoints?: number; checklist?: Array<{ text: string }>; recurrenceRule?: string };
  assert.equal(task.areaId, area.id);
  assert.equal(task.listId, todayList.id);
  assert.equal(task.sectionId, section.id);
  assert.equal(task.projectId, project.id);
  assert.equal(task.goalId, goal.id);
  assert.equal(task.estimateMinutes, 30);
  assert.equal(task.storyPoints, 3);
  assert.equal(task.recurrenceRule, "FREQ=WEEKLY;BYDAY=FR");
  assert.equal(task.checklist?.length, 2);

  const recurrence = parseInstalledClawData(binPath, installRoot, [
    "recurrences",
    "create",
    "Weekly CLI review",
    "--rule",
    "FREQ=WEEKLY;BYDAY=FR",
    "--anchor-type",
    "task",
    "--anchor-id",
    task.id,
    "--next-run-at",
    "2026-04-24T09:00:00.000Z",
    "--json",
  ]) as { id: string; anchorId?: string; rule: string };
  assert.equal(recurrence.anchorId, task.id);

  const cycle = parseInstalledClawData(binPath, installRoot, [
    "cycles",
    "create",
    "Sprint 17",
    "--status",
    "active",
    "--project-id",
    project.id,
    "--starts-at",
    "2026-04-15T00:00:00.000Z",
    "--ends-at",
    "2026-04-29T00:00:00.000Z",
    "--capacity-points",
    "20",
    "--json",
  ]) as { id: string; status: string; projectId?: string; capacityPoints?: number };
  assert.equal(cycle.status, "active");
  assert.equal(cycle.projectId, project.id);

  const epic = parseInstalledClawData(binPath, installRoot, [
    "epics",
    "create",
    "CLI productivity core",
    "--kind",
    "initiative",
    "--project-id",
    project.id,
    "--goal-id",
    goal.id,
    "--json",
  ]) as { id: string; kind: string; projectId?: string };
  assert.equal(epic.kind, "initiative");

  const typedTask = parseInstalledClawData(binPath, installRoot, [
    "tasks",
    "update",
    task.id,
    "--cycle-id",
    cycle.id,
    "--epic-id",
    epic.id,
    "--json",
  ]) as { id: string; cycleId?: string; epicId?: string };
  assert.equal(typedTask.cycleId, cycle.id);
  assert.equal(typedTask.epicId, epic.id);

  const comment = parseInstalledClawData(binPath, installRoot, [
    "comments",
    "create",
    "Ready for review",
    "--entity-type",
    "task",
    "--entity-id",
    task.id,
    "--visibility",
    "internal",
    "--json",
  ]) as { id: string; entityId?: string; body?: string };
  assert.equal(comment.entityId, task.id);

  const attachment = parseInstalledClawData(binPath, installRoot, [
    "attachments",
    "create",
    "CLI screenshot",
    "--entity-type",
    "task",
    "--entity-id",
    task.id,
    "--mime-type",
    "image/png",
    "--uri",
    "file://cli.png",
    "--json",
  ]) as { id: string; entityId?: string; mimeType?: string };
  assert.equal(attachment.entityId, task.id);
  assert.equal(attachment.mimeType, "image/png");

  const annotatedTask = parseInstalledClawData(binPath, installRoot, [
    "tasks",
    "update",
    task.id,
    "--comment-ids",
    comment.id,
    "--attachment-ids",
    attachment.id,
    "--json",
  ]) as { id: string; commentIds?: string[]; attachmentIds?: string[] };
  assert.deepEqual(annotatedTask.commentIds, [comment.id]);
  assert.deepEqual(annotatedTask.attachmentIds, [attachment.id]);

  const customField = parseInstalledClawData(binPath, installRoot, [
    "custom-fields",
    "create",
    "Impact",
    "--entity-type",
    "task",
    "--field-type",
    "select",
    "--data",
    '{"options":["low","high"]}',
    "--json",
  ]) as { id: string; name: string; fieldType: string; options?: string[] };
  assert.equal(customField.fieldType, "select");

  const fieldValue = parseInstalledClawData(binPath, installRoot, [
    "field-values",
    "create",
    customField.id,
    "--entity-type",
    "task",
    "--entity-id",
    task.id,
    "--data",
    '{"value":"high"}',
    "--json",
  ]) as { id: string; fieldId: string; entityId: string; value?: string };
  assert.equal(fieldValue.fieldId, customField.id);
  assert.equal(fieldValue.entityId, task.id);
  assert.equal(fieldValue.value, "high");

  const reminder = parseInstalledClawData(binPath, installRoot, [
    "reminders",
    "create",
    "Follow up publish",
    "--trigger-at",
    "2026-04-15T09:00:00.000Z",
    "--anchor-type",
    "task",
    "--anchor-id",
    task.id,
    "--json",
  ]) as { id: string; anchorId?: string };
  assert.equal(reminder.anchorId, task.id);

  const deadline = parseInstalledClawData(binPath, installRoot, [
    "deadlines",
    "create",
    "Release cutoff",
    "--due-at",
    "2026-04-18T18:00:00.000Z",
    "--anchor-type",
    "project",
    "--anchor-id",
    project.id,
    "--json",
  ]) as { id: string; anchorId?: string };
  assert.equal(deadline.anchorId, project.id);

  const event = parseInstalledClawData(binPath, installRoot, [
    "events",
    "create",
    "Release review",
    "--starts-at",
    "2026-04-16T10:00:00.000Z",
    "--json",
  ]) as { id: string };
  assert.ok(event.id);

  const taskList = parseInstalledClawData(binPath, installRoot, [
    "tasks",
    "list",
    "--section-id",
    section.id,
    "--json",
  ]) as Array<{ id: string }>;
  assert.equal(taskList.some((item) => item.id === task.id), true);

  const workspaceSearchPayload = parseInstalledClawData(binPath, installRoot, [
    "search",
    "query",
    "CLI",
    "--domains",
    "tasks,attachments",
    "--json",
  ]) as { global?: Array<{ domain: string; sourceId: string; id?: string }> } | Array<{ domain: string; id: string }>;
  const workspaceSearch = Array.isArray(workspaceSearchPayload)
    ? workspaceSearchPayload.map((item) => ({ domain: item.domain, sourceId: item.id }))
    : workspaceSearchPayload.global ?? [];
  assert.equal(workspaceSearch.some((item) => item.domain === "tasks" && item.sourceId === task.id), true);

  const timeline = parseInstalledClawData(binPath, installRoot, [
    "timeline",
    "week",
    "--start",
    "2026-04-15T00:00:00.000Z",
    "--project-id",
    project.id,
    "--json",
  ]) as {
    projects: Array<{ projectId?: string; tasks: unknown[]; milestones: unknown[]; deadlines: unknown[]; cycles: unknown[] }>;
    tasks: Array<{ id: string; dependencyState: { ready: boolean } }>;
    milestones: Array<{ id: string }>;
    deadlines: Array<{ id: string }>;
    cycles: Array<{ id: string }>;
    now: { readyTasks: Array<{ id: string }> };
  };
  assert.equal(timeline.projects.some((item) => item.projectId === project.id), true);
  assert.equal(timeline.tasks.some((item) => item.id === task.id && item.dependencyState.ready), true);
  assert.equal(timeline.milestones.some((item) => item.id === milestone.id), true);
  assert.equal(timeline.deadlines.some((item) => item.id === deadline.id), true);
  assert.equal(timeline.cycles.some((item) => item.id === cycle.id), true);
  assert.equal(timeline.now.readyTasks.some((item) => item.id === task.id), true);

  const completedTask = parseInstalledClawData(binPath, installRoot, [
    "tasks",
    "complete",
    task.id,
    "--json",
  ]) as { id: string; status: string };
  assert.equal(completedTask.status, "done");

  const milestoneList = parseInstalledClawData(binPath, installRoot, [
    "milestones",
    "list",
    "--json",
  ]) as Array<{ id: string }>;
  assert.equal(milestoneList.some((item) => item.id === milestone.id), true);

  const eventList = parseInstalledClawData(binPath, installRoot, [
    "events",
    "list",
    "--json",
  ]) as Array<{ id: string }>;
  assert.equal(eventList.some((item) => item.id === event.id), true);

  const agenda = parseInstalledClawData(binPath, installRoot, [
    "agenda",
    "--start",
    "2026-04-15T00:00:00.000Z",
    "--end",
    "2026-04-19T00:00:00.000Z",
    "--include-completed",
    "--json",
  ]) as { items: Array<{ domain: string; id: string }> };
  assert.equal(agenda.items.some((item) => item.domain === "tasks" && item.id === task.id), true);
  assert.equal(agenda.items.some((item) => item.domain === "deadlines" && item.id === deadline.id), true);

  const exported = parseInstalledClawData(binPath, installRoot, [
    "work",
    "export",
    "snapshot.json",
    "--confirm",
    "--approval-id",
    "approval_installed_export",
    "--legal-label",
    "Installed package export - human reviewed",
    "--json",
  ]) as { path: string };
  assert.equal(fs.existsSync(exported.path), true);
  const snapshot = JSON.parse(fs.readFileSync(exported.path, "utf8")) as { collections?: Record<string, unknown[]> };
  assert.equal(Array.isArray(snapshot.collections?.lists), true);
  assert.equal(Array.isArray(snapshot.collections?.sections), true);
  assert.equal(Array.isArray(snapshot.collections?.comments), true);
  assert.equal(Array.isArray(snapshot.collections?.attachments), true);
  assert.equal(Array.isArray(snapshot.collections?.saved_views), true);
  assert.equal(Array.isArray(snapshot.collections?.recurrences), true);
  assert.equal(Array.isArray(snapshot.collections?.cycles), true);
  assert.equal(Array.isArray(snapshot.collections?.epics), true);
  assert.equal(Array.isArray(snapshot.collections?.custom_fields), true);
  assert.equal(Array.isArray(snapshot.collections?.field_values), true);
  assert.equal(Array.isArray(snapshot.collections?.templates), true);

  const backup = parseInstalledClawData(binPath, installRoot, [
    "work",
    "backup",
    "backups",
    "--confirm",
    "--approval-id",
    "approval_installed_backup",
    "--legal-label",
    "Installed package backup - human reviewed",
    "--json",
  ]) as { files: string[] };
  assert.equal(backup.files.some((filePath) => filePath.endsWith("core.sqlite")), true);

  const importRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-installed-import-"));
  const imported = parseInstalledClawData(binPath, importRoot, [
    "work",
    "import",
    exported.path,
    "--replace",
    "--json",
  ]) as { importedCollections?: Record<string, number> };
  assert.equal(imported.importedCollections?.sections, 1);
  assert.equal(imported.importedCollections?.cycles, 1);

  const importedSections = parseInstalledClawData(binPath, importRoot, [
    "sections",
    "list",
    "--json",
  ]) as Array<{ title?: string }>;
  assert.equal(importedSections.some((item) => item.title === "Next"), true);

  const dbTask = runInstalledClawProcess(binPath, installRoot, [
    "db",
    "task",
    "Magic fallback",
  ]);
  assert.match(dbTask.stderr, /Using local database for this project/);
  assert.match(dbTask.stdout, /Created task \S+ "Magic fallback"/);

  assert.equal(fs.existsSync(path.join(dataRoot, "core.sqlite")), true);
  assert.equal(fs.existsSync(resolveClawPersistentSurfacePath("claw.workspace.data", installRoot, "database.sqlite")), false);
  assert.equal(fs.existsSync(resolveClawPersistentSurfacePath("claw.workspace", installRoot, "workspace.manifest.json")), false);
});
