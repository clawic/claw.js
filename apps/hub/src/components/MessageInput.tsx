"use client";

import * as React from "react";
import { PlusCircle, SmilePlus, SendHorizontal } from "lucide-react";
import { useHub } from "@/context/HubContext";

interface MessageInputProps {
  channelId: string;
  channelName?: string;
  threadId?: string;
  onSent?: () => void;
}

export function MessageInput({ channelId, channelName, threadId, onSent }: MessageInputProps) {
  const { currentAgentId, currentAgentKind } = useHub();
  const [content, setContent] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = React.useState(false);

  const placeholder = threadId
    ? "Reply in thread..."
    : channelName
      ? `Message #${channelName}`
      : "Send a message...";

  const handleSubmit = async () => {
    const text = content.trim();
    if (!text || sending) return;
    setSending(true);
    setContent("");

    try {
      const url = threadId
        ? `/api/messages/${threadId}/thread`
        : `/api/channels/${channelId}/messages`;

      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: text,
          authorId: currentAgentId,
          authorKind: currentAgentKind,
          ...(threadId ? {} : {}),
        }),
      });
      onSent?.();
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [content]);

  return (
    <div className="px-4 pb-6 pt-1">
      <div
        className="flex items-end gap-2 rounded-lg px-4 py-2"
        style={{ backgroundColor: "var(--input-bg)" }}
      >
        <button className="mb-1 shrink-0 text-muted-foreground hover:text-foreground">
          <PlusCircle className="h-5 w-5" />
        </button>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className="max-h-[200px] min-h-[24px] flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button className="mb-1 shrink-0 text-muted-foreground hover:text-foreground">
          <SmilePlus className="h-5 w-5" />
        </button>
        {content.trim() && (
          <button
            onClick={handleSubmit}
            disabled={sending}
            className="mb-1 shrink-0 rounded-md bg-primary px-2 py-1 text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
