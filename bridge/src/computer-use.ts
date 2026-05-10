import type { CommandExecutor } from "./command-executor.ts";
import { detectPlatform } from "./platform.ts";

export interface ComputerUseCapabilities {
  screenshot: boolean;
  keystroke: boolean;
  click: boolean;
  platform: ReturnType<typeof detectPlatform>;
}

export interface ScreenshotRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenshotOptions {
  display?: number;
  region?: ScreenshotRegion;
  format?: "png" | "jpg";
}

export interface ScreenshotResult {
  format: "png" | "jpg";
  bytes: Buffer;
  durationMs: number;
}

export type ModifierKey = "command" | "control" | "shift" | "option";

export class ComputerUseUnsupportedError extends Error {
  readonly capability: string;
  constructor(capability: string, message: string) {
    super(message);
    this.name = "ComputerUseUnsupportedError";
    this.capability = capability;
  }
}

export interface ComputerUseOptions {
  executor: CommandExecutor;
  platform?: ReturnType<typeof detectPlatform>;
  capabilities?: ComputerUseCapabilities;
}

export class ComputerUse {
  private readonly executor: CommandExecutor;
  private readonly platform: ReturnType<typeof detectPlatform>;
  private capabilitiesCache: ComputerUseCapabilities | null;

  constructor(options: ComputerUseOptions) {
    this.executor = options.executor;
    this.platform = options.platform ?? detectPlatform();
    this.capabilitiesCache = options.capabilities ?? null;
  }

  static async detect(executor: CommandExecutor): Promise<ComputerUse> {
    const platform = detectPlatform();
    const cu = new ComputerUse({ executor, platform });
    await cu.refreshCapabilities();
    return cu;
  }

  async refreshCapabilities(): Promise<ComputerUseCapabilities> {
    if (this.platform !== "darwin") {
      this.capabilitiesCache = {
        platform: this.platform,
        screenshot: false,
        keystroke: false,
        click: false,
      };
      return this.capabilitiesCache;
    }
    const [hasScreencapture, hasOsascript, hasCliclick] = await Promise.all([
      this.executor.binaryExists("screencapture"),
      this.executor.binaryExists("osascript"),
      this.executor.binaryExists("cliclick"),
    ]);
    this.capabilitiesCache = {
      platform: this.platform,
      screenshot: hasScreencapture,
      keystroke: hasOsascript,
      click: hasCliclick,
    };
    return this.capabilitiesCache;
  }

  capabilities(): ComputerUseCapabilities {
    if (!this.capabilitiesCache) {
      return {
        platform: this.platform,
        screenshot: false,
        keystroke: false,
        click: false,
      };
    }
    return this.capabilitiesCache;
  }

  async screenshot(options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    this.requireCapability("screenshot");
    const format = options.format ?? "png";
    const args = ["-x", "-t", format];
    if (options.display) {
      args.push("-D", String(options.display));
    }
    if (options.region) {
      args.push(
        "-R",
        `${options.region.x},${options.region.y},${options.region.width},${options.region.height}`,
      );
    }
    args.push("-");
    const start = Date.now();
    const result = await this.executor.exec({
      command: "screencapture",
      args,
      timeoutMs: 10_000,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `screencapture failed (exit ${result.exitCode}): ${result.stderr.toString()}`,
      );
    }
    return {
      format,
      bytes: result.stdout,
      durationMs: Date.now() - start,
    };
  }

  async keystroke(text: string): Promise<void> {
    this.requireCapability("keystroke");
    const escaped = escapeAppleScriptString(text);
    const script = `tell application "System Events" to keystroke ${escaped}`;
    await this.runOsascript(script);
  }

  async key(keyCode: number, modifiers: ModifierKey[] = []): Promise<void> {
    this.requireCapability("keystroke");
    if (!Number.isInteger(keyCode) || keyCode < 0 || keyCode > 255) {
      throw new Error(`invalid key code: ${keyCode}`);
    }
    const usingClause =
      modifiers.length > 0
        ? ` using {${modifiers.map((m) => `${m} down`).join(", ")}}`
        : "";
    const script = `tell application "System Events" to key code ${keyCode}${usingClause}`;
    await this.runOsascript(script);
  }

  async click(
    x: number,
    y: number,
    button: "left" | "right" = "left",
  ): Promise<void> {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`invalid click coords: ${x},${y}`);
    }
    if (!this.capabilitiesCache?.click) {
      throw new ComputerUseUnsupportedError(
        "click",
        "click requires cliclick (brew install cliclick) on macOS",
      );
    }
    const verb = button === "right" ? "rc" : "c";
    const result = await this.executor.exec({
      command: "cliclick",
      args: [`${verb}:${Math.round(x)},${Math.round(y)}`],
      timeoutMs: 5_000,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `cliclick failed (exit ${result.exitCode}): ${result.stderr.toString()}`,
      );
    }
  }

  private async runOsascript(script: string): Promise<void> {
    const result = await this.executor.exec({
      command: "osascript",
      args: ["-e", script],
      timeoutMs: 5_000,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `osascript failed (exit ${result.exitCode}): ${result.stderr.toString()}`,
      );
    }
  }

  private requireCapability(name: keyof ComputerUseCapabilities): void {
    const caps = this.capabilities();
    if (caps.platform !== "darwin") {
      throw new ComputerUseUnsupportedError(
        name,
        `${name} is only supported on macOS (current: ${caps.platform})`,
      );
    }
    if (!(caps as unknown as Record<string, unknown>)[name]) {
      throw new ComputerUseUnsupportedError(
        name,
        `${name} is not available on this host`,
      );
    }
  }
}

function escapeAppleScriptString(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
