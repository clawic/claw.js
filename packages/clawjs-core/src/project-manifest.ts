import { z } from "zod";

export const clawProjectTypeSchema = z.enum(["app", "agent", "server", "workspace", "skill", "plugin", "project"]);
export const clawProjectAttachmentStateSchema = z.enum(["attached", "detached"]);
export const clawProjectFolderRoleSchema = z.enum(["primary", "reference"]);

export const clawProjectFolderRefSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  role: clawProjectFolderRoleSchema.default("reference"),
  label: z.string().min(1).optional(),
});

export const clawProjectManifestSchema = z.object({
  schemaVersion: z.literal(1),
  manifestKind: z.literal("claw.project").default("claw.project"),
  projectId: z.string().min(1),
  type: clawProjectTypeSchema.default("project"),
  name: z.string().min(1),
  title: z.string().min(1),
  primaryFolder: clawProjectFolderRefSchema.default({ id: "primary", path: ".", role: "primary" }),
  folderRefs: z.array(clawProjectFolderRefSchema).default([]),
  workspaceBinding: z.object({
    workspaceId: z.string().min(1),
    appId: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
  }).optional(),
  attachment: z.object({
    state: clawProjectAttachmentStateSchema,
    workspaceId: z.string().min(1).optional(),
    detachedReason: z.string().min(1).optional(),
  }).default({ state: "detached" }),
  runtime: z.object({
    adapter: z.string().min(1),
  }).optional(),
  directories: z.record(z.string().min(1)).default({}),
  resources: z.record(z.array(z.object({
    id: z.string().min(1),
    path: z.string().min(1),
  }))).default({}),
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional(),
});

export type ClawProjectManifest = z.infer<typeof clawProjectManifestSchema>;

export function createClawProjectId(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/[./]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "project";
}

export function normalizeClawProjectManifest(input: unknown, fallbackName = "project", now = new Date().toISOString()): ClawProjectManifest {
  const raw = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name : createClawProjectId(fallbackName);
  const workspace = raw.workspace && typeof raw.workspace === "object" && !Array.isArray(raw.workspace)
    ? raw.workspace as Record<string, unknown>
    : {};
  const hasWorkspaceBinding = Object.prototype.hasOwnProperty.call(raw, "workspaceBinding");
  const workspaceId = typeof workspace.workspaceId === "string" && workspace.workspaceId.trim()
    ? workspace.workspaceId
    : undefined;
  const manifest = {
    ...raw,
    schemaVersion: 1,
    manifestKind: "claw.project",
    projectId: typeof raw.projectId === "string" && raw.projectId.trim() ? raw.projectId : createClawProjectId(name),
    type: typeof raw.type === "string" ? raw.type : "project",
    name,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : name,
    primaryFolder: raw.primaryFolder ?? { id: "primary", path: ".", role: "primary" },
    folderRefs: Array.isArray(raw.folderRefs) ? raw.folderRefs : [],
    workspaceBinding: hasWorkspaceBinding ? raw.workspaceBinding : workspaceId ? {
      workspaceId,
      ...(typeof workspace.appId === "string" ? { appId: workspace.appId } : {}),
      ...(typeof workspace.agentId === "string" ? { agentId: workspace.agentId } : {}),
    } : undefined,
    attachment: raw.attachment ?? {
      state: workspaceId ? "attached" : "detached",
      ...(workspaceId ? { workspaceId } : { detachedReason: "no_workspace_binding" }),
    },
    directories: raw.directories ?? {},
    resources: raw.resources ?? {},
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: now,
  };
  return clawProjectManifestSchema.parse(manifest);
}

export function assertSafeClawProjectHandoff(value: unknown): { safe: boolean; blockedFields: string[] } {
  const blockedFields: string[] = [];
  const visit = (entry: unknown, path: string): void => {
    if (!entry || typeof entry !== "object") return;
    for (const [key, child] of Object.entries(entry as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if ((lower.includes("secret") || lower.includes("token") || lower.includes("password") || lower.includes("credential")) && child !== false) {
        blockedFields.push(path ? `${path}.${key}` : key);
        continue;
      }
      visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(value, "");
  return { safe: blockedFields.length === 0, blockedFields };
}
