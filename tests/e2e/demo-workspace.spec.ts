import { expect, resetDemoState, saveArtifactScreenshot, test } from "./fixtures";

test("notes CRUD persists across reloads", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/notes");
  await expect(page.getByTestId("notes-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("notes-create-button").click();
  await expect(page.getByTestId("notes-title-input")).toBeVisible();

  await page.getByTestId("notes-title-input").fill("Release cutover checklist");
  await page.getByTestId("notes-folder-input").fill("Operations");
  await page.getByTestId("notes-tags-input").fill("release, smoke");
  await page.getByTestId("notes-editor-content").fill("Validate smoke suite before cutting the release.");
  await page.getByTestId("notes-save-button").click();

  await page.reload();
  await expect(page.getByTestId("notes-page")).toBeVisible({ timeout: 20_000 });

  const createdNote = page.getByTestId("note-list-item").filter({ hasText: "Release cutover checklist" });
  await expect(createdNote).toHaveCount(1);
  await createdNote.first().click();
  await expect(page.getByTestId("notes-editor-content")).toHaveValue(/Validate smoke suite/);

  await saveArtifactScreenshot(page, "notes-crud.png");

  await page.getByTestId("notes-delete-button").click();
  await expect(page.getByTestId("note-list-item").filter({ hasText: "Release cutover checklist" })).toHaveCount(0);
});

test("tasks and goals move across columns and persist", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/tasks");
  await expect(page.getByTestId("tasks-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("my-work-panel")).toBeVisible();
  await expect(page.getByTestId("team-work-panel")).toBeVisible();
  await expect(page.getByTestId("operations-cockpit-panel")).toBeVisible();
  await expect(page.getByTestId("my-work-stat-triage")).not.toContainText("0");
  await expect(page.getByTestId("team-work-stat-approvals")).not.toContainText("0");
  await expect(page.getByTestId("operations-cockpit-stat-releases")).not.toContainText("0");

  await page.getByTestId("operations-release-title-input").fill("Ops launch cutover");
  await page.getByTestId("operations-release-add-button").click();
  await expect(page.getByTestId("operations-release-item").filter({ hasText: "Ops launch cutover" })).toHaveCount(1);

  await page.getByTestId("operations-incident-title-input").fill("Payments rollback risk");
  await page.getByTestId("operations-incident-severity-select").selectOption("sev1");
  await page.getByTestId("operations-incident-release-select").selectOption({ label: "Ops launch cutover" });
  await page.getByTestId("operations-incident-add-button").click();
  await expect(page.getByTestId("operations-incident-item").filter({ hasText: "Payments rollback risk" })).toHaveCount(1);

  await page.getByTestId("operations-feedback-title-input").fill("Support escalation from early access");
  await page.getByTestId("operations-feedback-origin-select").selectOption("support");
  await page.getByTestId("operations-feedback-incident-select").selectOption({ label: "Payments rollback risk" });
  await page.getByTestId("operations-feedback-add-button").click();
  await expect(page.getByTestId("operations-feedback-item").filter({ hasText: "Support escalation from early access" })).toHaveCount(1);

  await page.getByTestId("operations-check-title-input").fill("Rollback readiness check");
  await page.getByTestId("operations-check-kind-select").selectOption("release_readiness");
  await page.getByTestId("operations-check-release-select").selectOption({ label: "Ops launch cutover" });
  await page.getByTestId("operations-check-incident-select").selectOption({ label: "Payments rollback risk" });
  await page.getByTestId("operations-check-add-button").click();
  await expect(page.getByTestId("operations-check-item").filter({ hasText: "Rollback readiness check" })).toHaveCount(1);

  await page.getByTestId("tasks-add-goal-button").click();
  await page.getByTestId("tasks-goal-title-input").fill("Plan the spring launch");
  await page.getByTestId("tasks-goal-add-confirm").click();
  await expect(page.getByText("Plan the spring launch")).toBeVisible();

  await page.getByTestId("tasks-column-add-backlog").click();
  await page.getByTestId("tasks-new-title-input").fill("Close remaining browser gaps");
  await page.getByTestId("tasks-new-priority-select").selectOption("urgent");
  await page.getByTestId("tasks-new-add-button").click();

  const taskCard = page.getByTestId("task-card").filter({ hasText: "Close remaining browser gaps" });
  await expect(taskCard).toHaveCount(1);
  await taskCard.first().click();

  await expect(page.getByTestId("task-detail-panel")).toBeVisible();
  await page.getByText("Click to add description...").click();
  await page.getByTestId("task-detail-description-input").fill("Track the remaining pages and move them to the blocking suite.");
  await page.getByTestId("task-detail-save-button").click();
  await page.getByTestId("task-detail-goal-select").selectOption({ label: "Plan the spring launch" });
  await page.getByTestId("task-detail-label-input").fill("blocking");
  await page.getByTestId("task-detail-label-input").press("Enter");
  await page.getByTestId("task-blocker-title-input").fill("Waiting on QA sign-off");
  await page.getByTestId("task-blocker-kind-select").selectOption("waiting_human");
  await page.getByTestId("task-blocker-add-button").click();
  await expect(page.getByTestId("task-blocker-item").filter({ hasText: "Waiting on QA sign-off" })).toHaveCount(1);
  await page.getByTestId("task-artifact-title-input").fill("Final staging screenshot");
  await page.getByTestId("task-artifact-kind-select").selectOption("screenshot");
  await page.getByTestId("task-artifact-summary-input").fill("Proof for the release checklist");
  await page.getByTestId("task-artifact-add-button").click();
  await expect(page.getByTestId("task-artifact-item").filter({ hasText: "Final staging screenshot" })).toHaveCount(1);
  await page.getByTestId("task-decision-title-input").fill("Ship from the existing task view");
  await page.getByTestId("task-decision-status-select").selectOption("accepted");
  await page.getByTestId("task-decision-summary-input").fill("Avoid opening a second productivity route.");
  await page.getByTestId("task-decision-add-button").click();
  await expect(page.getByTestId("task-decision-item").filter({ hasText: "Ship from the existing task view" })).toHaveCount(1);
  await page.getByTestId("task-assignment-title-input").fill("Reviewer owns the release gate");
  await page.getByTestId("task-assignment-agent-input").fill("reviewer");
  await page.getByTestId("task-assignment-add-button").click();
  await expect(page.getByTestId("task-assignment-item").filter({ hasText: "Reviewer owns the release gate" })).toHaveCount(1);
  await page.getByTestId("task-assignment-accept-button").last().click();
  await page.getByTestId("task-handoff-title-input").fill("Pass release validation to reviewer");
  await page.getByTestId("task-handoff-agent-input").fill("reviewer");
  await page.getByTestId("task-handoff-add-button").click();
  await expect(page.getByTestId("task-handoff-item").filter({ hasText: "Pass release validation to reviewer" })).toHaveCount(1);
  await page.getByTestId("task-handoff-accept-button").last().click();
  await page.getByTestId("task-approval-title-input").fill("Approve publish gate");
  await page.getByTestId("task-approval-kind-select").selectOption("publish");
  await page.getByTestId("task-approval-add-button").click();
  await expect(page.getByTestId("task-approval-item").filter({ hasText: "Approve publish gate" })).toHaveCount(1);
  await page.getByTestId("task-approval-approve-button").last().click();
  await page.getByTestId("task-focus-start-button").click();
  await expect(page.getByTestId("task-active-session")).toContainText("Focus:");
  await page.getByTestId("task-focus-complete-button").click();
  await page.getByTestId("task-handoff-complete-button").last().click();
  await page.getByTestId("task-blocker-resolve-button").last().click();
  await page.getByTestId("task-status-done").click();

  await page.reload();
  await expect(page.getByTestId("tasks-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("tasks-column-done").getByText("Close remaining browser gaps")).toBeVisible();
  await expect(page.getByTestId("operations-release-item").filter({ hasText: "Ops launch cutover" })).toHaveCount(1);
  await expect(page.getByTestId("operations-incident-item").filter({ hasText: "Payments rollback risk" })).toHaveCount(1);
  await expect(page.getByTestId("operations-feedback-item").filter({ hasText: "Support escalation from early access" })).toHaveCount(1);
  await expect(page.getByTestId("operations-check-item").filter({ hasText: "Rollback readiness check" })).toHaveCount(1);
  await saveArtifactScreenshot(page, "tasks-operations-cockpit.png");

  await page.getByTestId("task-card").filter({ hasText: "Close remaining browser gaps" }).first().click();
  await expect(page.getByTestId("task-artifact-item").filter({ hasText: "Final staging screenshot" })).toHaveCount(1);
  await expect(page.getByTestId("task-decision-item").filter({ hasText: "Ship from the existing task view" })).toHaveCount(1);
  await expect(page.getByTestId("task-assignment-item").filter({ hasText: "Reviewer owns the release gate" })).toHaveCount(1);
  await expect(page.getByTestId("task-approval-item").filter({ hasText: "Approve publish gate" })).toHaveCount(1);
  await expect(page.getByTestId("team-capacity-card").first()).toBeVisible();
  await page.getByTestId("task-detail-delete-button").click();
  await expect(page.getByTestId("task-card").filter({ hasText: "Close remaining browser gaps" })).toHaveCount(0);
});

test("memory entries can be added, filtered, and deleted", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/memory");
  await expect(page.getByTestId("memory-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("memory-add-button").click();
  await page.getByTestId("memory-title-input").fill("Regression playbook");
  await page.getByTestId("memory-content-input").fill("Document reproducible browser flows before every release.");
  await page.getByTestId("memory-source-input").fill("qa-docs");
  await page.getByTestId("memory-tags-input").fill("release, browser");
  await page.getByTestId("memory-save-button").click();

  await page.reload();
  await expect(page.getByTestId("memory-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("memory-search-input").fill("Regression playbook");
  const entry = page.getByTestId("memory-entry").filter({ hasText: "Regression playbook" });
  await expect(entry).toHaveCount(1);
  await page.getByTestId("memory-filter-knowledge").click();
  await entry.first().getByTestId("memory-entry-toggle").click();
  await entry.first().getByTestId("memory-delete-button").click();
  await expect(page.getByTestId("memory-entry").filter({ hasText: "Regression playbook" })).toHaveCount(0);
});

test("inbox supports unread filtering, replies, and deletion", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/inbox");
  await expect(page.getByTestId("inbox-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("inbox-unread-toggle").click();
  await expect(page.getByTestId("inbox-message-item")).toHaveCount(1);
  await page.getByTestId("inbox-message-item").first().click();

  await page.getByTestId("inbox-toggle-read-button").click();
  await expect(page.getByText("No unread messages")).toBeVisible();

  await page.getByTestId("inbox-unread-toggle").click();
  await expect(page.getByTestId("inbox-message-item").filter({ hasText: "Release checklist" })).toHaveCount(1);
  await expect(page.getByTestId("inbox-reply-input")).toBeVisible();
  await page.getByTestId("inbox-reply-input").fill("Reply from the hermetic inbox test.");
  await page.getByTestId("inbox-send-button").click();
  await expect(page.getByText("Reply sent")).toBeVisible();

  await page.getByTestId("inbox-delete-button").click();
  await page.reload();
  await expect(page.getByTestId("inbox-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("inbox-message-item").filter({ hasText: "Release checklist" })).toHaveCount(0);
});
