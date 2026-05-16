import type { TtsCatalog } from "@clawjs/claw";

export type { TtsCatalog };

export interface E2EAiAuthProviderStatus {
  provider: string;
  hasAuth: boolean;
  hasSubscription: boolean;
  hasApiKey: boolean;
  hasProfileApiKey: boolean;
  hasEnvKey: boolean;
  authType: "oauth" | "token" | "api_key" | "env" | null;
  enabledForAgent?: boolean;
}

export interface E2EAiAuthStatus {
  cliAvailable: boolean;
  defaultModel?: string;
  providers: Record<string, E2EAiAuthProviderStatus>;
}

export interface E2ESkillDescriptor {
  id: string;
  label: string;
  enabled: boolean;
  scope?: "workspace" | "runtime" | "global";
  path?: string;
}

export interface E2ESkillSearchEntry {
  source: string;
  slug: string;
  label: string;
  summary?: string;
  installRef: string;
  homepage?: string;
}

export interface E2ESkillSourceDescriptor {
  id: string;
  label: string;
  status: "ready" | "degraded" | "unsupported";
  capabilities: { search: boolean; install: boolean; resolveExact: boolean };
  summary?: string;
  warnings?: string[];
}

export interface E2EContact {
  id: string;
  name: string;
  relationship: string;
  avatar: { type: string; value?: string };
  emoji?: string;
}

export interface E2EWorkspaceFile {
  fileName: string;
  content: string;
}

export interface E2EImageAsset {
  relativePath: string;
  filePath: string;
  exists: boolean;
  size: number | null;
  mimeType: string | null;
}

export interface E2EImageRecord {
  id: string;
  kind: string;
  status: "succeeded" | "failed";
  operation?: "create" | "edit" | "import";
  prompt: string;
  revisedPrompt?: string;
  title: string;
  imageType?: string;
  tags?: string[];
  collections?: string[];
  backendId: string;
  backendLabel: string;
  provider?: string;
  model?: string;
  parentId?: string;
  sourceImageIds?: string[];
  editDepth?: number;
  provenance?: string;
  externalGenerator?: string;
  createdAt: string;
  updatedAt: string;
  output: E2EImageAsset | null;
  metadata?: Record<string, unknown>;
  error?: string;
}
