import { useState } from "react";
import type { Heartbeat } from "../lib/types";

interface Props {
  heartbeats: Heartbeat[];
  height?: number;
}

export function ResponseTime({ heartbeats, height = 150 }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const points = heartbeats.filter((h) => h.responseTimeMs != null);

  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-text-faint text-sm"
        style={{ height }}
      >
        Not enough data for chart
      </div>
    );
  }

  const values = points.map((p) => p.responseTimeMs!);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values);
  const avgVal = Math.round(values.reduce((a, b) => a + b, 0) / values.length);

  const padTop = 12;
  const padBottom = 8;
  const chartH = height - padTop - padBottom;
  const viewW = 800;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * viewW;
    const y = padTop + chartH - (p.responseTimeMs! / maxVal) * chartH;
    return { x, y };
  });

  // Smooth bezier
  let path = `M${coords[0].x},${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const cpx = (prev.x + curr.x) / 2;
    path += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
  }
  const areaPath = `${path} L${viewW},${height} L0,${height} Z`;

  const hoveredPoint = hoveredIdx !== null ? coords[hoveredIdx] : null;
  const hoveredBeat = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${viewW} ${height}`}
        preserveAspectRatio="none"
        className="block"
        onMouseLeave={() => setHoveredIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = (e.clientX - rect.left) / rect.width;
          const idx = Math.round(relX * (coords.length - 1));
          setHoveredIdx(Math.max(0, Math.min(idx, coords.length - 1)));
        }}
      >
        {/* Horizontal grid */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={0} y1={padTop + chartH * (1 - frac)}
            x2={viewW} y2={padTop + chartH * (1 - frac)}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />
        ))}

        <defs>
          <linearGradient id="rtFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-green)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="var(--color-green)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#rtFill)" />
        <path d={path} fill="none" stroke="var(--color-green)" strokeWidth={2} strokeLinejoin="round" />

        {/* Hover line + dot */}
        {hoveredPoint && (
          <>
            <line
              x1={hoveredPoint.x} y1={padTop}
              x2={hoveredPoint.x} y2={height - padBottom}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <circle
              cx={hoveredPoint.x} cy={hoveredPoint.y}
              r={4.5}
              fill="var(--color-green)"
              stroke="var(--color-bg)"
              strokeWidth={2.5}
            />
          </>
        )}
      </svg>

      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-5 text-xs text-text-muted">
          <span>Min <span className="text-green font-semibold">{minVal}ms</span></span>
          <span>Avg <span className="text-green font-semibold">{avgVal}ms</span></span>
          <span>Max <span className="text-green font-semibold">{maxVal}ms</span></span>
        </div>
        {hoveredBeat && (
          <div className="text-xs">
            <span className="text-green font-bold">{hoveredBeat.responseTimeMs}ms</span>
            <span className="text-text-faint ml-2">
              {new Date(hoveredBeat.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
