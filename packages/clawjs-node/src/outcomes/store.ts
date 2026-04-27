import path from "path";
import { createHash, randomUUID } from "crypto";

import {
  outcomeRecordSchema,
  outcomeStateSchema,
  type JudgmentRecord,
  type OutcomeAddInput,
  type OutcomeCaptureInput,
  type OutcomeCaptureResult,
  type OutcomeLinkInput,
  type OutcomeLinks,
  type OutcomeListInput,
  type OutcomeRecord,
  type OutcomeResult,
  type OutcomeState,
  type SessionRecord,
} from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { CLAWJS_DIR } from "../workspace/manifest.ts";

export const OUTCOME_STATE_FILE = "outcomes.json";

export interface OutcomeStoreOptions {
  workspaceDir: string;
  filesystem?: NodeFileSystemHost;
}

export interface OutcomeWriteContext {
  judgment?: JudgmentRecord | null;
}

interface OutcomeSignal {
  result: OutcomeResult;
  score: number;
  note: string;
  quote: string;
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

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function roundGap(value: number): number {
  return Math.max(-1, Math.min(1, Number(value.toFixed(2))));
}

function emptyLinks(): OutcomeLinks {
  return {
    judgments: [],
    sessions: [],
    learnings: [],
    tasks: [],
    artifacts: [],
  };
}

function linksFromInput(input: OutcomeAddInput): OutcomeLinks {
  return {
    judgments: input.judgment ? [input.judgment] : [],
    sessions: input.session ? [input.session] : [],
    learnings: input.learning ? [input.learning] : [],
    tasks: input.task ? [input.task] : [],
    artifacts: input.artifact ? [input.artifact] : [],
  };
}

function mergeLinks(current: OutcomeLinks, links: OutcomeLinkInput): OutcomeLinks {
  return {
    judgments: unique([...current.judgments, ...(links.judgment ? [links.judgment] : [])]),
    sessions: unique([...current.sessions, ...(links.session ? [links.session] : [])]),
    learnings: unique([...current.learnings, ...(links.learning ? [links.learning] : [])]),
    tasks: unique([...current.tasks, ...(links.task ? [links.task] : [])]),
    artifacts: unique([...current.artifacts, ...(links.artifact ? [links.artifact] : [])]),
  };
}

function applyCalibration(record: Omit<OutcomeRecord, "expectedConfidence" | "confidenceGap">, judgment?: JudgmentRecord | null): OutcomeRecord {
  if (!judgment) return outcomeRecordSchema.parse(record) as OutcomeRecord;
  const expectedConfidence = clamp01(judgment.confidence);
  return outcomeRecordSchema.parse({
    ...record,
    expectedConfidence,
    confidenceGap: roundGap(record.score - expectedConfidence),
  }) as OutcomeRecord;
}

function quote(value: string): string {
  const text = normalizeText(value);
  return text.length <= 240 ? text : `${text.slice(0, 237).trim()}...`;
}

function classifyOutcomeMessage(content: string): OutcomeSignal | null {
  const text = normalizeKey(content);
  if (!text || text.length < 8) return null;

  const negative = [
    "no funciona",
    "no funciono",
    "no ha funcionado",
    "fallo",
    "fallado",
    "ha fallado",
    "esta mal",
    "incorrecto",
    "no sirve",
    "does not work",
    "doesn t work",
    "not working",
    "failed",
    "wrong",
    "broken",
  ].some((pattern) => text.includes(pattern));

  const positive = [
    "funciona",
    "funciono",
    "ha funcionado",
    "perfecto",
    "correcto",
    "esta bien",
    "me gusta",
    "validado",
    "works",
    "worked",
    "looks good",
    "that is good",
    "success",
  ].some((pattern) => text.includes(pattern));

  const partial = [
    "a medias",
    "parcial",
    "parcialmente",
    "pero",
    "mixed",
    "partially",
  ].some((pattern) => text.includes(pattern));

  if (negative && positive || partial && (negative || positive)) {
    return {
      result: "mixed",
      score: 0.5,
      note: "Captured mixed user validation from session.",
      quote: quote(content),
    };
  }
  if (negative) {
    return {
      result: "failed",
      score: 0.2,
      note: "Captured explicit user failure or correction from session.",
      quote: quote(content),
    };
  }
  if (positive) {
    return {
      result: "worked",
      score: 0.85,
      note: "Captured explicit user success or validation from session.",
      quote: quote(content),
    };
  }
  return null;
}

export class OutcomeStore {
  readonly workspaceDir: string;
  private readonly filesystem: NodeFileSystemHost;

  constructor(options: OutcomeStoreOptions) {
    this.workspaceDir = options.workspaceDir;
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
  }

  get statePath(): string {
    return path.join(this.workspaceDir, CLAWJS_DIR, OUTCOME_STATE_FILE);
  }

  readState(): OutcomeState {
    try {
      return outcomeStateSchema.parse(JSON.parse(this.filesystem.readText(this.statePath))) as OutcomeState;
    } catch {
      return { schemaVersion: 1, outcomes: [], updatedAt: nowIso() };
    }
  }

  writeState(state: OutcomeState): OutcomeState {
    const next = outcomeStateSchema.parse({
      schemaVersion: 1,
      outcomes: [...state.outcomes].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      updatedAt: nowIso(),
    }) as OutcomeState;
    this.filesystem.ensureDir(path.dirname(this.statePath));
    this.filesystem.withLockRetry(resolveFileLockPath(this.statePath), () => {
      this.filesystem.writeTextAtomic(this.statePath, `${JSON.stringify(next, null, 2)}\n`);
    });
    return next;
  }

  list(input: OutcomeListInput = {}): OutcomeRecord[] {
    return this.readState().outcomes
      .filter((outcome) => !input.result || outcome.result === input.result)
      .filter((outcome) => !input.status || outcome.status === input.status)
      .filter((outcome) => !input.judgment || outcome.links.judgments.includes(input.judgment));
  }

  get(id: string): OutcomeRecord | null {
    return this.readState().outcomes.find((outcome) => outcome.id === id) ?? null;
  }

  add(input: OutcomeAddInput, context: OutcomeWriteContext = {}): OutcomeRecord {
    const subject = normalizeText(input.subject);
    const note = normalizeText(input.note);
    if (!subject) throw new Error("Outcome subject is required.");
    if (!note) throw new Error("Outcome note is required.");
    const score = clamp01(input.score);
    const timestamp = nowIso();
    const base = {
      id: `outcome_${shortHash(`${subject}:${input.result}:${timestamp}:${randomUUID()}`)}`,
      subject,
      result: input.result,
      score,
      note,
      status: "active" as const,
      links: linksFromInput(input),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    const outcome = applyCalibration(base, context.judgment);
    const state = this.readState();
    this.writeState({ ...state, outcomes: [...state.outcomes, outcome] });
    return outcome;
  }

  captureSession(session: SessionRecord | null, input: Omit<OutcomeCaptureInput, "sessionId"> = {}): OutcomeCaptureResult {
    if (!session) throw new Error("Session not found.");
    const outcomes: OutcomeRecord[] = [];
    for (const message of session.messages) {
      if (message.role !== "user") continue;
      const signal = classifyOutcomeMessage(message.content);
      if (!signal) continue;
      outcomes.push(this.add({
        subject: `Session outcome: ${session.title || session.sessionId}`,
        result: signal.result,
        score: signal.score,
        note: signal.note,
        session: session.sessionId,
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        metadata: {
          ...(input.metadata ?? {}),
          capturedFrom: "session",
          messageId: message.id,
          quote: signal.quote,
        },
      }));
    }
    return {
      sessionId: session.sessionId,
      outcomes,
      ignored: outcomes.length === 0,
      ...(outcomes.length === 0 ? { reason: "No clear outcome signal found." } : {}),
    };
  }

  link(id: string, links: OutcomeLinkInput, context: OutcomeWriteContext = {}): OutcomeRecord {
    const state = this.readState();
    const current = state.outcomes.find((outcome) => outcome.id === id);
    if (!current) throw new Error(`Outcome not found: ${id}`);
    const next = applyCalibration({
      ...current,
      links: mergeLinks(current.links, links),
      updatedAt: nowIso(),
    }, context.judgment);
    this.writeState({ ...state, outcomes: state.outcomes.map((outcome) => outcome.id === id ? next : outcome) });
    return next;
  }

  archive(id: string, reason?: string): OutcomeRecord {
    const state = this.readState();
    const current = state.outcomes.find((outcome) => outcome.id === id);
    if (!current) throw new Error(`Outcome not found: ${id}`);
    const timestamp = nowIso();
    const next = outcomeRecordSchema.parse({
      ...current,
      status: "archived",
      ...(reason ? { archiveReason: normalizeText(reason) } : {}),
      archivedAt: timestamp,
      updatedAt: timestamp,
    }) as OutcomeRecord;
    this.writeState({ ...state, outcomes: state.outcomes.map((outcome) => outcome.id === id ? next : outcome) });
    return next;
  }
}

export function createOutcomeStore(options: OutcomeStoreOptions): OutcomeStore {
  return new OutcomeStore(options);
}
