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
