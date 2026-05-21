import path from "node:path";

import { expect, test, saveBrowserScreenshot } from "./helpers.ts";

type CompanyRecord = { id: string; name: string };
type AgentRecord = { id: string; title: string };
type IssueRecord = { id: string; status: string };
type ReleaseRecord = { id: string; status: string };
type FeedbackRecord = { id: string; status: string; linkedIssueId?: string };
type IncidentRecord = { id: string; status: string };

async function getSelectedCompany(page: import("@playwright/test").Page): Promise<CompanyRecord> {
  const response = await page.request.get("/api/companies");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { companies: CompanyRecord[] };
  expect(payload.companies.length).toBeGreaterThan(0);
  return payload.companies[0]!;
}

test("organization cockpit backend flows work end-to-end", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("onboarding-dialog")).toBeVisible();
  await page.getByTestId("onboarding-get-started").click();
  await page.getByTestId("company-name-input").fill("Northstar Studio");
  await page.getByTestId("company-description-input").fill("Portfolio cockpit e2e test organization.");
  await page.getByTestId("create-company-button").click();
  await expect(page.getByTestId("onboarding-finish")).toBeVisible();
  await page.getByTestId("onboarding-finish").click();

  await expect(page.getByTestId("dashboard-page")).toBeVisible();
  await expect(page.getByTestId("metric-active-goals")).toContainText("1");
  await expect(page.getByTestId("metric-open-incidents")).toContainText("0");

  const company = await getSelectedCompany(page);

  const detailResponse = await page.request.get(`/api/companies/${company.id}`);
  expect(detailResponse.ok()).toBeTruthy();
  const detail = await detailResponse.json() as {
    company: CompanyRecord;
    portfolioItems: Array<{ id: string }>;
  };
  const portfolioItemId = detail.portfolioItems[0]?.id;
  expect(portfolioItemId).toBeTruthy();

  const agentResponse = await page.request.post(`/api/companies/${company.id}/agents`, {
    data: {
      name: "Ops Runner",
      role: "operator",
      title: "Operations Runner",
      capabilities: "Triage feedback and execute assigned work.",
      autonomyLevel: "act_limited",
      watchDomains: ["feedback", "operations"],
    },
  });
  expect(agentResponse.ok()).toBeTruthy();
  const agentPayload = await agentResponse.json() as { agent: AgentRecord };
  const agentId = agentPayload.agent.id;

  const feedbackResponse = await page.request.post(`/api/companies/${company.id}/feedback`, {
    data: {
      portfolioItemId,
      title: "Users report slower checkout after the latest update",
      body: "Several users mention regressions during payment on mobile.",
      sourceType: "review",
      priority: "high",
    },
  });
  expect(feedbackResponse.ok()).toBeTruthy();
  const feedbackPayload = await feedbackResponse.json() as { feedback: FeedbackRecord };

  const triageResponse = await page.request.post(`/api/feedback/${feedbackPayload.feedback.id}/triage`, {
    data: {
      actorAgentId: agentId,
      createIssueFromFeedback: true,
    },
  });
  expect(triageResponse.ok()).toBeTruthy();
  const triagePayload = await triageResponse.json() as {
    feedback: FeedbackRecord;
    issue: IssueRecord | null;
    run: { id: string } | null;
    comment: { id: string } | null;
  };
  expect(triagePayload.feedback.status).toBe("triaged");
  expect(triagePayload.issue?.id).toBeTruthy();
  expect(triagePayload.run?.id).toBeTruthy();
  expect(triagePayload.comment?.id).toBeTruthy();

  const releaseResponse = await page.request.post(`/api/companies/${company.id}/releases`, {
    data: {
      portfolioItemId,
      name: "Checkout stability patch",
      releaseType: "update",
      status: "planned",
      plannedAt: new Date().toISOString(),
    },
  });
  expect(releaseResponse.ok()).toBeTruthy();
  const releasePayload = await releaseResponse.json() as { release: ReleaseRecord };
  const shipResponse = await page.request.post(`/api/releases/${releasePayload.release.id}/ship`);
  expect(shipResponse.ok()).toBeTruthy();
  const shipped = await shipResponse.json() as { release: ReleaseRecord };
  expect(shipped.release.status).toBe("released");

  const incidentResponse = await page.request.post(`/api/companies/${company.id}/operational-incidents`, {
    data: {
      portfolioItemId,
      title: "Checkout error spike",
      severity: "sev2",
      summary: "Transient backend failures after deploy.",
    },
  });
  expect(incidentResponse.ok()).toBeTruthy();
  const incidentPayload = await incidentResponse.json() as { operationalIncident: IncidentRecord };
  const resolveResponse = await page.request.post(`/api/incidents/${incidentPayload.operationalIncident.id}/resolve`, {
    data: { resolution: "Rollback completed and alerts cleared.", force: true },
  });
  expect(resolveResponse.ok()).toBeTruthy();
  const resolved = await resolveResponse.json() as { incident: IncidentRecord; approval: null };
  expect(resolved.incident.status).toBe("resolved");

  const criticalIncidentResponse = await page.request.post(`/api/companies/${company.id}/operational-incidents`, {
    data: {
      portfolioItemId,
      title: "Critical payment outage",
      severity: "sev1",
      summary: "Requires explicit approval to close.",
    },
  });
  expect(criticalIncidentResponse.ok()).toBeTruthy();
  const criticalIncidentPayload = await criticalIncidentResponse.json() as { operationalIncident: IncidentRecord };
  const gatedResolveResponse = await page.request.post(`/api/incidents/${criticalIncidentPayload.operationalIncident.id}/resolve`, {
    data: { resolution: "Attempted close without approval." },
  });
  expect(gatedResolveResponse.ok()).toBeTruthy();
  const gatedResolve = await gatedResolveResponse.json() as { incident: IncidentRecord; approval: { id: string } | null };
  expect(gatedResolve.approval?.id).toBeTruthy();
  expect(gatedResolve.incident.status).toBe("open");

  const issueRunResponse = await page.request.post(`/api/issues/${triagePayload.issue!.id}/run`);
  expect(issueRunResponse.ok()).toBeTruthy();
  const issueRunText = await issueRunResponse.text();
  expect(issueRunText).toContain("\"done\":true");
  expect(issueRunText).toContain("STATUS: in_review");

  const summaryResponse = await page.request.post(`/api/companies/${company.id}/summary/recompute`);
  expect(summaryResponse.ok()).toBeTruthy();

  await page.reload();
  await expect(page.getByTestId("metric-open-incidents")).toContainText("1");
  await expect(page.getByTestId("metric-untriaged-feedback")).toContainText("0");
  await expect(page.getByTestId("metric-planned-releases")).toContainText("0");
  await expect(page.getByTestId("metric-pending-approvals")).toContainText("1");
  await expect(page.getByTestId("portfolio-watch-list")).toContainText("Northstar Studio primary initiative");

  const issueDetailResponse = await page.request.get(`/api/issues/${triagePayload.issue!.id}`);
  expect(issueDetailResponse.ok()).toBeTruthy();
  const issueDetail = await issueDetailResponse.json() as { issue: IssueRecord; comments: Array<{ body: string }> };
  expect(issueDetail.issue.status).toBe("in_review");
  expect(issueDetail.comments.some((comment) => comment.body.includes("STATUS: in_review"))).toBeTruthy();

  const fixturesResponse = await page.request.get(`/api/companies/${company.id}/fixtures`);
  expect(fixturesResponse.ok()).toBeTruthy();
  const fixtures = await fixturesResponse.json() as { detail: { summary: { openIncidents: { value: number } } } };
  expect(fixtures.detail.summary.openIncidents.value).toBe(1);

  const screenshotPath = await saveBrowserScreenshot(page, "company-cockpit-dashboard.png");
  expect(path.basename(screenshotPath)).toBe("company-cockpit-dashboard.png");
});

test("issue detail virtualizes long comment lists", async ({ page }) => {
  const now = new Date().toISOString();
  const comments = Array.from({ length: 160 }, (_, index) => ({
    id: `comment-${index + 1}`,
    companyId: "company-virtual",
    issueId: "issue-virtual",
    body: `Virtualized board comment ${index + 1}`,
    authorUserId: "board",
    createdAt: now,
    updatedAt: now,
  }));

  await page.route(/\/api\/companies$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        companies: [{ id: "company-virtual", name: "Virtual Company", issuePrefix: "VIR" }],
      }),
    });
  });
  await page.route("**/api/companies/company-virtual", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        company: { id: "company-virtual", name: "Virtual Company", issuePrefix: "VIR" },
        agents: [],
        issues: [],
        approvals: [],
        feedbackItems: [],
      }),
    });
  });
  await page.route("**/api/issues/issue-virtual", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        issue: {
          id: "issue-virtual",
          companyId: "company-virtual",
          identifier: "VIR-1",
          title: "Long comment thread",
          description: "Fixture issue with many comments.",
          status: "in_progress",
          priority: "high",
          createdAt: now,
          updatedAt: now,
        },
        comments,
      }),
    });
  });

  await page.goto("/issues/issue-virtual");
  await expect(page.getByText("Virtualized board comment 160")).toBeVisible();
  await expect.poll(async () => page.getByTestId("board-comment-row").count()).toBeLessThan(80);
});

test("dashboard and sidebar do not duplicate the full company detail payload", async ({ page }) => {
  const now = new Date().toISOString();
  let fullDetailRequests = 0;

  const metric = (label: string, value: number, href: string, tone = "neutral") => ({
    label,
    value,
    href,
    tone,
  });

  await page.route(/\/api\/companies$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        companies: [{
          id: "company-virtual",
          name: "Virtual Company",
          issuePrefix: "VIR",
          status: "active",
          issueCounter: 1,
          createdAt: now,
          updatedAt: now,
        }],
      }),
    });
  });
  await page.route("**/api/companies/company-virtual/sidebar", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        company: { id: "company-virtual", name: "Virtual Company", brandColor: "#0ea5e9" },
        pendingApprovalsCount: 1,
        untriagedFeedbackCount: 1,
      }),
    });
  });
  await page.route("**/api/companies/company-virtual/summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        company: {
          id: "company-virtual",
          name: "Virtual Company",
          issuePrefix: "VIR",
          issueCounter: 1,
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
        summary: {
          activeGoals: metric("Active goals", 1, "/goals"),
          projectsInProgress: metric("Projects in progress", 1, "/work"),
          pendingApprovals: metric("Pending approvals", 1, "/approvals", "warning"),
          runningRuns: metric("Running runs", 0, "/agents"),
          openIncidents: metric("Open incidents", 0, "/operations", "positive"),
          untriagedFeedback: metric("Untriaged feedback", 1, "/feedback", "warning"),
          plannedReleases: metric("Planned releases", 0, "/work"),
          itemsAtRisk: metric("Items at risk", 0, "/portfolio", "positive"),
          healthByItem: [],
          goalProgress: [],
          recentActivity: [],
        },
        recentIssues: [],
        pendingApprovals: [{ id: "approval-1", companyId: "company-virtual", type: "hire_agent", status: "pending", createdAt: now, updatedAt: now }],
        agents: [{ id: "agent-1", companyId: "company-virtual", name: "Board", role: "ceo", title: "CEO", status: "active", adapterType: "human", createdAt: now, updatedAt: now }],
      }),
    });
  });
  await page.route("**/api/companies/company-virtual", async (route) => {
    fullDetailRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ company: { id: "company-virtual", name: "Virtual Company" } }),
    });
  });

  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-page")).toBeVisible();
  await expect(page.getByTestId("sidebar")).toBeVisible();

  expect(fullDetailRequests).toBe(0);
});

test("rules tree, approval queue, and compile preview work end-to-end", async ({ page }) => {
  const companyResponse = await page.request.post("/api/companies", {
    data: {
      name: "Rules Studio",
      description: "Rules e2e organization.",
      brandColor: "#14b8a6",
    },
  });
  expect(companyResponse.ok()).toBeTruthy();

  await page.request.post("/api/rules", {
    data: {
      action: "scope",
      scope: { id: "northstar", kind: "brand", name: "Northstar Studio", aliases: ["NS", "North Star"] },
    },
  });
  await page.request.post("/api/rules", {
    data: {
      action: "scope",
      scope: { id: "northstar-website", kind: "output", name: "Website", parentId: "northstar", aliases: ["website", "site"] },
    },
  });

  const seedRules = [
    {
      id: "northstar-tone",
      title: "Northstar tone",
      kind: "directive",
      status: "active",
      scopeId: "northstar",
      content: "Use a concise, founder-led tone for Northstar Studio.",
      key: "tone",
    },
    {
      id: "northstar-logo",
      title: "Northstar logo",
      kind: "resource",
      status: "active",
      scopeId: "northstar",
      content: "Use the approved Northstar logo reference.",
      references: [{ kind: "asset", ref: "northstar-logo-primary", label: "primary logo" }],
      key: "logo",
    },
    {
      id: "northstar-type-default",
      title: "Northstar typography",
      kind: "default",
      status: "active",
      scopeId: "northstar",
      content: "Use Source Sans for general Northstar materials.",
      key: "typography",
    },
    {
      id: "northstar-website-type",
      title: "Northstar website typography",
      kind: "default",
      status: "active",
      scopeId: "northstar-website",
      content: "Use Inter for Northstar websites.",
      applyWhen: { outputFormats: ["website"] },
      key: "typography",
    },
    {
      id: "northstar-slides",
      title: "Northstar slide deck",
      kind: "directive",
      status: "active",
      scopeId: "northstar",
      content: "Use Keynote for Northstar slide decks.",
      applyWhen: { outputFormats: ["slides", "pdf"] },
      key: "slides",
    },
    {
      id: "northstar-pending",
      title: "Northstar pending website rule",
      kind: "directive",
      status: "pending",
      scopeId: "northstar-website",
      content: "Pending website rule is visible before approval.",
      applyWhen: { outputFormats: ["website"] },
      key: "pending-website",
    },
  ];

  for (const rule of seedRules) {
    const response = await page.request.post("/api/rules", { data: { action: "propose", rule } });
    expect(response.ok()).toBeTruthy();
  }

  const compiledResponse = await page.request.post("/api/rules", {
    data: {
      action: "compile",
      input: {
        prompt: "Create a site for NS.",
        brand: "North Star",
        outputFormat: "website",
        taskType: "website",
      },
    },
  });
  expect(compiledResponse.ok()).toBeTruthy();
  const compiled = await compiledResponse.json() as { prompt: string; overridden: Array<{ rule: { id: string } }>; omitted: Array<{ rule: { id: string }; reason: string }> };
  expect(compiled.prompt).toContain("Northstar tone");
  expect(compiled.prompt).toContain("Northstar website typography");
  expect(compiled.prompt).toContain("primary logo");
  expect(compiled.prompt).not.toContain("Keynote");
  expect(compiled.prompt).not.toContain("Source Sans");
  expect(compiled.overridden.some((entry) => entry.rule.id === "northstar-type-default")).toBeTruthy();
  expect(compiled.omitted.some((entry) => entry.rule.id === "northstar-pending" && entry.reason === "status:pending")).toBeTruthy();

  await page.goto("/rules");
  await expect(page.getByTestId("rules-page")).toBeVisible();
  await expect(page.getByTestId("rules-scope-tree")).toContainText("Northstar Studio");
  await expect(page.getByTestId("rules-scope-tree")).toContainText("Website");
  await expect(page.getByTestId("rules-pending-queue")).toContainText("Northstar pending website rule");
  await page.getByTestId("rules-approve-northstar-pending").click();
  await expect(page.getByTestId("rules-pending-count")).toContainText("0 pending");
  await page.getByTestId("rules-compile-input").fill("Create a website for North Star.");
  await page.getByRole("button", { name: "Compile" }).click();
  await expect(page.getByTestId("rules-compile-output")).toContainText("Northstar website typography");

  const screenshotPath = await saveBrowserScreenshot(page, "rules-page.png");
  expect(path.basename(screenshotPath)).toBe("rules-page.png");
});
