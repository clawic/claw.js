import type {
  AuditStore,
  BridgeFrame,
  BridgeSession,
} from "@clawjs/mesh";

import type { SshClient } from "@clawjs/ssh-client";

import {
  handleSshJob,
  type SshAuditSink,
  type SshJobContext,
} from "./ssh-job-handler.ts";

export interface SshWsHandlerDeps {
  client: SshClient;
  auditStore: AuditStore;
}

export function createSshWsHandler(
  deps: SshWsHandlerDeps,
): (session: BridgeSession, frame: BridgeFrame) => Promise<void> {
  return async function onFrame(session, frame) {
    if (frame.kind !== "request") return;
    const payload = frame.payload as Record<string, unknown> | undefined;
    const method = typeof payload?.method === "string" ? payload.method : null;
    if (!method || !method.startsWith("ssh.")) return;
    const requestId = frame.id;
    const jobId = `${session.id}:${requestId ?? "anon"}`;
    const auditSink: SshAuditSink = {
      record: (input) => deps.auditStore.record(input),
    };
    const ctx: SshJobContext = {
      client: deps.client,
      audit: auditSink,
      actorId: session.id,
      onStdout: (chunk) => {
        if (session.closed) return;
        session.send({
          kind: "event",
          id: requestId,
          payload: {
            method: "ssh.exec.stdout",
            params: { data: chunk.toString("base64") },
          },
        });
      },
      onStderr: (chunk) => {
        if (session.closed) return;
        session.send({
          kind: "event",
          id: requestId,
          payload: {
            method: "ssh.exec.stderr",
            params: { data: chunk.toString("base64") },
          },
        });
      },
    };
    const outcome = await handleSshJob(ctx, payload, jobId);
    if (!session.closed) {
      session.send({
        kind: "response",
        id: requestId,
        payload: outcome,
      });
    }
  };
}
