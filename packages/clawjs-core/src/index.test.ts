import test from "node:test";
import assert from "node:assert/strict";

import {
  CLAWJS_CANONICAL_HIERARCHY,
  CLAWJS_CANONICAL_TERMS,
  CLAWJS_NON_SYNONYMS,
  ClawError,
  PRODUCTIVITY_COLLECTION_DEFINITIONS,
  activityEntryRecordSchema,
  areaRecordSchema,
  assertCodexReadOnlyPath,
  assignmentRecordSchema,
  artifactRecordSchema,
  auditEventSchema,
  blockerRecordSchema,
  capacityRecordSchema,
  clawCommandRequestSchema,
  clawCommandResponseSchema,
  clawContractFixturesV1,
  clawContractVersionV1,
  clawHostRegistrySchema,
  clawJsonSchemasV1,
  agentRecordSchema,
  createCodexReadOnlySourceDescriptor,
  createTtsPlaybackPlan,
  compatSnapshotSchema,
  createManifest,
  decisionRecordSchema,
  deadlineRecordSchema,
  eventRecordSchema,
  feedbackRecordSchema,
  goalRecordSchema,
  handoffRecordSchema,
  incidentRecordSchema,
  linkedEntityRefSchema,
  segmentTextForTts,
  semanticPlanSchema,
  manifestSchema,
  milestoneRecordSchema,
  maskCredential,
  noteRecordSchema,
  operationalCheckRecordSchema,
  personIdentitySchema,
  projectRecordSchema,
  productivityApprovalRecordSchema,
  releaseRecordSchema,
  reminderRecordSchema,
  resolveClawGlobalDataDir,
  resolveClawHostRegistryPath,
  resolveClawHostStateDir,
  resolveClawWorkspaceDir,
  taskRecordSchema,
  workSessionRecordSchema,
  stripMarkdownForTts,
  summarizeReadiness,
  templatePackSchema,
  temporalItemSchema,
  workspaceSearchQuerySchema,
} from "./index.ts";

test("createManifest returns a valid manifest", () => {
  const manifest = createManifest({
    appId: "demo-app",
    workspaceId: "demo-workspace",
    agentId: "demo-agent",
    rootDir: "/tmp/demo",
    projectId: "demo-project",
    logicalAgentId: "designer",
    runtimeAgentId: "designer-demo-project",
    materializationVersion: 1,
  }, "openclaw");

  assert.deepEqual(manifestSchema.parse(manifest), manifest);
  assert.equal(manifest.projectId, "demo-project");
  assert.equal(manifest.logicalAgentId, "designer");
  assert.equal(manifest.runtimeAgentId, "designer-demo-project");
  assert.equal(manifest.materializationVersion, 1);
});

test("maskCredential keeps only the tail", () => {
  assert.equal(maskCredential("sk-12345678"), "*******5678");
  assert.equal(maskCredential("abcd", 4), "****");
  assert.equal(maskCredential(""), null);
});

test("summarizeReadiness degrades until all tracked capabilities are ready", () => {
  const degraded = summarizeReadiness({
    runtime: { name: "runtime", status: "ready" },
    workspace: { name: "workspace", status: "ready" },
    auth: { name: "auth", status: "degraded", recommendedActions: ["login"] },
  });

  assert.equal(degraded.overallStatus, "degraded");
  assert.deepEqual(degraded.recommendedActions, ["login"]);

  const ready = summarizeReadiness({
    runtime: { name: "runtime", status: "ready" },
    workspace: { name: "workspace", status: "ready" },
    auth: { name: "auth", status: "ready" },
    models: { name: "models", status: "ready" },
    file_sync: { name: "file_sync", status: "ready" },
  });

  assert.equal(ready.overallStatus, "ready");
});

test("ClawError preserves code and repair hint", () => {
  const error = new ClawError({
    code: "runtime_not_found",
    message: "OpenClaw CLI is missing",
    capability: "runtime",
    repairHint: "Install the runtime first.",
  });

  assert.equal(error.code, "runtime_not_found");
  assert.equal(error.repairHint, "Install the runtime first.");
});

test("host contract schemas validate v1 command and registry payloads", () => {
  const request = clawCommandRequestSchema.parse({
    schemaVersion: clawContractVersionV1,
    requestId: "req-1",
    domain: "calendar",
    resource: "events",
    action: "list",
    arguments: { limit: 10 },
    clientContext: { bundleId: "com.example.host" },
  });

  assert.equal(request.validationMode, "host_real");
  assert.equal(request.domain, "calendar");

  const registry = clawHostRegistrySchema.parse({
    schemaVersion: clawContractVersionV1,
    activeHostId: "claw",
    updatedAt: "2026-05-13T10:00:00.000Z",
    hosts: [
      {
        schemaVersion: clawContractVersionV1,
        id: "claw",
        displayName: "Claw",
        kind: "standalone",
        bundleId: "com.example.claw",
        endpoint: { transport: "xpc", address: "com.example.claw.runtime" },
        capabilities: [
          {
            id: "calendar.events.list",
            domain: "calendar",
            actions: ["list"],
            riskLevel: "read",
            brokerRequired: true,
            requiresOSPermission: true,
          },
        ],
        registeredAt: "2026-05-13T10:00:00.000Z",
        updatedAt: "2026-05-13T10:00:00.000Z",
      },
    ],
  });

  assert.equal(registry.hosts[0]?.capabilities[0]?.osPermissionState, "unknown");
});

test("host contract fixtures and JSON schema exports cover the public v1 surface", () => {
  assert.equal(clawJsonSchemasV1.commandRequest.$id, "https://schemas.claw.dev/v1/command-request.schema.json");
  assert.equal(clawJsonSchemasV1.commandResponse.$id, "https://schemas.claw.dev/v1/command-response.schema.json");
  assert.equal(clawJsonSchemasV1.hostDescriptor.$id, "https://schemas.claw.dev/v1/host-descriptor.schema.json");

  const request = clawCommandRequestSchema.parse(clawContractFixturesV1.commandRequest);
  const response = clawCommandResponseSchema.parse(clawContractFixturesV1.commandResponse);
  const registry = clawHostRegistrySchema.parse(clawContractFixturesV1.hostRegistry);

  assert.equal(request.schemaVersion, clawContractVersionV1);
  assert.equal(response.meta.hostId, "clawix");
  assert.equal(registry.activeHostId, "clawix");
});

test("storage helpers resolve Claw roots and enforce Codex read-only policy", () => {
  assert.equal(
    resolveClawGlobalDataDir({ homeDir: "/Users/demo", platform: "darwin" }),
    "/Users/demo/Library/Application Support/Claw",
  );
  assert.equal(resolveClawWorkspaceDir("/repo/app"), "/repo/app/.claw");
  assert.equal(
    resolveClawHostStateDir({ homeDir: "/Users/demo", hostName: "Clawix", platform: "darwin" }),
    "/Users/demo/Library/Application Support/Clawix",
  );
  assert.equal(
    resolveClawHostRegistryPath({ homeDir: "/Users/demo", platform: "darwin" }),
    "/Users/demo/Library/Application Support/Claw/hosts/registry.json",
  );

  assert.doesNotThrow(() => assertCodexReadOnlyPath({
    homeDir: "/Users/demo",
    path: "/Users/demo/.codex/sessions/session.jsonl",
    operation: "mirror",
  }));
  assert.throws(() => assertCodexReadOnlyPath({
    homeDir: "/Users/demo",
    path: "/Users/demo/.codex/sessions/session.jsonl",
    operation: "delete",
  }), /Refusing delete operation/);
  assert.throws(() => assertCodexReadOnlyPath({
    homeDir: "/Users/demo",
    path: "/Users/demo/projects/../.codex/auth.json",
    operation: "write",
  }), /Refusing write operation/);
  assert.doesNotThrow(() => assertCodexReadOnlyPath({
    homeDir: "/Users/demo",
    path: "/Users/demo/.codex/AGENTS.md",
    operation: "write",
    allowAgentsMdOptIn: true,
  }));

  assert.deepEqual(createCodexReadOnlySourceDescriptor("/Users/demo"), {
    id: "codex",
    rootDir: "/Users/demo/.codex",
    allowedOperations: ["read", "mirror", "index"],
    writePolicy: "agents_md_opt_in_only",
  });
});

test("semantic plan schema validates agent-native action previews", () => {
  const plan = semanticPlanSchema.parse({
    schemaVersion: 1,
    intent: {
      id: "intent-code-change",
      summary: "Prepare a code change",
      constraints: ["do not publish without approval"],
    },
    objects: [
      { id: "repo", kind: "repository", label: "Example repo" },
      { id: "change", kind: "task", label: "Proposed change" },
    ],
    actions: [
      {
        id: "inspect",
        type: "inspect",
        label: "Inspect repository",
        objectIds: ["repo"],
        effectIds: ["read-local"],
        permissionIds: ["repo-read"],
        risk: "low",
      },
    ],
    effects: [
      {
        id: "read-local",
        kind: "read",
        description: "Read local repository files",
        objectIds: ["repo"],
        reversible: true,
        risk: "low",
      },
    ],
    permissions: [
      {
        id: "repo-read",
        capability: "repository.read",
        scope: "local workspace",
        risk: "low",
      },
    ],
  });

  assert.equal(plan.intent.summary, "Prepare a code change");
  assert.equal(plan.actions[0]?.requiresHumanApproval, false);
});

test("compat and template schemas validate normalized payloads", () => {
  const compat = compatSnapshotSchema.parse({
    schemaVersion: 1,
    runtimeAdapter: "openclaw",
    runtimeVersion: "1.2.3",
    probedAt: "2026-03-20T10:00:00.000Z",
    capabilities: { status: true, doctor: false },
  });
  assert.equal(compat.runtimeAdapter, "openclaw");

  const templatePack = templatePackSchema.parse({
    schemaVersion: 1,
    id: "demo",
    name: "Demo",
    mutations: [
      {
        targetFile: "SOUL.md",
        mode: "managed_block",
        blockId: "core",
        content: "hello",
      },
    ],
  });
  assert.equal(templatePack.mutations[0]?.targetFile, "SOUL.md");

  const auditEvent = auditEventSchema.parse({
    timestamp: "2026-03-21T10:00:00.000Z",
    event: "files.binding_synced",
    capability: "file_sync",
    detail: { file: "SOUL.md" },
  });
  assert.equal(auditEvent.capability, "file_sync");
});

test("workspace productivity schemas validate linked records and search queries", () => {
  const area = areaRecordSchema.parse({
    id: "area-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    name: "Platform",
    status: "active",
  });
  assert.equal(area.status, "active");

  const link = linkedEntityRefSchema.parse({
    domain: "area",
    id: "area-1",
    relationship: "contains",
  });
  assert.equal(link.domain, "area");

  const taskLink = linkedEntityRefSchema.parse({
    domain: "task",
    id: "task-1",
    relationship: "blocks",
  });
  assert.equal(taskLink.domain, "task");

  const task = taskRecordSchema.parse({
    id: "task-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Ship workspace layer",
    status: "todo",
    priority: "high",
    labels: ["sdk"],
    areaId: "area-1",
    watcherPersonIds: [],
    childTaskIds: [],
    dependsOnTaskIds: [],
    commentIds: [],
    attachmentIds: [],
    blockedByIds: [],
    evidenceIds: [],
    decisionIds: [],
    assignmentIds: [],
    handoffIds: [],
    approvalIds: [],
    checklist: [],
    estimateMinutes: 90,
    blockedReason: "waiting on api",
    links: [taskLink],
  });
  assert.equal(task.estimateMinutes, 90);

  const goal = goalRecordSchema.parse({
    id: "goal-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Ship productivity",
    status: "active",
    level: "personal",
    areaId: "area-1",
    parentId: "goal-root",
    parentGoalId: "goal-root",
    ownerAgentId: "agent-1",
    reviewCadence: "weekly",
    metricDirection: "increase",
  });
  assert.equal(goal.reviewCadence, "weekly");

  const project = projectRecordSchema.parse({
    id: "project-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    name: "Workspace local-first",
    status: "in_progress",
    areaId: "area-1",
    leadAgentId: "agent-1",
    milestoneIds: ["milestone-1"],
    defaultSectionIds: [],
  });
  assert.equal(project.milestoneIds[0], "milestone-1");

  const milestone = milestoneRecordSchema.parse({
    id: "milestone-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "CLI beta",
    status: "active",
    areaId: "area-1",
    projectId: "project-1",
  });
  assert.equal(milestone.projectId, "project-1");

  const activity = activityEntryRecordSchema.parse({
    id: "activity-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "derived" },
    entityType: "task",
    entityId: "task-1",
    kind: "created",
    title: "Task created",
    areaId: "area-1",
    projectId: "project-1",
    taskId: "task-1",
  });
  assert.equal(activity.entityType, "task");

  const blocker = blockerRecordSchema.parse({
    id: "blocker-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Waiting on policy review",
    status: "active",
    kind: "policy_block",
    taskId: "task-1",
    dependencyTaskIds: [],
    evidenceIds: [],
  });
  assert.equal(blocker.kind, "policy_block");

  const artifact = artifactRecordSchema.parse({
    id: "artifact-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Hermetic screenshot",
    kind: "screenshot",
    taskId: "task-1",
    summary: "Captured final screen",
  });
  assert.equal(artifact.kind, "screenshot");

  const decision = decisionRecordSchema.parse({
    id: "decision-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Keep the loop on /tasks",
    status: "accepted",
    taskId: "task-1",
    alternatives: ["New route", "Reuse panel"],
    artifactIds: ["artifact-1"],
  });
  assert.equal(decision.status, "accepted");

  const session = workSessionRecordSchema.parse({
    id: "session-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Focus on task loop",
    status: "active",
    taskIds: ["task-1"],
    blockerIds: ["blocker-1"],
    startedAt: "2026-03-21T10:05:00.000Z",
  });
  assert.equal(session.status, "active");

  const assignment = assignmentRecordSchema.parse({
    id: "assignment-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Own the release gate",
    status: "accepted",
    taskId: "task-1",
    assignedToAgentId: "agent-release",
    assignedBy: "lead-agent",
  });
  assert.equal(assignment.assignedToAgentId, "agent-release");

  const handoff = handoffRecordSchema.parse({
    id: "handoff-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Pass QA closeout to reviewer",
    status: "proposed",
    taskId: "task-1",
    fromAgentId: "agent-build",
    toAgentId: "agent-review",
    artifactIds: ["artifact-1"],
    blockerIds: ["blocker-1"],
  });
  assert.equal(handoff.toAgentId, "agent-review");

  const approval = productivityApprovalRecordSchema.parse({
    id: "approval-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Approve publish step",
    status: "pending",
    kind: "publish",
    taskId: "task-1",
    policyReason: "Publishing requires a reviewer gate.",
    evidenceIds: ["artifact-1"],
    decisionIds: ["decision-1"],
  });
  assert.equal(approval.kind, "publish");

  const capacity = capacityRecordSchema.parse({
    id: "capacity-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "derived" },
    title: "Agent reviewer",
    status: "active",
    agentId: "agent-review",
    availability: "available",
    currentWip: 2,
    queueDepth: 3,
    blockedCount: 1,
    overdueCount: 0,
    assignedTaskIds: ["task-1"],
    pendingApprovalIds: ["approval-1"],
    pendingHandoffIds: ["handoff-1"],
  });
  assert.equal(capacity.agentId, "agent-review");

  const agent = agentRecordSchema.parse({
    id: "agent-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    name: "Reviewer",
    status: "active",
    role: "review",
    domains: ["release", "quality"],
    availability: "busy",
    autonomyLevel: "act_limited",
    permissions: ["tasks.update", "checks.update"],
    policyGate: "approval_required",
    linkedTaskIds: ["task-1"],
  });
  assert.equal(agent.autonomyLevel, "act_limited");

  const release = releaseRecordSchema.parse({
    id: "release-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Spring launch",
    status: "at_risk",
    projectId: "project-1",
    linkedTaskIds: ["task-1"],
    incidentIds: ["incident-1"],
    approvalIds: ["approval-1"],
  });
  assert.equal(release.status, "at_risk");

  const incident = incidentRecordSchema.parse({
    id: "incident-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Checkout regression",
    status: "investigating",
    severity: "sev2",
    projectId: "project-1",
    taskId: "task-1",
    blockerIds: ["blocker-1"],
    feedbackIds: ["feedback-1"],
  });
  assert.equal(incident.severity, "sev2");

  const feedback = feedbackRecordSchema.parse({
    id: "feedback-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "channel", channel: "support" },
    title: "Customer saw the regression",
    status: "new",
    origin: "customer",
    priority: "high",
    incidentId: "incident-1",
  });
  assert.equal(feedback.origin, "customer");

  const check = operationalCheckRecordSchema.parse({
    id: "check-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "derived" },
    title: "Release readiness",
    status: "failing",
    kind: "release_readiness",
    releaseId: "release-1",
  });
  assert.equal(check.kind, "release_readiness");

  const reminder = reminderRecordSchema.parse({
    id: "reminder-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Review workspace",
    status: "active",
    triggerAt: "2026-03-22T09:00:00.000Z",
    anchorType: "task",
    anchorId: "task-1",
  });
  assert.equal(reminder.anchorType, "task");

  const deadline = deadlineRecordSchema.parse({
    id: "deadline-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Workspace ship date",
    status: "active",
    dueAt: "2026-03-25T18:00:00.000Z",
    anchorType: "project",
    anchorId: "project-1",
  });
  assert.equal(deadline.anchorType, "project");

  const note = noteRecordSchema.parse({
    id: "note-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Context",
    blocks: [{ id: "block-1", type: "paragraph", text: "Workspace context." }],
    tags: ["workspace"],
    linkedEntityIds: ["task-1"],
    searchText: "Context Workspace context.",
  });
  assert.equal(note.blocks[0]?.type, "paragraph");

  const identity = personIdentitySchema.parse({
    channel: "telegram",
    handle: "@alice",
  });
  assert.equal(identity.channel, "telegram");

  const event = eventRecordSchema.parse({
    id: "event-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Launch review",
    startsAt: "2026-03-22T09:00:00.000Z",
    attendeePersonIds: [],
    linkedTaskIds: ["task-1"],
    linkedNoteIds: ["note-1"],
    reminders: [{ id: "reminder-1", minutesBeforeStart: 30 }],
  });
  assert.equal(event.reminders[0]?.minutesBeforeStart, 30);

  const temporal = temporalItemSchema.parse({
    id: "time-1",
    kind: "routine",
    status: "active",
    title: "Review PRs",
    timezone: "UTC",
    schedule: {
      mode: "cron",
      timezone: "UTC",
      cron: "0 */3 * * *",
    },
    participants: [{ id: "agent-1", kind: "agent", label: "Reviewer", agentId: "reviewer" }],
    actions: [{ id: "action-1", kind: "workflow", target: "runtime_scheduler" }],
    projections: [{ id: "projection-1", itemId: "time-1", target: "relay_routines", status: "pending", updatedAt: "2026-03-21T10:00:00.000Z" }],
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
  });
  assert.equal(temporal.schedule.cron, "0 */3 * * *");

  const search = workspaceSearchQuerySchema.parse({
    query: "workspace",
    domains: ["areas", "tasks", "goals", "projects", "milestones", "blockers", "artifacts", "decisions", "work_sessions", "assignments", "handoffs", "approvals", "capacity", "agents", "releases", "incidents", "feedback", "checks", "reminders", "deadlines", "notes"],
    strategy: "hybrid",
    limit: 5,
  });
  assert.equal(search.strategy, "hybrid");
});

test("productivity collection definitions expose the unified local and remote contract", () => {
  const collectionNames = PRODUCTIVITY_COLLECTION_DEFINITIONS.map((definition) => definition.name);
  assert.deepEqual(collectionNames.slice(0, 5), [
    "areas",
    "people",
    "tasks",
    "goals",
    "projects",
  ]);
  assert.equal(collectionNames.includes("lists"), true);
  assert.equal(collectionNames.includes("sections"), true);
  assert.equal(collectionNames.includes("comments"), true);
  assert.equal(collectionNames.includes("attachments"), true);
  assert.equal(collectionNames.includes("saved_views"), true);
  assert.equal(collectionNames.includes("recurrences"), true);
  assert.equal(collectionNames.includes("cycles"), true);
  assert.equal(collectionNames.includes("epics"), true);
  assert.equal(collectionNames.includes("custom_fields"), true);
  assert.equal(collectionNames.includes("field_values"), true);
  assert.equal(collectionNames.includes("templates"), true);
  // Keep this legacy workspace block contiguous even when adjacent catalog
  // families move in or out of the productivity registry.
  const idxReminders = collectionNames.indexOf("reminders");
  assert.ok(idxReminders >= 0, "reminders collection present");
  assert.deepEqual(collectionNames.slice(idxReminders, idxReminders + 5), [
    "reminders",
    "deadlines",
    "notes",
    "inbox_threads",
    "inbox_messages",
  ]);
  assert.deepEqual(collectionNames.filter((name) => [
    "milestones",
    "events",
    "activity_entries",
    "blockers",
    "artifacts",
    "decisions",
    "work_sessions",
    "assignments",
    "handoffs",
    "approvals",
    "capacity",
    "agents",
    "releases",
    "incidents",
    "feedback",
    "checks",
  ].includes(name)), [
    "milestones",
    "events",
    "activity_entries",
    "blockers",
    "artifacts",
    "decisions",
    "work_sessions",
    "assignments",
    "handoffs",
    "approvals",
    "capacity",
    "agents",
    "releases",
    "incidents",
    "feedback",
    "checks",
  ]);

  const goalFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "goals")?.fields ?? [];
  assert.equal(goalFields.some((field) => field.name === "parentId"), true);
  assert.equal(goalFields.some((field) => field.name === "parentGoalId"), true);
  assert.equal(goalFields.some((field) => field.name === "ownerAgentId"), true);

  const projectFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "projects")?.fields ?? [];
  assert.equal(projectFields.some((field) => field.name === "leadAgentId"), true);
  assert.equal(projectFields.some((field) => field.name === "reviewAt"), true);
  assert.equal(projectFields.some((field) => field.name === "defaultSectionIds"), true);

  const taskFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "tasks")?.fields ?? [];
  assert.equal(taskFields.some((field) => field.name === "blockedByIds"), true);
  assert.equal(taskFields.some((field) => field.name === "approvalIds"), true);
  assert.equal(taskFields.some((field) => field.name === "startAt"), true);
  assert.equal(taskFields.some((field) => field.name === "sectionId"), true);

  const blockerFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "blockers")?.fields ?? [];
  assert.equal(blockerFields.some((field) => field.name === "kind"), true);

  const assignmentFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "assignments")?.fields ?? [];
  assert.equal(assignmentFields.some((field) => field.name === "assignedToAgentId"), true);

  const approvalFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "approvals")?.fields ?? [];
  assert.equal(approvalFields.some((field) => field.name === "policyReason"), true);

  const agentFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "agents")?.fields ?? [];
  assert.equal(agentFields.some((field) => field.name === "autonomyLevel"), true);

  const releaseFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "releases")?.fields ?? [];
  assert.equal(releaseFields.some((field) => field.name === "incidentIds"), true);

  const incidentFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "incidents")?.fields ?? [];
  assert.equal(incidentFields.some((field) => field.name === "severity"), true);
});

test("canonical terminology exports the agreed product vocabulary", () => {
  assert.equal(CLAWJS_CANONICAL_TERMS.runtimeAdapter, "runtime adapter");
  assert.equal(CLAWJS_CANONICAL_TERMS.agentProfile, "agent profile");
  assert.deepEqual(CLAWJS_CANONICAL_HIERARCHY, [
    "runtimeAdapter",
    "workspace",
    "agent",
    "agentProfile",
    "provider",
    "model",
    "gateway",
  ]);
  assert.deepEqual(CLAWJS_NON_SYNONYMS.gateway, ["runtime adapter"]);
  assert.deepEqual(CLAWJS_NON_SYNONYMS.workspace, ["agent"]);
  assert.deepEqual(CLAWJS_NON_SYNONYMS.provider, ["model"]);
});

test("tts helpers strip markdown and build a stable playback plan", () => {
  const plain = stripMarkdownForTts("## Hello\n\n**World** [link](https://example.com)\n- item");
  assert.equal(plain, "Hello. World link item");

  const segments = segmentTextForTts(
    "First sentence. Second sentence with, enough detail to split safely if needed.",
    { maxSegmentLength: 20 },
  );
  assert.deepEqual(segments, [
    "First sentence.",
    "Second sentence",
    "with, enough detail",
    "to split safely if",
    "needed.",
  ]);

  const plan = createTtsPlaybackPlan({
    text: "Paragraph one.\n\nParagraph two with `inline code`.",
  });
  assert.equal(plan.plainText, "Paragraph one. Paragraph two with inline code.");
  assert.deepEqual(
    plan.segments.map((segment) => segment.text),
    ["Paragraph one.", "Paragraph two with inline code."],
  );
});
