import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
      <div style={{ maxWidth: 708, margin: "0 auto", padding: "40px 48px 120px" }}>
        {/* Topbar */}
        <div className="flex items-center justify-between mb-8">
          <Link
            to={isNew ? `/${spaceId}` : `/${spaceId}/${pageSlug}`}
            className="text-[13px] hover:underline"
            style={{ color: "var(--color-text-muted)" }}
          >
            {isNew ? "Cancel" : "Back"}
          </Link>

          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="border-0 rounded px-2 py-1 text-[12px] outline-0"
              style={{ background: "var(--color-bg-input)", color: "var(--color-text-muted)" }}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>

            <button
              onClick={() => saveMutation.mutate()}
              disabled={!title.trim() || saveMutation.isPending}
              className="px-3 py-1 rounded text-[13px] font-medium border-0 cursor-pointer transition-opacity disabled:opacity-30"
              style={{ background: "var(--color-primary)", color: "#fff", fontFamily: "inherit" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              {saveMutation.isPending ? "Saving..." : isNew ? "Create" : "Save"}
            </button>
          </div>
        </div>

        {/* Title */}
        <input
          type="text"
          placeholder="Untitled"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-transparent border-0 outline-0 font-bold"
          style={{
            fontSize: "40px",
            letterSpacing: "-0.04em",
            lineHeight: 1.2,
            color: "var(--color-text)",
            marginBottom: "8px",
          }}
        />

        {/* Tags */}
        <input
          type="text"
          placeholder="Add tags..."
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="w-full bg-transparent border-0 outline-0 text-[13px] mb-4"
          style={{ color: "var(--color-text-muted)" }}
        />

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--color-border)", marginBottom: "20px" }} />

        {/* Body editor */}
        <textarea
          placeholder="Type '/' for commands, or just start writing..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full border-0 outline-0 resize-y"
          style={{
            minHeight: "400px",
            fontSize: "15px",
            lineHeight: 1.7,
            background: "transparent",
            color: "var(--color-text)",
            fontFamily: "var(--font-mono)",
            padding: 0,
          }}
        />

        {/* Change summary */}
        {!isNew && (
          <input
            type="text"
            placeholder="Describe your changes..."
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            className="w-full border-0 rounded px-3 py-2 text-[13px] outline-0 mt-4"
            style={{ background: "var(--color-bg-input)", color: "var(--color-text)" }}
          />
        )}

        {saveMutation.isError && (
          <p className="mt-3 text-[13px]" style={{ color: "var(--color-red)" }}>
            {(saveMutation.error as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}
