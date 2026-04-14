import type { VaultActor, VaultClaims } from "./auth.ts";
import type { VaultCapability, VaultPolicyRecord } from "../shared/types.ts";

export function actorSubject(actor: VaultActor | VaultClaims): { type: string; id: string } {
  if ("kind" in actor && actor.kind === "user") {
    return { type: actor.role, id: actor.sub };
  }
  return { type: actor.actorType, id: actor.actorId };
}

export function isAllowed(
  policies: VaultPolicyRecord[],
  actor: VaultActor | VaultClaims,
  secretName: string,
  capability: VaultCapability,
): boolean {
  const subject = actorSubject(actor);
  const matches = policies.filter((policy) =>
    policy.secretName === secretName
    && policy.capability === capability
    && (
      (policy.subjectType === subject.type && (policy.subjectId === subject.id || policy.subjectId === "*"))
      || (policy.subjectType === "*" && policy.subjectId === "*")
    ));
  if (matches.some((policy) => policy.effect === "deny")) return false;
  return matches.some((policy) => policy.effect === "allow");
}
