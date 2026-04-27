import path from "path";
import { createHash, randomUUID } from "crypto";

import {
  commitmentRecordSchema,
  commitmentStateSchema,
  type CommitmentAddInput,
  type CommitmentCaptureInput,
  type CommitmentCaptureResult,
  type CommitmentEvidence,
  type CommitmentKind,
  type CommitmentLinkInput,
  type CommitmentLinks,
  type CommitmentListInput,
  type CommitmentOutcomeInput,
  type CommitmentParty,
  type CommitmentRecord,
  type CommitmentState,
  type SessionRecord,
} from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { CLAWJS_DIR } from "../workspace/manifest.ts";

export const COMMITMENT_STATE_FILE = "commitments.json";

export interface CommitmentStoreOptions {
  workspaceDir: string;
  filesystem?: NodeFileSystemHost;
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

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function links(input: Partial<CommitmentLinks> = {}): CommitmentLinks {
  return {
    sessions: unique(input.sessions ?? []),
    judgments: unique(input.judgments ?? []),
    decisions: unique(input.decisions ?? []),
    learnings: unique(input.learnings ?? []),
    tasks: unique(input.tasks ?? []),
    reminders: unique(input.reminders ?? []),
    deadlines: unique(input.deadlines ?? []),
    artifacts: unique(input.artifacts ?? []),
  };
}

function mergeLinks(current: CommitmentLinks, input: CommitmentLinkInput): CommitmentLinks {
  return links({
    sessions: [...current.sessions, ...(input.session ? [input.session] : [])],
    judgments: [...current.judgments, ...(input.judgment ? [input.judgment] : [])],
    decisions: [...current.decisions, ...(input.decision ? [input.decision] : [])],
    learnings: [...current.learnings, ...(input.learning ? [input.learning] : [])],
    tasks: [...current.tasks, ...(input.task ? [input.task] : [])],
    reminders: [...current.reminders, ...(input.reminder ? [input.reminder] : [])],
    deadlines: [...current.deadlines, ...(input.deadline ? [input.deadline] : [])],
    artifacts: [...current.artifacts, ...(input.artifact ? [input.artifact] : [])],
  });
}

function owner(input: CommitmentAddInput | CommitmentCaptureInput): CommitmentParty {
  if ("ownerUserId" in input && input.ownerUserId) return { kind: "user", id: input.ownerUserId };
  return { kind: "agent", ...(input.ownerAgentId || input.agentId ? { id: input.ownerAgentId ?? input.agentId } : {}) };
}

function beneficiary(input: CommitmentAddInput | CommitmentCaptureInput): CommitmentParty {
  if ("beneficiaryAgentId" in input && input.beneficiaryAgentId) return { kind: "agent", id: input.beneficiaryAgentId };
  return { kind: "user", ...(input.beneficiaryUserId ? { id: input.beneficiaryUserId } : {}) };
}

function evidence(input: { note: string; sessionId?: string; quote?: string; artifactId?: string }): CommitmentEvidence {
  return {
    id: `ev-${randomUUID()}`,
    note: normalizeText(input.note),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.quote ? { quote: normalizeText(input.quote).slice(0, 500) } : {}),
    ...(input.artifactId ? { artifactId: input.artifactId } : {}),
    createdAt: nowIso(),
  };
}

function classifyCommitment(content: string): { claim: string; kind: CommitmentKind } | null {
  const text = normalizeText(content);
  if (text.length < 8) return null;
  const explicit = /\b(te aviso|te avisare|te avisaré|te recuerdo|te recordare|te recordaré|me encargo|lo hare|lo haré|hare|haré|voy a avisarte|voy a enviarte|voy a entregarte|i will|i'll|i’ll|i can follow up|i will follow up|i'll follow up|i’ll follow up|i will notify|i'll notify|i’ll notify|i will remind|i'll remind|i’ll remind|i will send|i'll send|i’ll send|i will deliver|i'll deliver|i’ll deliver)\b/i.test(text);
  if (!explicit) return null;
  const kind: CommitmentKind = /\b(entregar|entregarte|enviar|enviarte|mandar|mandarte|send|deliver|attach|share)\b/i.test(text)
    ? "delivery"
    : /\b(avis\w*|record\w*|follow up|remind\w*|notify|check back|seguimiento)\b/i.test(text)
      ? "follow_up"
      : "promise";
  return { claim: text, kind };
}

export class CommitmentStore {
  readonly workspaceDir: string;
  private readonly filesystem: NodeFileSystemHost;

  constructor(options: CommitmentStoreOptions) {
    this.workspaceDir = options.workspaceDir;
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
  }

  get statePath(): string {
    return path.join(this.workspaceDir, CLAWJS_DIR, COMMITMENT_STATE_FILE);
  }

  readState(): CommitmentState {
    try {
      return commitmentStateSchema.parse(JSON.parse(this.filesystem.readText(this.statePath))) as CommitmentState;
    } catch {
      return { schemaVersion: 1, commitments: [], updatedAt: nowIso() };
    }
  }

  writeState(state: CommitmentState): CommitmentState {
    const next = commitmentStateSchema.parse({
      schemaVersion: 1,
      commitments: [...state.commitments].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      updatedAt: nowIso(),
    }) as CommitmentState;
    this.filesystem.ensureDir(path.dirname(this.statePath));
    this.filesystem.withLockRetry(resolveFileLockPath(this.statePath), () => {
      this.filesystem.writeTextAtomic(this.statePath, `${JSON.stringify(next, null, 2)}\n`);
    });
    return next;
  }

  list(input: CommitmentListInput = {}): CommitmentRecord[] {
    return this.readState().commitments
      .filter((commitment) => !input.status || commitment.status === input.status)
      .filter((commitment) => !input.kind || commitment.kind === input.kind)
      .filter((commitment) => !input.ownerAgentId || (commitment.owner.kind === "agent" && commitment.owner.id === input.ownerAgentId));
  }

  get(id: string): CommitmentRecord | null {
    return this.readState().commitments.find((commitment) => commitment.id === id) ?? null;
  }

  add(input: CommitmentAddInput & { source?: CommitmentRecord["source"]; note?: string; quote?: string }): CommitmentRecord {
    const claim = normalizeText(input.claim);
    if (!claim) throw new Error("Commitment claim is required.");
    const timestamp = nowIso();
    const record = commitmentRecordSchema.parse({
      id: `commitment_${shortHash(`${claim}:${timestamp}:${randomUUID()}`)}`,
      claim,
      kind: input.kind,
      status: "active",
      source: input.source ?? "manual",
      owner: owner(input),
      beneficiary: beneficiary(input),
      evidence: input.sessionId ? [evidence({ sessionId: input.sessionId, note: input.note ?? "Commitment evidence from session.", quote: input.quote })] : [],
      links: links({ sessions: input.sessionId ? [input.sessionId] : [], tasks: input.taskId ? [input.taskId] : [] }),
      ...(input.remindAt ? { remindAt: input.remindAt } : {}),
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }) as CommitmentRecord;
    const state = this.readState();
    this.writeState({ ...state, commitments: [...state.commitments, record] });
    return record;
  }

  captureSession(session: SessionRecord | null, input: CommitmentCaptureInput): CommitmentCaptureResult {
    if (!session) throw new Error("Session not found.");
    const commitments: CommitmentRecord[] = [];
    for (const message of session.messages) {
      if (message.role !== "assistant") continue;
      const signal = classifyCommitment(message.content);
      if (!signal) continue;
      commitments.push(this.add({
        claim: signal.claim,
        kind: signal.kind,
        sessionId: session.sessionId,
        ownerAgentId: input.ownerAgentId,
        beneficiaryUserId: input.beneficiaryUserId,
        agentId: input.agentId,
        workspaceId: input.workspaceId,
        source: "session_capture",
        note: "Explicit assistant commitment captured from session.",
        quote: normalizeText(message.content).slice(0, 300),
        metadata: { capturedFrom: "session", messageId: message.id, role: message.role },
      }));
    }
    return {
      sessionId: session.sessionId,
      commitments,
      ignored: commitments.length === 0,
      ...(commitments.length === 0 ? { reason: "No explicit commitment signal found." } : {}),
    };
  }

  link(id: string, input: CommitmentLinkInput): CommitmentRecord {
    const state = this.readState();
    const current = state.commitments.find((commitment) => commitment.id === id);
    if (!current) throw new Error(`Commitment not found: ${id}`);
    const next = commitmentRecordSchema.parse({ ...current, links: mergeLinks(current.links, input), updatedAt: nowIso() }) as CommitmentRecord;
    this.writeState({ ...state, commitments: state.commitments.map((commitment) => commitment.id === id ? next : commitment) });
    return next;
  }

  fulfill(id: string, input: CommitmentOutcomeInput): CommitmentRecord {
    const state = this.readState();
    const current = state.commitments.find((commitment) => commitment.id === id);
    if (!current) throw new Error(`Commitment not found: ${id}`);
    const timestamp = nowIso();
    const nextEvidence = input.evidenceSessionId || input.artifactId ? [evidence({ sessionId: input.evidenceSessionId, artifactId: input.artifactId, note: input.outcome ?? "Commitment fulfilled." })] : [];
    const next = commitmentRecordSchema.parse({
      ...current,
      status: "fulfilled",
      ...(input.outcome ? { outcome: normalizeText(input.outcome) } : {}),
      evidence: [...current.evidence, ...nextEvidence],
      links: mergeLinks(current.links, { session: input.evidenceSessionId, artifact: input.artifactId }),
      fulfilledAt: timestamp,
      updatedAt: timestamp,
    }) as CommitmentRecord;
    this.writeState({ ...state, commitments: state.commitments.map((commitment) => commitment.id === id ? next : commitment) });
    return next;
  }

  miss(id: string, input: CommitmentOutcomeInput): CommitmentRecord {
    const state = this.readState();
    const current = state.commitments.find((commitment) => commitment.id === id);
    if (!current) throw new Error(`Commitment not found: ${id}`);
    const timestamp = nowIso();
    const nextEvidence = input.evidenceSessionId || input.artifactId ? [evidence({ sessionId: input.evidenceSessionId, artifactId: input.artifactId, note: input.reason ?? "Commitment missed." })] : [];
    const next = commitmentRecordSchema.parse({
      ...current,
      status: "missed",
      missReason: normalizeText(input.reason ?? "Commitment missed."),
      evidence: [...current.evidence, ...nextEvidence],
      links: mergeLinks(current.links, { session: input.evidenceSessionId, artifact: input.artifactId }),
      missedAt: timestamp,
      updatedAt: timestamp,
    }) as CommitmentRecord;
    this.writeState({ ...state, commitments: state.commitments.map((commitment) => commitment.id === id ? next : commitment) });
    return next;
  }

  cancel(id: string, reason?: string): CommitmentRecord {
    const state = this.readState();
    const current = state.commitments.find((commitment) => commitment.id === id);
    if (!current) throw new Error(`Commitment not found: ${id}`);
    const timestamp = nowIso();
    const next = commitmentRecordSchema.parse({
      ...current,
      status: "cancelled",
      ...(reason ? { cancelReason: normalizeText(reason) } : {}),
      cancelledAt: timestamp,
      updatedAt: timestamp,
    }) as CommitmentRecord;
    this.writeState({ ...state, commitments: state.commitments.map((commitment) => commitment.id === id ? next : commitment) });
    return next;
  }

  relevantTo(query: string, options: string[] = []): CommitmentRecord[] {
    const tokens = normalizeKey(query).split(" ").filter((token) => token.length > 3);
    return this.list({ status: "active" }).filter((commitment) => {
      const haystack = normalizeKey(commitment.claim);
      if (options.some((option) => haystack.includes(normalizeKey(option)))) return true;
      return tokens.some((token) => haystack.includes(token));
    });
  }
}

export function createCommitmentStore(options: CommitmentStoreOptions): CommitmentStore {
  return new CommitmentStore(options);
}
