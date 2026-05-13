import path from "path";
import { createHash, randomUUID } from "crypto";

import {
  learningRecordSchema,
  learningStateSchema,
  type LearningAddInput,
  type LearningEvidence,
  type LearningEvidenceInput,
  type LearningEvidenceSentiment,
  type LearningKind,
  type LearningListInput,
  type LearningPromotion,
  type LearningPromotionPreview,
  type LearningPromotionTarget,
  type LearningRecord,
  type LearningState,
  type LearningTarget,
  type SessionRecord,
} from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { CLAW_DIR } from "../workspace/manifest.ts";

export const LEARNING_STATE_FILE = "learning.json";

export interface LearningStoreOptions {
  workspaceDir: string;
  filesystem?: NodeFileSystemHost;
}

export interface LearningCaptureResult {
  sessionId: string;
  learnings: LearningRecord[];
  ignored: boolean;
  reason?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function slug(value: string, fallback = "learning"): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/[./]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56)
    || fallback;
}

function clampConfidence(value: number): number {
  return Math.max(0.05, Math.min(0.95, Number(value.toFixed(2))));
}

function confidenceFor(evidence: LearningEvidence[], explicit = false): number {
  const positives = evidence.filter((entry) => entry.sentiment === "positive").length;
  const negatives = evidence.filter((entry) => entry.sentiment === "negative").length;
  const neutral = evidence.filter((entry) => entry.sentiment === "neutral").length;
  return clampConfidence(0.3 + positives * 0.16 + neutral * 0.08 - negatives * 0.18 + (explicit ? 0.18 : 0));
}

function evidence(input: LearningEvidenceInput): LearningEvidence {
  return {
    id: `ev-${randomUUID()}`,
    sessionId: input.sessionId,
    sentiment: input.sentiment,
    note: normalizeText(input.note),
    ...(input.quote ? { quote: normalizeText(input.quote).slice(0, 500) } : {}),
    createdAt: nowIso(),
  };
}

function titleFromClaim(claim: string): string {
  const cleaned = claim
    .replace(/^user\s+(prefers|likes|dislikes|corrected|asked|wants)\s+/i, "")
    .replace(/^the\s+user\s+/i, "")
    .trim();
  const compact = cleaned.length > 70 ? `${cleaned.slice(0, 67).trim()}...` : cleaned;
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

function sessionQuote(content: string): string {
  return normalizeText(content).slice(0, 300);
}

function classifyTarget(text: string): LearningTarget {
  return /\b(ui|interface|interfaces|interfaz|icon|icons|icono|iconos|design|diseño)\b/i.test(text) ? "ui" : "user";
}

function classifyUserMessage(content: string): {
  claim: string;
  target: LearningTarget;
  kind: LearningKind;
  sentiment: LearningEvidenceSentiment;
  explicit: boolean;
} | null {
  const text = normalizeText(content);
  if (text.length < 8) return null;
  const key = normalizeKey(text);

  const explicit = /\b(remember|learn this|save this|note this|recuerda|aprende|guarda|ten en cuenta)\b/i.test(text);
  if (explicit) {
    return {
      claim: text.replace(/^(remember|learn this|save this|note this|recuerda|aprende|guarda|ten en cuenta)[:,]?\s*/i, ""),
      target: "user",
      kind: "observation",
      sentiment: "positive",
      explicit: true,
    };
  }

  if (/\b(prefiero|preferiría|me gusta|me gustó|i prefer|i like|liked|works better|better for me)\b/i.test(text)) {
    return {
      claim: `User preference: ${text}`,
      target: classifyTarget(text),
      kind: "preference",
      sentiment: "positive",
      explicit: false,
    };
  }

  if (/\b(no me gusta|no uses|don't use|do not use|evita|avoid|wrong approach|en vez de|instead of)\b/i.test(text)) {
    return {
      claim: `User correction: ${text}`,
      target: classifyTarget(text),
      kind: "correction",
      sentiment: "negative",
      explicit: false,
    };
  }

  if (/\b(falló|failed|bug|error|regression|no funciona|broken|fixed|arreglado)\b/i.test(text)) {
    return {
      claim: `Observed failure signal: ${text}`,
      target: "workflow",
      kind: "failure",
      sentiment: "neutral",
      explicit: false,
    };
  }

  if (key.includes("pasos") || key.includes("workflow") || key.includes("procedure") || key.includes("proceso")) {
    return {
      claim: `Workflow signal: ${text}`,
      target: "workflow",
      kind: "workflow",
      sentiment: "neutral",
      explicit: false,
    };
  }

  return null;
}

export class LearningStore {
  readonly workspaceDir: string;
  private readonly filesystem: NodeFileSystemHost;

  constructor(options: LearningStoreOptions) {
    this.workspaceDir = options.workspaceDir;
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
  }

  get statePath(): string {
    return path.join(this.workspaceDir, CLAW_DIR, LEARNING_STATE_FILE);
  }

  readState(): LearningState {
    try {
      return learningStateSchema.parse(JSON.parse(this.filesystem.readText(this.statePath))) as LearningState;
    } catch {
      return { schemaVersion: 1, learnings: [], updatedAt: nowIso() };
    }
  }

  writeState(state: LearningState): LearningState {
    const next = learningStateSchema.parse({
      schemaVersion: 1,
      learnings: [...state.learnings].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      updatedAt: nowIso(),
    }) as LearningState;
    this.filesystem.ensureDir(path.dirname(this.statePath));
    this.filesystem.withLockRetry(resolveFileLockPath(this.statePath), () => {
      this.filesystem.writeTextAtomic(this.statePath, `${JSON.stringify(next, null, 2)}\n`);
    });
    return next;
  }

  list(input: LearningListInput = {}): LearningRecord[] {
    return this.readState().learnings
      .filter((learning) => !input.target || learning.target === input.target)
      .filter((learning) => !input.kind || learning.kind === input.kind)
      .filter((learning) => !input.status || learning.status === input.status);
  }

  get(id: string): LearningRecord | null {
    return this.readState().learnings.find((learning) => learning.id === id) ?? null;
  }

  add(input: LearningAddInput): LearningRecord {
    const claim = normalizeText(input.claim);
    if (!claim) throw new Error("Learning claim is required.");
    const firstEvidence = evidence({
      sessionId: input.evidenceSessionId,
      sentiment: input.sentiment ?? "neutral",
      note: input.note || "Manual learning evidence.",
      quote: input.quote,
    });
    const state = this.readState();
    const key = normalizeKey(`${input.target}:${input.kind}:${claim}`);
    const current = state.learnings.find((entry) =>
      entry.status === "active"
      && normalizeKey(`${entry.target}:${entry.kind}:${entry.claim}`) === key);
    if (current) {
      return this.addEvidence(current.id, {
        sessionId: firstEvidence.sessionId,
        sentiment: firstEvidence.sentiment,
        note: firstEvidence.note,
        quote: firstEvidence.quote,
      });
    }
    const timestamp = nowIso();
    const id = `${slug(titleFromClaim(claim))}-${shortHash(key)}`;
    const record = learningRecordSchema.parse({
      id,
      claim,
      target: input.target,
      kind: input.kind,
      status: "active",
      confidence: confidenceFor([firstEvidence], Boolean(input.metadata?.explicit)),
      evidence: [firstEvidence],
      promotions: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }) as LearningRecord;
    this.writeState({ ...state, learnings: [...state.learnings, record] });
    return record;
  }

  addEvidence(id: string, input: LearningEvidenceInput): LearningRecord {
    const state = this.readState();
    const current = state.learnings.find((learning) => learning.id === id);
    if (!current) throw new Error(`Learning not found: ${id}`);
    const nextEvidence = evidence(input);
    const explicit = current.metadata?.explicit === true;
    const next = learningRecordSchema.parse({
      ...current,
      evidence: [...current.evidence, nextEvidence],
      confidence: confidenceFor([...current.evidence, nextEvidence], explicit),
      updatedAt: nowIso(),
    }) as LearningRecord;
    this.writeState({ ...state, learnings: state.learnings.map((learning) => learning.id === id ? next : learning) });
    return next;
  }

  archive(id: string, reason?: string): LearningRecord {
    const state = this.readState();
    const current = state.learnings.find((learning) => learning.id === id);
    if (!current) throw new Error(`Learning not found: ${id}`);
    const timestamp = nowIso();
    const next = learningRecordSchema.parse({
      ...current,
      status: "archived",
      archivedAt: timestamp,
      ...(reason ? { archiveReason: normalizeText(reason) } : {}),
      updatedAt: timestamp,
    }) as LearningRecord;
    this.writeState({ ...state, learnings: state.learnings.map((learning) => learning.id === id ? next : learning) });
    return next;
  }

  captureSession(session: SessionRecord | null): LearningCaptureResult {
    if (!session) throw new Error("Session not found.");
    const created: LearningRecord[] = [];
    for (const message of session.messages) {
      if (message.role !== "user") continue;
      const signal = classifyUserMessage(message.content);
      if (!signal) continue;
      created.push(this.add({
        claim: signal.claim,
        target: signal.target,
        kind: signal.kind,
        evidenceSessionId: session.sessionId,
        sentiment: signal.sentiment,
        note: signal.explicit ? "Explicit user instruction to remember or learn." : `Captured from ${message.role} message.`,
        quote: sessionQuote(message.content),
        metadata: {
          explicit: signal.explicit,
          capturedFrom: "session",
          messageId: message.id,
        },
      }));
    }
    return {
      sessionId: session.sessionId,
      learnings: created,
      ignored: created.length === 0,
      ...(created.length === 0 ? { reason: "No clear learning signal found." } : {}),
    };
  }

  previewPromotion(id: string, target: LearningPromotionTarget): LearningPromotionPreview {
    const learning = this.get(id);
    if (!learning) throw new Error(`Learning not found: ${id}`);
    const title = titleFromClaim(learning.claim);
    const evidenceRefs = learning.evidence.map((entry) => entry.sessionId);
    const notes = learning.evidence.map((entry) => `${entry.sentiment}: ${entry.note}`).join("\n");
    const base = {
      source: `learning:${learning.id}`,
      confidence: learning.confidence,
      evidenceSessionIds: evidenceRefs,
    };

    if (target === "rule") {
      return {
        learning,
        target,
        writable: true,
        warnings: ["Rule promotion creates a pending rule, not an active rule."],
        payload: {
          id: `learning-${learning.id}`,
          title,
          scopeId: "clawjs",
          status: "pending",
          content: learning.claim,
          source: `learning:${learning.id}`,
          references: learning.evidence.map((entry) => ({ kind: "note", ref: entry.sessionId, label: `Learning evidence ${entry.sentiment}` })),
        },
      };
    }

    if (target === "user") {
      return {
        learning,
        target,
        writable: true,
        warnings: ["User promotion creates a pending user proposal, not a verified user fact."],
        payload: {
          title,
          value: learning.claim,
          source: `learning:${learning.id}`,
          confidence: learning.confidence,
          notes,
          visibility: "agent",
          sensitivity: "personal",
        },
      };
    }

    if (target === "skill") {
      return {
        learning,
        target,
        writable: true,
        warnings: ["Skill promotion creates a local library skill asset; sync remains explicit."],
        payload: {
          id: `learning-${learning.id}`,
          kind: "skill",
          title,
          tags: ["learning", learning.kind, learning.target],
          content: [
            `# ${title}`,
            "",
            "## Trigger",
            learning.claim,
            "",
            "## Evidence",
            ...learning.evidence.map((entry) => `- ${entry.sentiment} ${entry.sessionId}: ${entry.note}`),
          ].join("\n"),
        },
      };
    }

    if (target === "memory") {
      return {
        learning,
        target,
        writable: true,
        warnings: ["Memory promotion stores a durable factual record; behavioral policy belongs in rules."],
        payload: {
          id: `learning-${learning.id}`,
          title,
          content: learning.claim,
          kind: "semantic",
          tags: ["learning", learning.kind, learning.target],
          metadata: base,
        },
      };
    }

    return {
      learning,
      target,
      writable: false,
      warnings: ["Soul promotion is dry-run only in v1."],
      payload: {
        title,
        proposedAdjustment: learning.claim,
        metadata: base,
      },
    };
  }

  recordPromotion(id: string, promotion: Omit<LearningPromotion, "createdAt">): LearningRecord {
    const state = this.readState();
    const current = state.learnings.find((learning) => learning.id === id);
    if (!current) throw new Error(`Learning not found: ${id}`);
    const timestamp = nowIso();
    const nextPromotion: LearningPromotion = { ...promotion, createdAt: timestamp };
    const next = learningRecordSchema.parse({
      ...current,
      status: promotion.applied ? "promoted" : current.status,
      promotions: [...current.promotions, nextPromotion],
      ...(promotion.applied ? { promotedAt: timestamp, promotedTo: promotion.target } : {}),
      updatedAt: timestamp,
    }) as LearningRecord;
    this.writeState({ ...state, learnings: state.learnings.map((learning) => learning.id === id ? next : learning) });
    return next;
  }
}

export function createLearningStore(options: LearningStoreOptions): LearningStore {
  return new LearningStore(options);
}
