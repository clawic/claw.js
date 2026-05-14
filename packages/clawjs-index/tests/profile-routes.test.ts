import { clawApiPath } from "@clawjs/core";
// Integration test for the Profile / Feed / Chat / Marketplace routes against
// a real Fastify app, with stub deps that simulate a daemon-side ProfileStore.

import { test } from "vitest";
import assert from "node:assert/strict";

import Fastify from "fastify";

import {
  registerProfileSurfaces, profileFlagFromEnv, CLAW_PROFILE_FLAG_ENV,
} from "../src/routes/index.ts";
import type {
  ProfileDeps, FeedDeps, ChatDeps, MarketplaceDeps,
} from "../src/routes/index.ts";
import type { Block, Group, Profile, CapabilityRef } from "@clawjs/profile";
import { buildHandle } from "@clawjs/marketplace/handles";
import { rootFromMnemonic, generateMnemonic } from "@clawjs/marketplace/recovery";

function makeBlock(vertical: string): Block {
  return {
    blockId: new Uint8Array(32).fill(7),
    archetype: "standalone",
    vertical,
    audience: { groups: ["public"] },
    fieldsPerLevel: { body: ["public"] },
    content: { body: "hello" },
    createdAt: 1, updatedAt: 1, version: 1,
  };
}

function makeProfile(): Profile {
  const root = rootFromMnemonic(generateMnemonic(32));
  const handle = buildHandle({ alias: "alice", rootPubkey: root.publicKey });
  return {
    rootPubkey: root.publicKey,
    handle,
    blocks: [],
    groups: [],
    capabilitiesIssued: [],
    version: 1,
    updatedAt: 1,
  };
}

function makeStubDeps() {
  let profile: Profile | null = null;
  const blocks = new Map<string, Block>();
  const groups: Group[] = [];
  const capabilities: CapabilityRef[] = [];

  const profileDeps: ProfileDeps = {
    async init({ alias, mnemonic }) {
      profile = makeProfile();
      profile.handle = buildHandle({ alias, rootPubkey: profile.rootPubkey });
      return { profile, mnemonic: mnemonic ?? "abandon abandon ..." };
    },
    getProfile: () => profile,
    setHandle: (alias) => { if (!profile) throw new Error("no profile"); profile.handle = buildHandle({ alias, rootPubkey: profile.rootPubkey }); return profile; },
    createBlock: () => { const b = makeBlock("post/v1"); blocks.set(Buffer.from(b.blockId).toString("hex"), b); return b; },
    updateBlock: (id) => blocks.get(id)!,
    deleteBlock: (id) => { blocks.delete(id); },
    listBlocks: () => [...blocks.values()],
    getBlock: (id) => blocks.get(id) ?? null,
    listGroups: () => groups,
    createGroup: (id, label) => { const g = { id, label, members: [], createdAt: 0, updatedAt: 0 } as Group; groups.push(g); return g; },
    addGroupMember: (id) => groups.find((g) => g.id === id)!,
    removeGroupMember: (id) => groups.find((g) => g.id === id)!,
    issueInviteLink: () => ({ token: "abc", expiresAt: 99999 }),
    issueCapability: () => {
      const cap = { capId: "cap123", blockId: new Uint8Array(32), level: "interested", issuedAt: 0, expiresAt: 99999 };
      capabilities.push(cap);
      return cap;
    },
    verifyCapability: () => true,
    listPeers: () => [],
    pairByFingerprint: () => ({ alias: "x", fingerprint: "0".repeat(12), rootPubkey: new Uint8Array(32) }),
  };

  const feedDeps: FeedDeps = {
    list: () => [],
    subscribe: () => () => undefined,
  };

  const chatDeps: ChatDeps = {
    listThreads: () => [],
    listMessages: () => [],
    send: async () => ({ id: "m1", threadPeerRootPubkey: new Uint8Array(32), fromMe: true, body: "hi", sentAt: 1 }),
    markRead: () => undefined,
    subscribe: () => () => undefined,
  };

  const marketplaceDeps: MarketplaceDeps = {
    discoveredIntents: async () => [],
    expressInterest: async () => ({ capabilityId: "cap123", mailboxMessageId: "m1" }),
    listInquiries: () => [],
  };

  return { profileDeps, feedDeps, chatDeps, marketplaceDeps };
}

test("feature flag: profileFlagFromEnv reads the env var", () => {
  assert.equal(profileFlagFromEnv({ [CLAW_PROFILE_FLAG_ENV]: "1" } as never), true);
  assert.equal(profileFlagFromEnv({ [CLAW_PROFILE_FLAG_ENV]: "0" } as never), false);
  assert.equal(profileFlagFromEnv({ [CLAW_PROFILE_FLAG_ENV]: "false" } as never), false);
  assert.equal(profileFlagFromEnv({} as never), false);
});

test("profile routes: init + create block + list blocks", async () => {
  const app = Fastify();
  const { profileDeps, feedDeps, chatDeps, marketplaceDeps } = makeStubDeps();
  registerProfileSurfaces(app, {
    enabled: true, profile: profileDeps, feed: feedDeps, chats: chatDeps, marketplace: marketplaceDeps,
  });
  await app.ready();

  const init = await app.inject({ method: "POST", url: clawApiPath("profile/init"), payload: { alias: "alice" } });
  assert.equal(init.statusCode, 200);
  const body = init.json() as { profile: { handle: { alias: string } } };
  assert.equal(body.profile.handle.alias, "alice");

  const create = await app.inject({
    method: "POST", url: clawApiPath("profile/blocks"),
    payload: {
      vertical: "post/v1", archetype: "standalone",
      audience: { groups: ["public"] }, fieldsPerLevel: { body: ["public"] },
      content: { body: "hello" },
    },
  });
  assert.equal(create.statusCode, 200);
  const list = await app.inject({ method: "GET", url: clawApiPath("profile/blocks") });
  assert.equal(list.statusCode, 200);
  const blocks = (list.json() as { blocks: unknown[] }).blocks;
  assert.equal(blocks.length, 1);
  await app.close();
});

test("chat routes: list / send round-trips through the daemon", async () => {
  const app = Fastify();
  const { profileDeps, feedDeps, chatDeps, marketplaceDeps } = makeStubDeps();
  registerProfileSurfaces(app, {
    enabled: true, profile: profileDeps, feed: feedDeps, chats: chatDeps, marketplace: marketplaceDeps,
  });
  await app.ready();
  const sent = await app.inject({ method: "POST", url: clawApiPath("chats/alice/messages"), payload: { body: "hi" } });
  assert.equal(sent.statusCode, 200);
  const msg = (sent.json() as { message: { body: string } }).message;
  assert.equal(msg.body, "hi");
  await app.close();
});

test("marketplace routes: discovered-intents + express-interest", async () => {
  const app = Fastify();
  const { profileDeps, feedDeps, chatDeps, marketplaceDeps } = makeStubDeps();
  registerProfileSurfaces(app, {
    enabled: true, profile: profileDeps, feed: feedDeps, chats: chatDeps, marketplace: marketplaceDeps,
  });
  await app.ready();

  const list = await app.inject({ method: "GET", url: clawApiPath("marketplace/discovered-intents") });
  assert.equal(list.statusCode, 200);
  const interest = await app.inject({
    method: "POST", url: clawApiPath("marketplace/express-interest"),
    payload: { intentId: "deadbeef" },
  });
  assert.equal(interest.statusCode, 200);
  await app.close();
});

test("feature flag off: routes are not registered", async () => {
  const app = Fastify();
  const { profileDeps, feedDeps, chatDeps, marketplaceDeps } = makeStubDeps();
  registerProfileSurfaces(app, {
    enabled: false, profile: profileDeps, feed: feedDeps, chats: chatDeps, marketplace: marketplaceDeps,
  });
  await app.ready();
  const init = await app.inject({ method: "POST", url: clawApiPath("profile/init"), payload: { alias: "alice" } });
  assert.equal(init.statusCode, 404);
  await app.close();
});
