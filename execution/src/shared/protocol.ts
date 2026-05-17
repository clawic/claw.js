import { randomUUID } from "node:crypto";

import type { DeploymentKind, RuntimeLanguage, RunStatus } from "./types.ts";

interface WorkerHelloPayload {
  tenantId: string;
  workerId: string;
  label: string;
  workspaceRoot: string;
  secret: string;
  runtimes: RuntimeLanguage[];
  deployKinds: DeploymentKind[];
}

export interface WorkerInvokePayload {
  runId: string;
  tenantId: string;
  projectId: string;
  repositoryId: string;
  assetId: string;
  revisionId: string;
  assetKind: "script" | "notebook";
  runtime: RuntimeLanguage;
  repository: {
    remoteUrl: string;
    defaultBranch: string;
  };
  asset: {
    path: string;
    name: string;
  };
  revision: {
    content: string;
    baseRef: string;
    branchName: string;
  };
  inputs: Record<string, unknown>;
  targetCellId?: string | null;
  artifactDir: string;
}

export interface WorkerArtifactPayload {
  name: string;
  path: string;
  kind: "file" | "directory";
  sizeBytes: number;
  contentType: string;
  deployableKind?: DeploymentKind | null;
}

interface NotebookCellOutput {
  id: string;
  status: "succeeded" | "failed" | "stale";
  output: string;
}

interface WorkerCompletePayload {
  runId: string;
  status: RunStatus;
  exitCode: number;
  outputText: string;
  errorText: string;
  artifacts: WorkerArtifactPayload[];
  notebookSnapshot?: {
    cells: NotebookCellOutput[];
  };
}

interface WorkerLogPayload {
  runId: string;
  stream: "stdout" | "stderr" | "system";
  line: string;
}

interface WorkerClaimPayload {
  tenantId: string;
  workerId: string;
}

interface WorkerTerminalPayload {
  runId: string;
  data: string;
}

interface WorkerEnvelopeBase {
  type: "hello" | "heartbeat" | "claimRun" | "invoke" | "streamLogs" | "completeRun" | "terminalData" | "deploymentStatus" | "ack" | "error";
  requestId?: string;
}

export interface WorkerHelloEnvelope extends WorkerEnvelopeBase {
  type: "hello";
  payload: WorkerHelloPayload;
}

interface WorkerHeartbeatEnvelope extends WorkerEnvelopeBase {
  type: "heartbeat";
  payload: { workerId: string; timestamp: number };
}

interface WorkerClaimEnvelope extends WorkerEnvelopeBase {
  type: "claimRun";
  payload: WorkerClaimPayload;
}

export interface WorkerInvokeEnvelope extends WorkerEnvelopeBase {
  type: "invoke";
  requestId: string;
  payload: WorkerInvokePayload;
}

export interface WorkerLogsEnvelope extends WorkerEnvelopeBase {
  type: "streamLogs";
  requestId: string;
  payload: WorkerLogPayload;
}

export interface WorkerCompleteEnvelope extends WorkerEnvelopeBase {
  type: "completeRun";
  requestId: string;
  payload: WorkerCompletePayload;
}

interface WorkerTerminalEnvelope extends WorkerEnvelopeBase {
  type: "terminalData";
  requestId: string;
  payload: WorkerTerminalPayload;
}

interface WorkerAckEnvelope extends WorkerEnvelopeBase {
  type: "ack";
  requestId?: string;
  payload?: Record<string, unknown>;
}

interface WorkerErrorEnvelope extends WorkerEnvelopeBase {
  type: "error";
  requestId?: string;
  code: string;
  message: string;
}

export type WorkerInboundEnvelope =
  | WorkerHelloEnvelope
  | WorkerHeartbeatEnvelope
  | WorkerClaimEnvelope
  | WorkerLogsEnvelope
  | WorkerCompleteEnvelope
  | WorkerTerminalEnvelope
  | WorkerAckEnvelope
  | WorkerErrorEnvelope;

type WorkerOutboundEnvelope = WorkerInvokeEnvelope | WorkerAckEnvelope | WorkerErrorEnvelope;

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
