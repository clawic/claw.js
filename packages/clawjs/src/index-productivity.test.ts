import { test } from "vitest";
import assert from "node:assert/strict";
import { registeredDatabasePath, registeredSearchDatabasePath } from "../../../tests/helpers/stable-surface-test-builders.ts";
import fs from "fs";
import os from "os";
import path from "path";

import { clawSharedJsonFields, resolveClawPersistentSurfacePath } from "@clawjs/core";

import { CLI_EXIT_OK, runCli } from "./index.ts";
import { captureStream, useIsolatedClawDataRoot } from "./index-test-utils.ts";

function parseCliJsonPayload<T>(text: string): T {
  const payload = JSON.parse(text) as T | { data: T };
  return typeof payload === "object" && payload !== null && "data" in payload ? payload.data : payload;
}

test.sequential("runCli add workspace and workspace command groups operate on local productivity data", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-workspace-"));
  useIsolatedClawDataRoot(t, tempRoot);

  assert.equal(await runCli(["new", "workspace", "demo-workspace", "--no-install"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);

  const projectRoot = path.join(tempRoot, "demo-workspace");
  const installCalls: string[] = [];

  const addStdout = captureStream();
  assert.equal(await runCli(["add", "workspace", "--project", projectRoot, "--json"], {
    stdout: addStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
    runCommand: async (command, args) => {
      installCalls.push(`${command} ${args.join(" ")}`);
    },
  }), CLI_EXIT_OK);
  assert.match(addStdout.getOutput(), /"integration": "workspace"/);
  assert.match(installCalls.join("\n"), /@clawjs\/workspace/);

  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  assert.ok(packageJson.dependencies?.["@clawjs/workspace"]);

  const createStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "create",
    "Ship workspace",
    "--workspace",
    projectRoot,
    "--runtime",
    "demo",
    "--json",
  ], {
    stdout: createStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  const createdTask = parseCliJsonPayload<{ id: string }>(createStdout.getOutput());

  const listStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "list",
    "--workspace",
    projectRoot,
    "--runtime",
    "demo",
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), new RegExp(createdTask.id));

  const getStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "get",
    createdTask.id,
    "--workspace",
    projectRoot,
    "--runtime",
    "demo",
    "--json",
  ], {
    stdout: getStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.equal(parseCliJsonPayload<{ title: string }>(getStdout.getOutput()).title, "Ship workspace");
});

test.sequential("runCli zero-config productivity commands bootstrap local sqlite in an empty directory", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-productivity-zero-config-"));
  const dataRoot = useIsolatedClawDataRoot(t, workspaceRoot);

  const magicTaskStdout = captureStream();
  const magicTaskStderr = captureStream();
  assert.equal(await runCli([
    "db",
    "task",
    "Ship CLI",
  ], {
    stdout: magicTaskStdout.stream,
    stderr: magicTaskStderr.stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(magicTaskStdout.getOutput(), /Created task (\S+) "Ship CLI"/);
  assert.match(magicTaskStderr.getOutput(), /Using local database for this project/);
  const taskId = magicTaskStdout.getOutput().match(/Created task (\S+) "Ship CLI"/)?.[1] ?? "";
  assert.ok(taskId);

  const magicLeadStdout = captureStream();
  assert.equal(await runCli([
    "db",
    "leads",
    "--set", "name=Ada",
    "--set", "website=https://ada.dev",
    "--set", "companyId=company_ada",
    "--json",
  ], {
    stdout: magicLeadStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const lead = parseCliJsonPayload<{ title: string; metadata?: { website?: string } }>(magicLeadStdout.getOutput());
  assert.equal(lead.title, "Ada");
  assert.equal(lead.metadata?.website, "https://ada.dev");

  const magicAliasStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "create",
    "Alias task",
    "--json",
  ], {
    stdout: magicAliasStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const aliasTask = parseCliJsonPayload<{ id: string; title: string }>(magicAliasStdout.getOutput());
  assert.equal(aliasTask.title, "Alias task");

  const magicTasksListStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "list",
    "--json",
  ], {
    stdout: magicTasksListStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const tasksList = parseCliJsonPayload<Array<{ id: string }>>(magicTasksListStdout.getOutput());
  assert.equal(tasksList.some((item) => item.id === taskId), true);
  assert.equal(tasksList.some((item) => item.id === aliasTask.id), true);

  const magicSchemaStdout = captureStream();
  assert.equal(await runCli([
    "db",
    "leads",
    "schema",
    "--json",
  ], {
    stdout: magicSchemaStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const schema = parseCliJsonPayload<{ exists: boolean; collection: { name: string; fields: Array<{ name: string }> } }>(magicSchemaStdout.getOutput());
  assert.equal(schema.exists, true);
  assert.equal(schema.collection.name, "leads");
  assert.equal(schema.collection.fields.some((field) => field.name === "title"), true);

  assert.equal(fs.existsSync(registeredDatabasePath(dataRoot, "claw.database.core")), true);
  assert.equal(fs.existsSync(resolveClawPersistentSurfacePath("claw.workspace.data", workspaceRoot, "database.sqlite")), false);
  assert.equal(fs.existsSync(resolveClawPersistentSurfacePath("claw.workspace", workspaceRoot, "workspace.manifest.json")), false);

  const areaStdout = captureStream();
  assert.equal(await runCli([
    "areas",
    "create",
    "Platform",
    "--status", "active",
    "--json",
  ], {
    stdout: areaStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const area = parseCliJsonPayload<{ id: string; status?: string }>(areaStdout.getOutput());
  assert.equal(area.status, "active");

  const personStdout = captureStream();
  const personStderr = captureStream();
  const personExitCode = await runCli([
    "people",
    "upsert",
    "Alice Example",
    "--email", "alice@example.com",
    "--json",
  ], {
    stdout: personStdout.stream,
    stderr: personStderr.stream,
    cwd: workspaceRoot,
  });
  assert.equal(personExitCode, CLI_EXIT_OK, `${personStdout.getOutput()}\n${personStderr.getOutput()}`);
  const person = parseCliJsonPayload<{ id: string }>(personStdout.getOutput());

  const projectStdout = captureStream();
  assert.equal(await runCli([
    "projects",
    "create",
    "Workspace Core",
    "--status", "in_progress",
    "--area-id", area.id,
    "--owner-person-id", person.id,
    "--json",
  ], {
    stdout: projectStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const project = parseCliJsonPayload<{ id: string; ownerPersonId?: string; areaId?: string }>(projectStdout.getOutput());
  assert.equal(project.ownerPersonId, person.id);
  assert.equal(project.areaId, area.id);

  const goalStdout = captureStream();
  assert.equal(await runCli([
    "goals",
    "create",
    "Ship zero-config productivity",
    "--status", "active",
    "--area-id", area.id,
    "--project-id", project.id,
    "--owner-person-id", person.id,
    "--metric-key", "cli_crud",
    "--review-cadence", "weekly",
    "--target-value", "1",
    "--json",
  ], {
    stdout: goalStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const goal = parseCliJsonPayload<{ id: string; projectId?: string; areaId?: string; reviewCadence?: string }>(goalStdout.getOutput());
  assert.equal(goal.projectId, project.id);
  assert.equal(goal.areaId, area.id);
  assert.equal(goal.reviewCadence, "weekly");

  const milestoneStdout = captureStream();
  assert.equal(await runCli([
    "milestones",
    "create",
    "CLI launch",
    "--status", "active",
    "--area-id", area.id,
    "--project-id", project.id,
    "--goal-id", goal.id,
    "--target-date", "2026-04-18T17:00:00.000Z",
    "--json",
  ], {
    stdout: milestoneStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const milestone = parseCliJsonPayload<{ id: string; projectId?: string; areaId?: string }>(milestoneStdout.getOutput());
  assert.equal(milestone.projectId, project.id);
  assert.equal(milestone.areaId, area.id);

  const taskStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "create",
    "Ship workspace",
    "--status", "blocked",
    "--area-id", area.id,
    "--project-id", project.id,
    "--goal-id", goal.id,
    "--estimate-minutes", "45",
    "--blocked-reason", "waiting on release notes",
    "--checklist-json", '[{"text":"cut release"},{"text":"announce launch","completed":true}]',
    "--json",
  ], {
    stdout: taskStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const task = parseCliJsonPayload<{
    id: string;
    status?: string;
    projectId?: string;
    goalId?: string;
    areaId?: string;
    estimateMinutes?: number;
    blockedReason?: string;
    checklist?: Array<{ text: string }>;
  }>(taskStdout.getOutput());
  assert.equal(task.projectId, project.id);
  assert.equal(task.goalId, goal.id);
  assert.equal(task.areaId, area.id);
  assert.equal(task.estimateMinutes, 45);
  assert.equal(task.blockedReason, "waiting on release notes");
  assert.equal(task.checklist?.length, 2);

  const blockerStdout = captureStream();
  assert.equal(await runCli([
    "blockers",
    "create",
    "Need product approval",
    "--kind", "policy_block",
    "--task-id", task.id,
    "--project-id", project.id,
    "--goal-id", goal.id,
    "--owner-agent-id", "reviewer",
    "--json",
  ], {
    stdout: blockerStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const blocker = parseCliJsonPayload<{ id: string; taskId?: string; kind?: string }>(blockerStdout.getOutput());
  assert.equal(blocker.taskId, task.id);
  assert.equal(blocker.kind, "policy_block");

  const artifactStdout = captureStream();
  assert.equal(await runCli([
    "artifacts",
    "create",
    "Final screenshot",
    "--kind", "screenshot",
    "--task-id", task.id,
    "--summary", "Hermetic validation screenshot",
    "--json",
  ], {
    stdout: artifactStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const artifact = parseCliJsonPayload<{ id: string; taskId?: string; kind?: string }>(artifactStdout.getOutput());
  assert.equal(artifact.taskId, task.id);
  assert.equal(artifact.kind, "screenshot");

  const decisionStdout = captureStream();
  assert.equal(await runCli([
    "decisions",
    "create",
    "Keep rollout local-first",
    "--status", "accepted",
    "--task-id", task.id,
    "--project-id", project.id,
    "--artifact-ids", artifact.id,
    "--alternatives", "remote-only,hybrid",
    "--json",
  ], {
    stdout: decisionStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const decision = parseCliJsonPayload<{ id: string; status?: string; artifactIds?: string[] }>(decisionStdout.getOutput());
  assert.equal(decision.status, "accepted");
  assert.equal(decision.artifactIds?.includes(artifact.id), true);

  const sessionStdout = captureStream();
  assert.equal(await runCli([
    "work-sessions",
    "create",
    "Focus shipping block",
    "--task-ids", task.id,
    "--blocker-ids", blocker.id,
    "--timebox-minutes", "30",
    "--json",
  ], {
    stdout: sessionStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const workSession = parseCliJsonPayload<{ id: string; taskIds?: string[]; blockerIds?: string[]; status?: string }>(sessionStdout.getOutput());
  assert.equal(workSession.status, "active");
  assert.equal(workSession.taskIds?.includes(task.id), true);
  assert.equal(workSession.blockerIds?.includes(blocker.id), true);

  const assignmentStdout = captureStream();
  assert.equal(await runCli([
    "assignments",
    "create",
    "Reviewer owns release gate",
    "--task-id", task.id,
    "--assigned-to-agent-id", "reviewer",
    "--assigned-by", "planner",
    "--reviewer-agent-id", "lead",
    "--status", "accepted",
    "--json",
  ], {
    stdout: assignmentStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const assignment = parseCliJsonPayload<{ id: string; taskId?: string; assignedToAgentId?: string; status?: string }>(assignmentStdout.getOutput());
  assert.equal(assignment.taskId, task.id);
  assert.equal(assignment.assignedToAgentId, "reviewer");
  assert.equal(assignment.status, "accepted");

  const handoffStdout = captureStream();
  assert.equal(await runCli([
    "handoffs",
    "create",
    "Pass release validation to reviewer",
    "--task-id", task.id,
    "--from-agent-id", "planner",
    "--to-agent-id", "reviewer",
    "--artifact-ids", artifact.id,
    "--blocker-ids", blocker.id,
    "--objective", "Finish the release gate",
    "--next-step", "Confirm the last blocker is gone",
    "--json",
  ], {
    stdout: handoffStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const handoff = parseCliJsonPayload<{ id: string; taskId?: string; toAgentId?: string; artifactIds?: string[] }>(handoffStdout.getOutput());
  assert.equal(handoff.taskId, task.id);
  assert.equal(handoff.toAgentId, "reviewer");
  assert.equal(handoff.artifactIds?.includes(artifact.id), true);

  const approvalStdout = captureStream();
  assert.equal(await runCli([
    "approvals",
    "create",
    "Approve publish",
    "--kind", "publish",
    "--task-id", task.id,
    "--handoff-id", handoff.id,
    "--approver-agent-id", "lead",
    "--requested-by-agent-id", "reviewer",
    "--policy-reason", "Publishing requires reviewer sign-off",
    "--evidence-ids", artifact.id,
    "--decision-ids", decision.id,
    "--json",
  ], {
    stdout: approvalStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const approval = parseCliJsonPayload<{ id: string; taskId?: string; kind?: string; status?: string }>(approvalStdout.getOutput());
  assert.equal(approval.taskId, task.id);
  assert.equal(approval.kind, "publish");
  assert.equal(approval.status, "pending");

  const capacityStdout = captureStream();
  assert.equal(await runCli([
    "capacity",
    "create",
    "Reviewer capacity",
    "--agent-id", "reviewer",
    "--team-id", "release",
    "--max-wip", "2",
    "--current-wip", "1",
    "--queue-depth", "2",
    "--blocked-count", "1",
    "--overdue-count", "0",
    "--json",
  ], {
    stdout: capacityStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const capacity = parseCliJsonPayload<{ id: string; agentId?: string }>(capacityStdout.getOutput());
  assert.equal(capacity.agentId, "reviewer");

  const reminderStdout = captureStream();
  assert.equal(await runCli([
    "reminders",
    "create",
    "Follow up",
    "--trigger-at", "2026-04-15T09:00:00.000Z",
    "--anchor-type", "task",
    "--anchor-id", task.id,
    "--json",
  ], {
    stdout: reminderStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const reminder = parseCliJsonPayload<{ id: string; anchorId?: string; status?: string }>(reminderStdout.getOutput());
  assert.equal(reminder.anchorId, task.id);

  const deadlineStdout = captureStream();
  const deadlineStderr = captureStream();
  const deadlineExitCode = await runCli([
    "deadlines",
    "create",
    "Launch date",
    "--due-at", "2026-04-20T18:00:00.000Z",
    "--anchor-type", "project",
    "--anchor-id", project.id,
    "--json",
  ], {
    stdout: deadlineStdout.stream,
    stderr: deadlineStderr.stream,
    cwd: workspaceRoot,
  });
  assert.equal(deadlineExitCode, CLI_EXIT_OK, `${deadlineStdout.getOutput()}\n${deadlineStderr.getOutput()}`);
  const deadline = parseCliJsonPayload<{ id: string; anchorId?: string }>(deadlineStdout.getOutput());
  assert.equal(deadline.anchorId, project.id);

  const noteStdout = captureStream();
  assert.equal(await runCli([
    "notes",
    "create",
    "Workspace notes",
    "--content", "Zero-config workspace launch checklist",
    "--tags", "workspace,launch",
    "--json",
  ], {
    stdout: noteStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const note = parseCliJsonPayload<{ id: string }>(noteStdout.getOutput());

  const eventStdout = captureStream();
  assert.equal(await runCli([
    "events",
    "create",
    "Launch review",
    "--starts-at", "2026-04-16T10:00:00.000Z",
    "--attendees", person.id,
    "--json",
  ], {
    stdout: eventStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const event = parseCliJsonPayload<{ id: string }>(eventStdout.getOutput());
  assert.ok(event.id);

  const inboxStdout = captureStream();
  assert.equal(await runCli([
    "inbox",
    "draft",
    "Need update on workspace core",
    "--channel", "email",
    "--participants", person.id,
    "--json",
  ], {
    stdout: inboxStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const thread = parseCliJsonPayload<{ thread: { id: string } }>(inboxStdout.getOutput());
  assert.ok(thread.thread.id);

  const inboxProcessStdout = captureStream();
  assert.equal(await runCli([
    "inbox",
    "process",
    thread.thread.id,
    "--task-title", "Reply to workspace core thread",
    "--note-title", "Workspace core thread summary",
    "--reminder-title", "Follow up thread",
    "--trigger-at", "2026-04-16T09:30:00.000Z",
    "--area-id", area.id,
    "--project-id", project.id,
    "--goal-id", goal.id,
    "--json",
  ], {
    stdout: inboxProcessStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const processed = parseCliJsonPayload<{
    thread: { id: string; linkedTaskIds?: string[]; linkedNoteIds?: string[] };
    task?: { id: string };
    note?: { id: string };
    reminder?: { id: string };
  }>(inboxProcessStdout.getOutput());
  assert.equal(processed.thread.id, thread.thread.id);
  assert.equal(processed.thread.linkedTaskIds?.includes(processed.task?.id || ""), true);
  assert.equal(processed.thread.linkedNoteIds?.includes(processed.note?.id || ""), true);
  assert.ok(processed.reminder?.id);

  const teamWorkStdout = captureStream();
  assert.equal(await runCli([
    "team-work",
    "--json",
  ], {
    stdout: teamWorkStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(teamWorkStdout.getOutput(), /"pendingApprovals":/);
  assert.match(teamWorkStdout.getOutput(), new RegExp(approval.id));

  const myWorkStdout = captureStream();
  assert.equal(await runCli([
    "my-work",
    "--json",
  ], {
    stdout: myWorkStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(myWorkStdout.getOutput(), /"activeBlockers":/);
  assert.match(myWorkStdout.getOutput(), new RegExp(blocker.id));

  const taskMoveStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "move",
    "--ids", task.id,
    "--area-id", area.id,
    "--project-id", project.id,
    "--goal-id", goal.id,
    "--json",
  ], {
    stdout: taskMoveStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(taskMoveStdout.getOutput(), new RegExp(task.id));

  const completeStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "complete",
    task.id,
    "--json",
  ], {
    stdout: completeStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(completeStdout.getOutput(), /"status": "done"/);

  const blockerResolveStdout = captureStream();
  assert.equal(await runCli([
    "blockers",
    "update",
    blocker.id,
    "--status", "resolved",
    "--json",
  ], {
    stdout: blockerResolveStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(blockerResolveStdout.getOutput(), /"status": "resolved"/);

  const workSessionCompleteStdout = captureStream();
  assert.equal(await runCli([
    "work-sessions",
    "complete",
    workSession.id,
    "--outcome", "Focus loop shipped",
    "--json",
  ], {
    stdout: workSessionCompleteStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(workSessionCompleteStdout.getOutput(), /"status": "completed"/);

  const reviewStdout = captureStream();
  assert.equal(await runCli([
    "review",
    "daily",
    "--json",
  ], {
    stdout: reviewStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(reviewStdout.getOutput(), /"activeProjects":/);
  assert.match(reviewStdout.getOutput(), /"pendingDecisions":/);

  const remindersListStdout = captureStream();
  assert.equal(await runCli([
    "reminders",
    "list",
    "--after", "2026-04-15T00:00:00.000Z",
    "--before", "2026-04-16T00:00:00.000Z",
    "--json",
  ], {
    stdout: remindersListStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(remindersListStdout.getOutput(), new RegExp(reminder.id));

  const deadlinesListStdout = captureStream();
  assert.equal(await runCli([
    "deadlines",
    "list",
    "--after", "2026-04-20T00:00:00.000Z",
    "--before", "2026-04-21T00:00:00.000Z",
    "--json",
  ], {
    stdout: deadlinesListStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(deadlinesListStdout.getOutput(), new RegExp(deadline.id));

  const agendaStdout = captureStream();
  assert.equal(await runCli([
    "agenda",
    "--start", "2026-04-15T00:00:00.000Z",
    "--end", "2026-04-21T00:00:00.000Z",
    "--json",
  ], {
    stdout: agendaStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(agendaStdout.getOutput(), /"domain": "milestones"/);
  assert.match(agendaStdout.getOutput(), /"domain": "deadlines"/);

  const activityStdout = captureStream();
  assert.equal(await runCli([
    "activity",
    "list",
    "--task-id", task.id,
    "--json",
  ], {
    stdout: activityStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(activityStdout.getOutput(), /Task created/);

  const workspaceSearchStdout = captureStream();
  assert.equal(await runCli([
    "search",
    "query",
    "workspace",
    "--domains", "tasks,goals,projects,reminders,deadlines,notes,people,inbox,events",
    "--json",
  ], {
    stdout: workspaceSearchStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(workspaceSearchStdout.getOutput(), /"domain": "tasks"/);
  assert.match(workspaceSearchStdout.getOutput(), /"domain": "notes"/);

  const exportStdout = captureStream();
  const exportStderr = captureStream();
  const exportExitCode = await runCli([
    "work",
    "export",
    "snapshot.json",
    "--workspace", workspaceRoot,
    "--confirm",
    "--approval-id",
    "approval_productivity_export",
    "--legal-label",
    "Productivity snapshot - human reviewed",
    "--json",
  ], {
    stdout: exportStdout.stream,
    stderr: exportStderr.stream,
    cwd: workspaceRoot,
  });
  assert.equal(exportExitCode, CLI_EXIT_OK, `${exportStdout.getOutput()}\n${exportStderr.getOutput()}`);
  const exported = parseCliJsonPayload<{ path: string }>(exportStdout.getOutput());
  assert.equal(fs.existsSync(exported.path), true);

  const backupStdout = captureStream();
  assert.equal(await runCli([
    "work",
    "backup",
    "backups",
    "--workspace", workspaceRoot,
    "--confirm",
    "--approval-id",
    "approval_productivity_backup",
    "--legal-label",
    "Productivity backup - human reviewed",
    "--json",
  ], {
    stdout: backupStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const backup = parseCliJsonPayload<{ files: string[] }>(backupStdout.getOutput());
  assert.equal(backup.files.length > 0, true);

  const inspectStdout = captureStream();
  assert.equal(await runCli([
    "workspace",
    "inspect",
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: inspectStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(inspectStdout.getOutput(), new RegExp(`"${clawSharedJsonFields.schemaVersion}": 6`));

  assert.equal(fs.existsSync(registeredDatabasePath(dataRoot, "claw.database.core")), true);
  assert.equal(fs.existsSync(resolveClawPersistentSurfacePath("claw.workspace", workspaceRoot, "workspace.manifest.json")), false);
  assert.ok(note.id);
});
