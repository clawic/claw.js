import path from "path";
import { randomUUID } from "crypto";

import {
  userProposalSchema,
  userSpecSchema,
  userStateSchema,
  type UserAssignment,
  type UserCompileProfile,
  type UserCompileResult,
  type UserCustomFact,
  type UserDomainId,
  type UserDomainState,
  type UserEntity,
  type UserEntityType,
  type UserFacetKey,
  type UserFact,
  type UserFactMetadata,
  type UserFactSensitivity,
  type UserFactValue,
  type UserFactVisibility,
  type UserLink,
  type UserMergeProposal,
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
const DOMAIN_IDS = new Set<UserDomainId>([
  "career.projects", "career.employment", "career.education", "career.skills",
  "family.household", "family.relationships", "travel.documents", "travel.places",
  "health.sleep", "health.routines", "health.conditions", "legal.documents",
  "finance.profile", "location.places", "accounts.public",
]);
const ENTITY_TYPES = new Set<UserEntityType>(["person", "organization", "place", "asset", "pet", "document", "account"]);
const BEHAVIOR_FACETS = new Set(["assistant", "behavior", "communication", "preference", "preferences", "rules", "style"]);
const SENSITIVE_CATEGORIES = new Set<UserFactSensitivity>(["sensitive", "medical", "financial", "legal", "location", "intimate", "child", "official_id", "account"]);
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
const DOMAIN_DEFINITIONS: Record<UserDomainId, { pack: UserPackId; sensitivity: UserFactSensitivity; facets: UserFacetKey[]; records: UserRecordType[]; entities: UserEntityType[] }> = {
  "career.projects": { pack: "professional", sensitivity: "personal", facets: ["projects"], records: ["project", "achievement"], entities: ["organization", "person", "document", "account"] },
  "career.employment": { pack: "professional", sensitivity: "personal", facets: ["work"], records: ["employment", "affiliation"], entities: ["organization", "person", "place"] },
  "career.education": { pack: "professional", sensitivity: "personal", facets: ["education"], records: ["education", "certification"], entities: ["organization", "place", "document"] },
  "career.skills": { pack: "professional", sensitivity: "personal", facets: ["skills"], records: ["skill", "certification"], entities: ["document", "account"] },
  "family.household": { pack: "practical", sensitivity: "personal", facets: ["home", "family"], records: ["pet", "routine", "life_event"], entities: ["person", "place", "asset", "pet"] },
  "family.relationships": { pack: "practical", sensitivity: "personal", facets: ["relationships", "family"], records: ["relationship"], entities: ["person"] },
  "travel.documents": { pack: "practical", sensitivity: "official_id", facets: ["travel", "legal"], records: ["administrative_document"], entities: ["document", "place"] },
  "travel.places": { pack: "practical", sensitivity: "location", facets: ["travel", "residence"], records: ["residence", "life_event"], entities: ["place"] },
  "health.sleep": { pack: "wellbeing", sensitivity: "medical", facets: ["health", "routines"], records: ["routine"], entities: ["document", "account"] },
  "health.routines": { pack: "wellbeing", sensitivity: "medical", facets: ["health", "routines"], records: ["routine"], entities: ["person", "document", "account"] },
  "health.conditions": { pack: "wellbeing", sensitivity: "medical", facets: ["health"], records: ["health_condition"], entities: ["person", "document"] },
  "legal.documents": { pack: "practical", sensitivity: "legal", facets: ["legal"], records: ["administrative_document"], entities: ["document", "organization"] },
  "finance.profile": { pack: "practical", sensitivity: "financial", facets: ["finances"], records: ["administrative_document"], entities: ["organization", "document", "account"] },
  "location.places": { pack: "practical", sensitivity: "location", facets: ["residence", "travel"], records: ["residence"], entities: ["place"] },
  "accounts.public": { pack: "practical", sensitivity: "account", facets: ["devices", "publicContact"], records: ["descriptive_preference"], entities: ["account"] },
};
const FACET_DOMAINS = new Map<UserFacetKey, UserDomainId[]>();
const RECORD_DOMAINS = new Map<UserRecordType, UserDomainId[]>();
const ENTITY_DOMAINS = new Map<UserEntityType, UserDomainId[]>();
for (const [packId, definition] of Object.entries(PACK_DEFINITIONS) as Array<[UserPackId, typeof PACK_DEFINITIONS[UserPackId]]>) {
  for (const facet of definition.facets) FACET_PACKS.set(facet, [...(FACET_PACKS.get(facet) ?? []), packId]);
  for (const record of definition.records) RECORD_PACKS.set(record, [...(RECORD_PACKS.get(record) ?? []), packId]);
  for (const entity of definition.entities) ENTITY_PACKS.set(entity, [...(ENTITY_PACKS.get(entity) ?? []), packId]);
}
for (const [domainId, definition] of Object.entries(DOMAIN_DEFINITIONS) as Array<[UserDomainId, typeof DOMAIN_DEFINITIONS[UserDomainId]]>) {
  for (const facet of definition.facets) FACET_DOMAINS.set(facet, [...(FACET_DOMAINS.get(facet) ?? []), domainId]);
  for (const record of definition.records) RECORD_DOMAINS.set(record, [...(RECORD_DOMAINS.get(record) ?? []), domainId]);
  for (const entity of definition.entities) ENTITY_DOMAINS.set(entity, [...(ENTITY_DOMAINS.get(entity) ?? []), domainId]);
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
  domain?: UserDomainId;
  supersedes?: string;
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
  domain?: UserDomainId;
  supersedes?: string;
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
  domain?: UserDomainId;
  source?: string;
  sensitivity?: UserFactSensitivity;
  confidence?: number;
  notes?: string;
  visibility?: UserFactVisibility;
}
export interface UserCompileOptions { userId?: string; agentId?: string; write?: boolean; profile?: UserCompileProfile; }
export interface UserQueryInput {
  userId?: string;
  domain?: UserPackId | UserDomainId;
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
  domain: UserPackId | UserDomainId;
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
export interface UserClassificationResult {
  target: "user" | "rules" | "memory";
  confidence: number;
  reason: string;
  path?: string;
  domain?: UserDomainId;
  recordType?: UserRecordType;
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
  domain?: UserDomainId;
  supersedes?: string;
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
    ...(input.domain ? { domain: input.domain } : {}),
    ...(input.supersedes ? { supersedes: input.supersedes } : {}),
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
    domains: [],
    entities: [],
    links: [],
    records: [],
    customFacts: [],
    proposals: [],
    tombstones: [],
    mergeProposals: [],
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
      domains: spec.domains ?? [],
      entities: spec.entities ?? [],
      links: spec.links ?? [],
      records: spec.records ?? [],
      customFacts: spec.customFacts ?? [],
      proposals: spec.proposals ?? [],
      tombstones: spec.tombstones ?? [],
      mergeProposals: spec.mergeProposals ?? [],
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
function assertDomainId(value: string): UserDomainId {
  if (!DOMAIN_IDS.has(value as UserDomainId)) throw new Error(`Unknown UserSpec domain: ${value}`);
  return value as UserDomainId;
}
function assertEntityType(value: string): UserEntityType {
  if (!ENTITY_TYPES.has(value as UserEntityType)) throw new Error(`Unknown UserSpec entity type: ${value}`);
  return value as UserEntityType;
}
function hasEnabledPack(spec: UserSpec, packId: UserPackId): boolean {
  return spec.packs.some((pack) => pack.id === packId && pack.enabled);
}
function hasEnabledDomain(spec: UserSpec, domainId: UserDomainId): boolean {
  return spec.domains.some((domain) => domain.id === domainId && domain.enabled) || hasEnabledPack(spec, DOMAIN_DEFINITIONS[domainId].pack);
}
function requiredDomainsForSensitivity(sensitivity: UserFactSensitivity, domain?: UserDomainId): UserDomainId[] {
  if (!SENSITIVE_CATEGORIES.has(sensitivity)) return [];
  if (domain) return [domain];
  if (sensitivity === "medical" || sensitivity === "sensitive") return ["health.conditions"];
  if (sensitivity === "financial") return ["finance.profile"];
  if (sensitivity === "legal" || sensitivity === "official_id") return ["legal.documents"];
  if (sensitivity === "location") return ["location.places"];
  if (sensitivity === "account") return ["accounts.public"];
  return [];
}
function assertDomainsEnabled(spec: UserSpec, domains: UserDomainId[], context: string): void {
  const missing = domains.filter((domainId) => !hasEnabledDomain(spec, domainId));
  if (missing.length) throw new Error(`${context} requires enabled user domain(s): ${missing.join(", ")}`);
}
function inferDomainFromFacet(facet: UserFacetKey, key?: string): UserDomainId | undefined {
  if (facet === "projects") return "career.projects";
  if (facet === "work") return "career.employment";
  if (facet === "education") return "career.education";
  if (facet === "skills") return "career.skills";
  if (facet === "family" || facet === "home") return "family.household";
  if (facet === "relationships") return "family.relationships";
  if (facet === "health" && key?.toLowerCase().includes("sleep")) return "health.sleep";
  if (facet === "health") return "health.conditions";
  if (facet === "legal") return "legal.documents";
  if (facet === "finances") return "finance.profile";
  if (facet === "residence") return "location.places";
  if (facet === "travel") return "travel.places";
  if (facet === "devices" || facet === "publicContact") return "accounts.public";
  return FACET_DOMAINS.get(facet)?.[0];
}
function inferDomainFromRecord(type: UserRecordType): UserDomainId | undefined {
  if (type === "project" || type === "achievement") return "career.projects";
  if (type === "employment" || type === "affiliation") return "career.employment";
  if (type === "education" || type === "certification") return "career.education";
  if (type === "skill") return "career.skills";
  if (type === "relationship") return "family.relationships";
  if (type === "pet") return "family.household";
  if (type === "residence") return "location.places";
  if (type === "health_condition") return "health.conditions";
  if (type === "routine") return "health.routines";
  if (type === "administrative_document") return "legal.documents";
  return RECORD_DOMAINS.get(type)?.[0];
}
function inferDomainFromEntity(type: UserEntityType, fields: Record<string, UserFactValue> = {}): UserDomainId | undefined {
  if (type === "organization") return "career.employment";
  if (type === "place") return "location.places";
  if (type === "document" && ("passport" in fields || "documentNumber" in fields || "country" in fields)) return "travel.documents";
  if (type === "document") return "legal.documents";
  if (type === "account") return "accounts.public";
  if (type === "pet" || type === "asset") return "family.household";
  return ENTITY_DOMAINS.get(type)?.[0];
}
function sensitivityForDomain(domain?: UserDomainId, fallback: UserFactSensitivity = "personal"): UserFactSensitivity {
  return domain ? DOMAIN_DEFINITIONS[domain].sensitivity : fallback;
}
function allowedSensitiveForProfile(profile: UserCompileProfile, sensitivity: UserFactSensitivity): boolean {
  if (!SENSITIVE_CATEGORIES.has(sensitivity)) return true;
  if (profile === "wellbeing") return sensitivity === "medical" || sensitivity === "sensitive";
  if (profile === "travel") return sensitivity === "official_id" || sensitivity === "location";
  return false;
}
function domainMatchesProfile(profile: UserCompileProfile, domain?: UserDomainId): boolean {
  if (profile === "general") return true;
  if (!domain) return false;
  if (profile === "work") return domain.startsWith("career.") || domain === "accounts.public";
  if (profile === "family") return domain.startsWith("family.") || domain === "location.places";
  if (profile === "travel") return domain.startsWith("travel.") || domain === "location.places";
  if (profile === "wellbeing") return domain.startsWith("health.");
  return true;
}
function isVisibleVerified(spec: UserSpec, metadataValue: UserFactMetadata, profile: UserCompileProfile = "general"): boolean {
  if (metadataValue.status !== "verified" || metadataValue.visibility === "private") return false;
  if (!domainMatchesProfile(profile, metadataValue.domain)) return false;
  if (SENSITIVE_CATEGORIES.has(metadataValue.sensitivity)) {
    return metadataValue.visibility === "public" && allowedSensitiveForProfile(profile, metadataValue.sensitivity) && (!metadataValue.domain || hasEnabledDomain(spec, metadataValue.domain));
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

  domains(userId?: string): Array<UserDomainState & { pack: UserPackId; availableFacets: UserFacetKey[]; availableRecords: UserRecordType[]; availableEntities: UserEntityType[] }> {
    const user = this.resolve({ userId });
    return (Object.keys(DOMAIN_DEFINITIONS) as UserDomainId[]).map((id) => {
      const current = user.domains.find((domain) => domain.id === id);
      const definition = DOMAIN_DEFINITIONS[id];
      return {
        id,
        schemaVersion: current?.schemaVersion ?? 1,
        enabled: current?.enabled ?? hasEnabledPack(user, definition.pack),
        ...(current?.enabledAt ? { enabledAt: current.enabledAt } : {}),
        ...(current?.disabledAt ? { disabledAt: current.disabledAt } : {}),
        sensitivity: current?.sensitivity ?? definition.sensitivity,
        visibility: current?.visibility ?? "agent",
        pack: definition.pack,
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
    const domainStates = (Object.keys(DOMAIN_DEFINITIONS) as UserDomainId[])
      .filter((domainId) => DOMAIN_DEFINITIONS[domainId].pack === id)
      .map((domainId) => {
        const currentDomain = user.domains.find((domain) => domain.id === domainId);
        return {
          id: domainId,
          schemaVersion: currentDomain?.schemaVersion ?? 1,
          enabled: input.enabled,
          ...(input.enabled ? { enabledAt: currentDomain?.enabledAt ?? timestamp } : {}),
          ...(!input.enabled ? { disabledAt: timestamp } : {}),
          sensitivity: currentDomain?.sensitivity ?? DOMAIN_DEFINITIONS[domainId].sensitivity,
          visibility: currentDomain?.visibility ?? "agent",
        };
      });
    const nextUser = {
      ...user,
      packs: [...user.packs.filter((entry) => entry.id !== id), pack],
      domains: [...user.domains.filter((entry) => DOMAIN_DEFINITIONS[entry.id].pack !== id), ...domainStates],
      updatedAt: timestamp,
    };
    this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
    return pack;
  }

  enablePack(userId: string | undefined, id: UserPackId): UserPackState { return this.setPack({ userId, id, enabled: true }); }
  disablePack(userId: string | undefined, id: UserPackId): UserPackState { return this.setPack({ userId, id, enabled: false }); }

  setDomain(input: { userId?: string; id: UserDomainId; enabled: boolean }): UserDomainState {
    const state = this.readState();
    const user = this.resolve({ userId: input.userId });
    const id = assertDomainId(input.id);
    const timestamp = nowIso();
    const current = user.domains.find((domain) => domain.id === id);
    const domain: UserDomainState = {
      id,
      schemaVersion: current?.schemaVersion ?? 1,
      enabled: input.enabled,
      ...(input.enabled ? { enabledAt: current?.enabledAt ?? timestamp } : {}),
      ...(!input.enabled ? { disabledAt: timestamp } : {}),
      sensitivity: current?.sensitivity ?? DOMAIN_DEFINITIONS[id].sensitivity,
      visibility: current?.visibility ?? "agent",
    };
    const nextUser = { ...user, domains: [...user.domains.filter((entry) => entry.id !== id), domain], updatedAt: timestamp };
    this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
    return domain;
  }

  enableDomain(userId: string | undefined, id: UserDomainId): UserDomainState { return this.setDomain({ userId, id, enabled: true }); }
  disableDomain(userId: string | undefined, id: UserDomainId): UserDomainState { return this.setDomain({ userId, id, enabled: false }); }

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
    const domain = input.domain ?? inferDomainFromFacet(facet, key);
    const sensitivity = input.sensitivity ?? (domain && DOMAIN_DEFINITIONS[domain].pack === "wellbeing" ? sensitivityForDomain(domain) : facet === "health" ? "medical" : "personal");
    assertDomainsEnabled(user, requiredDomainsForSensitivity(sensitivity, input.domain ?? (facet === "health" ? domain : undefined)), `User fact ${input.path}`);
    const timestamp = nowIso();
    const currentFacts = user.facets[facet] ?? [];
    const current = currentFacts.find((fact) => fact.key === key);
    const fact: UserFact = {
      id: current?.id ?? normalizeId(`${facet}-${key}`),
      key,
      value: input.value,
      metadata: metadata({ ...input, domain, sensitivity }),
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
    const domain = input.domain ?? inferDomainFromRecord(type);
    const sensitivity = input.sensitivity ?? (domain && DOMAIN_DEFINITIONS[domain].pack === "wellbeing" ? sensitivityForDomain(domain) : type === "health_condition" ? "medical" : "personal");
    assertDomainsEnabled(user, requiredDomainsForSensitivity(sensitivity, input.domain ?? (type === "health_condition" ? domain : undefined)), `User record ${type}`);
    const record: UserRecord = {
      id: normalizeId(`${type}-${input.title}-${randomUUID().slice(0, 8)}`),
      type,
      title: input.title.trim(),
      fields: input.fields ?? {},
      metadata: metadata({ ...input, domain, sensitivity }),
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
    assertDomainsEnabled(user, requiredDomainsForSensitivity(sensitivity, input.domain), `User custom fact ${input.title}`);
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
    const parsedPath = input.path ? parsePath(input.path) : undefined;
    const domain = input.domain ?? (parsedPath ? inferDomainFromFacet(parsedPath.facet, parsedPath.key) : input.recordType ? inferDomainFromRecord(input.recordType) : undefined);
    const sensitivity = input.sensitivity ?? (domain && DOMAIN_DEFINITIONS[domain].pack === "wellbeing" ? sensitivityForDomain(domain) : input.path?.startsWith("health.") || input.recordType === "health_condition" ? "medical" : "personal");
    assertDomainsEnabled(user, requiredDomainsForSensitivity(sensitivity, input.domain ?? (input.path?.startsWith("health.") || input.recordType === "health_condition" ? domain : undefined)), "User proposal");
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
      ...(domain ? { domain } : {}),
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
        domain: proposal.domain,
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
        domain: proposal.domain,
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
        domain: proposal.domain,
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
    const isPack = PACK_IDS.has(input.domain as UserPackId);
    const domain = isPack ? undefined : assertDomainId(input.domain);
    const pack = isPack ? assertPackId(input.domain) : DOMAIN_DEFINITIONS[domain!].pack;
    const user = this.resolve({ userId: input.userId });
    if (domain) assertDomainsEnabled(user, [domain], `User wizard ${domain}`);
    else if (!hasEnabledPack(user, pack)) throw new Error(`User wizard ${pack} requires enabled user pack(s): ${pack}`);
    const recordType: UserRecordType = domain ? DOMAIN_DEFINITIONS[domain].records[0] ?? "life_event" : pack === "professional"
      ? "project"
      : pack === "wellbeing"
        ? "routine"
        : "administrative_document";
    return this.propose({
      userId: user.id,
      recordType,
      title: input.title,
      fields: input.fields,
      ...(domain ? { domain } : {}),
      source: input.source ?? `wizard:${domain ?? pack}`,
      sensitivity: input.sensitivity ?? (domain ? DOMAIN_DEFINITIONS[domain].sensitivity : PACK_DEFINITIONS[pack].sensitivity),
      confidence: input.confidence,
      notes: input.notes,
      visibility: input.visibility,
    });
  }

  addEntity(input: { userId?: string; type: UserEntityType; title: string; fields?: Record<string, UserFactValue>; source?: string; sensitivity?: UserFactSensitivity; confidence?: number; validFrom?: string; validTo?: string; notes?: string; visibility?: UserFactVisibility }): UserEntity {
    const state = this.readState();
    const user = this.resolve({ userId: input.userId });
    const type = assertEntityType(input.type);
    const domain = inferDomainFromEntity(type, input.fields ?? {});
    const sensitivity = input.sensitivity ?? (domain ? sensitivityForDomain(domain) : "personal");
    assertDomainsEnabled(user, requiredDomainsForSensitivity(sensitivity, SENSITIVE_CATEGORIES.has(sensitivity) ? domain : undefined), `User entity ${type}`);
    const timestamp = nowIso();
    const entity: UserEntity = {
      id: normalizeId(`${type}-${input.title}-${randomUUID().slice(0, 8)}`),
      type,
      title: input.title.trim(),
      fields: input.fields ?? {},
      metadata: metadata({ ...input, domain, sensitivity }),
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
    assertDomainsEnabled(user, requiredDomainsForSensitivity(sensitivity), `User link ${input.relation}`);
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
    const domain = input.domain && DOMAIN_IDS.has(input.domain as UserDomainId) ? assertDomainId(input.domain) : undefined;
    const pack = input.domain && !domain ? assertPackId(input.domain) : undefined;
    const matchesDomain = (meta: UserFactMetadata | UserProposal, fallbackDomains: UserDomainId[] = [], fallbackPacks: UserPackId[] = []) => {
      if (domain) return meta.domain === domain || fallbackDomains.includes(domain);
      if (pack) return meta.domain ? DOMAIN_DEFINITIONS[meta.domain].pack === pack : fallbackPacks.includes(pack);
      return true;
    };
    const facts = Object.entries(user.facets).flatMap(([facet, entries]) => (entries ?? []).map((fact) => ({ ...fact, facet: facet as UserFacetKey })))
      .filter((fact) => matchesDomain(fact.metadata, FACET_DOMAINS.get(fact.facet) ?? [], FACET_PACKS.get(fact.facet) ?? []))
      .filter((fact) => (!input.type || fact.facet === input.type || fact.key === input.type))
      .filter((fact) => matchesMeta(fact.metadata) && matchesText(fact));
    const records = user.records
      .filter((record) => matchesDomain(record.metadata, RECORD_DOMAINS.get(record.type) ?? [], RECORD_PACKS.get(record.type) ?? []))
      .filter((record) => (!input.type || record.type === input.type))
      .filter((record) => matchesMeta(record.metadata) && matchesText(record));
    const customFacts = user.customFacts
      .filter((fact) => matchesDomain(fact.metadata) && (!input.type || fact.title === input.type))
      .filter((fact) => matchesMeta(fact.metadata) && matchesText(fact));
    const proposals = user.proposals
      .filter((proposal) => matchesDomain(proposal, proposal.path ? FACET_DOMAINS.get(proposal.path.split(".", 1)[0] as UserFacetKey) ?? [] : proposal.recordType ? RECORD_DOMAINS.get(proposal.recordType) ?? [] : [], proposal.path ? FACET_PACKS.get(proposal.path.split(".", 1)[0] as UserFacetKey) ?? [] : proposal.recordType ? RECORD_PACKS.get(proposal.recordType) ?? [] : []))
      .filter((proposal) => (!input.type || proposal.recordType === input.type || proposal.path?.startsWith(`${input.type}.`) || proposal.kind === input.type))
      .filter((proposal) => matchesMeta(proposal) && matchesText(proposal));
    const entities = user.entities
      .filter((entity) => matchesDomain(entity.metadata, ENTITY_DOMAINS.get(entity.type) ?? [], ENTITY_PACKS.get(entity.type) ?? []))
      .filter((entity) => (!input.type || entity.type === input.type))
      .filter((entity) => matchesMeta(entity.metadata) && matchesText(entity));
    const links = user.links
      .filter((link) => !domain && !pack)
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
    const nextMergeProposals = user.mergeProposals.filter((proposal) => proposal.id !== id);
    const deletedKind = user.records.some((record) => record.id === id) ? "record"
      : user.customFacts.some((fact) => fact.id === id) ? "custom_fact"
        : user.proposals.some((proposal) => proposal.id === id) ? "proposal"
          : user.entities.some((entity) => entity.id === id) ? "entity"
            : user.links.some((link) => link.id === id || link.from === id || link.to === id) ? "link"
              : user.mergeProposals.some((proposal) => proposal.id === id) ? "merge_proposal"
                : Object.values(user.facets).some((facts) => facts?.some((fact) => fact.id === id)) ? "fact"
                  : null;
    const deleted = JSON.stringify(user.facets) !== JSON.stringify(nextFacets)
      || nextRecords.length !== user.records.length
      || nextCustomFacts.length !== user.customFacts.length
      || nextProposals.length !== user.proposals.length
      || nextEntities.length !== user.entities.length
      || nextLinks.length !== user.links.length
      || nextMergeProposals.length !== user.mergeProposals.length;
    if (deleted) {
      const timestamp = nowIso();
      const nextUser = {
        ...user,
        facets: nextFacets,
        records: nextRecords,
        customFacts: nextCustomFacts,
        proposals: nextProposals,
        entities: nextEntities,
        links: nextLinks,
        mergeProposals: nextMergeProposals,
        tombstones: [...user.tombstones, { id, kind: deletedKind ?? "fact", userId: user.id, deletedAt: timestamp }],
        updatedAt: timestamp,
      };
      this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
    }
    return { id, deleted };
  }

  reviewList(input: { userId?: string; status?: UserProposal["status"] } = {}): UserProposal[] {
    return this.resolve({ userId: input.userId }).proposals.filter((proposal) => !input.status || proposal.status === input.status);
  }

  reviewShow(id: string, userId?: string): UserProposal {
    const proposal = this.resolve({ userId }).proposals.find((entry) => entry.id === id);
    if (!proposal) throw new Error(`User proposal not found: ${id}`);
    return proposal;
  }

  reviewReject(id: string, userId?: string, reason?: string): UserProposal {
    const state = this.readState();
    const user = this.resolve({ userId });
    const proposal = user.proposals.find((entry) => entry.id === id);
    if (!proposal) throw new Error(`User proposal not found: ${id}`);
    const timestamp = nowIso();
    const rejected = { ...proposal, status: "rejected" as const, notes: reason ?? proposal.notes, updatedAt: timestamp };
    const nextUser = { ...user, proposals: user.proposals.map((entry) => entry.id === id ? rejected : entry), updatedAt: timestamp };
    this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
    return rejected;
  }

  reviewEdit(id: string, patch: Partial<UserProposal>, userId?: string): UserProposal {
    const state = this.readState();
    const user = this.resolve({ userId });
    const proposal = user.proposals.find((entry) => entry.id === id);
    if (!proposal) throw new Error(`User proposal not found: ${id}`);
    const timestamp = nowIso();
    const next = userProposalSchema.parse({ ...proposal, ...patch, id: proposal.id, userId: proposal.userId, status: proposal.status, updatedAt: timestamp }) as UserProposal;
    const nextUser = { ...user, proposals: user.proposals.map((entry) => entry.id === id ? next : entry), updatedAt: timestamp };
    this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
    return next;
  }

  reviewApproveMany(ids: string[], userId?: string): UserProposal[] {
    return ids.map((id) => this.verify(id, userId));
  }

  supersede(id: string, input: { userId?: string; value?: UserFactValue; title?: string; fields?: Record<string, UserFactValue>; notes?: string; validFrom?: string; visibility?: UserFactVisibility }): UserFact | UserRecord | UserCustomFact {
    const state = this.readState();
    const user = this.resolve({ userId: input.userId });
    const timestamp = nowIso();
    for (const [facet, facts] of Object.entries(user.facets) as Array<[UserFacetKey, UserFact[] | undefined]>) {
      const current = (facts ?? []).find((fact) => fact.id === id);
      if (!current) continue;
      const archived = { ...current, metadata: { ...current.metadata, status: "archived" as const, validTo: timestamp }, updatedAt: timestamp };
      const nextFact: UserFact = { ...current, id: normalizeId(`${facet}-${current.key}-${randomUUID().slice(0, 8)}`), value: input.value ?? current.value, metadata: metadata({ ...current.metadata, supersedes: current.id, validFrom: input.validFrom, notes: input.notes, visibility: input.visibility ?? current.metadata.visibility }), createdAt: timestamp, updatedAt: timestamp };
      const nextUser = { ...user, facets: { ...user.facets, [facet]: [...(facts ?? []).filter((fact) => fact.id !== id), archived, nextFact] }, updatedAt: timestamp };
      this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
      return nextFact;
    }
    const record = user.records.find((entry) => entry.id === id);
    if (record) {
      const archived = { ...record, metadata: { ...record.metadata, status: "archived" as const, validTo: timestamp }, updatedAt: timestamp };
      const nextRecord: UserRecord = { ...record, id: normalizeId(`${record.type}-${input.title ?? record.title}-${randomUUID().slice(0, 8)}`), title: input.title ?? record.title, fields: input.fields ?? record.fields, metadata: metadata({ ...record.metadata, supersedes: record.id, validFrom: input.validFrom, notes: input.notes, visibility: input.visibility ?? record.metadata.visibility }), createdAt: timestamp, updatedAt: timestamp };
      const nextUser = { ...user, records: [...user.records.filter((entry) => entry.id !== id), archived, nextRecord], updatedAt: timestamp };
      this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
      return nextRecord;
    }
    throw new Error(`User item not found: ${id}`);
  }

  classify(text: string): UserClassificationResult {
    const normalized = text.toLowerCase();
    if (/(habla|responde|pregunta|usa|formato|tono|breve|conciso|antes de actuar)/.test(normalized)) return { target: "rules", confidence: 0.8, reason: "behavioral preference or agent instruction" };
    if (/(ayer|recuerdo|conversaci[oó]n|pas[oó]|una vez|episodio)/.test(normalized)) return { target: "memory", confidence: 0.7, reason: "episodic or conversation-like memory" };
    if (/(trabajo en|proyecto)/.test(normalized)) return { target: "user", confidence: 0.8, reason: "verifiable professional fact", domain: "career.employment", recordType: "employment" };
    if (/(duermo|salud)/.test(normalized)) return { target: "user", confidence: 0.75, reason: "verifiable wellbeing fact", domain: "health.sleep", path: "health.sleep" };
    if (/(pasaporte)/.test(normalized)) return { target: "user", confidence: 0.75, reason: "verifiable document fact", domain: "travel.documents", recordType: "administrative_document" };
    if (/(vivo en|ciudad)/.test(normalized)) return { target: "user", confidence: 0.75, reason: "verifiable location fact", domain: "location.places", path: "residence.city" };
    return { target: "memory", confidence: 0.45, reason: "not enough structure for a verified user fact" };
  }

  extractMemory(input: { userId?: string; source: string }): UserProposal[] {
    const classification = this.classify(input.source);
    if (classification.target !== "user") return [];
    const title = input.source.length > 80 ? `${input.source.slice(0, 77)}...` : input.source;
    if (classification.path) return [this.propose({ userId: input.userId, path: classification.path, value: title, domain: classification.domain, source: "memory", confidence: classification.confidence })];
    return [this.propose({ userId: input.userId, recordType: classification.recordType ?? "life_event", title, domain: classification.domain, source: "memory", confidence: classification.confidence })];
  }

  proposeMerge(input: { userId?: string; sourceId?: string; targetId?: string }): UserMergeProposal[] {
    const state = this.readState();
    const user = this.resolve({ userId: input.userId });
    const timestamp = nowIso();
    const pairs: Array<{ sourceId: string; targetId: string; reason: string }> = [];
    if (input.sourceId && input.targetId) pairs.push({ sourceId: input.sourceId, targetId: input.targetId, reason: "manual merge proposal" });
    else for (let i = 0; i < user.entities.length; i += 1) for (let j = i + 1; j < user.entities.length; j += 1) {
      const left = user.entities[i]!;
      const right = user.entities[j]!;
      if (left.type === right.type && normalizeId(left.title) === normalizeId(right.title)) pairs.push({ sourceId: right.id, targetId: left.id, reason: `possible duplicate ${left.type} title` });
    }
    const proposals = pairs.filter((pair) => !user.mergeProposals.some((proposal) => proposal.sourceId === pair.sourceId && proposal.targetId === pair.targetId && proposal.status === "pending")).map((pair): UserMergeProposal => ({ id: normalizeId(`merge-${pair.sourceId}-${pair.targetId}-${randomUUID().slice(0, 8)}`), userId: user.id, sourceId: pair.sourceId, targetId: pair.targetId, reason: pair.reason, status: "pending", createdAt: timestamp, updatedAt: timestamp }));
    if (proposals.length) this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse({ ...user, mergeProposals: [...user.mergeProposals, ...proposals], updatedAt: timestamp }) : spec) });
    return proposals;
  }

  decideMerge(id: string, decision: "approved" | "rejected", userId?: string): UserMergeProposal {
    const state = this.readState();
    const user = this.resolve({ userId });
    const proposal = user.mergeProposals.find((entry) => entry.id === id);
    if (!proposal) throw new Error(`User merge proposal not found: ${id}`);
    const timestamp = nowIso();
    let nextUser = user;
    if (decision === "approved" && proposal.status === "pending") {
      const source = user.entities.find((entity) => entity.id === proposal.sourceId);
      const target = user.entities.find((entity) => entity.id === proposal.targetId);
      if (!source || !target) throw new Error(`User merge entities not found for proposal: ${id}`);
      nextUser = { ...user, entities: user.entities.filter((entity) => entity.id !== source.id).map((entity) => entity.id === target.id ? { ...target, fields: { ...source.fields, ...target.fields }, updatedAt: timestamp } : entity), tombstones: [...user.tombstones, { id: source.id, kind: "entity" as const, userId: user.id, deletedAt: timestamp, reason: `merged into ${target.id}` }] };
    }
    const decided = { ...proposal, status: decision, updatedAt: timestamp, decidedAt: timestamp };
    nextUser = { ...nextUser, mergeProposals: nextUser.mergeProposals.map((entry) => entry.id === id ? decided : entry), updatedAt: timestamp };
    this.writeState({ ...state, specs: state.specs.map((spec) => spec.id === user.id ? userSpecSchema.parse(nextUser) : spec) });
    return decided;
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

  renderMarkdown(spec: UserSpec, profile: UserCompileProfile = "general"): string {
    const lines = [`# ${spec.displayName}`, "", `<!-- Generated from ClawJS UserSpec (${profile}). Edit the structured user source, not this block. -->`];
    const identityFacts = spec.facets.identity?.filter((fact) => isVisibleVerified(spec, fact.metadata, profile)) ?? [];
    if (identityFacts.length) {
      lines.push("", "## Identity", ...identityFacts.map((fact) => `- ${formatKey(fact.key)}: ${formatValue(fact.value)}`));
    }
    const activeDomains = this.domains(spec.id).filter((domain) => domain.enabled && domainMatchesProfile(profile, domain.id));
    if (activeDomains.length) {
      lines.push("", "## Enabled User Domains", ...activeDomains.map((domain) => `- ${domain.id} v${domain.schemaVersion}`));
    }
    for (const facet of FACET_KEYS) {
      if (facet === "identity") continue;
      const facts = (spec.facets[facet] ?? []).filter((fact) => isVisibleVerified(spec, fact.metadata, profile));
      if (!facts.length) continue;
      lines.push("", `## ${SECTION_LABELS[facet]}`, ...facts.map((fact) => `- ${formatKey(fact.key)}: ${formatValue(fact.value)}`));
    }
    const records = spec.records.filter((record) => isVisibleVerified(spec, record.metadata, profile));
    if (records.length) {
      lines.push("", "## Structured Records");
      for (const record of records) {
        const fields = Object.entries(record.fields).map(([key, value]) => `${formatKey(key)}: ${formatValue(value)}`).join("; ");
        lines.push(`- ${record.title} (${record.type.replace(/_/g, " ")})${fields ? `: ${fields}` : ""}`);
      }
    }
    const entities = spec.entities.filter((entity) => isVisibleVerified(spec, entity.metadata, profile));
    if (entities.length) {
      lines.push("", "## Linked Entities");
      for (const entity of entities) {
        const fields = Object.entries(entity.fields).map(([key, value]) => `${formatKey(key)}: ${formatValue(value)}`).join("; ");
        lines.push(`- ${entity.title} (${entity.type})${fields ? `: ${fields}` : ""}`);
      }
    }
    const visibleEntityIds = new Set(entities.map((entity) => entity.id));
    const links = spec.links.filter((link) => isVisibleVerified(spec, link.metadata, profile) && visibleEntityIds.has(link.from) && visibleEntityIds.has(link.to));
    if (links.length) {
      lines.push("", "## Entity Links", ...links.map((link) => `- ${link.from} ${link.relation} ${link.to}`));
    }
    const customFacts = spec.customFacts.filter((fact) => isVisibleVerified(spec, fact.metadata, profile));
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
    const markdown = this.renderMarkdown(spec, options.profile ?? "general");
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
