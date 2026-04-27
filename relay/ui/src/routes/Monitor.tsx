import { useAuth } from "../lib/auth";
import { PageBody, PageHeader } from "../components/PageHeader";
import { useMonitorStream } from "./monitor/useMonitorStream";
import { MonitorAgentStrip } from "./monitor/MonitorAgentStrip";
import { MonitorSessionsList } from "./monitor/MonitorSessionsList";
import { MonitorTranscript } from "./monitor/MonitorTranscript";
import { MonitorActivityTicker } from "./monitor/MonitorActivityTicker";

export function MonitorPage() {
  const { auth } = useAuth();
  const tenantId = auth!.tenantId;
  const { state, selectSession } = useMonitorStream(tenantId);

  const selected = state.selectedSessionId
    ? state.sessions[state.selectedSessionId] ?? null
    : null;

  return (
    <>
      <PageHeader title="Monitor">
        <span className="text-[11px] text-text-muted">
          {state.connected ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green" />
              live
            </span>
          ) : state.error ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red" />
              {state.error}
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-text-faint" />
              connecting…
            </span>
          )}
        </span>
      </PageHeader>
      <PageBody>
        <div className="h-full w-full flex flex-col border border-border rounded overflow-hidden bg-bg">
          <MonitorAgentStrip agents={state.agents} />
          <div className="flex-1 grid grid-cols-[280px_1fr] min-h-0">
            <MonitorSessionsList
              sessions={state.sessions}
              attachedClients={state.attachedClients}
              selectedSessionId={state.selectedSessionId}
              myClientId={state.myClientId}
              onSelect={selectSession}
            />
            <MonitorTranscript session={selected} />
          </div>
          <MonitorActivityTicker activity={state.activity} />
        </div>
      </PageBody>
    </>
  );
}
