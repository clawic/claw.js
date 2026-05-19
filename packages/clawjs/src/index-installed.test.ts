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

test("published CLI package does not depend on the retired Index package", () => {
  const cliPackageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "packages/clawjs/package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const indexLauncher = fs.readFileSync(path.resolve(process.cwd(), "packages/clawjs/bin/index-server-launcher.mjs"), "utf8");

  assert.equal(cliPackageJson.dependencies?.["@clawjs/index"], undefined);
  assert.equal(cliPackageJson.dependencies?.["@clawjs/search"], "0.1.2");
  assert.equal(indexLauncher.includes('import("@clawjs/index")'), false);
});

test("published CLI tarballs install with npm and manage local-first productivity zero-config from the real binary", { concurrency: false }, async (t) => {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-packages-"));
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-installed-"));
  const dataRoot = useIsolatedClawDataRoot(t, installRoot);
  const packageRoots = {
    core: path.resolve(process.cwd(), "packages/clawjs-core"),
    claw: path.resolve(process.cwd(), "packages/clawjs-node"),
    workspace: path.resolve(process.cwd(), "packages/clawjs-workspace"),
    database: path.resolve(process.cwd(), "packages/claw-database"),
    marketplace: path.resolve(process.cwd(), "packages/marketplace"),
    profile: path.resolve(process.cwd(), "packages/clawjs-profile"),
    audio: path.resolve(process.cwd(), "packages/clawjs-audio"),
    index: path.resolve(process.cwd(), "packages/clawjs-index"),
    sessions: path.resolve(process.cwd(), "packages/clawjs-sessions"),
    cli: path.resolve(process.cwd(), "packages/clawjs"),
    denseDataPack: path.resolve(process.cwd(), "packages/clawjs-domain-pack-dense-data"), // @clawjs/domain-pack-dense-data
  };
  assert.equal(JSON.parse(fs.readFileSync(path.join(packageRoots.denseDataPack, "package.json"), "utf8")).name, "@clawjs/domain-pack-dense-data");

  let tarballs: string[];
  let denseDataPackTarball = "";
  try {
    tarballs = [
      packWorkspacePackage(packageRoots.core, packDir),
      packWorkspacePackage(packageRoots.claw, packDir),
      packWorkspacePackage(packageRoots.workspace, packDir),
      packWorkspacePackage(packageRoots.database, packDir),
      packWorkspacePackage(packageRoots.marketplace, packDir),
      packWorkspacePackage(packageRoots.profile, packDir),
      packWorkspacePackage(packageRoots.audio, packDir),
      packWorkspacePackage(packageRoots.index, packDir),
      packWorkspacePackage(packageRoots.sessions, packDir),
      packWorkspacePackage(packageRoots.cli, packDir),
    ];
    denseDataPackTarball = packWorkspacePackage(packageRoots.denseDataPack, packDir);
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

  JSON.parse(runInstalledClaw(binPath, installRoot, [
    "modules",
    "enable",
    "health",
    "--json",
  ]));
  const missingDensePack = spawnSync(process.execPath, [binPath, "patient", "list", "--json"], {
    cwd: installRoot,
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(missingDensePack.status, 64);
  assert.equal(JSON.parse(missingDensePack.stdout).error.code, "optional_pack_missing");

  runCommand("npm", ["install", "--prefer-offline", denseDataPackTarball], { cwd: installRoot });
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

  const magicDbLead = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "db",
    "leads",
    "--set",
    "name=Ada",
    "--set",
    "website=https://ada.dev",
    "--set",
    "companyId=company_ada",
    "--json",
  ])) as { title: string; metadata?: { website?: string } };
  assert.equal(magicDbLead.title, "Ada");
  assert.equal(magicDbLead.metadata?.website, "https://ada.dev");

  const magicAliasTask = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "tasks",
    "create",
    "Alias task",
    "--json",
  ])) as { id: string; title: string };
  assert.equal(magicAliasTask.title, "Alias task");

  const listedTasks = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "db",
    "tasks",
    "list",
    "--json",
  ])) as Array<{ id: string; title?: string }>;
  assert.equal(listedTasks.some((item) => item.title === "Alias task"), true);
  assert.equal(listedTasks.some((item) => item.title === "Magic fallback"), true);

  const magicSchema = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "db",
    "leads",
    "schema",
    "--json",
  ])) as { exists: boolean; collection: { name: string } };
  assert.equal(magicSchema.exists, true);
  assert.equal(magicSchema.collection.name, "leads");

  assert.equal(fs.existsSync(path.join(dataRoot, "core.sqlite")), true);
  assert.equal(fs.existsSync(resolveClawPersistentSurfacePath("claw.workspace.data", installRoot, "database.sqlite")), false);
  assert.equal(fs.existsSync(resolveClawPersistentSurfacePath("claw.workspace", installRoot, "workspace.manifest.json")), false);

  const area = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "areas",
    "create",
    "Personal Ops",
    "--status",
    "active",
    "--json",
  ])) as { id: string; status: string; name: string };
  assert.equal(area.status, "active");
  assert.equal(area.name, "Personal Ops");

  const project = JSON.parse(runInstalledClaw(binPath, installRoot, [
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
  ])) as { id: string; areaId?: string; name: string; statusCategory?: string; reviewAt?: string };
  assert.equal(project.areaId, area.id);
  assert.equal(project.statusCategory, "active");
  assert.equal(project.reviewAt, "2026-04-20T09:00:00.000Z");

  const todayList = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "lists",
    "create",
    "Today",
    "--kind",
    "today",
    "--rank",
    "1",
    "--json",
  ])) as { id: string; kind: string; title: string };
  assert.equal(todayList.kind, "today");

  const upcomingList = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "lists",
    "create",
    "Upcoming",
    "--kind",
    "upcoming",
    "--json",
  ])) as { id: string; kind: string };
  assert.equal(upcomingList.kind, "upcoming");

  const section = JSON.parse(runInstalledClaw(binPath, installRoot, [
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
  ])) as { id: string; listId?: string; projectId?: string; rank?: number };
  assert.equal(section.listId, todayList.id);
  assert.equal(section.projectId, project.id);
  assert.equal(section.rank, 10);

  const savedView = JSON.parse(runInstalledClaw(binPath, installRoot, [
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
  ])) as { id: string; domain: string; favorite?: boolean };
  assert.equal(savedView.domain, "tasks");
  assert.equal(savedView.favorite, true);

  const goal = JSON.parse(runInstalledClaw(binPath, installRoot, [
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
  ])) as { id: string; areaId?: string; projectId?: string };
  assert.equal(goal.areaId, area.id);
  assert.equal(goal.projectId, project.id);

  const milestone = JSON.parse(runInstalledClaw(binPath, installRoot, [
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
  ])) as { id: string; projectId?: string };
  assert.equal(milestone.projectId, project.id);

  const task = JSON.parse(runInstalledClaw(binPath, installRoot, [
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
  ])) as { id: string; areaId?: string; listId?: string; sectionId?: string; projectId?: string; goalId?: string; estimateMinutes?: number; storyPoints?: number; checklist?: Array<{ text: string }>; recurrenceRule?: string };
  assert.equal(task.areaId, area.id);
  assert.equal(task.listId, todayList.id);
  assert.equal(task.sectionId, section.id);
  assert.equal(task.projectId, project.id);
  assert.equal(task.goalId, goal.id);
  assert.equal(task.estimateMinutes, 30);
  assert.equal(task.storyPoints, 3);
  assert.equal(task.recurrenceRule, "FREQ=WEEKLY;BYDAY=FR");
  assert.equal(task.checklist?.length, 2);

  const recurrence = JSON.parse(runInstalledClaw(binPath, installRoot, [
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
  ])) as { id: string; anchorId?: string; rule: string };
  assert.equal(recurrence.anchorId, task.id);

  const cycle = JSON.parse(runInstalledClaw(binPath, installRoot, [
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
  ])) as { id: string; status: string; projectId?: string; capacityPoints?: number };
  assert.equal(cycle.status, "active");
  assert.equal(cycle.projectId, project.id);

  const epic = JSON.parse(runInstalledClaw(binPath, installRoot, [
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
  ])) as { id: string; kind: string; projectId?: string };
  assert.equal(epic.kind, "initiative");

  const typedTask = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "tasks",
    "update",
    task.id,
    "--cycle-id",
    cycle.id,
    "--epic-id",
    epic.id,
    "--json",
  ])) as { id: string; cycleId?: string; epicId?: string };
  assert.equal(typedTask.cycleId, cycle.id);
  assert.equal(typedTask.epicId, epic.id);

  const comment = JSON.parse(runInstalledClaw(binPath, installRoot, [
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
  ])) as { id: string; entityId?: string; body?: string };
  assert.equal(comment.entityId, task.id);

  const attachment = JSON.parse(runInstalledClaw(binPath, installRoot, [
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
  ])) as { id: string; entityId?: string; mimeType?: string };
  assert.equal(attachment.entityId, task.id);
  assert.equal(attachment.mimeType, "image/png");

  const annotatedTask = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "tasks",
    "update",
    task.id,
    "--comment-ids",
    comment.id,
    "--attachment-ids",
    attachment.id,
    "--json",
  ])) as { id: string; commentIds?: string[]; attachmentIds?: string[] };
  assert.deepEqual(annotatedTask.commentIds, [comment.id]);
  assert.deepEqual(annotatedTask.attachmentIds, [attachment.id]);

  const customField = JSON.parse(runInstalledClaw(binPath, installRoot, [
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
  ])) as { id: string; name: string; fieldType: string; options?: string[] };
  assert.equal(customField.fieldType, "select");

  const fieldValue = JSON.parse(runInstalledClaw(binPath, installRoot, [
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
  ])) as { id: string; fieldId: string; entityId: string; value?: string };
  assert.equal(fieldValue.fieldId, customField.id);
  assert.equal(fieldValue.entityId, task.id);
  assert.equal(fieldValue.value, "high");

  const reminder = JSON.parse(runInstalledClaw(binPath, installRoot, [
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
  ])) as { id: string; anchorId?: string };
  assert.equal(reminder.anchorId, task.id);

  const deadline = JSON.parse(runInstalledClaw(binPath, installRoot, [
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
  ])) as { id: string; anchorId?: string };
  assert.equal(deadline.anchorId, project.id);

  const event = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "events",
    "create",
    "Release review",
    "--starts-at",
    "2026-04-16T10:00:00.000Z",
    "--json",
  ])) as { id: string };
  assert.ok(event.id);

  const taskList = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "tasks",
    "list",
    "--section-id",
    section.id,
    "--json",
  ])) as Array<{ id: string }>;
  assert.equal(taskList.some((item) => item.id === task.id), true);

  const workspaceSearchPayload = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "search",
    "query",
    "CLI",
    "--domains",
    "tasks,attachments",
    "--json",
  ])) as { global?: Array<{ domain: string; sourceId: string; id?: string }> } | Array<{ domain: string; id: string }>;
  const workspaceSearch = Array.isArray(workspaceSearchPayload)
    ? workspaceSearchPayload.map((item) => ({ domain: item.domain, sourceId: item.id }))
    : workspaceSearchPayload.global ?? [];
  assert.equal(workspaceSearch.some((item) => item.domain === "tasks" && item.sourceId === task.id), true);

  const commentSearchPayload = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "search",
    "query",
    "review",
    "--domains",
    "comments",
    "--json",
  ])) as { global?: Array<{ domain: string; sourceId: string; id?: string }> } | Array<{ domain: string; id: string }>;
  const commentSearch = Array.isArray(commentSearchPayload)
    ? commentSearchPayload.map((item) => ({ domain: item.domain, sourceId: item.id }))
    : commentSearchPayload.global ?? [];
  assert.equal(commentSearch.some((item) => item.domain === "comments" && item.sourceId === comment.id), true);

  const timeline = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "timeline",
    "week",
    "--start",
    "2026-04-15T00:00:00.000Z",
    "--project-id",
    project.id,
    "--json",
  ])) as {
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

  const completedTask = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "tasks",
    "complete",
    task.id,
    "--json",
  ])) as { id: string; status: string };
  assert.equal(completedTask.status, "done");

  const milestoneList = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "milestones",
    "list",
    "--json",
  ])) as Array<{ id: string }>;
  assert.equal(milestoneList.some((item) => item.id === milestone.id), true);

  const eventList = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "events",
    "list",
    "--json",
  ])) as Array<{ id: string }>;
  assert.equal(eventList.some((item) => item.id === event.id), true);

  const agenda = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "agenda",
    "--start",
    "2026-04-15T00:00:00.000Z",
    "--end",
    "2026-04-19T00:00:00.000Z",
    "--include-completed",
    "--json",
  ])) as { items: Array<{ domain: string; id: string }> };
  assert.equal(agenda.items.some((item) => item.domain === "tasks" && item.id === task.id), true);
  assert.equal(agenda.items.some((item) => item.domain === "deadlines" && item.id === deadline.id), true);

  const exported = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "work",
    "export",
    "snapshot.json",
    "--json",
  ])) as { path: string };
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

  const backup = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "work",
    "backup",
    "backups",
    "--json",
  ])) as { files: string[] };
  assert.equal(backup.files.some((filePath) => filePath.endsWith("core.sqlite")), true);

  const importRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-installed-import-"));
  const imported = JSON.parse(runInstalledClaw(binPath, importRoot, [
    "work",
    "import",
    exported.path,
    "--replace",
    "--json",
  ])) as { importedCollections?: Record<string, number> };
  assert.equal(imported.importedCollections?.sections, 1);
  assert.equal(imported.importedCollections?.cycles, 1);

  const importedSections = JSON.parse(runInstalledClaw(binPath, importRoot, [
    "sections",
    "list",
    "--json",
  ])) as Array<{ title?: string }>;
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
