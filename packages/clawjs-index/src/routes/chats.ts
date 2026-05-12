// Chat routes: /v1/chats/*.
//
// One thread per peer (RootKey). Messages are mailbox-v2-dr ciphertext under
// the hood; the API exposes already-decrypted plaintexts for the local owner.

import type { FastifyInstance } from "fastify";

export interface ChatThread {
  peerRootPubkey: Uint8Array;
  peerHandle: { alias: string; fingerprint: string };
  lastMessageAt: number;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  threadPeerRootPubkey: Uint8Array;
  fromMe: boolean;
  body: string;
  sentAt: number;
  /** When non-null, indicates the message is a *draft* the agent prepared
   *  on the user's behalf and is awaiting human approval. */
  draftFromAgent?: boolean;
}

export interface ChatDeps {
  listThreads(): ChatThread[];
  listMessages(peerHandleOrRootHex: string, opts?: { limit?: number; before?: number }): ChatMessage[];
  send(peerHandleOrRootHex: string, body: string): Promise<ChatMessage>;
  markRead(peerHandleOrRootHex: string): void;
  subscribe(cb: (event: { kind: "new-message" | "thread-update"; data: unknown }) => void): () => void;
}

export function registerChatRoutes(app: FastifyInstance, deps: ChatDeps): void {
  app.get("/v1/chats", async () => ({
    threads: deps.listThreads().map(serializeThread),
  }));

  app.get("/v1/chats/:peer/messages", async (req) => {
    const { peer } = req.params as { peer: string };
    const q = (req.query ?? {}) as { limit?: string; before?: string };
    const limit = q.limit ? Number(q.limit) : 50;
    const before = q.before ? Number(q.before) : undefined;
    return { messages: deps.listMessages(peer, { limit, before }).map(serializeMessage) };
  });

  app.post("/v1/chats/:peer/messages", async (req, reply) => {
    const { peer } = req.params as { peer: string };
    const body = (req.body ?? {}) as { body?: string };
    if (!body.body) return reply.code(400).send({ error: "body required" });
    const msg = await deps.send(peer, body.body);
    return { message: serializeMessage(msg) };
  });

  app.post("/v1/chats/:peer/read", async (req) => {
    const { peer } = req.params as { peer: string };
    deps.markRead(peer);
    return { ok: true };
  });
}

function serializeThread(t: ChatThread): Record<string, unknown> {
  return {
    peer: {
      rootPubkey: Buffer.from(t.peerRootPubkey).toString("hex"),
      handle: t.peerHandle,
    },
    lastMessageAt: t.lastMessageAt,
    unreadCount: t.unreadCount,
  };
}

function serializeMessage(m: ChatMessage): Record<string, unknown> {
  return {
    id: m.id,
    threadPeerRootPubkey: Buffer.from(m.threadPeerRootPubkey).toString("hex"),
    fromMe: m.fromMe,
    body: m.body,
    sentAt: m.sentAt,
    draftFromAgent: m.draftFromAgent ?? false,
  };
}
