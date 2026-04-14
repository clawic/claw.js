import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { api } from "../lib/api";

type Page = {
  id: string;
  title: string;
  slug: string;
  body: string;
  status: string;
  tags: string[];
};

export function PageEdit() {
  const { spaceId = "main", pageSlug } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !pageSlug || pageSlug === "new";

  const { data: existing } = useQuery({
    queryKey: ["page", spaceId, pageSlug],
    queryFn: () => api.get<Page>(`/spaces/${spaceId}/pages/${pageSlug}`),
    enabled: !isNew,
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState("published");
  const [changeSummary, setChangeSummary] = useState("");

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setBody(existing.body);
      setTags(existing.tags.join(", "));
      setStatus(existing.status);
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsedTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
      if (isNew) {
        return api.post(`/spaces/${spaceId}/pages`, { title, body, tags: parsedTags, status });
      }
      return api.patch(`/spaces/${spaceId}/pages/${pageSlug}`, {
        title, body, tags: parsedTags, status, changeSummary: changeSummary || undefined,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      queryClient.invalidateQueries({ queryKey: ["page"] });
      const slug = (result as Page)?.slug ?? pageSlug;
      navigate(`/${spaceId}/${slug}`);
    },
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link
            to={isNew ? `/${spaceId}` : `/${spaceId}/${pageSlug}`}
            className="flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text"
          >
            <ArrowLeft size={14} />
            {isNew ? "Cancel" : "Back"}
          </Link>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!title.trim() || saveMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded text-[13px] font-medium hover:opacity-90 disabled:opacity-40"
          >
            <Save size={14} />
            {saveMutation.isPending ? "Saving..." : isNew ? "Create Page" : "Save Changes"}
          </button>
        </div>

        {/* Title */}
        <input
          type="text"
          placeholder="Page title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-2xl font-bold bg-transparent border-0 outline-0 mb-4 placeholder:text-text-faint"
        />

        {/* Status + tags row */}
        <div className="flex items-center gap-3 mb-4">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-bg-input border border-border rounded px-3 py-1.5 text-[13px] outline-0"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <input
            type="text"
            placeholder="Tags (comma separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="flex-1 bg-bg-input border border-border rounded px-3 py-1.5 text-[13px] outline-0"
          />
        </div>

        {/* Body editor */}
        <textarea
          placeholder="Write your page content in Markdown...&#10;&#10;Use [[page-slug]] to link to other pages."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full min-h-[400px] bg-bg-input border border-border rounded px-4 py-3 text-[14px] font-mono outline-0 resize-y leading-relaxed"
        />

        {/* Change summary (edit mode only) */}
        {!isNew && (
          <input
            type="text"
            placeholder="Change summary (optional)"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            className="w-full mt-3 bg-bg-input border border-border rounded px-3 py-2 text-[13px] outline-0"
          />
        )}

        {saveMutation.isError && (
          <p className="mt-3 text-[13px] text-red">
            {(saveMutation.error as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}
