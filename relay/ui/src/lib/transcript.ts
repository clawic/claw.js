export type RawMessage = {
  role?: string;
  type?: string;
  content?: string;
  text?: string;
  message?: string;
};

export type SessionDetail = {
  session?: { messages?: RawMessage[]; transcript?: RawMessage[] };
  messages?: RawMessage[];
  transcript?: RawMessage[];
};

export type TranscriptLine = {
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
};

export function normalizeMessages(data: SessionDetail): TranscriptLine[] {
  const raw =
    data.session?.messages ??
    data.session?.transcript ??
    data.messages ??
    data.transcript ??
    [];
  return raw.map((m) => {
    const role = (m.role ?? (m.type === "user" ? "user" : "assistant")) as
      | "user"
      | "assistant";
    const text = m.content ?? m.text ?? m.message ?? "";
    return { role, text };
  });
}
