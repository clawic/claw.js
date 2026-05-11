import fs from "node:fs";
import path from "node:path";

import type { RuntimeServiceStore } from "../store.ts";
import type {
  DistillInput,
  DistillationRecord,
  DistillerOptions,
  RuntimeServicesContext,
} from "../types.ts";

function yamlEscape(value: string): string {
  return value.replace(/"/g, '\\"');
}

function buildSkillMarkdown(meta: {
  slug: string;
  name: string;
  description: string;
  body: string;
  confidence: number;
  sessionId: string;
  tags: string[];
}): string {
  const frontmatter = [
    "---",
    `name: "${yamlEscape(meta.name)}"`,
    `description: "${yamlEscape(meta.description)}"`,
    "version: 0.1.0",
    `author: "clawjs-runtime/distiller"`,
    "metadata:",
    "  clawjs:",
    "    schemaVersion: 1",
    "    kind: procedure",
    `    tags: [${meta.tags.map((tag) => `"${yamlEscape(tag)}"`).join(", ")}]`,
    "    provenance: distilled",
    `    confidence: ${meta.confidence}`,
    "    lineage:",
    `      fromSessionId: "${meta.sessionId}"`,
    `      distilledAt: "${new Date().toISOString()}"`,
    `      distilledBy: "clawjs-runtime/heuristic"`,
    "---",
    "",
  ].join("\n");
  return `${frontmatter}\n${meta.body}\n`;
}

export async function runDistillation(
  store: RuntimeServiceStore,
  context: RuntimeServicesContext,
  input: DistillInput,
  options: DistillerOptions = {},
): Promise<DistillationRecord> {
  const job = store.createJob("distill", { sessionId: input.sessionId, taskId: input.taskId ?? null });
  try {
    const minToolCalls = options.minToolCalls ?? input.minToolCalls ?? 1;
    const minMessageCount = options.minMessageCount ?? 4;

    const sessionWithMessages = await context.sessionsClient.getSessionWithMessages(input.sessionId);
    const { session, messages } = sessionWithMessages;
    const toolCount = messages.filter((m) => m.role === "tool" || (m.toolCalls && m.toolCalls.length > 0)).length;

    if (!options.forceRedistill && !input.forceRedistill) {
      if (toolCount < minToolCalls) {
        const record = store.recordDistillation({
          sessionId: input.sessionId,
          skillSlug: `skipped-${session.id.slice(0, 8)}`,
          skillMarkdownPath: null,
          confidence: 0,
          toolCallCount: toolCount,
          messageCount: messages.length,
          status: "skipped",
          reason: `tool_count_below_threshold:${toolCount}<${minToolCalls}`,
        });
        store.finishJob(job.id, true);
        return record;
      }
      if (messages.length < minMessageCount) {
        const record = store.recordDistillation({
          sessionId: input.sessionId,
          skillSlug: `skipped-${session.id.slice(0, 8)}`,
          skillMarkdownPath: null,
          confidence: 0,
          toolCallCount: toolCount,
          messageCount: messages.length,
          status: "skipped",
          reason: `message_count_below_threshold:${messages.length}<${minMessageCount}`,
        });
        store.finishJob(job.id, true);
        return record;
      }
    }

    const synthesized = await context.distillerSynthesizer({ session, messages });
    if (!synthesized) {
      const record = store.recordDistillation({
        sessionId: input.sessionId,
        skillSlug: `skipped-${session.id.slice(0, 8)}`,
        skillMarkdownPath: null,
        confidence: 0,
        toolCallCount: toolCount,
        messageCount: messages.length,
        status: "skipped",
        reason: "synthesizer_returned_null",
      });
      store.finishJob(job.id, true);
      return record;
    }

    fs.mkdirSync(context.skillsOutputDir, { recursive: true });
    const skillDir = path.join(context.skillsOutputDir, synthesized.slug);
    fs.mkdirSync(skillDir, { recursive: true });
    const skillPath = path.join(skillDir, "SKILL.md");
    fs.writeFileSync(
      skillPath,
      buildSkillMarkdown({
        slug: synthesized.slug,
        name: synthesized.name,
        description: synthesized.description,
        body: synthesized.body,
        confidence: synthesized.confidence,
        sessionId: session.id,
        tags: synthesized.tags ?? ["distilled"],
      }),
      "utf8",
    );

    const record = store.recordDistillation({
      sessionId: session.id,
      skillSlug: synthesized.slug,
      skillMarkdownPath: skillPath,
      confidence: synthesized.confidence,
      toolCallCount: toolCount,
      messageCount: messages.length,
      status: "completed",
      reason: input.reason ?? null,
    });
    store.finishJob(job.id, true);
    return record;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    store.finishJob(job.id, false, message);
    throw error;
  }
}
