import type {
  AuditStore,
  BridgeFrame,
  BridgeSession,
} from "@clawjs/mesh";

import {
  handleTccJob,
  type TccAuditSink,
  type TccJobContext,
} from "./tcc-job-handler.ts";
import type { ComputerUse } from "./computer-use.ts";
import type {
  TerminalOutputEvent,
  TerminalExitEvent,
  TerminalProcessController,
  TerminalProcess,
} from "./terminal.ts";

export interface TccWsHandlerDeps {
  computerUse?: ComputerUse;
  terminal?: TerminalProcessController;
  auditStore: AuditStore;
  streamTerminalEvents?: boolean;
}

export function createTccWsHandler(
  deps: TccWsHandlerDeps,
): (session: BridgeSession, frame: BridgeFrame) => Promise<void> {
  const stream = deps.streamTerminalEvents !== false;
  return async function onFrame(session, frame) {
    if (frame.kind !== "request") return;
    const payload = frame.payload as Record<string, unknown> | undefined;
    const method = typeof payload?.method === "string" ? payload.method : null;
    if (!method || !method.startsWith("tcc.")) return;
    const requestId = frame.id;
    const jobId = `${session.id}:${requestId ?? "anon"}`;
    const auditSink: TccAuditSink = {
      record: (input) => deps.auditStore.record(input),
    };
    const ctx: TccJobContext = {
      computerUse: deps.computerUse,
      terminal: deps.terminal,
      audit: auditSink,
      actorId: session.id,
      onTerminalSpawn:
        stream && deps.terminal
          ? (proc) => attachStreaming(deps.terminal!, session, proc, requestId)
          : undefined,
    };
    const outcome = await handleTccJob(ctx, payload, jobId);
    if (!session.closed) {
      session.send({
        kind: "response",
        id: requestId,
        payload: outcome,
      });
    }
  };
}

function attachStreaming(
  terminal: TerminalProcessController,
  session: BridgeSession,
  proc: TerminalProcess,
  requestId?: string,
): void {
  const onData = (ev: TerminalOutputEvent): void => {
    if (ev.id !== proc.id || session.closed) return;
    session.send({
      kind: "event",
      id: requestId,
      payload: {
        method: `tcc.terminal.${ev.channel}`,
        params: {
          id: ev.id,
          data: ev.data.toString("base64"),
        },
      },
    });
  };
  const onExit = (ev: TerminalExitEvent): void => {
    if (ev.id !== proc.id) return;
    if (!session.closed) {
      session.send({
        kind: "event",
        id: requestId,
        payload: {
          method: "tcc.terminal.exit",
          params: ev,
        },
      });
    }
    detach();
  };
  const onClose = (): void => detach();
  function detach(): void {
    terminal.off("data", onData);
    terminal.off("exit", onExit);
    session.socket.off("close", onClose);
  }
  terminal.on("data", onData);
  terminal.on("exit", onExit);
  if (session.closed) {
    detach();
    return;
  }
  session.socket.once("close", onClose);
}
