// Generate built-in skills (14 personality presets + 20 procedure skills)
// into the central skills home. Idempotent: skips skills that already exist.

import path from "path";

import type { SoulSpec } from "@clawjs/core";

import { BUILTIN_SOUL_PRESETS, SoulStore } from "../soul/store.ts";
import type { SkillsStore } from "./store.ts";

interface BuiltinReport {
  personalitiesCreated: number;
  proceduresCreated: number;
  skipped: number;
}

const BUILTIN_PROCEDURES: Array<{ slug: string; label: string; summary: string; tags: string[] }> = [
  { slug: "support-triage", label: "Support Triage", summary: "Prioritize and route incoming support requests automatically.", tags: ["support", "triage", "customer", "routing"] },
  { slug: "code-review", label: "Code Review", summary: "Automated code review with style and security checks.", tags: ["code", "review", "security", "lint"] },
  { slug: "data-extraction", label: "Data Extraction", summary: "Extract structured data from unstructured text and documents.", tags: ["data", "extraction", "parsing", "text"] },
  { slug: "email-draft", label: "Email Draft", summary: "Draft professional emails based on context and tone.", tags: ["email", "draft", "writing", "communication"] },
  { slug: "meeting-summary", label: "Meeting Summary", summary: "Summarize meeting transcripts into action items and key points.", tags: ["meeting", "summary", "transcription", "notes"] },
  { slug: "content-moderation", label: "Content Moderation", summary: "Detect and flag inappropriate or harmful content.", tags: ["moderation", "content", "safety", "filter"] },
  { slug: "translation", label: "Translation", summary: "Translate text between multiple languages with context awareness.", tags: ["translation", "language", "i18n", "localization"] },
  { slug: "sentiment-analysis", label: "Sentiment Analysis", summary: "Analyze sentiment and emotional tone of text.", tags: ["sentiment", "analysis", "emotion", "nlp"] },
  { slug: "document-qa", label: "Document Q&A", summary: "Answer questions about uploaded documents and knowledge bases.", tags: ["document", "qa", "knowledge", "search"] },
  { slug: "task-planning", label: "Task Planning", summary: "Break down complex goals into actionable task lists.", tags: ["task", "planning", "project", "management"] },
  { slug: "api-connector", label: "API Connector", summary: "Connect and orchestrate calls to external REST and GraphQL APIs.", tags: ["api", "connector", "rest", "graphql", "integration"] },
  { slug: "image-analysis", label: "Image Analysis", summary: "Analyze and describe images, detect objects and text.", tags: ["image", "analysis", "vision", "ocr"] },
  { slug: "calendar-manager", label: "Calendar Manager", summary: "Manage calendar events, scheduling and availability.", tags: ["calendar", "scheduling", "events", "time"] },
  { slug: "knowledge-base", label: "Knowledge Base", summary: "Build and query a structured knowledge base from documents.", tags: ["knowledge", "base", "rag", "retrieval", "search"] },
  { slug: "workflow-automation", label: "Workflow Automation", summary: "Automate multi-step workflows with conditional logic.", tags: ["workflow", "automation", "pipeline", "orchestration"] },
  { slug: "report-generator", label: "Report Generator", summary: "Generate formatted reports from data and templates.", tags: ["report", "generator", "template", "formatting"] },
  { slug: "web-scraper", label: "Web Scraper", summary: "Extract data from web pages with configurable selectors.", tags: ["web", "scraper", "extraction", "crawl"] },
  { slug: "notification-hub", label: "Notification Hub", summary: "Send notifications across multiple channels (email, Slack, SMS).", tags: ["notification", "alert", "slack", "email", "sms"] },
  { slug: "form-builder", label: "Form Builder", summary: "Create dynamic forms with validation and conditional fields.", tags: ["form", "builder", "validation", "input"] },
  { slug: "chat-assistant", label: "Chat Assistant", summary: "Conversational assistant with memory and context awareness.", tags: ["chat", "assistant", "conversation", "memory"] },
];

export function generateBuiltinSkills(store: SkillsStore, soulStore: SoulStore): BuiltinReport {
  const report: BuiltinReport = { personalitiesCreated: 0, proceduresCreated: 0, skipped: 0 };

  for (const preset of BUILTIN_SOUL_PRESETS) {
    const slug = preset.id;
    if (store.get(slug)) { report.skipped++; continue; }
    const body = soulStore.renderMarkdown(preset);
    store.create({
      slug,
      kind: "personality",
      name: preset.title,
      description: preset.description || `Personality preset: ${preset.title}`,
      version: "0.1.0",
      builtin: true,
      body,
      soul: { presetId: preset.id, modules: preset.modules as unknown as Record<string, unknown> },
      tags: ["builtin", "personality", preset.id],
    });
    report.personalitiesCreated++;
  }

  for (const proc of BUILTIN_PROCEDURES) {
    const slug = proc.slug;
    if (store.get(slug)) { report.skipped++; continue; }
    const body = `# ${proc.label}\n\n${proc.summary}\n\nThis is a built-in procedure skill scaffold. Customize the body to encode the actual procedure for your environment.\n`;
    store.create({
      slug,
      kind: "procedure",
      name: proc.label,
      description: proc.summary,
      version: "0.1.0",
      builtin: true,
      body,
      tags: ["builtin", ...proc.tags],
    });
    report.proceduresCreated++;
  }
  return report;
}

export { BUILTIN_PROCEDURES as BUILTIN_PROCEDURE_SKILLS };
