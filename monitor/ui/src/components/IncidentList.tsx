import type { Incident } from "../lib/types";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

const STYLES: Record<string, { pill: string; label: string }> = {
  down:     { pill: "bg-red/15 text-red",    label: "Down" },
  degraded: { pill: "bg-yellow/15 text-yellow", label: "Degraded" },
  up:       { pill: "bg-green/15 text-green", label: "Recovered" },
};

export function IncidentList({ incidents }: { incidents: Incident[] }) {
  if (incidents.length === 0) {
    return (
      <div className="text-center py-10 text-text-faint text-sm">
        No incidents recorded
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-text-faint text-[11px] uppercase tracking-wider">
          <th className="text-left font-medium pb-3 pl-1">Status</th>
          <th className="text-left font-medium pb-3">Date &amp; Time</th>
          <th className="text-right font-medium pb-3 pr-1">Duration</th>
        </tr>
      </thead>
      <tbody>
        {incidents.map((inc) => {
          const s = STYLES[inc.status] ?? STYLES.down;
          return (
            <tr key={inc.id} className="border-t border-white/5">
              <td className="py-2.5 pl-1">
                <span className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold ${s.pill}`}>
                  {s.label}
                </span>
              </td>
              <td className="py-2.5 text-text-muted">{formatDate(inc.startedAt)}</td>
              <td className="py-2.5 pr-1 text-right">
                {inc.resolvedAt ? (
                  <span className="text-text-faint">
                    {formatDuration(inc.durationMs ?? (inc.resolvedAt - inc.startedAt))}
                  </span>
                ) : (
                  <span className="text-red font-semibold text-xs">Ongoing</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
