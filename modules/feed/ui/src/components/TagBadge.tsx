export function TagBadge({ tag, onClick }: { tag: string; onClick?: () => void }) {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 ${
        onClick ? "cursor-pointer hover:bg-zinc-700" : ""
      }`}
    >
      {tag}
    </span>
  );
}
