import { z } from "zod";

export const HOST_KINDS = [
  "mac",
  "ios",
  "ipad",
  "linuxServer",
  "linuxDesktop",
  "windowsPC",
  "sbc",
] as const;

export type HostKind = (typeof HOST_KINDS)[number];

export const HOST_ENDPOINT_KINDS = [
  "lan",
  "tailscale",
  "linked",
  "loopback",
  "ssh",
  "iroh-node",
] as const;

export type HostEndpointKind = (typeof HOST_ENDPOINT_KINDS)[number];

export const HOST_ENDPOINT_PROTOCOLS = ["bridge", "ssh", "iroh"] as const;
export type HostEndpointProtocol = (typeof HOST_ENDPOINT_PROTOCOLS)[number];

export const HOST_PERMISSION_PROFILES = [
  "fullTrust",
  "scoped",
  "askPerTask",
] as const;
export type HostPermissionProfile = (typeof HOST_PERMISSION_PROFILES)[number];

export const HOST_SSH_AUTH_METHODS = ["key", "password", "agent"] as const;
export type HostSSHAuthMethod = (typeof HOST_SSH_AUTH_METHODS)[number];

export const HostEndpointSchema = z.object({
  kind: z.enum(HOST_ENDPOINT_KINDS),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(HOST_ENDPOINT_PROTOCOLS).optional(),
  irohNodeId: z.string().min(1).optional(),
  relayUrl: z.string().url().optional(),
  lastSeenEndpoint: z.string().min(1).optional(),
});

export type HostEndpoint = z.infer<typeof HostEndpointSchema>;

export const HostSSHConfigSchema = z.object({
  user: z.string().min(1),
  authMethod: z.enum(HOST_SSH_AUTH_METHODS),
  keySecretId: z.string().min(1).optional(),
  passwordSecretId: z.string().min(1).optional(),
  knownHostFingerprint: z.string().min(1).optional(),
  forwardAgent: z.boolean().optional(),
  jumpHostId: z.string().min(1).optional(),
});

export type HostSSHConfig = z.infer<typeof HostSSHConfigSchema>;

export const HostMetadataSchema = z.object({
  tags: z.array(z.string()).default([]),
  clientKind: z.enum(["companion", "desktop"]).optional(),
  provider: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  dnsRecords: z.array(z.string()).optional(),
  dockerComposePath: z.string().min(1).optional(),
  notes: z.string().optional(),
});

export type HostMetadata = z.infer<typeof HostMetadataSchema>;

export const HostSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(HOST_KINDS),
  displayName: z.string().min(1),
  signingPublicKey: z.string().min(1).optional(),
  agreementPublicKey: z.string().min(1).optional(),
  endpoints: z.array(HostEndpointSchema).default([]),
  permissionProfile: z.enum(HOST_PERMISSION_PROFILES),
  capabilities: z.array(z.string()).default([]),
  ssh: HostSSHConfigSchema.optional(),
  metadata: HostMetadataSchema,
  lastSeenAt: z.date().optional(),
  revokedAt: z.date().optional(),
  createdAt: z.date(),
});

export type Host = z.infer<typeof HostSchema>;

export const HostInputSchema = HostSchema.partial({
  id: true,
  endpoints: true,
  capabilities: true,
  metadata: true,
  permissionProfile: true,
  createdAt: true,
}).extend({
  id: z.string().min(1).optional(),
  endpoints: z.array(HostEndpointSchema).optional(),
  capabilities: z.array(z.string()).optional(),
  metadata: HostMetadataSchema.partial().optional(),
  permissionProfile: z.enum(HOST_PERMISSION_PROFILES).optional(),
  createdAt: z.date().optional(),
});

export type HostInput = z.infer<typeof HostInputSchema>;
