// End-to-end test that exercises the verification flow described in the
// `vale-quiero-que-hagamos-sharded-feigenbaum.md` plan against two daemon
// stand-ins (an A node and a B node) in the same process, plus a third
// C node that discovers A's listing via the InMemoryIrohAdapter DHT.
//
// Steps mirrored from the plan's "Verificación" section:
//
//   1. Both nodes generate identity (BIP-39 mnemonic + RootKey + DeviceKey
//      + RoleKey + handle).
//   2. A pairs with B via the pairing link (handle + fingerprint round-trip).
//   3. A adds B to the `friends` group.
//   4. A publishes a `post/v1` block with audience `friends`. B observes the
//      block and projects it through the ACL.
//   5. A publishes an `item/v1` block with audience `public`. C discovers it
//      via the Iroh DHT.
//   6. C expresses interest → A issues a capability. C re-evaluates ACL with
//      the capability and now sees the contact field.
//   7. A and B exchange two messages over the v2 mailbox (Double Ratchet);
//      message keys differ across messages.

import { test } from "vitest";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";

import { generateEd25519Keypair, issueCertificate } from "@clawjs/marketplace/identity";
import { generateMnemonic, rootFromMnemonic } from "@clawjs/marketplace/recovery";
import { buildHandle, encodePairingLink, decodePairingLink } from "@clawjs/marketplace/handles";
import {
  canonicalizeIntent, signIntent,
} from "@clawjs/marketplace/wire";
import {
  IrohDht, InMemoryIrohAdapter,
} from "@clawjs/marketplace/discovery";
import { itemPlugin } from "@clawjs/marketplace/verticals/core";
import {
  generatePreKeyPair, signPreKey,
  x3dhInitiate, x3dhRespond,
  initAsAlice, initAsBob, dratchetEncrypt, dratchetDecrypt,
} from "@clawjs/marketplace/ratchet";

import {
  newBlock, signBlock,
  createGroup, addMember,
  resolveAcl, projectBlock,
  issueCapability,
  ProfileStore,
} from "../src/index.ts";

interface Node {
  name: string;
  root: ReturnType<typeof generateEd25519Keypair>;
  device: ReturnType<typeof generateEd25519Keypair>;
  role: ReturnType<typeof generateEd25519Keypair>;
  deviceCert: ReturnType<typeof issueCertificate>;
  roleCert: ReturnType<typeof issueCertificate>;
  handle: ReturnType<typeof buildHandle>;
  mnemonic: string;
}

function spawnNode(alias: string): Node {
  const mnemonic = generateMnemonic(32);
  const root = rootFromMnemonic(mnemonic);
  const device = generateEd25519Keypair();
  const role = generateEd25519Keypair();
  const deviceCert = issueCertificate({ parent: root, child: device, childKind: "device", scope: { deviceName: alias } });
  const roleCert = issueCertificate({ parent: root, child: role, childKind: "role", scope: { vertical: "post/v1" } });
  const handle = buildHandle({ alias, rootPubkey: root.publicKey });
  return { name: alias, root, device, role, deviceCert, roleCert, handle, mnemonic };
}

test("Plan E2E: full flow A↔B↔C across identity, profile, discovery, mailbox", async () => {
  const dir = mkdtempSync(join(tmpdir(), "clawix-e2e-"));
  const storeA = new ProfileStore({ databasePath: join(dir, "A.db") });
  const storeB = new ProfileStore({ databasePath: join(dir, "B.db") });
  const storeC = new ProfileStore({ databasePath: join(dir, "C.db") });
  try {
    const A = spawnNode("alice");
    const B = spawnNode("bob");
    const C = spawnNode("charlie");
    storeA.upsertProfile({ rootPubkey: A.root.publicKey, handle: A.handle });
    storeB.upsertProfile({ rootPubkey: B.root.publicKey, handle: B.handle });
    storeC.upsertProfile({ rootPubkey: C.root.publicKey, handle: C.handle });

    // Step 2: A and B exchange pairing links.
    const aLink = encodePairingLink({ handle: A.handle });
    const decodedA = decodePairingLink(aLink);
    assert.deepEqual(Array.from(decodedA.handle.rootPubkey), Array.from(A.root.publicKey));
    storeB.upsertPeer({ handle: decodedA.handle, trustedLocally: true });

    // Step 3: A adds B to the `friends` group.
    let friends = createGroup({ id: "friends" });
    friends = addMember(friends, B.root.publicKey);
    storeA.putGroup(friends);

    // Step 4: A publishes a `post/v1` block. B can read it via the ACL.
    const { block: post, payloadCbor: postPayload } = newBlock({
      archetype: "standalone",
      vertical: "post/v1",
      audience: { groups: ["friends"] },
      fieldsPerLevel: { body: ["public", "friends"], geo_zone: ["friends"] },
      content: { body: "weekend match in the park", geo_zone: "u4pr" },
      rolePubkey: A.role.publicKey, roleCertificate: A.roleCert,
    });
    signBlock({ block: post, payloadCbor: postPayload, rolePrivate: A.role.privateKey, devicePrivate: A.device.privateKey });
    storeA.putBlock(post, A.root.publicKey);

    const aclForB = resolveAcl({ viewerRootPubkey: B.root.publicKey, block: post, ownerGroups: [friends] });
    assert.equal(aclForB.canRead, true);
    assert.deepEqual(aclForB.allowedFields.sort(), ["body", "geo_zone"]);

    // Step 5: A publishes an `item/v1` block. C discovers it via the DHT.
    const itemFields = itemPlugin.validator.offerToCbor({
      title: "Used bike",
      condition: "good",
      photos: [{ hash: new Uint8Array(32).fill(1), mime: "image/jpeg", size: 1024 }],
      geo_zone: "u4pr",
      category: "bikes",
      price_hint_eur: 350,
      contact_phone: "+34 600 600 600",
    });
    const { intent: itemIntent, payloadCbor: itemPayload } = canonicalizeIntent({
      side: "offer",
      vertical: "item/v1",
      fields: itemFields,
      visibility: { title: 0, geo_zone: 0, category: 0, price_band: 0, contact_phone: 4 },
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      rolePubkey: A.role.publicKey,
      roleCertificate: A.roleCert,
    });
    signIntent({ intent: itemIntent, payloadCbor: itemPayload, rolePrivate: A.role.privateKey, devicePrivate: A.device.privateKey });

    const dht = new IrohDht({ adapter: new InMemoryIrohAdapter() });
    await dht.publish(itemIntent);
    const discoveredByC = await dht.query({ vertical: "item/v1", geoZone: "u4pr", tag: "bikes", priceBand: 2 });
    assert.equal(discoveredByC.length, 1);
    assert.equal(discoveredByC[0].fields.title, "Used bike");

    // Step 6: C expresses interest → A issues a capability that unlocks the
    // contact field.
    const { block: itemBlock, payloadCbor: itemBlockPayload } = newBlock({
      archetype: "standalone",
      vertical: "item/v1",
      audience: { groups: ["public"] },
      fieldsPerLevel: {
        title: ["public"], category: ["public"], price_hint_eur: ["public"], geo_zone: ["public"],
        contact_phone: ["interested-in-listing"],
      },
      content: itemFields,
      rolePubkey: A.role.publicKey, roleCertificate: A.roleCert,
    });
    signBlock({ block: itemBlock, payloadCbor: itemBlockPayload, rolePrivate: A.role.privateKey, devicePrivate: A.device.privateKey });
    storeA.putBlock(itemBlock, A.root.publicKey);

    const cap = issueCapability({
      blockId: itemBlock.blockId,
      level: "interested-in-listing",
      issuedTo: C.root.publicKey,
      rolePrivate: A.role.privateKey,
    });
    storeA.putCapability(cap, "issued");
    storeC.putCapability(cap, "received");

    // Re-evaluate ACL on C's side with the capability presented.
    const aclForC = projectBlock({
      viewerRootPubkey: C.root.publicKey,
      block: itemBlock,
      ownerGroups: [],
      presentedCapabilities: [cap],
    });
    assert.equal(aclForC.acl.canRead, true);
    assert.ok(aclForC.acl.allowedFields.includes("contact_phone"));
    assert.equal(aclForC.block.content?.contact_phone, "+34 600 600 600");

    // Step 7: Mailbox v2 — A and B exchange two messages.
    const spkB = generatePreKeyPair();
    const spkB_sig = signPreKey({ identityPrivate: B.role.privateKey, preKeyPublic: spkB.publicKey });
    const ekA = generatePreKeyPair();
    const { sharedSecret: skA, ephemeralPublic } = x3dhInitiate({
      initiator: { identityPrivate: A.role.privateKey, ephemeralPrivate: ekA.privateKey },
      responderBundle: {
        identityKey: B.role.publicKey, signedPreKey: spkB.publicKey,
        signedPreKeyId: 1, signedPreKeySignature: spkB_sig,
      },
    });
    const { sharedSecret: skB } = x3dhRespond({
      responder: { identityPrivate: B.role.privateKey, signedPreKeyPrivate: spkB.privateKey },
      initiatorIdentityKey: A.role.publicKey,
      initiatorEphemeralPublic: ephemeralPublic,
    });
    let aState = initAsAlice({ rootKeyFromX3dh: skA, remoteDh: spkB.publicKey });
    let bState = initAsBob({ rootKeyFromX3dh: skB, signedPreKeyPair: spkB });

    const enc1 = dratchetEncrypt(aState, new TextEncoder().encode("hi bob"));
    aState = enc1.nextState;
    const enc2 = dratchetEncrypt(aState, new TextEncoder().encode("how's the bike"));
    aState = enc2.nextState;

    const dec1 = dratchetDecrypt(bState, enc1.message);
    bState = dec1.nextState;
    const dec2 = dratchetDecrypt(bState, enc2.message);
    bState = dec2.nextState;
    assert.equal(new TextDecoder().decode(dec1.plaintext), "hi bob");
    assert.equal(new TextDecoder().decode(dec2.plaintext), "how's the bike");
    assert.notEqual(
      Buffer.from(enc1.message.ciphertext).toString("hex"),
      Buffer.from(enc2.message.ciphertext).toString("hex"),
      "two consecutive Alice→Bob messages must use different message keys",
    );
  } finally {
    storeA.close(); storeB.close(); storeC.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
