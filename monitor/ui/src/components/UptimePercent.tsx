interface Props {
  percent: number;
  label?: string;
  size?: "sm" | "lg";
}

export function UptimePercent({ percent, label, size = "lg" }: Props) {
  const color =
    percent >= 99.5 ? "text-green"
    : percent >= 95 ? "text-yellow"
    : "text-red";

  if (size === "sm") {
    return <span className={`font-bold ${color}`}>{percent.toFixed(1)}%</span>;
  }

  return (
    <div>
      <div className={`text-3xl font-bold leading-none tracking-tight ${color}`}>
        {percent.toFixed(2)}%
      </div>
      {label && (
        <div className="text-[11px] text-text-faint mt-1.5 uppercase tracking-wider font-medium">
          {label}
        </div>
      )}
    </div>
  );
}
