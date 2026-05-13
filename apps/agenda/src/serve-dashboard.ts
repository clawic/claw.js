import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createDashboard, resolveRoot, parseArgv } from "./dashboard.js";

const { flags } = parseArgv(process.argv.slice(2));
const rootDir = resolveRoot(flags);
const PORT = Number(flags.port) || 3737;
const HTML = readFileSync(path.join(import.meta.dirname, "app.html"), "utf8");

async function getClaw() {
  return createDashboard(rootDir);
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString());
}

function json(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function matchRoute(method: string, url: string, pattern: string): string | null {
  if (method === "PATCH" || method === "POST") {
    const regex = new RegExp(`^${pattern.replace(":id", "([^/]+)")}$`);
    const m = url.match(regex);
    return m ? m[1] ?? "" : null;
  }
  return null;
}

function numberOrUndefined(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : undefined;
}

const server = http.createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
  const url = requestUrl.pathname;

  try {
    if (method === "GET" && url === "/v1/health") {
      return json(res, 200, {
        ok: true,
        service: "claw-day",
        rootDir,
      });
    }

    // ── List all ──
    if (method === "GET" && url === "/api/data") {
      const claw = await getClaw();
      const [
        projects,
        goals,
        tasks,
        milestones,
        notes,
        lists,
        sections,
        comments,
        attachments,
        savedViews,
        recurrences,
        cycles,
        epics,
        customFields,
        fieldValues,
        templates,
        reminders,
        deadlines,
      ] = await Promise.all([
        claw.projects.list({ includeArchived: false, limit: 200 }),
        claw.goals.list({ includeArchived: false, limit: 200 }),
        claw.tasks.list({ includeArchived: false, limit: 400 }),
        claw.milestones.list({ includeArchived: false, limit: 200 }),
        claw.notes.list({ includeArchived: false, limit: 50 }),
        claw.lists.list({ includeArchived: false, limit: 100 }),
        claw.sections.list({ includeArchived: false, limit: 100 }),
        claw.comments.list({ includeArchived: false, limit: 200 }),
        claw.attachments.list({ includeArchived: false, limit: 200 }),
        claw.savedViews.list({ includeArchived: false, limit: 100 }),
        claw.recurrences.list({ includeArchived: false, limit: 100 }),
        claw.cycles.list({ includeArchived: false, limit: 100 }),
        claw.epics.list({ includeArchived: false, limit: 100 }),
        claw.customFields.list({ includeArchived: false, limit: 100 }),
        claw.fieldValues.list({ includeArchived: false, limit: 200 }),
        claw.templates.list({ includeArchived: false, limit: 100 }),
        claw.reminders.list({ includeArchived: false, limit: 100 }),
        claw.deadlines.list({ includeArchived: false, limit: 100 }),
      ]);
      return json(res, 200, {
        projects,
        goals,
        tasks,
        milestones,
        notes,
        lists,
        sections,
        comments,
        attachments,
        savedViews,
        recurrences,
        cycles,
        epics,
        customFields,
        fieldValues,
        templates,
        reminders,
        deadlines,
      });
    }

    if (method === "GET" && url === "/api/timeline") {
      const claw = await getClaw();
      const mode = requestUrl.searchParams.get("mode") === "day" ? "day" : "week";
      const startParam = requestUrl.searchParams.get("start");
      const start = startParam ? new Date(startParam) : new Date();
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + (mode === "week" ? 7 : 1));
      end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
      const projectId = requestUrl.searchParams.get("projectId") || undefined;
      const timeline = await claw.productivity.timeline({
        start: start.toISOString(),
        end: end.toISOString(),
        projectId,
        includeDone: requestUrl.searchParams.get("includeDone") === "true",
      });
      return json(res, 200, { mode, ...timeline });
    }

    // ── Planning primitives ──
    if (method === "POST" && url === "/api/lists") {
      const claw = await getClaw();
      const body = await readBody(req);
      const result = await claw.lists.create({
        title: body.title,
        kind: body.kind ?? "custom",
        description: body.description,
        areaId: body.areaId || undefined,
        projectId: body.projectId || undefined,
        rank: numberOrUndefined(body.rank),
        filter: body.filter,
      });
      return json(res, 201, result);
    }

    if (method === "POST" && url === "/api/sections") {
      const claw = await getClaw();
      const body = await readBody(req);
      const result = await claw.sections.create({
        title: body.title,
        description: body.description,
        listId: body.listId || undefined,
        projectId: body.projectId || undefined,
        areaId: body.areaId || undefined,
        rank: numberOrUndefined(body.rank),
      });
      return json(res, 201, result);
    }

    if (method === "POST" && url === "/api/cycles") {
      const claw = await getClaw();
      const body = await readBody(req);
      const result = await claw.cycles.create({
        name: body.name,
        status: body.status ?? "planned",
        description: body.description,
        projectId: body.projectId || undefined,
        goalId: body.goalId || undefined,
        startsAt: body.startsAt || undefined,
        endsAt: body.endsAt || undefined,
        capacityPoints: numberOrUndefined(body.capacityPoints),
        taskIds: stringArray(body.taskIds),
      });
      return json(res, 201, result);
    }

    if (method === "POST" && url === "/api/epics") {
      const claw = await getClaw();
      const body = await readBody(req);
      const result = await claw.epics.create({
        title: body.title,
        kind: body.kind ?? "epic",
        status: body.status ?? "planned",
        description: body.description,
        projectId: body.projectId || undefined,
        goalId: body.goalId || undefined,
        ownerPersonId: body.ownerPersonId || undefined,
        rank: numberOrUndefined(body.rank),
        targetDate: body.targetDate || undefined,
        healthStatus: body.healthStatus || undefined,
        taskIds: stringArray(body.taskIds),
      });
      return json(res, 201, result);
    }

    if (method === "POST" && url === "/api/saved-views") {
      const claw = await getClaw();
      const body = await readBody(req);
      const result = await claw.savedViews.create({
        name: body.name,
        domain: body.domain ?? "tasks",
        query: body.query,
        filters: body.filters,
        sort: body.sort,
        groupBy: body.groupBy,
        favorite: Boolean(body.favorite),
        rank: numberOrUndefined(body.rank),
      });
      return json(res, 201, result);
    }

    if (method === "POST" && url === "/api/recurrences") {
      const claw = await getClaw();
      const body = await readBody(req);
      const result = await claw.recurrences.create({
        title: body.title,
        status: body.status ?? "active",
        rule: body.rule,
        timezone: body.timezone,
        anchorType: body.anchorType || undefined,
        anchorId: body.anchorId || undefined,
        nextRunAt: body.nextRunAt || undefined,
      });
      return json(res, 201, result);
    }

    if (method === "POST" && url === "/api/milestones") {
      const claw = await getClaw();
      const body = await readBody(req);
      const result = await claw.milestones.create({
        title: body.title,
        description: body.description,
        status: body.status ?? "planned",
        areaId: body.areaId || undefined,
        projectId: body.projectId || undefined,
        goalId: body.goalId || undefined,
        targetDate: body.targetDate || undefined,
      });
      return json(res, 201, result);
    }

    if (method === "PATCH") {
      const milestoneId = matchRoute(method, url, "/api/milestones/:id");
      if (milestoneId) {
        const claw = await getClaw();
        const body = await readBody(req);
        const result = await claw.milestones.update(milestoneId, body);
        return json(res, 200, result);
      }
    }

    // ── Projects ──
    if (method === "POST" && url === "/api/projects") {
      const claw = await getClaw();
      const body = await readBody(req);
      const result = await claw.projects.create({
        name: body.name,
        description: body.description,
        status: body.status ?? "in_progress",
        kind: body.kind,
        healthStatus: body.healthStatus ?? "green",
        rank: numberOrUndefined(body.rank),
        statusCategory: body.statusCategory,
        startAt: body.startAt || undefined,
        targetDate: body.targetDate || undefined,
        deadlineAt: body.deadlineAt || undefined,
        templateId: body.templateId || undefined,
        reviewAt: body.reviewAt || undefined,
        reviewCadence: body.reviewCadence,
        archiveReason: body.archiveReason,
        defaultSectionIds: stringArray(body.defaultSectionIds),
      });
      return json(res, 201, result);
    }

    if (method === "PATCH") {
      const projectId = matchRoute(method, url, "/api/projects/:id");
      if (projectId) {
        const claw = await getClaw();
        const body = await readBody(req);
        const result = await claw.projects.update(projectId, body);
        return json(res, 200, result);
      }
    }

    // ── Goals ──
    if (method === "POST" && url === "/api/goals") {
      const claw = await getClaw();
      const body = await readBody(req);
      const result = await claw.goals.create({
        title: body.title,
        description: body.description,
        status: body.status ?? "active",
        level: body.level ?? "personal",
        projectId: body.projectId || undefined,
        metricLabel: body.metricLabel,
        targetValue: body.targetValue ? Number(body.targetValue) : undefined,
        currentValue: body.currentValue ? Number(body.currentValue) : undefined,
        unit: body.unit,
        healthStatus: body.healthStatus ?? "green",
      });
      return json(res, 201, result);
    }

    if (method === "PATCH") {
      const goalId = matchRoute(method, url, "/api/goals/:id");
      if (goalId) {
        const claw = await getClaw();
        const body = await readBody(req);
        if (body.targetValue !== undefined) body.targetValue = Number(body.targetValue);
        if (body.currentValue !== undefined) body.currentValue = Number(body.currentValue);
        const result = await claw.goals.update(goalId, body);
        return json(res, 200, result);
      }
    }

    // ── Tasks ──
    if (method === "POST" && url === "/api/tasks") {
      const claw = await getClaw();
      const body = await readBody(req);
      const labels: string[] = body.labels ?? [];
      if (body.today && !labels.includes("today")) labels.push("today");
      const result = await claw.tasks.create({
        title: body.title,
        description: body.description,
        status: body.status ?? "todo",
        type: body.type,
        priority: body.priority ?? "medium",
        rank: numberOrUndefined(body.rank),
        labels,
        listId: body.listId || undefined,
        sectionId: body.sectionId || undefined,
        cycleId: body.cycleId || undefined,
        epicId: body.epicId || undefined,
        startAt: body.startAt || undefined,
        dependsOnTaskIds: stringArray(body.dependsOnTaskIds),
        deferUntil: body.deferUntil || undefined,
        dueAt: body.dueAt || undefined,
        deadlineAt: body.deadlineAt || undefined,
        snoozedUntil: body.snoozedUntil || undefined,
        recurrenceRule: body.recurrenceRule || undefined,
        storyPoints: numberOrUndefined(body.storyPoints),
        waitingOn: body.waitingOn,
        projectId: body.projectId || undefined,
        goalId: body.goalId || undefined,
        commentIds: stringArray(body.commentIds),
        attachmentIds: stringArray(body.attachmentIds),
      });
      return json(res, 201, result);
    }

    if (method === "PATCH") {
      const taskId = matchRoute(method, url, "/api/tasks/:id");
      if (taskId) {
        const claw = await getClaw();
        const body = await readBody(req);
        if (body.status === "done") {
          const result = await claw.tasks.complete(taskId);
          return json(res, 200, result);
        }
        const result = await claw.tasks.update(taskId, body);
        return json(res, 200, result);
      }
    }

    // ── Collaboration / metadata primitives ──
    if (method === "POST" && url === "/api/comments") {
      const claw = await getClaw();
      const body = await readBody(req);
      const result = await claw.comments.create({
        entityType: body.entityType,
        entityId: body.entityId,
        body: body.body,
        authorPersonId: body.authorPersonId || undefined,
        authorAgentId: body.authorAgentId || undefined,
        visibility: body.visibility,
      });
      return json(res, 201, result);
    }

    if (method === "POST" && url === "/api/attachments") {
      const claw = await getClaw();
      const body = await readBody(req);
      const result = await claw.attachments.create({
        title: body.title,
        entityType: body.entityType,
        entityId: body.entityId,
        name: body.name,
        mimeType: body.mimeType,
        uri: body.uri,
        path: body.path,
        sizeBytes: numberOrUndefined(body.sizeBytes),
        preview: body.preview,
        uploadedBy: body.uploadedBy,
      });
      return json(res, 201, result);
    }

    if (method === "POST" && url === "/api/custom-fields") {
      const claw = await getClaw();
      const body = await readBody(req);
      const result = await claw.customFields.create({
        name: body.name,
        entityType: body.entityType,
        fieldType: body.fieldType,
        description: body.description,
        options: Array.isArray(body.options) ? body.options : undefined,
        required: Boolean(body.required),
        rank: numberOrUndefined(body.rank),
      });
      return json(res, 201, result);
    }

    if (method === "POST" && url === "/api/field-values") {
      const claw = await getClaw();
      const body = await readBody(req);
      const result = await claw.fieldValues.create({
        fieldId: body.fieldId,
        entityType: body.entityType,
        entityId: body.entityId,
        value: body.value,
      });
      return json(res, 201, result);
    }

    if (method === "POST" && url === "/api/templates") {
      const claw = await getClaw();
      const body = await readBody(req);
      const result = await claw.templates.create({
        name: body.name,
        entityType: body.entityType,
        status: body.status ?? "active",
        description: body.description,
        body: body.body,
        rank: numberOrUndefined(body.rank),
      });
      return json(res, 201, result);
    }

    // ── Notes / Logs ──
    if (method === "POST" && url === "/api/notes") {
      const claw = await getClaw();
      const body = await readBody(req);
      const now = new Date();
      const result = await claw.notes.create({
        title: body.title ?? `Log ${now.toISOString().replace("T", " ").slice(0, 16)}`,
        content: body.content,
        tags: body.tags ?? ["day-log"],
      });
      return json(res, 201, result);
    }

    // ── HTML app ──
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
  } catch (err: any) {
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
