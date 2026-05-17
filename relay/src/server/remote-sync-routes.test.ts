import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "vitest";

import { buildRelayApp } from "./app.ts";

test("relay exposes remote Gateway and Sync conformance API routes", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-relay-remote-sync-"));
  const built = await buildRelayApp({
    config: {
      dbPath: path.join(tempRoot, "relay.sqlite"),
      corsOrigins: [],
    },
  });
  try {
    const conformance = await built.app.inject({ method: "GET", url: "/v1/remote/conformance" });
    assert.equal(conformance.statusCode, 200);
    const conformancePayload = conformance.json() as {
      status: string;
      decisions: Array<{ decisionId: string }>;
      missingRoutes: string[];
      hostedSelfHostedParity: string;
      transportContract: string;
    };
    assert.equal(conformancePayload.status, "baseline_registered");
    assert.equal(conformancePayload.missingRoutes.length, 0);
    assert.equal(conformancePayload.hostedSelfHostedParity, "required");
    assert.equal(conformancePayload.transportContract, "transport_agnostic_iroh_v1_adapter");
    assert.equal(conformancePayload.decisions.some((entry) => entry.decisionId === "remote_surface_parity"), true);

    const classifications = await built.app.inject({ method: "GET", url: "/v1/remote/classifications" });
    assert.equal(classifications.statusCode, 200);
    const classificationPayload = classifications.json() as { classifications: Array<{ id: string; relay: string }> };
    assert.equal(classificationPayload.classifications.some((entry) => entry.id === "claw.gateway" && entry.relay === "remote-safe"), true);

    const gateway = await built.app.inject({ method: "GET", url: "/v1/gateway/conformance" });
    assert.equal(gateway.statusCode, 200);
    const gatewayPayload = gateway.json() as { gateway: { contract: string; hostedSelfHostedParity: string } };
    assert.equal(gatewayPayload.gateway.contract, "registered_local_contract_projection");
    assert.equal(gatewayPayload.gateway.hostedSelfHostedParity, "required");

    const manifests = await built.app.inject({ method: "GET", url: "/v1/sync/manifests?driver=skills" });
    assert.equal(manifests.statusCode, 200);
    const manifestsPayload = manifests.json() as { manifests: Array<{ driver: string; secretPolicy: { plaintextReplication: boolean } }> };
    assert.equal(manifestsPayload.manifests[0]?.driver, "skills");
    assert.equal(manifestsPayload.manifests[0]?.secretPolicy.plaintextReplication, false);

    const plan = await built.app.inject({
      method: "POST",
      url: "/v1/sync/plan",
      headers: { "content-type": "application/json" },
      payload: {
        driver: "skills",
        localHash: "hash-a",
        peerHash: "hash-b",
      },
    });
    assert.equal(plan.statusCode, 200);
    const planPayload = plan.json() as {
      mode: string;
      writes: boolean;
      actions: Array<{ action: string; reason: string }>;
      conflicts: Array<{ status: string; objectRef: string }>;
      nextCursor?: { cursor: string };
    };
    assert.equal(planPayload.mode, "plan");
    assert.equal(planPayload.writes, false);
    assert.equal(planPayload.actions.some((action) => action.action === "conflict" && action.reason === "diverged_snapshots_detect_and_elevate"), true);
    assert.equal(planPayload.conflicts[0]?.status, "open");
    assert.equal(planPayload.conflicts[0]?.objectRef, "skill.review");
    assert.equal(planPayload.nextCursor?.cursor.includes("skill.review"), true);

    const conflicts = await built.app.inject({
      method: "POST",
      url: "/v1/sync/conflicts",
      headers: { "content-type": "application/json" },
      payload: { localHash: "hash-a", peerHash: "hash-b" },
    });
    assert.equal(conflicts.statusCode, 200);
    const conflictsPayload = conflicts.json() as { conflicts: Array<{ status: string }>; silentOverwriteAllowed: boolean; writes: boolean };
    assert.equal(conflictsPayload.conflicts[0]?.status, "open");
    assert.equal(conflictsPayload.silentOverwriteAllowed, false);
    assert.equal(conflictsPayload.writes, false);

    const nodes = await built.app.inject({ method: "GET", url: "/v1/nodes" });
    assert.equal(nodes.statusCode, 200);
    const nodesPayload = nodes.json() as { nodes: Array<{ id: string }> };
    assert.equal(nodesPayload.nodes.some((node) => node.id === "claw.coordinator"), true);

    const revoke = await built.app.inject({
      method: "POST",
      url: "/v1/nodes/revoke",
      headers: { "content-type": "application/json" },
      payload: { nodeId: "node.peer" },
    });
    assert.equal(revoke.statusCode, 200);
    const revokePayload = revoke.json() as { operation: string; status: string; writes: boolean };
    assert.equal(revokePayload.operation, "revoke");
    assert.equal(revokePayload.status, "dry_run_only");
    assert.equal(revokePayload.writes, false);

    const invitation = await built.app.inject({
      method: "POST",
      url: "/v1/mesh/invitations",
      headers: { "content-type": "application/json" },
      payload: {
        issuerMeshId: "mesh.home",
        coordinatorNodeId: "node.mac",
        recipientMeshId: "mesh.server",
        allowedResourceIds: ["skills:default"],
        allowedActions: ["read", "sync"],
      },
    });
    assert.equal(invitation.statusCode, 200);
    const invitationPayload = invitation.json() as { invitation: { status: string; writes: boolean; allowedResourceIds: string[] }; writes: boolean };
    assert.equal(invitationPayload.invitation.status, "pending");
    assert.equal(invitationPayload.invitation.allowedResourceIds[0], "skills:default");
    assert.equal(invitationPayload.writes, false);

    const share = await built.app.inject({
      method: "POST",
      url: "/v1/mesh/shares",
      headers: { "content-type": "application/json" },
      payload: {
        issuerMeshId: "mesh.home",
        coordinatorNodeId: "node.mac",
        recipientMeshId: "mesh.server",
        resourceId: "skills:default",
        driver: "skills",
        actions: ["read", "sync"],
      },
    });
    assert.equal(share.statusCode, 200);
    const sharePayload = share.json() as { share: { status: string; resourceId: string; plaintextSecrets: boolean; writes: boolean }; writes: boolean };
    assert.equal(sharePayload.share.status, "proposed");
    assert.equal(sharePayload.share.resourceId, "skills:default");
    assert.equal(sharePayload.share.plaintextSecrets, false);
    assert.equal(sharePayload.writes, false);

    const meshRevocation = await built.app.inject({
      method: "POST",
      url: "/v1/mesh/revocations",
      headers: { "content-type": "application/json" },
      payload: { targetType: "share", targetId: "mesh_share_1", reason: "owner_revoked" },
    });
    assert.equal(meshRevocation.statusCode, 200);
    const meshRevocationPayload = meshRevocation.json() as { revocation: { targetType: string; cascadeSyncQueues: boolean; writes: boolean }; writes: boolean };
    assert.equal(meshRevocationPayload.revocation.targetType, "share");
    assert.equal(meshRevocationPayload.revocation.cascadeSyncQueues, true);
    assert.equal(meshRevocationPayload.writes, false);
  } finally {
    await built.app.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
