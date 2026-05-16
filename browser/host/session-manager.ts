import { createHash } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { chromium, type BrowserContext, type Page } from "playwright";

import {
  type BrowserActor,
  type BrowserController,
  type BrowserFrameEvent,
  type BrowserInputCommand,
  type BrowserSessionSnapshot,
  type BrowserStateEvent,
  type BrowserViewport,
} from "../shared/types.ts";
import { describeBrowserLocation } from "../shared/url.ts";

interface BrowserSessionControllerOptions {
  idleTtlMs?: number;
  screenshotDebounceMs?: number;
  viewport?: BrowserViewport;
  onState?: (event: BrowserStateEvent) => void;
  onFrame?: (event: BrowserFrameEvent) => void;
}

interface BrowserSession {
  workspaceId: string;
  workspaceDir: string;
  context: BrowserContext;
  page: Page;
  title: string;
  controller: BrowserController | null;
  startedAt: string;
  updatedAt: string;
  lastFrameAt?: string;
  lastFrameHash?: string;
  lastFrameBase64?: string;
  frameSeq: number;
  captureTimer: NodeJS.Timeout | null;
  captureInFlight: Promise<void> | null;
  idleTimer: NodeJS.Timeout | null;
}

const DEFAULT_VIEWPORT: BrowserViewport = {
  width: 1440,
  height: 960,
};

export class BrowserSessionController {
  private readonly sessions = new Map<string, BrowserSession>();
  private readonly idleTtlMs: number;
  private readonly screenshotDebounceMs: number;
  private readonly viewport: BrowserViewport;
  private readonly onState?: (event: BrowserStateEvent) => void;
  private readonly onFrame?: (event: BrowserFrameEvent) => void;

  constructor(options: BrowserSessionControllerOptions = {}) {
    this.idleTtlMs = options.idleTtlMs ?? 5 * 60_000;
    this.screenshotDebounceMs = options.screenshotDebounceMs ?? 200;
    this.viewport = options.viewport ?? DEFAULT_VIEWPORT;
    this.onState = options.onState;
    this.onFrame = options.onFrame;
  }

  async getSessionStatus(input: {
    workspaceId: string;
    workspaceDir: string;
  }): Promise<BrowserSessionSnapshot> {
    const session = this.sessions.get(input.workspaceDir);
    if (!session) {
      return this.buildIdleSnapshot(input.workspaceId);
    }
    this.bumpIdleTimer(session);
    return this.buildSnapshot(session);
  }

  async ensureSession(input: {
    workspaceId: string;
    workspaceDir: string;
    initialUrl?: string;
  }): Promise<BrowserSessionSnapshot> {
    let session = this.sessions.get(input.workspaceDir);
    if (!session) {
      session = await this.createSession(input.workspaceId, input.workspaceDir);
      this.sessions.set(input.workspaceDir, session);
      this.emitState(session, "session-created");
    }
    this.bumpIdleTimer(session);
    if (input.initialUrl?.trim()) {
      await session.page.goto(input.initialUrl.trim(), {
        waitUntil: "domcontentloaded",
      });
      await this.captureNow(session, "ensure-navigate");
    } else if (!session.lastFrameBase64) {
      await this.captureNow(session, "ensure-capture");
    }
    return this.buildSnapshot(session);
  }

  async acquireControl(input: {
    workspaceId: string;
    workspaceDir: string;
    actor: BrowserActor;
  }): Promise<BrowserSessionSnapshot> {
    const session = await this.requireSession(input.workspaceId, input.workspaceDir);
    session.controller = {
      deviceId: input.actor.deviceId,
      userId: input.actor.userId,
      ...(input.actor.email ? { email: input.actor.email } : {}),
      acquiredAt: new Date().toISOString(),
    };
    session.updatedAt = new Date().toISOString();
    this.bumpIdleTimer(session);
    this.emitState(session, "control-acquired");
    return this.buildSnapshot(session);
  }

  async releaseControl(input: {
    workspaceId: string;
    workspaceDir: string;
    actor: BrowserActor;
  }): Promise<BrowserSessionSnapshot> {
    const session = await this.requireSession(input.workspaceId, input.workspaceDir);
    this.assertController(session, input.actor, false);
    session.controller = null;
    session.updatedAt = new Date().toISOString();
    this.bumpIdleTimer(session);
    this.emitState(session, "control-released");
    return this.buildSnapshot(session);
  }

  async navigate(input: {
    workspaceId: string;
    workspaceDir: string;
    actor: BrowserActor;
    url: string;
  }): Promise<BrowserSessionSnapshot> {
    const session = await this.requireSession(input.workspaceId, input.workspaceDir);
    this.assertController(session, input.actor, true);
    await session.page.goto(input.url, { waitUntil: "domcontentloaded" });
    await this.captureNow(session, "navigate");
    return this.buildSnapshot(session);
  }

  async dispatchInput(input: {
    workspaceId: string;
    workspaceDir: string;
    actor: BrowserActor;
    command: BrowserInputCommand;
  }): Promise<BrowserSessionSnapshot> {
    const session = await this.requireSession(input.workspaceId, input.workspaceDir);
    this.assertController(session, input.actor, true);
    this.bumpIdleTimer(session);

    switch (input.command.type) {
      case "click":
        await session.page.mouse.click(input.command.x, input.command.y);
        break;
      case "type":
        await session.page.keyboard.type(input.command.text);
        break;
      case "key":
        await session.page.keyboard.press(input.command.key);
        break;
      case "navigate":
        await session.page.goto(input.command.url, { waitUntil: "domcontentloaded" });
        break;
    }

    await delay(120);
    await this.captureNow(session, `input-${input.command.type}`);
    return this.buildSnapshot(session);
  }

  async closeAll(): Promise<void> {
    const keys = [...this.sessions.keys()];
    await Promise.all(keys.map(async (workspaceDir) => {
      await this.disposeSession(workspaceDir);
    }));
  }

  private async createSession(workspaceId: string, workspaceDir: string): Promise<BrowserSession> {
    const userDataDir = path.join(workspaceDir, ".claw-browser", "profile");
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      viewport: this.viewport,
      ignoreHTTPSErrors: true,
    });
    const page = context.pages()[0] ?? await context.newPage();
    const session: BrowserSession = {
      workspaceId,
      workspaceDir,
      context,
      page,
      title: "Claw Browser",
      controller: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      frameSeq: 0,
      captureTimer: null,
      captureInFlight: null,
      idleTimer: null,
    };

    const schedule = () => this.scheduleCapture(session, "page-event");
    page.on("domcontentloaded", schedule);
    page.on("load", schedule);
    page.on("framenavigated", () => {
      if (page.mainFrame()) schedule();
    });

    return session;
  }

  private async requireSession(workspaceId: string, workspaceDir: string): Promise<BrowserSession> {
    return this.sessions.get(workspaceDir) ?? await this.ensureSession({ workspaceId, workspaceDir }).then(() => {
      const session = this.sessions.get(workspaceDir);
      if (!session) {
        throw new Error("Browser session is not available.");
      }
      return session;
    });
  }

  private buildIdleSnapshot(workspaceId: string): BrowserSessionSnapshot {
    return {
      workspaceId,
      active: false,
      status: "idle",
      navigation: describeBrowserLocation("", "Claw Browser"),
      controller: null,
      viewport: this.viewport,
      updatedAt: new Date().toISOString(),
    };
  }

  private buildSnapshot(session: BrowserSession): BrowserSessionSnapshot {
    const currentUrl = session.page.url();
    const navigation = describeBrowserLocation(currentUrl, session.title);
    return {
      workspaceId: session.workspaceId,
      active: true,
      status: "ready",
      navigation,
      controller: session.controller,
      viewport: this.viewport,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      ...(session.lastFrameAt ? { lastFrameAt: session.lastFrameAt } : {}),
    };
  }

  private async buildResolvedSnapshot(session: BrowserSession): Promise<BrowserSessionSnapshot> {
    const title = await session.page.title().catch(() => "Claw Browser");
    session.title = title || "Claw Browser";
    const navigation = describeBrowserLocation(session.page.url(), title);
    return {
      workspaceId: session.workspaceId,
      active: true,
      status: "ready",
      navigation,
      controller: session.controller,
      viewport: this.viewport,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      ...(session.lastFrameAt ? { lastFrameAt: session.lastFrameAt } : {}),
    };
  }

  private emitState(session: BrowserSession, reason: string): void {
    void this.buildResolvedSnapshot(session).then((snapshot) => {
      this.onState?.({
        workspaceId: session.workspaceId,
        reason,
        session: snapshot,
      });
    });
  }

  private scheduleCapture(session: BrowserSession, reason: string): void {
    if (session.captureTimer) clearTimeout(session.captureTimer);
    session.captureTimer = setTimeout(() => {
      void this.captureNow(session, reason);
    }, this.screenshotDebounceMs);
  }

  private async captureNow(session: BrowserSession, reason: string): Promise<void> {
    if (session.captureInFlight) {
      await session.captureInFlight;
      return;
    }
    session.captureInFlight = (async () => {
      const png = await session.page.screenshot({
        type: "png",
      });
      const hash = createHash("sha256").update(png).digest("hex");
      const nextFrameAt = new Date().toISOString();
      session.updatedAt = nextFrameAt;

      if (hash !== session.lastFrameHash) {
        session.lastFrameHash = hash;
        session.lastFrameBase64 = png.toString("base64");
        session.lastFrameAt = nextFrameAt;
        session.frameSeq += 1;
        this.onFrame?.({
          workspaceId: session.workspaceId,
          seq: session.frameSeq,
          imageBase64: session.lastFrameBase64,
          mimeType: "image/png",
          capturedAt: nextFrameAt,
          viewport: this.viewport,
        });
      }

      this.emitState(session, reason);
    })();

    try {
      await session.captureInFlight;
    } finally {
      session.captureInFlight = null;
    }
  }

  private assertController(session: BrowserSession, actor: BrowserActor, requireController: boolean): void {
    if (!session.controller) {
      if (requireController) {
        throw new Error("Take control before interacting with the shared browser.");
      }
      return;
    }
    if (session.controller.deviceId !== actor.deviceId) {
      throw new Error("Another device currently controls this browser.");
    }
  }

  private bumpIdleTimer(session: BrowserSession): void {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      void this.disposeSession(session.workspaceDir);
    }, this.idleTtlMs);
  }

  private async disposeSession(workspaceDir: string): Promise<void> {
    const session = this.sessions.get(workspaceDir);
    if (!session) return;
    this.sessions.delete(workspaceDir);
    if (session.captureTimer) clearTimeout(session.captureTimer);
    if (session.idleTimer) clearTimeout(session.idleTimer);
    await session.context.close().catch(() => undefined);
  }
}
