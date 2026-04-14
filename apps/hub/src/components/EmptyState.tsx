import { Hash, MessageCircle } from "lucide-react";

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: "channel" | "dm";
  title: string;
  description?: string;
}) {
  const Icon = icon === "dm" ? MessageCircle : Hash;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
        <Icon className="h-10 w-10 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-xl font-bold">{title}</h2>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
