import { randomUUID } from "node:crypto";

import type {
  BrowserActor,
  BrowserFrameEvent,
  BrowserInputCommand,
  BrowserSessionSnapshot,
} from "../../../browser/shared/types.ts";

export interface ConnectorWorkspaceDescriptor {
  workspaceId: string;
  displayName: string;
}

export interface ConnectorServiceDescriptor {
  serviceId: string;
  displayName?: string;
  status?: "online" | "offline" | "degraded";
}

interface ConnectorHelloPayload {
  tenantId: string;
  connectorId: string;
  agentId: string;
  version: string;
  capabilities: string[];
  workspaces: ConnectorWorkspaceDescriptor[];
  services?: ConnectorServiceDescriptor[];
  runtime?: {
    adapter: string;
    runtimeName?: string;
    version: string | null;
    installed?: boolean;
    cliAvailable: boolean;
    gatewayAvailable: boolean;
    online: boolean;
    transport: string;
    issues: string[];
  };
}

interface ConnectorEnvelopeBase {
  type: "hello" | "heartbeat" | "invoke" | "stream" | "result" | "error" | "event" | "ack" | "cancel";
  requestId?: string;
  subscriptionId?: string;
}

export interface InvokeEnvelope extends ConnectorEnvelopeBase {
  type: "invoke";
  requestId: string;
  tenantId: string;
  agentId: string;
  workspaceId?: string;
  operation: string;
  payload?: Record<string, unknown>;
}

export interface StreamEnvelope extends ConnectorEnvelopeBase {
  type: "stream";
  requestId: string;
  event: string;
  payload: Record<string, unknown>;
}

interface ResultEnvelope extends ConnectorEnvelopeBase {
  type: "result";
  requestId: string;
  payload: Record<string, unknown>;
}

export interface ErrorEnvelope extends ConnectorEnvelopeBase {
  type: "error";
  requestId?: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface AckEnvelope extends ConnectorEnvelopeBase {
  type: "ack";
  requestId?: string;
  payload?: Record<string, unknown>;
}

interface EventEnvelope extends ConnectorEnvelopeBase {
  type: "event";
  event: string;
  payload: Record<string, unknown>;
}

interface HeartbeatEnvelope extends ConnectorEnvelopeBase {
  type: "heartbeat";
  payload?: { timestamp: number };
}

export interface HelloEnvelope extends ConnectorEnvelopeBase {
  type: "hello";
  payload: ConnectorHelloPayload;
}

export interface CancelEnvelope extends ConnectorEnvelopeBase {
  type: "cancel";
  requestId: string;
}

export type ConnectorInboundEnvelope =
  | HelloEnvelope
  | HeartbeatEnvelope
  | StreamEnvelope
  | ResultEnvelope
  | ErrorEnvelope
  | AckEnvelope
  | EventEnvelope;

export type ConnectorOutboundEnvelope = InvokeEnvelope | AckEnvelope | CancelEnvelope;

export const RELAY_CONNECTOR_FRAME_MAX_BYTES = 512 * 1024;

export type RelayConnectorFrameParseErrorCode =
  | "relay_connector_frame_oversized"
  | "relay_connector_frame_truncated"
  | "relay_connector_frame_malformed"
  | "relay_connector_frame_unknown_fields"
  | "relay_connector_frame_invalid";

export type RelayConnectorFrameParseResult<TFrame extends ConnectorInboundEnvelope | ConnectorOutboundEnvelope> =
  | { ok: true; byteLength: number; frame: TFrame }
  | {
    ok: false;
    byteLength: number;
    error: {
      code: RelayConnectorFrameParseErrorCode;
      message: string;
      maxBytes?: number;
      fields?: string[];
    };
  };

const connectorTextEncoder = new TextEncoder();

function normalizeConnectorFrameInput(input: string | Uint8Array): string {
  return typeof input === "string" ? input : new TextDecoder("utf8", { fatal: false }).decode(input);
}

function connectorFrameByteLength(value: string): number {
  return connectorTextEncoder.encode(value).byteLength;
}

function isConnectorFrameTruncationError(error: unknown, text: string): boolean {
  const trimmed = text.trim();
  const looksCutOff = (trimmed.startsWith("{") && !/[}\]]$/.test(trimmed))
    || (trimmed.startsWith("[") && !/[\]}]$/.test(trimmed));
  return error instanceof SyntaxError
    && (looksCutOff || /unexpected end|unterminated|end of json input|after property value in json|after array element in json/i.test(error.message));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownFields(record: Record<string, unknown>, allowed: readonly string[]): string[] {
  const allowedSet = new Set(allowed);
  return Object.keys(record).filter((key) => !allowedSet.has(key));
}

function isRecordPayload(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

function invalidConnectorFrame(byteLength: number, message: string, fields?: string[]): RelayConnectorFrameParseResult<never> {
  return {
    ok: false,
    byteLength,
    error: {
      code: fields && fields.length > 0 ? "relay_connector_frame_unknown_fields" : "relay_connector_frame_invalid",
      message,
      ...(fields && fields.length > 0 ? { fields } : {}),
    },
  };
}

function validateConnectorInboundFrame(value: unknown, byteLength: number): RelayConnectorFrameParseResult<ConnectorInboundEnvelope> {
  if (!isRecord(value) || typeof value.type !== "string") {
    return invalidConnectorFrame(byteLength, "Connector inbound frame must be an object with a type field.");
  }
  switch (value.type) {
    case "hello": {
      const fields = unknownFields(value, ["type", "requestId", "subscriptionId", "payload"]);
      if (fields.length) return invalidConnectorFrame(byteLength, "Connector hello frame contains unsupported fields.", fields);
      const payload = value.payload;
      if (!isRecord(payload)
        || typeof payload.tenantId !== "string"
        || typeof payload.connectorId !== "string"
        || typeof payload.agentId !== "string"
        || typeof payload.version !== "string"
        || !Array.isArray(payload.capabilities)
        || !payload.capabilities.every((entry) => typeof entry === "string")
        || !Array.isArray(payload.workspaces)
        || !payload.workspaces.every((entry) => isRecord(entry) && typeof entry.workspaceId === "string" && typeof entry.displayName === "string")) {
        return invalidConnectorFrame(byteLength, "Connector hello frame payload is invalid.");
      }
      return { ok: true, byteLength, frame: value as unknown as HelloEnvelope };
    }
    case "heartbeat": {
      const fields = unknownFields(value, ["type", "requestId", "subscriptionId", "payload"]);
      if (fields.length) return invalidConnectorFrame(byteLength, "Connector heartbeat frame contains unsupported fields.", fields);
      if (value.payload !== undefined && (!isRecord(value.payload) || typeof value.payload.timestamp !== "number")) {
        return invalidConnectorFrame(byteLength, "Connector heartbeat frame payload is invalid.");
      }
      return { ok: true, byteLength, frame: value as HeartbeatEnvelope };
    }
    case "stream": {
      const fields = unknownFields(value, ["type", "requestId", "subscriptionId", "event", "payload"]);
      if (fields.length) return invalidConnectorFrame(byteLength, "Connector stream frame contains unsupported fields.", fields);
      if (typeof value.requestId !== "string" || typeof value.event !== "string" || !isRecordPayload(value.payload)) {
        return invalidConnectorFrame(byteLength, "Connector stream frame is invalid.");
      }
      return { ok: true, byteLength, frame: value as unknown as StreamEnvelope };
    }
    case "result": {
      const fields = unknownFields(value, ["type", "requestId", "subscriptionId", "payload"]);
      if (fields.length) return invalidConnectorFrame(byteLength, "Connector result frame contains unsupported fields.", fields);
      if (typeof value.requestId !== "string" || !isRecordPayload(value.payload)) {
        return invalidConnectorFrame(byteLength, "Connector result frame is invalid.");
      }
      return { ok: true, byteLength, frame: value as ResultEnvelope };
    }
    case "error": {
      const fields = unknownFields(value, ["type", "requestId", "subscriptionId", "code", "message", "details"]);
      if (fields.length) return invalidConnectorFrame(byteLength, "Connector error frame contains unsupported fields.", fields);
      if (typeof value.code !== "string" || typeof value.message !== "string" || (value.details !== undefined && !isRecordPayload(value.details))) {
        return invalidConnectorFrame(byteLength, "Connector error frame is invalid.");
      }
      return { ok: true, byteLength, frame: value as ErrorEnvelope };
    }
    case "ack": {
      const fields = unknownFields(value, ["type", "requestId", "subscriptionId", "payload"]);
      if (fields.length) return invalidConnectorFrame(byteLength, "Connector ack frame contains unsupported fields.", fields);
      if (value.payload !== undefined && !isRecordPayload(value.payload)) {
        return invalidConnectorFrame(byteLength, "Connector ack frame payload is invalid.");
      }
      return { ok: true, byteLength, frame: value as AckEnvelope };
    }
    case "event": {
      const fields = unknownFields(value, ["type", "requestId", "subscriptionId", "event", "payload"]);
      if (fields.length) return invalidConnectorFrame(byteLength, "Connector event frame contains unsupported fields.", fields);
      if (typeof value.event !== "string" || !isRecordPayload(value.payload)) {
        return invalidConnectorFrame(byteLength, "Connector event frame is invalid.");
      }
      return { ok: true, byteLength, frame: value as EventEnvelope };
    }
    default:
      return invalidConnectorFrame(byteLength, `Unsupported connector inbound frame type: ${value.type}`);
  }
}

function validateConnectorOutboundFrame(value: unknown, byteLength: number): RelayConnectorFrameParseResult<ConnectorOutboundEnvelope> {
  if (!isRecord(value) || typeof value.type !== "string") {
    return invalidConnectorFrame(byteLength, "Connector outbound frame must be an object with a type field.");
  }
  switch (value.type) {
    case "invoke": {
      const fields = unknownFields(value, ["type", "requestId", "subscriptionId", "tenantId", "agentId", "workspaceId", "operation", "payload"]);
      if (fields.length) return invalidConnectorFrame(byteLength, "Connector invoke frame contains unsupported fields.", fields);
      if (typeof value.requestId !== "string"
        || typeof value.tenantId !== "string"
        || typeof value.agentId !== "string"
        || typeof value.operation !== "string"
        || (value.workspaceId !== undefined && typeof value.workspaceId !== "string")
        || (value.payload !== undefined && !isRecordPayload(value.payload))) {
        return invalidConnectorFrame(byteLength, "Connector invoke frame is invalid.");
      }
      return { ok: true, byteLength, frame: value as unknown as InvokeEnvelope };
    }
    case "ack": {
      const fields = unknownFields(value, ["type", "requestId", "subscriptionId", "payload"]);
      if (fields.length) return invalidConnectorFrame(byteLength, "Connector ack frame contains unsupported fields.", fields);
      if (value.payload !== undefined && !isRecordPayload(value.payload)) {
        return invalidConnectorFrame(byteLength, "Connector ack frame payload is invalid.");
      }
      return { ok: true, byteLength, frame: value as AckEnvelope };
    }
    case "cancel": {
      const fields = unknownFields(value, ["type", "requestId", "subscriptionId"]);
      if (fields.length) return invalidConnectorFrame(byteLength, "Connector cancel frame contains unsupported fields.", fields);
      if (typeof value.requestId !== "string") return invalidConnectorFrame(byteLength, "Connector cancel frame requires requestId.");
      return { ok: true, byteLength, frame: value as CancelEnvelope };
    }
    default:
      return invalidConnectorFrame(byteLength, `Unsupported connector outbound frame type: ${value.type}`);
  }
}

function parseRelayConnectorFrame<TFrame extends ConnectorInboundEnvelope | ConnectorOutboundEnvelope>(
  input: string | Uint8Array,
  maxBytes: number,
  validate: (value: unknown, byteLength: number) => RelayConnectorFrameParseResult<TFrame>,
): RelayConnectorFrameParseResult<TFrame> {
  const text = normalizeConnectorFrameInput(input);
  const byteLength = connectorFrameByteLength(text);
  if (byteLength > maxBytes) {
    return {
      ok: false,
      byteLength,
      error: {
        code: "relay_connector_frame_oversized",
        message: `Relay connector frame exceeds ${maxBytes} bytes`,
        maxBytes,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      byteLength,
      error: {
        code: isConnectorFrameTruncationError(error, text) ? "relay_connector_frame_truncated" : "relay_connector_frame_malformed",
        message: error instanceof Error ? error.message : "Relay connector frame is malformed.",
      },
    };
  }
  return validate(parsed, byteLength);
}

export function parseConnectorInboundEnvelope(
  input: string | Uint8Array,
  maxBytes = RELAY_CONNECTOR_FRAME_MAX_BYTES,
): RelayConnectorFrameParseResult<ConnectorInboundEnvelope> {
  return parseRelayConnectorFrame(input, maxBytes, validateConnectorInboundFrame);
}

export function parseConnectorOutboundEnvelope(
  input: string | Uint8Array,
  maxBytes = RELAY_CONNECTOR_FRAME_MAX_BYTES,
): RelayConnectorFrameParseResult<ConnectorOutboundEnvelope> {
  return parseRelayConnectorFrame(input, maxBytes, validateConnectorOutboundFrame);
}

export interface AuthClaims {
  sub: string;
  email: string;
  tenantId: string;
  role: "admin" | "user";
  scopes: string[];
  agentId?: string;
  workspaceId?: string;
  deviceId?: string;
}

export interface ConnectorAuthContext {
  credentialId: string;
  tenantId: string;
  connectorId: string;
  agentId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

export interface EnrollmentResult {
  tenantId: string;
  connectorId: string;
  agentId: string;
  connectorToken: string;
}

export interface ActivityRecord {
  id: string;
  tenantId: string;
  agentId?: string | null;
  workspaceId?: string | null;
  capability: string;
  status: "success" | "error" | "info";
  detail: string;
  createdAt: number;
}

interface ConnectorBrowserEnsurePayload {
  initialUrl?: string;
}

interface ConnectorBrowserControlPayload {
  actor: BrowserActor;
}

interface ConnectorBrowserNavigatePayload {
  actor: BrowserActor;
  url: string;
}

interface ConnectorBrowserInputPayload {
  actor: BrowserActor;
  command: BrowserInputCommand;
}

interface ConnectorBrowserStatePayload {
  workspaceId: string;
  session: BrowserSessionSnapshot;
  reason: string;
}

interface ConnectorBrowserFramePayload extends BrowserFrameEvent {}

export interface UsageRecord {
  id: string;
  tenantId: string;
  agentId?: string | null;
  workspaceId?: string | null;
  tokensIn: number;
  tokensOut: number;
  estimatedCostUsd: number;
  createdAt: number;
}

export function generateOpaqueToken(prefix: string): { tokenId: string; token: string; secret: string } {
  const tokenId = randomUUID();
  const secret = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  return {
    tokenId,
    secret,
    token: `${prefix}_${tokenId}.${secret}`,
  };
}

export function parseOpaqueToken(prefix: string, token: string): { tokenId: string; secret: string } | null {
  const match = token.match(new RegExp(`^${prefix}_([^.]+)\\.(.+)$`));
  if (!match) return null;
  return { tokenId: match[1] ?? "", secret: match[2] ?? "" };
}
