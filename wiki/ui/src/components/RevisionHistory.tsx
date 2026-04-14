import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type Revision = {
  id: string;
  pageId: string;
  revisionNumber: number;
  title: string;
  body: string;
  changeSummary: string | null;
  editedByAgentId: string | null;
  editedByUserId: string | null;
  createdAt: string;
};

interface Props {
  spaceId: string;
  pageSlug: string;
}

export function RevisionHistory({ spaceId, pageSlug }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: ["revisions", spaceId, pageSlug],
    queryFn: () => api.get<{ items: Revision[] }>(`/spaces/${spaceId}/pages/${pageSlug}/revisions`),
    enabled: isOpen,
  });

  const revisions = data?.items ?? [];
  const selected = selectedRevision !== null
    ? revisions.find((r) => r.revisionNumber === selectedRevision)
    : null;

  return (
    <div className="mt-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-[12px] border-0 bg-transparent cursor-pointer transition-colors px-2 py-1 rounded"
        style={{ color: "var(--color-text-muted)", fontFamily: "inherit" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <span>{isOpen ? "\u25BC" : "\u25B6"}</span>
        Revision History
      </button>

      {isOpen && (
        <div className="mt-2 ml-2">
          {revisions.length === 0 && (
            <p className="text-[13px] py-2" style={{ color: "var(--color-text-faint)" }}>
              No revisions yet
            </p>
          )}
          {revisions.map((rev) => {
            const editor = rev.editedByAgentId ?? rev.editedByUserId ?? "Unknown";
            const isSelected = selectedRevision === rev.revisionNumber;
            return (
              <div key={rev.id}>
                <button
                  onClick={() => setSelectedRevision(isSelected ? null : rev.revisionNumber)}
                  className="flex items-center gap-3 w-full text-left py-1.5 px-2 rounded text-[13px] border-0 bg-transparent cursor-pointer transition-colors"
                  style={{
                    background: isSelected ? "var(--color-bg-active)" : undefined,
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--color-bg-hover)"; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  <span className="font-mono text-[11px]" style={{ color: "var(--color-text-faint)" }}>
                    v{rev.revisionNumber}
                  </span>
                  <span style={{ color: "var(--color-text-muted)" }}>{editor}</span>
                  {rev.changeSummary && (
                    <span className="truncate" style={{ maxWidth: 180, color: "var(--color-text-faint)" }}>
                      {rev.changeSummary}
                    </span>
                  )}
                  <span className="ml-auto text-[11px]" style={{ color: "var(--color-text-faint)" }}>
                    {new Date(rev.createdAt).toLocaleDateString()}
                  </span>
                </button>
                {isSelected && selected && (
                  <div
                    className="mx-2 my-1 rounded p-3"
                    style={{ background: "var(--color-bg-panel)" }}
                  >
                    <pre
                      className="text-[12px] whitespace-pre-wrap font-mono overflow-x-auto max-h-64 overflow-y-auto"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {selected.body}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
