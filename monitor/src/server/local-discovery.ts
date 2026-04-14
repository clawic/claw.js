import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LocalInstanceSnapshot } from "../shared/types.ts";

/* -------------------------------------------------------
   Known runtime definitions
   ------------------------------------------------------- */

interface KnownRuntime {
  id: string;
  runtimeName: string;
  homeDirName: string;
  configFileName: string | null;
  defaultPort: number | null;
}

const KNOWN_RUNTIMES: KnownRuntime[] = [
  { id: "openclaw", runtimeName: "OpenClaw", homeDirName: ".openclaw", configFileName: "openclaw.json", defaultPort: 18789 },
  { id: "picoclaw", runtimeName: "PicoClaw", homeDirName: ".picoclaw", configFileName: "config.json", defaultPort: null },
  { id: "nanoclaw", runtimeName: "NanoClaw", homeDirName: ".nanoclaw", configFileName: "config.json", defaultPort: null },
  { id: "nanobot", runtimeName: "Nanobot", homeDirName: ".nanobot", configFileName: "config.json", defaultPort: null },
  { id: "hermes", runtimeName: "Hermes", homeDirName: ".hermes", configFileName: null, defaultPort: null },
  { id: "ironclaw", runtimeName: "IronClaw", homeDirName: ".ironclaw", configFileName: "config.json", defaultPort: null },
  { id: "nemoclaw", runtimeName: "NemoClaw", homeDirName: ".nemoclaw", configFileName: "config.json", defaultPort: null },
  { id: "nullclaw", runtimeName: "NullClaw", homeDirName: ".nullclaw", configFileName: "config.json", defaultPort: null },
  { id: "zeroclaw", runtimeName: "ZeroClaw", homeDirName: ".zeroclaw", configFileName: "config.toml", defaultPort: null },
];

/* -------------------------------------------------------
   Config file reading
   ------------------------------------------------------- */

function readGatewayPortFromJson(filePath: string): number | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const port = raw?.gateway?.port;
    return typeof port === "number" && port > 0 ? port : null;
  } catch {
    return null;
  }
}

function readGatewayPortFromToml(filePath: string): number | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    // Simple regex extraction for [gateway] section port value
    const match = content.match(/\[gateway\][^[]*?port\s*=\s*(\d+)/s);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function resolveGatewayPort(runtime: KnownRuntime): { port: number | null; configPath: string | null } {
  const homeDir = path.join(os.homedir(), runtime.homeDirName);

  if (!runtime.configFileName) {
    return { port: runtime.defaultPort, configPath: null };
  }

  const configPath = path.join(homeDir, runtime.configFileName);
  if (!fs.existsSync(configPath)) {
    return { port: runtime.defaultPort, configPath: null };
  }

  const port = runtime.configFileName.endsWith(".toml")
    ? readGatewayPortFromToml(configPath)
    : readGatewayPortFromJson(configPath);

  return { port: port ?? runtime.defaultPort, configPath };
}

/* -------------------------------------------------------
   Gateway probing
   ------------------------------------------------------- */

export interface GatewayProbeResult {
  available: boolean;
  version: string | null;
  capabilities: Record<string, boolean>;
  responseTimeMs: number;
}

export async function probeGateway(gatewayUrl: string): Promise<GatewayProbeResult> {
  const start = performance.now();
  try {
    const res = await fetch(`${gatewayUrl}/v1/health`, {
      signal: AbortSignal.timeout(3000),
    });
    const elapsed = Math.round(performance.now() - start);
    if (!res.ok) {
      return { available: false, version: null, capabilities: {}, responseTimeMs: elapsed };
    }
    let version: string | null = null;
    let capabilities: Record<string, boolean> = {};
    try {
      const body = await res.json() as Record<string, unknown>;
      version = typeof body.version === "string" ? body.version : null;
      if (body.capabilities && typeof body.capabilities === "object") {
        capabilities = body.capabilities as Record<string, boolean>;
      }
    } catch {
      // Health endpoint might return non-JSON
    }
    return { available: true, version, capabilities, responseTimeMs: elapsed };
  } catch {
    const elapsed = Math.round(performance.now() - start);
    return { available: false, version: null, capabilities: {}, responseTimeMs: elapsed };
  }
}

/* -------------------------------------------------------
   Full discovery
   ------------------------------------------------------- */

export async function discoverLocalInstances(extraPorts: number[] = []): Promise<LocalInstanceSnapshot[]> {
  const results: LocalInstanceSnapshot[] = [];
  const probedPorts = new Set<number>();

  // Scan known runtimes
  for (const runtime of KNOWN_RUNTIMES) {
    const { port, configPath } = resolveGatewayPort(runtime);
    if (!port) continue;
    if (probedPorts.has(port)) continue;
    probedPorts.add(port);

    const gatewayUrl = `http://127.0.0.1:${port}`;
    const probe = await probeGateway(gatewayUrl);
    const now = Date.now();

    results.push({
      id: `local:${runtime.id}:${port}`,
      adapter: runtime.id,
      runtimeName: runtime.runtimeName,
      gatewayUrl,
      version: probe.version,
      status: probe.available ? "running" : "unreachable",
      configPath,
      capabilities: probe.capabilities,
      discoveredAt: now,
      lastSeenAt: now,
    });
  }

  // Probe extra ports (unknown runtimes)
  for (const port of extraPorts) {
    if (probedPorts.has(port)) continue;
    probedPorts.add(port);

    const gatewayUrl = `http://127.0.0.1:${port}`;
    const probe = await probeGateway(gatewayUrl);
    if (!probe.available) continue;

    const now = Date.now();
    results.push({
      id: `local:unknown:${port}`,
      adapter: "unknown",
      runtimeName: `Gateway :${port}`,
      gatewayUrl,
      version: probe.version,
      status: "running",
      configPath: null,
      capabilities: probe.capabilities,
      discoveredAt: now,
      lastSeenAt: now,
    });
  }

  return results;
}
