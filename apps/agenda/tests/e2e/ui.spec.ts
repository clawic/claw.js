import type { Page } from "@playwright/test";

import { expect, saveBrowserScreenshot, test } from "./helpers";

async function submitModal(page: Page) {
  await page.locator("#modal-body .btn.primary").click();
  await expect(page.locator("#modal-overlay")).not.toHaveClass(/open/, { timeout: 30_000 });
}

async function reloadDashboard(page: Page) {
  await page.waitForTimeout(1000);
  await expect(page.locator("#sec-projects h2")).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId("day-dashboard")).toBeVisible();
  await expect(page.locator("#sec-projects h2")).toBeVisible({ timeout: 30_000 });
}

test("day dashboard creates a daily task flow and progress log", async ({ page }) => {
  const runId = Date.now().toString(36);
  const projectName = `Cliente Atlas ${runId}`;
  const listTitle = `Today Board ${runId}`;
  const sectionTitle = `Deep Work ${runId}`;
  const cycleName = `Sprint 19 ${runId}`;
  const epicTitle = `UI productivity core ${runId}`;
  const milestoneTitle = `Beta marker ${runId}`;
  const taskTitle = `Preparar demo diaria ${runId}`;
  const dependentTaskTitle = `Publicar demo dependiente ${runId}`;
  const savedViewName = `Today Focus ${runId}`;
  const recurrenceTitle = `Review semanal ${runId}`;
  const templateName = `Launch checklist ${runId}`;

  await page.goto("/");
  await expect(page.getByTestId("day-dashboard")).toBeVisible();

  await page.getByTestId("new-project-button").click();
  await page.locator("#f-name").fill(projectName);
  await page.locator("#f-project-start").fill("2026-04-21");
  await page.locator("#f-target-date").fill("2026-04-24");
  await page.locator("#f-project-deadline").fill("2026-04-25");
  await submitModal(page);
  await reloadDashboard(page);
  await expect(page.locator("#sec-projects").getByTestId("project-row").filter({ hasText: projectName })).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("new-list-button").click();
  await page.locator("#f-title").fill(listTitle);
  await page.locator("#f-kind").selectOption("custom");
  await submitModal(page);
  await reloadDashboard(page);
  await expect(page.getByTestId("list-row").filter({ hasText: listTitle })).toHaveCount(1, { timeout: 30_000 });

  await page.getByTestId("new-section-button").click();
  await page.locator("#f-title").fill(sectionTitle);
  await page.locator("#f-list").selectOption({ label: listTitle });
  await page.locator("#f-project").selectOption({ label: projectName });
  await submitModal(page);
  await reloadDashboard(page);
  await expect(page.getByTestId("section-row").filter({ hasText: sectionTitle })).toHaveCount(1, { timeout: 30_000 });

  await page.getByTestId("new-cycle-button").click();
  await page.locator("#f-name").fill(cycleName);
  await page.locator("#f-status").selectOption("active");
  await page.locator("#f-capacity").fill("8");
  await page.locator("#f-start").fill("2026-04-21");
  await page.locator("#f-end").fill("2026-04-25");
  await page.locator("#f-project").selectOption({ label: projectName });
  await submitModal(page);
  await reloadDashboard(page);

  await page.getByTestId("new-epic-button").click();
  await page.locator("#f-title").fill(epicTitle);
  await page.locator("#f-kind").selectOption("initiative");
  await page.locator("#f-status").selectOption("active");
  await page.locator("#f-project").selectOption({ label: projectName });
  await submitModal(page);
  await reloadDashboard(page);

  await page.getByTestId("new-milestone-button").click();
  await page.locator("#f-title").fill(milestoneTitle);
  await page.locator("#f-project").selectOption({ label: projectName });
  await page.locator("#f-target-date").fill("2026-04-23");
  await submitModal(page);
  await reloadDashboard(page);

  await page.getByTestId("new-task-button").click();
  await page.locator("#f-title").fill(taskTitle);
  await page.locator("#f-type").selectOption("task");
  await page.locator("#f-priority").selectOption("high");
  await page.locator("#f-rank").fill("10");
  await page.locator("#f-project").selectOption({ label: projectName });
  await page.locator("#f-list").selectOption({ label: listTitle });
  await page.locator("#f-section").selectOption({ label: sectionTitle });
  await page.locator("#f-start").fill("2026-04-21");
  await page.locator("#f-due").fill("2026-04-22");
  await page.locator("#f-deadline").fill("2026-04-22");
  await page.locator("#f-story").fill("3");
  await page.locator("#f-recurrence").fill("FREQ=WEEKLY;BYDAY=FR");
  await page.locator("#f-today").check();
  await submitModal(page);

  const task = page.locator("#sec-focus").getByTestId("task-row").filter({ hasText: taskTitle });
  await expect(task).toBeVisible();
  await expect(task).toContainText(listTitle);
  await expect(task).toContainText(sectionTitle);
  await expect(task).toContainText("3 pts");

  await page.getByTestId("new-task-button").click();
  await page.locator("#f-title").fill(dependentTaskTitle);
  await page.locator("#f-priority").selectOption("high");
  await page.locator("#f-project").selectOption({ label: projectName });
  await page.locator("#f-start").fill("2026-04-22");
  await page.locator("#f-due").fill("2026-04-24");
  await page.locator("#f-deadline").fill("2026-04-24");
  await page.locator("#f-depends").selectOption({ label: taskTitle });
  await submitModal(page);

  const dataResponse = await page.request.get("/api/data");
  const data = await dataResponse.json();
  const createdTask = data.tasks.find((item: { title?: string }) => item.title === taskTitle);
  const createdProject = data.projects.find((item: { name?: string }) => item.name === projectName);
  expect(createdTask?.id).toBeTruthy();
  expect(createdProject?.id).toBeTruthy();
  await page.request.post("/api/comments", {
    data: { entityType: "task", entityId: createdTask.id, body: "Comentario visible", visibility: "internal" },
  });
  await page.request.post("/api/attachments", {
    data: { entityType: "task", entityId: createdTask.id, title: "Brief adjunto", mimeType: "text/markdown", uri: "file://brief.md" },
  });
  await page.request.post("/api/saved-views", {
    data: { name: savedViewName, domain: "tasks", query: "today", favorite: true },
  });
  await page.request.post("/api/recurrences", {
    data: { title: recurrenceTitle, rule: "FREQ=WEEKLY;BYDAY=FR", anchorType: "project", anchorId: createdProject.id },
  });
  await page.request.post("/api/custom-fields", {
    data: { name: "Impact", entityType: "task", fieldType: "select", options: ["low", "high"] },
  });
  const enriched = await (await page.request.get("/api/data")).json();
  const field = enriched.customFields.find((item: { name?: string }) => item.name === "Impact");
  await page.request.post("/api/field-values", {
    data: { fieldId: field.id, entityType: "task", entityId: createdTask.id, value: "high" },
  });
  await page.request.post("/api/templates", {
    data: { name: templateName, entityType: "project", body: { tasks: ["close loop"] } },
  });
  await page.reload();
  await expect(page.locator("#sec-focus").getByTestId("task-row").filter({ hasText: taskTitle }).filter({ hasText: "1 comments" })).toBeVisible();
  await expect(page.locator("#sec-focus").getByTestId("task-row").filter({ hasText: taskTitle }).filter({ hasText: "1 files" })).toBeVisible();

  await page.getByTestId("tab-planning").click();
  await expect(page.getByTestId("list-row").filter({ hasText: listTitle })).toBeVisible();
  await expect(page.getByTestId("section-row").filter({ hasText: sectionTitle })).toBeVisible();
  await expect(page.getByTestId("cycle-row").filter({ hasText: cycleName })).toBeVisible();
  await expect(page.getByTestId("epic-row").filter({ hasText: epicTitle })).toBeVisible();
  await expect(page.getByTestId("milestone-row").filter({ hasText: milestoneTitle })).toBeVisible();
  await expect(page.getByTestId("saved-view-row").filter({ hasText: savedViewName })).toBeVisible();
  await expect(page.getByTestId("recurrence-row").filter({ hasText: recurrenceTitle })).toBeVisible();
  await expect(page.getByTestId("template-row").filter({ hasText: templateName })).toBeVisible();
  await saveBrowserScreenshot(page, "day-dashboard-planning.png");

  await page.getByTestId("tab-timeline").click();
  await page.getByTestId("timeline-start").fill("2026-04-21");
  await page.getByTestId("timeline-start").dispatchEvent("change");
  await expect(page.getByTestId("timeline-project").filter({ hasText: projectName })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("timeline-task-bar").filter({ hasText: taskTitle })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("timeline-task-bar").filter({ hasText: dependentTaskTitle })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="timeline-task-bar"][data-readiness="blocked"]').filter({ hasText: dependentTaskTitle })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(`[data-testid="timeline-milestone-marker"][title="${milestoneTitle}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-deadline-marker"][title="${dependentTaskTitle} due"]`)).toBeVisible();
  await expect(page.getByTestId("timeline-now-blocked").filter({ hasText: dependentTaskTitle })).toBeVisible();
  await page.getByTestId("timeline-project-filter").selectOption({ label: projectName });
  await expect(page.getByTestId("timeline-project")).toHaveCount(1);
  await page.getByTestId("timeline-readiness-filter").selectOption("blocked");
  await expect(page.locator('[data-testid="timeline-task-bar"][data-readiness="blocked"]').filter({ hasText: dependentTaskTitle })).toBeVisible();
  await saveBrowserScreenshot(page, "day-dashboard-timeline-blocked.png");

  await page.getByTestId("tab-collaboration").click();
  await expect(page.getByTestId("comment-row").filter({ hasText: "Comentario visible" })).toBeVisible();
  await expect(page.getByTestId("attachment-row").filter({ hasText: "Brief adjunto" })).toBeVisible();
  await expect(page.getByTestId("custom-field-row").filter({ hasText: "Impact" })).toBeVisible();
  await expect(page.getByTestId("field-value-row").filter({ hasText: "high" })).toBeVisible();
  await saveBrowserScreenshot(page, "day-dashboard-collaboration.png");

  await page.getByTestId("tab-system").click();
  await expect(page.getByTestId("system-card").filter({ hasText: "Tasks" })).toBeVisible();
  await expect(page.getByTestId("system-card").filter({ hasText: "Epics" })).toBeVisible();
  await saveBrowserScreenshot(page, "day-dashboard-system.png");

  await page.getByTestId("tab-today").click();
  await task.hover();
  await task.getByTestId("task-start-button").click();
  await expect(task).toContainText("In progress");

  await task.hover();
  await task.getByTestId("task-done-button").click();
  await expect(page.locator("#sec-done")).toContainText(taskTitle);

  await page.getByTestId("tab-timeline").click();
  await page.getByTestId("timeline-readiness-filter").selectOption("ready");
  await expect(page.locator('[data-testid="timeline-task-bar"][data-readiness="ready"]').filter({ hasText: dependentTaskTitle })).toBeVisible();
  await expect(page.getByTestId("timeline-now-ready").filter({ hasText: dependentTaskTitle })).toBeVisible();
  await saveBrowserScreenshot(page, "day-dashboard-timeline.png");

  await page.getByTestId("tab-today").click();
  await page.getByTestId("quick-log-input").fill("Demo diaria cerrada.");
  await page.getByTestId("quick-log-submit").click();
  await expect(page.locator("#sec-logs").getByTestId("log-row").filter({ hasText: "Demo diaria cerrada." })).toBeVisible();
  await expect(page.locator("#toast")).not.toHaveClass(/show/);

  await saveBrowserScreenshot(page, "day-dashboard.png");
});
