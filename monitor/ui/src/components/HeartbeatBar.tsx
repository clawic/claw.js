import { useState, useRef, useCallback } from "react";
import type { Heartbeat, MonitorStatus } from "../lib/types";

const FILL: Record<MonitorStatus, string> = {
  up: "var(--color-green)",
  down: "var(--color-red)",
  degraded: "var(--color-yellow)",
  pending: "var(--color-gray)",
};

interface Props {
  heartbeats: Heartbeat[];
  barWidth?: number;
  barHeight?: number;
  gap?: number;
  maxBars?: number;
  showTooltip?: boolean;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function HeartbeatBar({
  heartbeats,
  barWidth = 5,
  barHeight = 30,
  gap = 3,
  maxBars = 50,
  showTooltip = true,
}: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bars = heartbeats.slice(-maxBars);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current || bars.length === 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      const idx = Math.floor(relX * bars.length);
      setHovered(Math.max(0, Math.min(idx, bars.length - 1)));
    },
    [bars.length],
  );

  if (bars.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-text-faint text-xs"
        style={{ height: barHeight }}
      >
        No data
      </div>
    );
  }

  const totalWidth = bars.length * (barWidth + gap) - gap;

  return (
    <div className="relative" ref={containerRef}>
      <svg
        width="100%"
        height={barHeight}
        viewBox={`0 0 ${totalWidth} ${barHeight}`}
        preserveAspectRatio="none"
        className="block rounded-sm"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
      >
        {bars.map((beat, i) => (
          <rect
            key={beat.id}
            x={i * (barWidth + gap)}
            y={0}
            width={barWidth}
            height={barHeight}
            rx={2}
            fill={FILL[beat.status]}
            opacity={hovered !== null && hovered !== i ? 0.35 : 1}
            style={{ transition: "opacity 0.12s ease" }}
          />
        ))}
      </svg>

      {showTooltip && hovered !== null && bars[hovered] && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            bottom: barHeight + 8,
            left: `${((hovered + 0.5) / bars.length) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="bg-[#1a1f2b] border border-white/10 rounded-lg px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.5)] whitespace-nowrap text-xs">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: FILL[bars[hovered].status] }}
              />
              <span className="font-bold text-text tracking-wide">
                {bars[hovered].status.toUpperCase()}
              </span>
            </div>
            {bars[hovered].responseTimeMs != null && (
              <div className="text-text-muted">
                Ping: <span className="text-text font-medium">{bars[hovered].responseTimeMs}ms</span>
              </div>
            )}
            {bars[hovered].detail && (
              <div className="text-text-faint">{bars[hovered].detail}</div>
            )}
            <div className="text-text-faint mt-1 text-[10px]">{formatTime(bars[hovered].createdAt)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
