interface Props {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = "" }: Props) {
  const normalized = status.toLowerCase().replace(/\s+/g, "_");
  return (
    <span className={`status-badge status-${normalized} ${className}`}>
      {status}
    </span>
  );
}
