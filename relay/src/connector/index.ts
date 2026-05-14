import { clawApiPath } from "@clawjs/core";
import { setTimeout as delay } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

import WebSocket from "ws";

import type { CancelEnvelope, ConnectorInboundEnvelope, ConnectorOutboundEnvelope, EnrollmentResult, InvokeEnvelope } from "../shared/protocol.ts";
import { RelayConnectorRuntime, type RelayConnectorOptions, type RelayConnectorServiceConfig } from "./runtime.ts";

function normalizeServiceId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function parseServiceEntry(entry: unknown): RelayConnectorServiceConfig | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const raw = entry as Record<string, unknown>;
  const serviceId = normalizeServiceId(String(raw.serviceId ?? raw.id ?? ""));
  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
  if (!serviceId || !baseUrl) return null;
  return {
    serviceId,
    baseUrl,
    ...(typeof raw.displayName === "string" && raw.displayName.trim() ? { displayName: raw.displayName.trim() } : {}),
  };
}

function readServicesConfig(values: Map<string, string>): RelayConnectorServiceConfig[] {
  const services: RelayConnectorServiceConfig[] = [];
  const push = (service: RelayConnectorServiceConfig | null) => {
    if (!service) return;
    const index = services.findIndex((entry) => entry.serviceId === service.serviceId);
    if (index >= 0) services[index] = service;
    else services.push(service);
  };

  const configPath = values.get("services-config")
    ?? values.get("service-config")
    ?? process.env.RELAY_SERVICES_CONFIG_PATH
    ?? process.env.RELAY_SERVICE_CONFIG_PATH;
  if (configPath) {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
    if (Array.isArray(parsed)) parsed.forEach((entry) => push(parseServiceEntry(entry)));
    else if (parsed && typeof parsed === "object") {
      for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === "string") push(parseServiceEntry({ id, baseUrl: value }));
        else if (value && typeof value === "object") push(parseServiceEntry({ id, ...(value as Record<string, unknown>) }));
      }
    }
  }

  const inline = values.get("services") ?? process.env.RELAY_SERVICES;
  if (inline) {
    for (const part of inline.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const splitAt = trimmed.indexOf("=");
      if (splitAt === -1) continue;
      push(parseServiceEntry({
        id: trimmed.slice(0, splitAt),
        baseUrl: trimmed.slice(splitAt + 1),
      }));
    }
  }

  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^RELAY_SERVICE_([A-Z0-9_]+)_URL$/);
    if (!match || !value?.trim()) continue;
    push(parseServiceEntry({
      id: match[1]?.toLowerCase().replaceAll("_", "-"),
      baseUrl: value,
    }));
  }

  return services.sort((left, right) => left.serviceId.localeCompare(right.serviceId));
}

function parseArgs(argv: string[]): RelayConnectorOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      values.set(key, value);
      index += 1;
    }
  }

  const relayUrl = values.get("relay-url") ?? process.env.RELAY_URL ?? "http://127.0.0.1:4410";
  const agentId = values.get("agent-id") ?? process.env.RELAY_AGENT_ID ?? "demo-agent";
  const connectorId = values.get("connector-id") ?? process.env.RELAY_CONNECTOR_ID ?? agentId;
  const enrollmentToken = values.get("enrollment-token") ?? process.env.RELAY_ENROLLMENT_TOKEN ?? "";
  const workspaceRoot = values.get("workspace-root") ?? process.env.RELAY_WORKSPACE_ROOT ?? "./relay-workspaces";
  const runtimeAdapter = values.get("runtime-adapter") ?? process.env.RELAY_RUNTIME_ADAPTER ?? "openclaw";
  const runtimeBinaryPath = values.get("runtime-binary-path")
    ?? values.get("codex-path")
    ?? process.env.RELAY_RUNTIME_BINARY_PATH
    ?? process.env.CLAW_CODEX_PATH
    ?? process.env.CLAW_OPENCLAW_PATH;
  const credentialPath = values.get("credential-path")
    ?? process.env.RELAY_CONNECTOR_CREDENTIAL_PATH
    ?? path.join(workspaceRoot, ".relay", "connector-credential.json");

  return {
    relayUrl,
    enrollmentToken,
    connectorId,
    agentId,
    workspaceRoot,
    runtimeAdapter,
    runtimeBinaryPath,
    credentialPath,
    services: readServicesConfig(values),
  };
}

function readStoredCredential(options: RelayConnectorOptions): EnrollmentResult | null {
  if (!options.credentialPath) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(options.credentialPath, "utf8")) as Partial<EnrollmentResult>;
    if (
      typeof parsed.connectorToken === "string"
      && typeof parsed.tenantId === "string"
      && typeof parsed.connectorId === "string"
      && typeof parsed.agentId === "string"
    ) {
      return {
        connectorToken: parsed.connectorToken,
        tenantId: parsed.tenantId,
        connectorId: parsed.connectorId,
        agentId: parsed.agentId,
      };
    }
  } catch {}
  return null;
}

function writeStoredCredential(options: RelayConnectorOptions, credential: EnrollmentResult): void {
  if (!options.credentialPath) return;
  fs.mkdirSync(path.dirname(options.credentialPath), { recursive: true });
  fs.writeFileSync(options.credentialPath, `${JSON.stringify({
    tenantId: credential.tenantId,
    connectorId: credential.connectorId,
    agentId: credential.agentId,
    connectorToken: credential.connectorToken,
  }, null, 2)}\n`, { mode: 0o600 });
}

async function enroll(options: RelayConnectorOptions): Promise<EnrollmentResult> {
  const response = await fetch(new URL(clawApiPath("connector/enroll"), options.relayUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enrollmentToken: options.enrollmentToken }),
  });

  if (!response.ok) {
    throw new Error(`Connector enrollment failed: ${response.status}`);
  }

  return await response.json() as EnrollmentResult;
}

async function startDevicePairing(options: RelayConnectorOptions): Promise<{
  pairingId: string;
  deviceCode: string;
  userCode: string;
  verificationUriComplete: string;
  qrPayload: string;
  intervalSec: number;
}> {
  const response = await fetch(new URL(clawApiPath("connectors/device/start"), options.relayUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connectorId: options.connectorId,
      agentId: options.agentId,
      displayName: options.connectorId,
    }),
  });
  if (!response.ok) {
    throw new Error(`Connector pairing start failed: ${response.status}`);
  }
  return await response.json() as {
    pairingId: string;
    deviceCode: string;
    userCode: string;
    verificationUriComplete: string;
    qrPayload: string;
    intervalSec: number;
  };
}

async function pollDevicePairing(options: RelayConnectorOptions, deviceCode: string, intervalSec: number): Promise<EnrollmentResult> {
  for (;;) {
    const response = await fetch(new URL(clawApiPath("connectors/device/poll"), options.relayUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceCode }),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (response.ok && payload.status === "approved") {
      return payload as unknown as EnrollmentResult;
    }
    if (response.status === 200 && payload.status === "authorization_pending") {
      await delay(intervalSec * 1000);
      continue;
    }
    throw new Error(`Connector pairing poll failed: ${response.status} ${String(payload.status ?? response.statusText)}`);
  }
}

async function bootstrapConnector(options: RelayConnectorOptions): Promise<EnrollmentResult> {
  const stored = readStoredCredential(options);
  if (stored) {
    return stored;
  }
  if (options.enrollmentToken) {
    const credential = await enroll(options);
    writeStoredCredential(options, credential);
    return credential;
  }
  const pairing = await startDevicePairing(options);
  console.error(`[relay-connector] approve connector ${options.connectorId}`);
  console.error(`[relay-connector] user code: ${pairing.userCode}`);
  console.error(`[relay-connector] verification uri: ${pairing.verificationUriComplete}`);
  console.error(`[relay-connector] qr payload: ${pairing.qrPayload}`);
  const credential = await pollDevicePairing(options, pairing.deviceCode, pairing.intervalSec || 5);
  writeStoredCredential(options, credential);
  return credential;
}

function toWebSocketUrl(relayUrl: string): string {
  const url = new URL(clawApiPath("connector/connect"), relayUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

async function runOnce(options: RelayConnectorOptions): Promise<void> {
  const enrollment = await bootstrapConnector(options);
  const socket = new WebSocket(toWebSocketUrl(options.relayUrl), {
    headers: {
      Authorization: `Bearer ${enrollment.connectorToken}`,
    },
  });
  const runtime = new RelayConnectorRuntime(options, (event, payload) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      type: "event",
      event,
      payload,
    }));
  });

  socket.on("open", async () => {
    const runtimeSummary = await runtime.getRuntimeSummary().catch((error) => ({
      adapter: options.runtimeAdapter,
      version: null,
      cliAvailable: false,
      gatewayAvailable: false,
      online: false,
      transport: "unknown",
      issues: [error instanceof Error ? error.message : String(error)],
    }));
    const runtimeCapabilities = [
      `runtime:${options.runtimeAdapter}`,
      runtimeSummary.online ? "runtime:ready" : "runtime:degraded",
    ];
    socket.send(JSON.stringify({
      type: "hello",
      payload: {
        tenantId: enrollment.tenantId,
        connectorId: enrollment.connectorId,
        agentId: enrollment.agentId,
        version: "0.1.0",
        capabilities: [
          "sessions",
          "workspace",
          "tasks",
          "notes",
          "memory",
          "inbox",
          "people",
          "events",
          "time",
          "personas",
          "plugins",
          "routines",
          "skills",
          "images",
          "integrations",
          "admin",
          "browser",
          "services",
          ...runtimeCapabilities,
        ],
        runtime: runtimeSummary,
        services: runtime.listServices(),
        workspaces: runtime.listWorkspaces(),
      },
    }));

    const heartbeat = setInterval(() => {
      socket.send(JSON.stringify({
        type: "heartbeat",
        payload: { timestamp: Date.now() },
      }));
    }, 10_000);

    socket.once("close", () => clearInterval(heartbeat));
  });

  const activeRequests = new Map<string, AbortController>();

  socket.on("message", async (buffer) => {
    const message = JSON.parse(buffer.toString()) as ConnectorInboundEnvelope | InvokeEnvelope | CancelEnvelope;

    if (message.type === "cancel") {
      const controller = activeRequests.get(message.requestId);
      if (controller) controller.abort("cancelled_by_client");
      return;
    }

    if (message.type !== "invoke") return;

    const controller = new AbortController();
    activeRequests.set(message.requestId, controller);

    try {
      const result = await runtime.execute(
        message.operation,
        message.workspaceId,
        message.payload,
        (event, payload) => {
          if (socket.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({
            type: "stream",
            requestId: message.requestId,
            event,
            payload,
          }));
        },
        controller.signal,
      );
      socket.send(JSON.stringify({
        type: "result",
        requestId: message.requestId,
        payload: result,
      }));
    } catch (error) {
      socket.send(JSON.stringify({
        type: "error",
        requestId: message.requestId,
        code: "connector_operation_failed",
        message: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      activeRequests.delete(message.requestId);
    }
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("close", () => resolve());
    socket.once("error", (error) => reject(error));
  });
}

export async function runRelayConnector(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);
  for (;;) {
    try {
      await runOnce(options);
    } catch (error) {
      console.error(`[relay-connector] ${error instanceof Error ? error.message : String(error)}`);
    }
    await delay(2_000);
  }
}
