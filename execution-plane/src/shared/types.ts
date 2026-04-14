export type Role = "admin" | "user";
export type AssetKind = "script" | "notebook";
export type RuntimeLanguage = "node" | "python";
export type RunStatus = "queued" | "claimed" | "running" | "succeeded" | "failed" | "cancelled";
export type ChangeRequestStatus = "open" | "approved" | "rejected" | "merged";
export type ReviewStatus = "pending" | "approved" | "rejected";
export type DeploymentKind = "static" | "node-web";
export type DeploymentStatus = "draft" | "ready" | "live" | "failed" | "rolled_back";
export type EnvironmentName = "preview" | "staging" | "production";

export interface AuthClaims {
  sub: string;
  email: string;
  role: Role;
  tenantId: string;
  scopes: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

export interface TenantMembership {
  userId: string;
  tenantId: string;
  role: Role;
  scopes: string[];
}

export interface ProjectRecord {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface RepositoryRecord {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  remoteUrl: string;
  defaultBranch: string;
  secretRef: string;
  createdAt: number;
  updatedAt: number;
}

export interface NotebookCell {
  id: string;
  runtime: RuntimeLanguage;
  label: string;
  code: string;
  lastOutput?: string;
  status?: "idle" | "stale" | "succeeded" | "failed";
}

export interface NotebookDocument {
  cells: NotebookCell[];
}

export interface CodeAssetRecord {
  id: string;
  tenantId: string;
  projectId: string;
  repositoryId: string;
  name: string;
  kind: AssetKind;
  path: string;
  runtime: RuntimeLanguage;
  createdAt: number;
  updatedAt: number;
}

export interface RevisionRecord {
  id: string;
  tenantId: string;
  projectId: string;
  repositoryId: string;
  assetId: string;
  branchName: string;
  baseRef: string;
  gitCommit: string | null;
  content: string;
  createdBy: string;
  createdAt: number;
}

export interface ChangeRequestRecord {
  id: string;
  tenantId: string;
  projectId: string;
  repositoryId: string;
  assetId: string;
  revisionId: string;
  title: string;
  description: string;
  targetBranch: string;
  status: ChangeRequestStatus;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChangeRequestReviewRecord {
  id: string;
  changeRequestId: string;
  reviewer: string;
  status: ReviewStatus;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowRecord {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  cron: string;
  assetId: string;
  enabled: boolean;
  inputsJson: string;
  createdAt: number;
  updatedAt: number;
}

export interface RunRecord {
  id: string;
  tenantId: string;
  projectId: string;
  repositoryId: string;
  assetId: string;
  revisionId: string;
  workflowId: string | null;
  status: RunStatus;
  workerId: string | null;
  targetCellId: string | null;
  inputsJson: string;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  outputText: string;
  errorText: string;
  createdAt: number;
  updatedAt: number;
}

export interface RunLogRecord {
  id: string;
  runId: string;
  stream: "stdout" | "stderr" | "system";
  line: string;
  createdAt: number;
}

export interface ArtifactRecord {
  id: string;
  runId: string;
  tenantId: string;
  projectId: string;
  kind: "file" | "directory";
  name: string;
  path: string;
  contentType: string;
  sizeBytes: number;
  deployableKind: DeploymentKind | null;
  createdAt: number;
}

export interface NotebookSnapshotRecord {
  id: string;
  assetId: string;
  revisionId: string;
  runId: string;
  snapshotJson: string;
  createdAt: number;
}

export interface WorkerRecord {
  id: string;
  tenantId: string;
  label: string;
  workspaceRoot: string;
  runtimesJson: string;
  deployKindsJson: string;
  online: number;
  lastSeenAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface DeploymentRecord {
  id: string;
  tenantId: string;
  projectId: string;
  artifactId: string;
  kind: DeploymentKind;
  environment: EnvironmentName;
  status: DeploymentStatus;
  releasePath: string;
  previewUrl: string;
  activeDomain: string;
  certificateStatus: "none" | "pending" | "issued";
  createdAt: number;
  updatedAt: number;
}

export interface DeploymentReleaseRecord {
  id: string;
  deploymentId: string;
  artifactId: string;
  versionLabel: string;
  path: string;
  status: "active" | "inactive";
  createdAt: number;
}

export interface DeploymentDomainRecord {
  id: string;
  deploymentId: string;
  domain: string;
  createdAt: number;
}

export interface DeploymentCertificateRecord {
  id: string;
  deploymentId: string;
  domain: string;
  status: "pending" | "issued" | "failed";
  createdAt: number;
  updatedAt: number;
}

export interface CreateNotebookInput {
  cells: NotebookCell[];
}

export interface WorkerSummary {
  workerId: string;
  label: string;
  runtimes: RuntimeLanguage[];
  deployKinds: DeploymentKind[];
  online: boolean;
  lastSeenAt: number;
}
