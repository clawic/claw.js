import {
  PairingAcceptResponseSchema,
  toBase64Url,
  type MeshLinkClient,
  type NodeIdentity,
} from "@clawjs/mesh";

export const httpLinkClient: MeshLinkClient = async (
  request,
  selfIdentity: NodeIdentity,
  selfKind,
) => {
  const url = `http://${request.remoteHost}:${request.remotePort}/v1/mesh/pair`;
  const body = {
    v: 1,
    token: request.remoteToken,
    clientNodeId: selfIdentity.nodeId,
    clientDisplayName: selfIdentity.displayName,
    clientSigningPublicKey: toBase64Url(selfIdentity.signingPublicKey),
    clientAgreementPublicKey: toBase64Url(selfIdentity.agreementPublicKey),
    clientKind: selfKind === "ios" || selfKind === "ipad" ? "companion" : "desktop",
    platform: selfKind,
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`pair failed: ${response.status} ${response.statusText}`);
  }
  const json = (await response.json()) as unknown;
  const parsed = PairingAcceptResponseSchema.parse(json);
  return {
    remoteNodeId: parsed.hostNodeId,
    remoteDisplayName: parsed.hostDisplayName,
    remoteSigningPublicKey: parsed.hostSigningPublicKey,
    remoteAgreementPublicKey: parsed.hostAgreementPublicKey,
  };
};
