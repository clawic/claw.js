import path from "path";
import { randomUUID } from "crypto";

import {
  userSpecSchema,
  userStateSchema,
  type UserAssignment,
  type UserCompileResult,
  type UserCustomFact,
  type UserEntity,
  type UserEntityType,
  type UserFacetKey,
  type UserFact,
  type UserFactMetadata,
  type UserFactSensitivity,
  type UserFactValue,
  type UserFactVisibility,
  type UserLink,
  type UserPackId,
  type UserPackState,
  type UserProposal,
  type UserRecord,
  type UserRecordType,
  type UserSpec,
  type UserState,
  type UserValidationIssue,
  type UserValidationResult,
} from "@clawjs/core";

import { applyTextMutation } from "../files/managed-blocks.ts";
import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { CLAWJS_DIR } from "../workspace/manifest.ts";
import { readWorkspaceFile, writeWorkspaceFile } from "../workspace/manager.ts";

export const USER_STATE_FILE = "users.json";
export const USER_MANAGED_BLOCK_ID = "user-spec";
export const USER_TARGET_FILE = "USER.md";
export const DEFAULT_USER_ID = "user";

const FACET_KEYS = new Set<UserFacetKey>([
  "identity", "biography", "residence", "languages", "publicContact", "work", "education",
  "projects", "skills", "interests", "tastes", "family", "relationships", "home", "routines",
  "health", "legal", "finances", "travel", "culture", "devices",
]);
const RECORD_TYPES = new Set<UserRecordType>([
  "education", "employment", "project", "relationship", "residence", "life_event", "achievement",
  "certification", "skill", "language", "affiliation", "descriptive_preference", "health_condition",
  "routine", "pet", "administrative_document",
]);
const PACK_IDS = new Set<UserPackId>(["practical", "professional", "wellbeing"]);
const ENTITY_TYPES = new Set<UserEntityType>(["person", "organization", "place", "asset", "pet", "document", "account"]);
const BEHAVIOR_FACETS = new Set(["assistant", "behavior", "communication", "preference", "preferences", "rules", "style"]);
const PACK_DEFINITIONS: Record<UserPackId, { sensitivity: UserFactSensitivity; facets: UserFacetKey[]; records: UserRecordType[]; entities: UserEntityType[] }> = {
  practical: {
    sensitivity: "personal",
    facets: ["home", "family", "legal", "travel", "devices", "routines", "residence"],
    records: ["administrative_document", "pet", "routine", "residence", "life_event"],
    entities: ["person", "place", "asset", "pet", "document", "account"],
  },
  professional: {
    sensitivity: "personal",
    facets: ["work", "education", "projects", "skills", "publicContact"],
    records: ["employment", "education", "project", "achievement", "certification", "skill", "affiliation"],
    entities: ["person", "organization", "place", "document", "account"],
  },
  wellbeing: {
    sensitivity: "sensitive",
    facets: ["health", "routines"],
    records: ["health_condition", "routine"],
    entities: ["person", "document", "account"],
  },
};
const FACET_PACKS = new Map<UserFacetKey, UserPackId[]>();
const RECORD_PACKS = new Map<UserRecordType, UserPackId[]>();
const ENTITY_PACKS = new Map<UserEntityType, UserPackId[]>();
for (const [packId, definition] of Object.entries(PACK_DEFINITIONS) as Array<[UserPackId, typeof PACK_DEFINITIONS[UserPackId]]>) {
  for (const facet of definition.facets) FACET_PACKS.set(facet, [...(FACET_PACKS.get(facet) ?? []), packId]);
  for (const record of definition.records) RECORD_PACKS.set(record, [...(RECORD_PACKS.get(record) ?? []), packId]);
  for (const entity of definition.entities) ENTITY_PACKS.set(entity, [...(ENTITY_PACKS.get(entity) ?? []), packId]);
}
const SECTION_LABELS: Record<UserFacetKey, string> = {
  identity: "Identity",
  biography: "Biography",
  residence: "Residence",
  languages: "Languages",
  publicContact: "Public Contact",
  work: "Work",
  education: "Education",
  projects: "Projects",
  skills: "Skills",
  interests: "Interests",
  tastes: "Tastes",
  family: "Family",
  relationships: "Relationships",
  home: "Home",
  routines: "Routines",
  health: "Health",
  legal: "Legal",
  finances: "Finances",
  travel: "Travel",
  culture: "Culture",
  devices: "Devices",
};

export interface UserStoreOptions { workspaceDir: string; filesystem?: NodeFileSystemHost; }
export interface UserInitInput { id?: string; displayName?: string; isDefault?: boolean; }
export interface UserSetInput {
  userId?: string;
  path: string;
  value: UserFactValue;
  source?: string;
  sensitivity?: UserFactSensitivity;
  confidence?: number;
  validFrom?: string;
  validTo?: string;
  notes?: string;
  visibility?: UserFactVisibility;
}
export interface UserAddRecordInput {
  userId?: string;
  type: UserRecordType;
  title: string;
  fields?: Record<string, UserFactValue>;
  source?: string;
  sensitivity?: UserFactSensitivity;
  confidence?: number;
  validFrom?: string;
  validTo?: string;
  notes?: string;
  visibility?: UserFactVisibility;
}
export interface UserProposalInput {
  userId?: string;
  path?: string;
  value?: UserFactValue;
  recordType?: UserRecordType;
  title?: string;
  fields?: Record<string, UserFactValue>;
  source?: string;
  sensitivity?: UserFactSensitivity;
  confidence?: number;
  notes?: string;
  visibility?: UserFactVisibility;
}
export interface UserCompileOptions { userId?: string; agentId?: string; write?: boolean; }
export interface UserQueryInput {
  userId?: string;
  domain?: UserPackId;
  type?: string;
  status?: UserFactMetadata["status"] | UserProposal["status"];
  sensitivity?: UserFactSensitivity;
  source?: string;
  date?: string;
  text?: string;
}
export interface UserQueryResult {
  facts: Array<UserFact & { facet: UserFacetKey }>;
  records: UserRecord[];
  customFacts: UserCustomFact[];
  proposals: UserProposal[];
  entities: UserEntity[];
  links: UserLink[];
}
export interface UserWizardInput {
  userId?: string;
  domain: UserPackId;
  title: string;
  fields?: Record<string, UserFactValue>;
  source?: string;
  sensitivity?: UserFactSensitivity;
  confidence?: number;
  validFrom?: string;
  validTo?: string;
  notes?: string;
  visibility?: UserFactVisibility;
}

function nowIso(): string { return new Date().toISOString(); }
function titleFromId(id: string): string {
  return id.split(/[._-]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") || id;
}
function normalizeId(value: string, fallback = "entry"): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._/-]+/g, "-").replace(/[./]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || fallback;
}
function metadata(input: {
  status?: UserFactMetadata["status"];
  source?: string;
  sensitivity?: UserFactSensitivity;
  confidence?: number;
  validFrom?: string;
  validTo?: string;
  notes?: string;
  visibility?: UserFactVisibility;
  verifiedAt?: string;
} = {}): UserFactMetadata {
  const status = input.status ?? "verified";
  const timestamp = input.verifiedAt ?? (status === "verified" ? nowIso() : undefined);
  return {
    status,
    schemaVersion: 1,
    ...(input.source ? { source: input.source } : {}),
    ...(timestamp ? { verifiedAt: timestamp } : {}),
    sensitivity: input.sensitivity ?? "personal",
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    ...(input.validFrom ? { validFrom: input.validFrom } : {}),
    ...(input.validTo ? { validTo: input.validTo } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    visibility: input.visibility ?? "agent",
  };
}
function defaultSpec(id = DEFAULT_USER_ID, displayName = "User"): UserSpec {
  const timestamp = nowIso();
  return {
    schemaVersion: 1,
    id,
    displayName,
    isDefault: id === DEFAULT_USER_ID,
    facets: {},
    packs: [],
    entities: [],
    links: [],
    records: [],
    customFacts: [],
    proposals: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
function normalizeState(raw: unknown): UserState {
  const parsed = raw as Partial<UserState>;
  const state: UserState = {
    schemaVersion: 1,
    specs: (parsed.specs ?? []).map((spec) => userSpecSchema.parse({
      ...spec,
      facets: spec.facets ?? {},
      packs: spec.packs ?? [],
      entities: spec.entities ?? [],
      links: spec.links ?? [],
      records: spec.records ?? [],
      customFacts: spec.customFacts ?? [],
      proposals: spec.proposals ?? [],
    })),
    assignments: (parsed.assignments ?? []).map((assignment) => ({
      agentId: String(assignment.agentId || ""),
      userId: String(assignment.userId || DEFAULT_USER_ID),
      createdAt: String(assignment.createdAt || nowIso()),
      updatedAt: String(assignment.updatedAt || nowIso()),
    })).filter((assignment) => assignment.agentId),
    updatedAt: parsed.updatedAt || nowIso(),
  };
  return userStateSchema.parse(state);
}
function parsePath(value: string): { facet: UserFacetKey; key: string } {
  const [facet, key] = value.split(".", 2);
  if (!facet || !key) throw new Error(`User paths must use facet.key, received ${value}`);
  if (BEHAVIOR_FACETS.has(facet)) throw new Error(`Behavior preferences belong in rules, not user: ${value}`);
  if (!FACET_KEYS.has(facet as UserFacetKey)) throw new Error(`Unknown UserSpec facet: ${facet}`);
  return { facet: facet as UserFacetKey, key };
}
function assertRecordType(value: string): UserRecordType {
  if (!RECORD_TYPES.has(value as UserRecordType)) throw new Error(`Unknown UserSpec record type: ${value}`);
  return value as UserRecordType;
}
function assertPackId(value: string): UserPackId {
  if (!PACK_IDS.has(value as UserPackId)) throw new Error(`Unknown UserSpec pack: ${value}`);
  return value as UserPackId;
}
function assertEntityType(value: string): UserEntityType {
  if (!ENTITY_TYPES.has(value as UserEntityType)) throw new Error(`Unknown UserSpec entity type: ${value}`);
  return value as UserEntityType;
}
function hasEnabledPack(spec: UserSpec, packId: UserPackId): boolean {
  return spec.packs.some((pack) => pack.id === packId && pack.enabled);
}
function enabledPackIds(spec: UserSpec): Set<UserPackId> {
  return new Set(spec.packs.filter((pack) => pack.enabled).map((pack) => pack.id));
}
function requiredPacksForSensitivity(sensitivity: UserFactSensitivity): UserPackId[] {
  return sensitivity === "sensitive" ? ["wellbeing"] : [];
}
function assertPacksEnabled(spec: UserSpec, packs: UserPackId[], context: string): void {
  const missing = packs.filter((packId) => !hasEnabledPack(spec, packId));
  if (missing.length) throw new Error(`${context} requires enabled user pack(s): ${missing.join(", ")}`);
}
function isVisibleVerified(spec: UserSpec, metadataValue: UserFactMetadata): boolean {
  if (metadataValue.status !== "verified" || metadataValue.visibility === "private") return false;
  if (metadataValue.sensitivity === "sensitive") {
    return metadataValue.visibility === "public" && hasEnabledPack(spec, "wellbeing");
  }
  return true;
}
function formatKey(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());
}
function formatValue(value: UserFactValue): string {
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(", ");
  if (value && typeof value === "object") return Object.entries(value).map(([key, entry]) => `${formatKey(key)}: ${String(entry)}`).join("; ");
  if (value === null) return "null";
  return String(value);
}

export class UserStore {
  readonly workspaceDir: string;
  private readonly filesystem: NodeFileSystemHost;

  constructor(options: UserStoreOptions) {
    this.workspaceDir = options.workspaceDir;
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
  }

  get statePath(): string { return path.join(this.workspaceDir, CLAWJS_DIR, USER_STATE_FILE); }

  readState(): UserState {
    if (!this.filesystem.exists(this.statePath)) return { schemaVersion: 1, specs: [defaultSpec()], assignments: [], updatedAt: nowIso() };
    const state = normalizeState(JSON.parse(this.filesystem.readText(this.statePath)) as unknown);
    if (!state.specs.some((spec) => spec.id === DEFAULT_USER_ID)) state.specs.unshift(defaultSpec());
    if (!state.specs.some((spec) => spec.isDefault)) state.specs[0] = { ...state.specs[0]!, isDefault: true };
    return state;
  }

  writeState(state: UserState): UserState {
    const specs = state.specs.map((spec, index) => ({ ...spec, isDefault: spec.id === DEFAULT_USER_ID || (index === 0 && !state.specs.some((entry) => entry.id === DEFAULT_USER_ID)) }));
    const next = userStateSchema.parse({ ...state, specs, updatedAt: nowIso() });
    this.filesystem.withLockRetry(resolveFileLockPath(this.statePath), () => this.filesystem.writeTextAtomic(this.statePath, `${JSON.stringify(next, null, 2)}\n`));
    return next;
  }

  list(): UserSpec[] { return this.readState().specs; }
  get(id: string): UserSpec | null { return this.readState().specs.find((spec) => spec.id === id) ?? null; }

  packs(userId?: string): Array<UserPackState & { availableFacets: UserFacetKey[]; availableRecords: UserRecordType[]; availableEntities: UserEntityType[] }> {
    const user = this.resolve({ userId });
    return (Object.keys(PACK_DEFINITIONS) as UserPackId[]).map((id) => {
      const current = user.packs.find((pack) => pack.id === id);
      const definition = PACK_DEFINITIONS[id];
      return {
        id,
        schemaVersion: current?.schemaVersion ?? 1,
        enabled: current?.enabled ?? false,
        ...(current?.enabledAt ? { enabledAt: current.enabledAt } : {}),
        ...(current?.disabledAt ? { disabledAt: current.disabledAt } : {}),
        sensitivity: current?.sensitivity ?? definition.sensitivity,
        visibility: current?.visibility ?? "agent",
        availableFacets: definition.facets,
        availableRecords: definition.records,
        availableEntities: definition.entities,
      };
    });
  }

  setPack(input: { userId?: string; id: UserPackId; enabled: boolean }): UserPackState {
    const state = this.readState();
    const user = this.resolve({ userId: input.userId });
    const id = assertPackId(input.id);
    const timestamp = nowIso();
    const current = user.packs.find((pack) => pack.id === id);
    const pack: UserPackState = {
      id,
      schemaVersion: current?.schemaVersion ?? 1,
      enabled: input.enabled,
      ...(input.enabled ? { enabledAt: current?.enabledAt ?? timestamp } : {}),
      ...(!input.enabled ? { disabledAt: timestamp } : {}),
      sensitivity: current?.sensitivity ?? PACK_DEFINITIONS[id].sensitivity,
      visibility: current?.visibility ?? "agent",
    };
    const nextUser = { ...user, packs: [...user.packs.filter((entry) => entry.id !== id), pack], updatedAt: timestamp };
    this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
    return pack;
  }

  enablePack(userId: string | undefined, id: UserPackId): UserPackState { return this.setPack({ userId, id, enabled: true }); }
  disablePack(userId: string | undefined, id: UserPackId): UserPackState { return this.setPack({ userId, id, enabled: false }); }

  init(input: UserInitInput = {}): UserSpec {
    const state = this.readState();
    const id = input.id?.trim() || DEFAULT_USER_ID;
    const current = state.specs.find((spec) => spec.id === id);
    const timestamp = nowIso();
    const next: UserSpec = current ? { ...current } : defaultSpec(id, input.displayName?.trim() || titleFromId(id));
    next.displayName = input.displayName?.trim() || next.displayName;
    next.isDefault = input.isDefault ?? next.isDefault;
    next.updatedAt = timestamp;
    const specs = current ? state.specs.map((spec) => spec.id === id ? next : spec) : [...state.specs, next];
    this.writeState({ ...state, specs });
    return next;
  }

  set(input: UserSetInput): UserFact {
    const { facet, key } = parsePath(input.path);
    const state = this.readState();
    const user = this.resolve({ userId: input.userId });
    const sensitivity = input.sensitivity ?? (facet === "health" ? "sensitive" : "personal");
    assertPacksEnabled(user, requiredPacksForSensitivity(sensitivity), `User fact ${input.path}`);
    const timestamp = nowIso();
    const currentFacts = user.facets[facet] ?? [];
    const current = currentFacts.find((fact) => fact.key === key);
    const fact: UserFact = {
      id: current?.id ?? normalizeId(`${facet}-${key}`),
      key,
      value: input.value,
      metadata: metadata({ ...input, sensitivity }),
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    const nextUser = {
      ...user,
      facets: {
        ...user.facets,
        [facet]: [...currentFacts.filter((entry) => entry.key !== key), fact],
      },
      updatedAt: timestamp,
    };
    this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
    return fact;
  }

  addRecord(input: UserAddRecordInput): UserRecord {
    const state = this.readState();
    const user = this.resolve({ userId: input.userId });
    const timestamp = nowIso();
    const type = assertRecordType(input.type);
    const sensitivity = input.sensitivity ?? (type === "health_condition" ? "sensitive" : "personal");
    assertPacksEnabled(user, requiredPacksForSensitivity(sensitivity), `User record ${type}`);
    const record: UserRecord = {
      id: normalizeId(`${type}-${input.title}-${randomUUID().slice(0, 8)}`),
      type,
      title: input.title.trim(),
      fields: input.fields ?? {},
      metadata: metadata({ ...input, sensitivity }),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const nextUser = { ...user, records: [...user.records, record], updatedAt: timestamp };
    this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
    return record;
  }

  addCustomFact(input: { userId?: string; title: string; value: UserFactValue } & Partial<UserFactMetadata>): UserCustomFact {
    const state = this.readState();
    const user = this.resolve({ userId: input.userId });
    const sensitivity = input.sensitivity ?? "personal";
    assertPacksEnabled(user, requiredPacksForSensitivity(sensitivity), `User custom fact ${input.title}`);
    const timestamp = nowIso();
    const fact: UserCustomFact = {
      id: normalizeId(`custom-${input.title}-${randomUUID().slice(0, 8)}`),
      title: input.title.trim(),
      value: input.value,
      metadata: metadata({ ...input, sensitivity }),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const nextUser = { ...user, customFacts: [...user.customFacts, fact], updatedAt: timestamp };
    this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
    return fact;
  }

  propose(input: UserProposalInput): UserProposal {
    const state = this.readState();
    const user = this.resolve({ userId: input.userId });
    if (input.path) parsePath(input.path);
    if (input.recordType) assertRecordType(input.recordType);
    if (!input.path && !input.recordType && !input.title) throw new Error("User proposal requires --path, --record-type, or --title");
    const sensitivity = input.sensitivity ?? (input.path?.startsWith("health.") || input.recordType === "health_condition" ? "sensitive" : "personal");
    assertPacksEnabled(user, requiredPacksForSensitivity(sensitivity), "User proposal");
    const timestamp = nowIso();
    const proposal: UserProposal = {
      id: normalizeId(`proposal-${input.path ?? input.recordType ?? input.title ?? "fact"}-${randomUUID().slice(0, 8)}`),
      kind: input.path ? "fact" : input.recordType ? "record" : "custom_fact",
      userId: user.id,
      ...(input.path ? { path: input.path } : {}),
      ...(input.recordType ? { recordType: input.recordType } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.fields ? { fields: input.fields } : {}),
      ...(input.source ? { source: input.source } : {}),
      sensitivity,
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      visibility: input.visibility ?? "agent",
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const nextUser = { ...user, proposals: [...user.proposals, proposal], updatedAt: timestamp };
    this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
    return proposal;
  }

  verify(proposalId: string, userId?: string): UserProposal {
    const state = this.readState();
    const user = this.resolve({ userId });
    const proposal = user.proposals.find((entry) => entry.id === proposalId);
    if (!proposal) throw new Error(`User proposal not found: ${proposalId}`);
    if (proposal.status !== "pending") return proposal;
    if (proposal.kind === "fact") {
      if (!proposal.path || proposal.value === undefined) throw new Error(`User proposal is missing fact data: ${proposalId}`);
      this.set({
        userId: user.id,
        path: proposal.path,
        value: proposal.value,
        source: proposal.source,
        sensitivity: proposal.sensitivity,
        confidence: proposal.confidence,
        notes: proposal.notes,
        visibility: proposal.visibility,
      });
    } else if (proposal.kind === "record") {
      if (!proposal.recordType || !proposal.title) throw new Error(`User proposal is missing record data: ${proposalId}`);
      this.addRecord({
        userId: user.id,
        type: proposal.recordType,
        title: proposal.title,
        fields: proposal.fields,
        source: proposal.source,
        sensitivity: proposal.sensitivity,
        confidence: proposal.confidence,
        notes: proposal.notes,
        visibility: proposal.visibility,
      });
    } else {
      if (!proposal.title || proposal.value === undefined) throw new Error(`User proposal is missing custom fact data: ${proposalId}`);
      this.addCustomFact({
        userId: user.id,
        title: proposal.title,
        value: proposal.value,
        source: proposal.source,
        sensitivity: proposal.sensitivity,
        confidence: proposal.confidence,
        notes: proposal.notes,
        visibility: proposal.visibility,
      });
    }
    const refreshed = this.readState();
    const refreshedUser = refreshed.specs.find((spec) => spec.id === user.id) ?? user;
    const timestamp = nowIso();
    const verified = { ...proposal, status: "verified" as const, updatedAt: timestamp, verifiedAt: timestamp };
    const nextUser = { ...refreshedUser, proposals: refreshedUser.proposals.map((entry) => entry.id === proposalId ? verified : entry), updatedAt: timestamp };
    this.writeState({ ...refreshed, specs: refreshed.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
    return verified;
  }

  wizard(input: UserWizardInput): UserProposal {
    const domain = assertPackId(input.domain);
    const user = this.resolve({ userId: input.userId });
    assertPacksEnabled(user, [domain], `User wizard ${domain}`);
    const recordType: UserRecordType = domain === "professional"
      ? "project"
      : domain === "wellbeing"
        ? "routine"
        : "administrative_document";
    return this.propose({
      userId: user.id,
      recordType,
      title: input.title,
      fields: input.fields,
      source: input.source ?? `wizard:${domain}`,
      sensitivity: input.sensitivity ?? PACK_DEFINITIONS[domain].sensitivity,
      confidence: input.confidence,
      notes: input.notes,
      visibility: input.visibility,
    });
  }

  addEntity(input: { userId?: string; type: UserEntityType; title: string; fields?: Record<string, UserFactValue>; source?: string; sensitivity?: UserFactSensitivity; confidence?: number; validFrom?: string; validTo?: string; notes?: string; visibility?: UserFactVisibility }): UserEntity {
    const state = this.readState();
    const user = this.resolve({ userId: input.userId });
    const type = assertEntityType(input.type);
    const sensitivity = input.sensitivity ?? "personal";
    assertPacksEnabled(user, requiredPacksForSensitivity(sensitivity), `User entity ${type}`);
    const timestamp = nowIso();
    const entity: UserEntity = {
      id: normalizeId(`${type}-${input.title}-${randomUUID().slice(0, 8)}`),
      type,
      title: input.title.trim(),
      fields: input.fields ?? {},
      metadata: metadata({ ...input, sensitivity }),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const nextUser = { ...user, entities: [...user.entities, entity], updatedAt: timestamp };
    this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
    return entity;
  }

  getEntity(id: string, userId?: string): UserEntity | null {
    return this.resolve({ userId }).entities.find((entity) => entity.id === id) ?? null;
  }

  listEntities(userId?: string, type?: UserEntityType): UserEntity[] {
    const entities = this.resolve({ userId }).entities;
    return type ? entities.filter((entity) => entity.type === type) : entities;
  }

  link(input: { userId?: string; from: string; relation: string; to: string; source?: string; sensitivity?: UserFactSensitivity; confidence?: number; validFrom?: string; validTo?: string; notes?: string; visibility?: UserFactVisibility }): UserLink {
    const state = this.readState();
    const user = this.resolve({ userId: input.userId });
    const entityIds = new Set(user.entities.map((entity) => entity.id));
    if (!entityIds.has(input.from)) throw new Error(`User entity not found: ${input.from}`);
    if (!entityIds.has(input.to)) throw new Error(`User entity not found: ${input.to}`);
    const sensitivity = input.sensitivity ?? "personal";
    assertPacksEnabled(user, requiredPacksForSensitivity(sensitivity), `User link ${input.relation}`);
    const timestamp = nowIso();
    const link: UserLink = {
      id: normalizeId(`link-${input.from}-${input.relation}-${input.to}-${randomUUID().slice(0, 8)}`),
      from: input.from,
      relation: input.relation.trim(),
      to: input.to,
      metadata: metadata({ ...input, sensitivity }),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const nextUser = { ...user, links: [...user.links, link], updatedAt: timestamp };
    this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
    return link;
  }

  query(input: UserQueryInput = {}): UserQueryResult {
    const user = this.resolve({ userId: input.userId });
    const text = input.text?.toLowerCase();
    const matchesText = (value: unknown) => !text || JSON.stringify(value).toLowerCase().includes(text);
    const matchesMeta = (meta: UserFactMetadata | UserProposal) => {
      if (input.status && meta.status !== input.status) return false;
      if (input.sensitivity && meta.sensitivity !== input.sensitivity) return false;
      if (input.source && meta.source !== input.source) return false;
      if (input.date) {
        const values = [("createdAt" in meta ? meta.createdAt : undefined), ("updatedAt" in meta ? meta.updatedAt : undefined), ("validFrom" in meta ? meta.validFrom : undefined), ("validTo" in meta ? meta.validTo : undefined)].filter(Boolean);
        if (!values.some((value) => String(value).startsWith(input.date!))) return false;
      }
      return true;
    };
    const domain = input.domain ? assertPackId(input.domain) : undefined;
    const facts = Object.entries(user.facets).flatMap(([facet, entries]) => (entries ?? []).map((fact) => ({ ...fact, facet: facet as UserFacetKey })))
      .filter((fact) => (!domain || FACET_PACKS.get(fact.facet)?.includes(domain)))
      .filter((fact) => (!input.type || fact.facet === input.type || fact.key === input.type))
      .filter((fact) => matchesMeta(fact.metadata) && matchesText(fact));
    const records = user.records
      .filter((record) => (!domain || RECORD_PACKS.get(record.type)?.includes(domain)))
      .filter((record) => (!input.type || record.type === input.type))
      .filter((record) => matchesMeta(record.metadata) && matchesText(record));
    const customFacts = user.customFacts
      .filter((fact) => !domain && (!input.type || fact.title === input.type))
      .filter((fact) => matchesMeta(fact.metadata) && matchesText(fact));
    const proposals = user.proposals
      .filter((proposal) => !domain || (proposal.path ? FACET_PACKS.get(proposal.path.split(".", 1)[0] as UserFacetKey)?.includes(domain) : proposal.recordType ? RECORD_PACKS.get(proposal.recordType)?.includes(domain) : false))
      .filter((proposal) => (!input.type || proposal.recordType === input.type || proposal.path?.startsWith(`${input.type}.`) || proposal.kind === input.type))
      .filter((proposal) => matchesMeta(proposal) && matchesText(proposal));
    const entities = user.entities
      .filter((entity) => (!domain || ENTITY_PACKS.get(entity.type)?.includes(domain)))
      .filter((entity) => (!input.type || entity.type === input.type))
      .filter((entity) => matchesMeta(entity.metadata) && matchesText(entity));
    const links = user.links
      .filter((link) => !domain)
      .filter((link) => (!input.type || link.relation === input.type))
      .filter((link) => matchesMeta(link.metadata) && matchesText(link));
    return { facts, records, customFacts, proposals, entities, links };
  }

  delete(id: string, userId?: string): { id: string; deleted: boolean } {
    const state = this.readState();
    const user = this.resolve({ userId });
    const nextFacets = Object.fromEntries(Object.entries(user.facets).map(([facet, facts]) => [facet, (facts ?? []).filter((fact) => fact.id !== id)])) as UserSpec["facets"];
    const nextRecords = user.records.filter((record) => record.id !== id);
    const nextCustomFacts = user.customFacts.filter((fact) => fact.id !== id);
    const nextProposals = user.proposals.filter((proposal) => proposal.id !== id);
    const nextEntities = user.entities.filter((entity) => entity.id !== id);
    const nextLinks = user.links.filter((link) => link.id !== id && link.from !== id && link.to !== id);
    const deleted = JSON.stringify(user.facets) !== JSON.stringify(nextFacets)
      || nextRecords.length !== user.records.length
      || nextCustomFacts.length !== user.customFacts.length
      || nextProposals.length !== user.proposals.length
      || nextEntities.length !== user.entities.length
      || nextLinks.length !== user.links.length;
    if (deleted) {
      const nextUser = { ...user, facets: nextFacets, records: nextRecords, customFacts: nextCustomFacts, proposals: nextProposals, entities: nextEntities, links: nextLinks, updatedAt: nowIso() };
      this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
    }
    return { id, deleted };
  }

  assign(input: { userId: string; agentId: string }): UserAssignment {
    if (!this.get(input.userId)) throw new Error(`User not found: ${input.userId}`);
    const state = this.readState();
    const timestamp = nowIso();
    const existing = state.assignments.find((assignment) => assignment.agentId === input.agentId);
    const next = { agentId: input.agentId, userId: input.userId, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
    this.writeState({ ...state, assignments: existing ? state.assignments.map((assignment) => assignment.agentId === input.agentId ? next : assignment) : [...state.assignments, next] });
    return next;
  }

  assignmentForAgent(agentId: string): UserAssignment | null {
    return this.readState().assignments.find((assignment) => assignment.agentId === agentId) ?? null;
  }

  resolve(input: { userId?: string; agentId?: string } = {}): UserSpec {
    const state = this.readState();
    const assignment = input.userId ? null : input.agentId ? state.assignments.find((entry) => entry.agentId === input.agentId) ?? null : null;
    const id = input.userId || assignment?.userId || DEFAULT_USER_ID;
    const spec = state.specs.find((entry) => entry.id === id) ?? state.specs.find((entry) => entry.isDefault) ?? defaultSpec();
    return userSpecSchema.parse(spec);
  }

  validate(input?: UserSpec): UserValidationResult {
    const parsed = userSpecSchema.safeParse(input ?? this.resolve());
    const issues: UserValidationIssue[] = parsed.success ? [] : parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "$", message: issue.message }));
    return { ok: issues.length === 0, issues };
  }

  renderMarkdown(spec: UserSpec): string {
    const lines = [`# ${spec.displayName}`, "", "<!-- Generated from ClawJS UserSpec. Edit the structured user source, not this block. -->"];
    const identityFacts = spec.facets.identity?.filter((fact) => isVisibleVerified(spec, fact.metadata)) ?? [];
    if (identityFacts.length) {
      lines.push("", "## Identity", ...identityFacts.map((fact) => `- ${formatKey(fact.key)}: ${formatValue(fact.value)}`));
    }
    const activePacks = this.packs(spec.id).filter((pack) => pack.enabled);
    if (activePacks.length) {
      lines.push("", "## Enabled User Packs", ...activePacks.map((pack) => `- ${formatKey(pack.id)} v${pack.schemaVersion}`));
    }
    for (const facet of FACET_KEYS) {
      if (facet === "identity") continue;
      const facts = (spec.facets[facet] ?? []).filter((fact) => isVisibleVerified(spec, fact.metadata));
      if (!facts.length) continue;
      lines.push("", `## ${SECTION_LABELS[facet]}`, ...facts.map((fact) => `- ${formatKey(fact.key)}: ${formatValue(fact.value)}`));
    }
    const records = spec.records.filter((record) => isVisibleVerified(spec, record.metadata));
    if (records.length) {
      lines.push("", "## Structured Records");
      for (const record of records) {
        const fields = Object.entries(record.fields).map(([key, value]) => `${formatKey(key)}: ${formatValue(value)}`).join("; ");
        lines.push(`- ${record.title} (${record.type.replace(/_/g, " ")})${fields ? `: ${fields}` : ""}`);
      }
    }
    const entities = spec.entities.filter((entity) => isVisibleVerified(spec, entity.metadata));
    if (entities.length) {
      lines.push("", "## Linked Entities");
      for (const entity of entities) {
        const fields = Object.entries(entity.fields).map(([key, value]) => `${formatKey(key)}: ${formatValue(value)}`).join("; ");
        lines.push(`- ${entity.title} (${entity.type})${fields ? `: ${fields}` : ""}`);
      }
    }
    const visibleEntityIds = new Set(entities.map((entity) => entity.id));
    const links = spec.links.filter((link) => isVisibleVerified(spec, link.metadata) && visibleEntityIds.has(link.from) && visibleEntityIds.has(link.to));
    if (links.length) {
      lines.push("", "## Entity Links", ...links.map((link) => `- ${link.from} ${link.relation} ${link.to}`));
    }
    const customFacts = spec.customFacts.filter((fact) => isVisibleVerified(spec, fact.metadata));
    if (customFacts.length) {
      lines.push("", "## Custom Facts", ...customFacts.map((fact) => `- ${fact.title}: ${formatValue(fact.value)}`));
    }
    const pending = spec.proposals.filter((proposal) => proposal.status === "pending").length;
    if (pending) lines.push("", `Pending proposed facts are intentionally omitted from this compiled profile (${pending} pending).`);
    return lines.join("\n").trimEnd();
  }

  preview(options: UserCompileOptions = {}): UserCompileResult {
    const spec = this.resolve({ userId: options.userId, agentId: options.agentId });
    const validation = this.validate(spec);
    if (!validation.ok) throw new Error(`Invalid UserSpec: ${validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
    const markdown = this.renderMarkdown(spec);
    const before = readWorkspaceFile(this.workspaceDir, USER_TARGET_FILE, this.filesystem) ?? "";
    const after = applyTextMutation({ originalContent: before, mode: "managed_block", blockId: USER_MANAGED_BLOCK_ID, content: markdown });
    return { userId: spec.id, ...(options.agentId ? { agentId: options.agentId } : {}), markdown: after, targetFile: USER_TARGET_FILE, blockId: USER_MANAGED_BLOCK_ID, changed: before.replace(/\r\n/g, "\n") !== after };
  }

  compile(options: UserCompileOptions = {}): UserCompileResult {
    const result = this.preview(options);
    if (options.write !== false) writeWorkspaceFile(this.workspaceDir, USER_TARGET_FILE, result.markdown, this.filesystem);
    return result;
  }

  inspect(id?: string, agentId?: string): { state: UserState; spec: UserSpec | null; resolved: UserSpec | null; validation: UserValidationResult } {
    const state = this.readState();
    const resolved = agentId ? this.resolve({ agentId }) : id ? this.resolve({ userId: id }) : null;
    const spec = id ? state.specs.find((entry) => entry.id === id) ?? null : resolved;
    return { state, spec, resolved, validation: resolved ? this.validate(resolved) : { ok: true, issues: [] } };
  }
}

export function createUserStore(options: UserStoreOptions): UserStore { return new UserStore(options); }
