import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  online: "bg-success",
  idle: "bg-warning",
  busy: "bg-danger",
  offline: "bg-muted-foreground",
};

export function PresenceIndicator({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "block h-3 w-3 rounded-full border-2 border-card",
        statusColors[status] ?? statusColors.offline,
        className,
      )}
    />
  );
}
