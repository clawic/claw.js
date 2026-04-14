import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, ChevronDown, ChevronUp } from "lucide-react";
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
    <div className="mt-6 border border-border rounded">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-3 text-[13px] font-medium hover:bg-bg-hover transition-colors"
      >
        <span className="flex items-center gap-2">
          <History size={14} />
          Revision History
        </span>
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {isOpen && (
        <div className="border-t border-border">
          {revisions.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-text-faint">No revisions yet</p>
          )}
          {revisions.map((rev) => {
            const editor = rev.editedByAgentId ?? rev.editedByUserId ?? "Unknown";
            const isSelected = selectedRevision === rev.revisionNumber;
            return (
              <div key={rev.id}>
                <button
                  onClick={() => setSelectedRevision(isSelected ? null : rev.revisionNumber)}
                  className={`flex items-center justify-between w-full px-4 py-2.5 text-[13px] hover:bg-bg-hover transition-colors border-b border-border ${
                    isSelected ? "bg-primary-bg" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-text-faint">v{rev.revisionNumber}</span>
                    <span className="text-text-muted">{editor}</span>
                    {rev.changeSummary && (
                      <span className="text-text-faint truncate max-w-[200px]">
                        {rev.changeSummary}
                      </span>
                    )}
                  </span>
                  <span className="text-text-faint text-[12px]">
                    {new Date(rev.createdAt).toLocaleDateString()}
                  </span>
                </button>
                {isSelected && selected && (
                  <div className="px-4 py-3 bg-bg-panel border-b border-border">
                    <pre className="text-[12px] whitespace-pre-wrap font-mono overflow-x-auto max-h-64 overflow-y-auto">
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
