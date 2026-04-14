import type { MonitorStatus } from "../lib/types";

const BG: Record<MonitorStatus, string> = {
  up: "bg-green",
  down: "bg-red",
  degraded: "bg-yellow",
  pending: "bg-gray",
};

const TEXT: Record<MonitorStatus, string> = {
  up: "text-green",
  down: "text-red",
  degraded: "text-yellow",
  pending: "text-gray",
};

export function StatusDot({
  status,
  size = 10,
  pulse = false,
}: {
  status: MonitorStatus;
  size?: number;
  pulse?: boolean;
}) {
  return (
    <span className={`relative inline-flex shrink-0 ${TEXT[status]}`}>
      <span
        className={`inline-block rounded-full ${BG[status]}`}
        style={{ width: size, height: size }}
      />
      {pulse && status !== "pending" && (
        <span
          className={`absolute rounded-full ${BG[status]} opacity-50`}
          style={{
            width: size,
            height: size,
            animation: "pulse-ring 2s ease-out infinite",
          }}
        />
      )}
    </span>
  );
}
