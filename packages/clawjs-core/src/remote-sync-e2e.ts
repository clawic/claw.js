import { z } from "zod";

import { remoteSyncRequiredRouteIds } from "./remote-sync.ts";

export const remoteProviderDeviceE2EDomainSchema = z.enum([
  "chat",
  "search",
  "sync",
  "secret_refs",
  "hosted_agents",
]);

export const remoteProviderDeviceE2EValidationPlanSchema = z.object({
  schemaVersion: z.literal(1),
  planId: z.string().min(1),
  requiredDomains: z.array(remoteProviderDeviceE2EDomainSchema).min(5),
  requiredRouteIds: z.array(z.string().min(1)).min(1),
  requiredExternalPendingIds: z.array(z.string().min(1)).min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  status: z.literal("external_pending"),
  approvedPhysicalValidationRequired: z.literal(true),
  noPlaintextSecrets: z.literal(true),
  hostedSelfHostedParityRequired: z.literal(true),
  createdAt: z.string().datetime(),
  writes: z.literal(false),
});

export type RemoteProviderDeviceE2EDomain = z.infer<typeof remoteProviderDeviceE2EDomainSchema>;
export type RemoteProviderDeviceE2EValidationPlan = z.infer<typeof remoteProviderDeviceE2EValidationPlanSchema>;

function providerDeviceE2EPlanId(parts: string[]): string {
  return `provider_device_e2e_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

export function buildRemoteProviderDeviceE2EValidationPlan(input: {
  createdAt?: string;
  requiredRouteIds?: readonly string[];
  evidenceRefs?: string[];
} = {}): RemoteProviderDeviceE2EValidationPlan {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return remoteProviderDeviceE2EValidationPlanSchema.parse({
    schemaVersion: 1,
    planId: providerDeviceE2EPlanId(["plan", createdAt]),
    requiredDomains: ["chat", "search", "sync", "secret_refs", "hosted_agents"],
    requiredRouteIds: input.requiredRouteIds?.length ? [...input.requiredRouteIds] : remoteSyncRequiredRouteIds.slice(),
    requiredExternalPendingIds: [
      "physical_iroh_handshake",
      "device_trust_acceptance",
      "physical_peer_trust",
      "physical_sync_driver_application",
      "physical_authority_handoff",
      "signed_host_audit_persistence",
      "physical_client_storage",
      "provider_secret_retrieval",
      "self_hosted_deployment",
      "hosted_deployment",
      "agent_runtime_execution",
      "billing_meter_persistence",
      "provider_device_e2e",
    ],
    evidenceRefs: input.evidenceRefs?.length ? input.evidenceRefs : [
      "claw inspect remote --json",
      "claw remote contracts --json",
      "claw remote pending --json",
      "Relay /v1/remote/conformance",
      "Relay /v1/remote/route-contracts",
      "Relay /v1/remote/external-pending",
    ],
    status: "external_pending",
    approvedPhysicalValidationRequired: true,
    noPlaintextSecrets: true,
    hostedSelfHostedParityRequired: true,
    createdAt,
    writes: false,
  });
}
