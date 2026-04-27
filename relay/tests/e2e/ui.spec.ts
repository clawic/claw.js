import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import WebSocket from "ws";

const TEST_BROWSER_FRAME = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1440" height="960" viewBox="0 0 1440 960">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#0f1720"/>
        <stop offset="100%" stop-color="#172554"/>
      </linearGradient>
    </defs>
    <rect width="1440" height="960" fill="url(#bg)"/>
    <rect x="84" y="78" width="1272" height="804" rx="24" fill="#f8fafc"/>
    <rect x="84" y="78" width="1272" height="56" rx="24" fill="#dbe4ee"/>
    <circle cx="122" cy="106" r="8" fill="#fb7185"/>
    <circle cx="146" cy="106" r="8" fill="#fbbf24"/>
    <circle cx="170" cy="106" r="8" fill="#34d399"/>
    <rect x="236" y="90" width="720" height="30" rx="15" fill="#ffffff"/>
    <text x="260" y="110" font-family="Arial, sans-serif" font-size="15" fill="#475569">http://localhost:4300/login</text>

    <rect x="420" y="210" width="600" height="540" rx="28" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
    <text x="720" y="286" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" fill="#0f172a">Shared Login</text>
    <text x="720" y="322" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#64748b">Human takeover on the same browser session</text>

    <text x="500" y="392" font-family="Arial, sans-serif" font-size="17" fill="#334155">Email</text>
    <rect x="500" y="408" width="440" height="56" rx="14" fill="#eef2f7"/>
    <text x="524" y="443" font-family="Arial, sans-serif" font-size="18" fill="#0f172a">admin@relay.local</text>

    <text x="500" y="520" font-family="Arial, sans-serif" font-size="17" fill="#334155">Password</text>
    <rect x="500" y="536" width="440" height="56" rx="14" fill="#eef2f7"/>
    <text x="524" y="571" font-family="Arial, sans-serif" font-size="18" fill="#0f172a">••••••••••••</text>

    <rect x="500" y="638" width="440" height="68" rx="18" fill="#0f172a"/>
    <text x="720" y="680" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#ffffff">Sign in</text>

    <rect x="1020" y="236" width="232" height="138" rx="18" fill="#e0f2fe"/>
    <text x="1136" y="282" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#075985">Local preview</text>
    <text x="1136" y="316" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#0369a1">Visible through Relay only</text>
    <rect x="1070" y="334" width="132" height="18" rx="9" fill="#38bdf8"/>
  </svg>
`).toString("base64");

function startBrowserConnector(baseUrl: string, connectorToken: string, agentId = "browser-ui-agent") {
  const session = {
    workspaceId: "main",
    active: false,
    status: "idle",
    navigation: {
      title: "Claw Browser",
      url: "",
      displayUrl: "Not started",
      isLocalUrl: false,
    },
    controller: null as null | {
      deviceId: string;
      userId: string;
      email?: string;
      acquiredAt: string;
    },
    viewport: { width: 1440, height: 960 },
    updatedAt: new Date().toISOString(),
  };
  let frameSeq = 0;

  const socket = new WebSocket(baseUrl.replace(/^http/, "ws") + "/v1/connector/connect", {
    headers: { Authorization: `Bearer ${connectorToken}` },
  });

  socket.on("open", () => {
    socket.send(JSON.stringify({
      type: "hello",
      payload: {
        tenantId: "demo-tenant",
        connectorId: agentId,
        agentId,
        version: "ui-test",
        capabilities: ["browser", "workspace"],
        workspaces: [{ workspaceId: "main", displayName: "Main" }],
      },
    }));
  });

  function emitState(reason: string) {
    session.updatedAt = new Date().toISOString();
    socket.send(JSON.stringify({
      type: "event",
      event: "browser.state",
      payload: {
        workspaceId: "main",
        reason,
        session,
      },
    }));
  }

  function emitFrame() {
    frameSeq += 1;
    socket.send(JSON.stringify({
      type: "event",
      event: "browser.frame",
      payload: {
        workspaceId: "main",
        seq: frameSeq,
        imageBase64: TEST_BROWSER_FRAME,
        mimeType: "image/svg+xml",
        capturedAt: new Date().toISOString(),
        viewport: session.viewport,
      },
    }));
  }

  socket.on("message", (buffer) => {
    const message = JSON.parse(buffer.toString()) as {
      type: string;
      requestId?: string;
      operation?: string;
      payload?: Record<string, any>;
    };
    if (message.type !== "invoke") return;
    const respond = (payload: Record<string, unknown>) => {
      socket.send(JSON.stringify({ type: "result", requestId: message.requestId, payload }));
    };

    switch (message.operation) {
      case "workspace.status":
        respond({ status: { workspaceId: "main", online: true } });
        return;
      case "browser.session.status":
        respond({ session });
        return;
      case "browser.session.ensure":
        session.active = true;
        session.status = "ready";
        session.navigation = {
          title: "Shared localhost login",
          url: String(message.payload?.initialUrl ?? "http://localhost:4300/login"),
          displayUrl: "Local preview",
          isLocalUrl: true,
        };
        respond({ session });
        emitState("session-ready");
        emitFrame();
        return;
      case "browser.control.acquire":
        session.controller = {
          deviceId: String(message.payload?.actor?.deviceId ?? "device"),
          userId: String(message.payload?.actor?.userId ?? "user"),
          ...(typeof message.payload?.actor?.email === "string" ? { email: message.payload.actor.email } : {}),
          acquiredAt: new Date().toISOString(),
        };
        respond({ session });
        emitState("control-acquired");
        return;
      case "browser.control.release":
        session.controller = null;
        respond({ session });
        emitState("control-released");
        return;
      case "browser.navigate":
        session.navigation = {
          title: "Remote page",
          url: String(message.payload?.url ?? ""),
          displayUrl: String(message.payload?.url ?? ""),
          isLocalUrl: false,
        };
        respond({ session });
        emitState("navigate");
        emitFrame();
        return;
      case "browser.input":
        respond({ session });
        emitFrame();
        return;
      default:
        respond({ ok: true });
    }
  });

  return socket;
}

async function loginApi(email: string, password: string) {
  const response = await fetch("http://127.0.0.1:4410/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, tenantId: "demo-tenant" }),
  });
  return await response.json() as { accessToken: string };
}

test("relay login keeps the short product name", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle("Relay");
  await expect(page.locator(".cb-login-brand")).toHaveText("Relay");

  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/agents");
  await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();

  const outputDir = path.join(process.cwd(), "output", "playwright");
  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({
    path: path.join(outputDir, "relay-brand-e2e.png"),
    fullPage: true,
  });
});

test("relay shared browser opens in an immersive standalone view", async ({ page }) => {
  const admin = await loginApi("admin@relay.local", "relay-admin");
  const enrollment = await fetch("http://127.0.0.1:4410/v1/admin/connectors/enrollments", {
    method: "POST",
    headers: {
      authorization: `Bearer ${admin.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      tenantId: "demo-tenant",
      agentId: "browser-ui-agent",
      description: "browser ui test",
    }),
  }).then(async (response) => await response.json() as { enrollmentToken: string });
  const connectorToken = await fetch("http://127.0.0.1:4410/v1/connector/enroll", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enrollmentToken: enrollment.enrollmentToken }),
  }).then(async (response) => (await response.json() as { connectorToken: string }).connectorToken);

  const socket = startBrowserConnector("http://127.0.0.1:4410", connectorToken);
  await new Promise((resolve) => socket.once("message", () => resolve(null)));

  try {
    await page.goto("/browser/demo-tenant/browser-ui-agent/main");
    await page.waitForURL("**/login");
    await page.getByTestId("login-submit").click();
    await page.waitForURL("**/browser/demo-tenant/browser-ui-agent/main");

    await expect(page.getByTestId("immersive-browser-shell")).toBeVisible();
    await page.getByTestId("browser-start").click();
    await expect(page.getByTestId("browser-status")).toContainText("Connected");
    await expect(page.getByTestId("browser-display-url")).toContainText("Local preview");
    await expect(page.getByTestId("browser-frame")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agents" })).toHaveCount(0);

    await page.getByTestId("browser-take-control").click();
    await expect(page.locator("text=admin@relay.local")).toBeVisible();

    await page.getByTestId("browser-release-control").click();
    await expect(page.locator("text=No controller")).toBeVisible();

    const outputDir = path.join(process.cwd(), "output", "playwright");
    fs.mkdirSync(outputDir, { recursive: true });
    await page.screenshot({
      path: path.join(outputDir, "relay-browser-immersive-e2e.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("browser-frame")).toBeVisible();
    await page.screenshot({
      path: path.join(outputDir, "relay-browser-immersive-mobile-e2e.png"),
      fullPage: true,
    });
  } finally {
    socket.close();
  }
});

test("relay monitor renders a live session transcript", async ({ page }) => {
  await page.route("**/v1/tenants/demo-tenant/monitor/stream**", async (route) => {
    const now = Date.now();
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
      },
      body: [
        "event: monitor.snapshot",
        `data: ${JSON.stringify({
          tenantId: "demo-tenant",
          clientId: "viewer-e2e",
          openedSessionId: "mon-session",
          agents: [{ agentId: "codex-monitor", displayName: "Codex Monitor", status: "online", version: "e2e", capabilities: ["sessions"] }],
          activity: [{ tenantId: "demo-tenant", agentId: "codex-monitor", workspaceId: "main", capability: "sessions.stream", status: "success", detail: "stream started", createdAt: now }],
          attachedClients: [{ clientId: "viewer-e2e", openedSessionId: "mon-session", attachedAt: now }],
          ts: now,
        })}`,
        "",
        "event: monitor.session.start",
        `data: ${JSON.stringify({ tenantId: "demo-tenant", agentId: "codex-monitor", workspaceId: "main", sessionId: "mon-session", startedAt: now, snippet: "audit this flow" })}`,
        "",
        "event: monitor.session.delta",
        `data: ${JSON.stringify({ tenantId: "demo-tenant", agentId: "codex-monitor", workspaceId: "main", sessionId: "mon-session", delta: "Live monitor transcript" })}`,
        "",
        "event: monitor.session.end",
        `data: ${JSON.stringify({ tenantId: "demo-tenant", agentId: "codex-monitor", workspaceId: "main", sessionId: "mon-session", reason: "complete", durationMs: 42 })}`,
        "",
        "",
      ].join("\n"),
    });
  });

  await page.goto("/login");
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/agents");
  await page.getByRole("link", { name: /Monitor/ }).click();
  await expect(page.getByRole("heading", { name: "Monitor" })).toBeVisible();
  await expect(page.getByText("codex-monitor", { exact: true })).toBeVisible();
  await expect(page.getByText("Live monitor transcript", { exact: true })).toBeVisible();
  await expect(page.getByText("stream started").first()).toBeVisible();

  const outputDir = path.join(process.cwd(), "output", "playwright");
  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({
    path: path.join(outputDir, "relay-monitor-e2e.png"),
    fullPage: true,
  });
});
