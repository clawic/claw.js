interface FilterBarProps {
  status: string;
  onStatusChange: (status: string) => void;
  itemType: string;
  onItemTypeChange: (type: string) => void;
  importance: string;
  onImportanceChange: (imp: string) => void;
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 outline-none focus:border-brand-500"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function FilterBar({
  status,
  onStatusChange,
  itemType,
  onItemTypeChange,
  importance,
  onImportanceChange,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-2.5">
      <Select
        value={status}
        onChange={onStatusChange}
        options={[
          { value: "", label: "All status" },
          { value: "unread", label: "Unread" },
          { value: "read", label: "Read" },
          { value: "archived", label: "Archived" },
        ]}
      />
      <Select
        value={itemType}
        onChange={onItemTypeChange}
        options={[
          { value: "", label: "All types" },
          { value: "rss_entry", label: "RSS" },
          { value: "tweet", label: "Tweet" },
          { value: "article", label: "Article" },
          { value: "youtube_video", label: "YouTube" },
          { value: "reddit_post", label: "Reddit" },
          { value: "github_issue", label: "GitHub Issue" },
          { value: "bookmark", label: "Bookmark" },
          { value: "podcast_episode", label: "Podcast" },
          { value: "newsletter", label: "Newsletter" },
        ]}
      />
      <Select
        value={importance}
        onChange={onImportanceChange}
        options={[
          { value: "", label: "All importance" },
          { value: "critical", label: "Critical" },
          { value: "high", label: "High" },
          { value: "normal", label: "Normal" },
          { value: "low", label: "Low" },
        ]}
      />
    </div>
  );
}
