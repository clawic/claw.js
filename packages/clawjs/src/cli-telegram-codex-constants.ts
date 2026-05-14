export const LEGACY_TELEGRAM_CODEX_PROCESSOR_ID = "telegram-codex";
export const TELEGRAM_CODEX_DEFAULT_INTERVAL_MS = 2_000;
export const TELEGRAM_CODEX_DEFAULT_TIMEOUT_SECONDS = 10;
export const TELEGRAM_CODEX_DEFAULT_PROCESSOR_TIMEOUT_MS = 600_000;
export const TELEGRAM_CODEX_BOT_COMMANDS = [
  { command: "new", description: "Start a fresh session" },
  { command: "reset", description: "Reset this session" },
  { command: "status", description: "Show session status" },
  { command: "queue", description: "Show queued messages" },
  { command: "stop", description: "Stop current run" },
  { command: "continue", description: "Process queued messages" },
  { command: "compact", description: "Compact session context" },
  { command: "summary", description: "Show active summary" },
  { command: "debug", description: "Show debug status" },
];
export const TELEGRAM_TOPIC_ICON_PRESETS = {
  general: { emoji: "💬", customEmojiId: "5417915203100613993" },
  work: { emoji: "💼", customEmojiId: "5348227245599105972" },
  code: { emoji: "💻", customEmojiId: "5350554349074391003" },
  research: { emoji: "🔎", customEmojiId: "5309965701241379366" },
  notes: { emoji: "📝", customEmojiId: "5373251851074415873" },
  brainstorm: { emoji: "💡", customEmojiId: "5312536423851630001" },
  done: { emoji: "✅", customEmojiId: "5237699328843200968" },
  agent: { emoji: "🤖", customEmojiId: "5309832892262654231" },
  thinking: { emoji: "🧠", customEmojiId: "5237889595894414384" },
} as const;
export type TelegramTopicIconPreset = keyof typeof TELEGRAM_TOPIC_ICON_PRESETS;

export const TELEGRAM_CODEX_ATTACHMENT_INSTRUCTIONS = [
  "Telegram delivery supports photos, videos, audio, animations, and documents when you have a Telegram file_id, an HTTPS URL, or a local file path generated in the active workspace.",
  "If the user asks you to send a photo or file, do not say this session cannot send attachments just because the reply is mediated through Telegram.",
  "If the user asks for a presentation or slides, prefer the local `claw slides` CLI: create a deck, add slides with layouts, validate it, render a PDF first, and attach the rendered PDF path as a document. Render PPTX/HTML/PNG too only when the user asks for them or you need visual debugging.",
  "Use this slide CLI syntax directly without exploratory help calls: `claw slides create \"Title\" --theme executive`; `claw slides add <deck> --layout title --heading \"...\" --subtitle \"...\"`; `claw slides add <deck> --layout title-bullets --heading \"...\" --bullet \"...\" --bullet \"...\"`; `claw slides add <deck> --layout image-left --heading \"...\" --body \"...\" --image ./path/to/image.svg`; `claw slides add <deck> --layout image-right --heading \"...\" --bullet \"...\" --image ./path/to/image.svg`; `claw slides add <deck> --layout full-bleed-image --heading \"...\" --subtitle \"...\" --image ./path/to/image.svg`; `claw slides add <deck> --layout comparison --heading \"...\" --left \"...\" --right \"...\"`; `claw slides add <deck> --layout metric-grid --heading \"...\" --metrics \"Label=Value\"`; `claw slides validate <deck>`; `claw slides render <deck> --format pdf`.",
  "When building a deck, run `claw slides add` commands sequentially. Do not start multiple slide writes in parallel against the same deck.",
  "Do not put literal `\\n` escape sequences into slide flags. Use repeated `--bullet` or `--step` flags for lists, and keep comparison text as short readable sentences.",
  "For presentation requests, complete the deck and validate/render it before replying. Do not send progress updates as the final answer; the final Telegram action should attach the rendered PDF path as a document.",
  "To attach media, include a final fenced block named clawjs-telegram-actions containing JSON: {\"actions\":[{\"type\":\"send_message\",\"mediaType\":\"photo|video|document|audio|animation\",\"media\":\"file_id_https_url_or_local_path\",\"text\":\"optional caption\"}]}.",
].join(" ");
