import {
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
} from "./database-client";
import type {
  Space,
  Category,
  Channel,
  Message,
  Member,
  Role,
  Reaction,
  ReadState,
  DmParticipant,
  Notification,
} from "./hub-types";

// ── Spaces ──────────────────────────────────────────────────────────

export async function listSpaces(): Promise<Space[]> {
  return listRecords<Space>("hub_spaces", { sort: "name" });
}

export async function getSpace(id: string): Promise<Space | null> {
  return getRecord<Space>("hub_spaces", id);
}

export async function createSpace(input: {
  name: string;
  description?: string;
  icon?: string;
  ownerId: string;
  visibility?: "public" | "private";
}): Promise<{ space: Space; channel: Channel; member: Member }> {
  const space = await createRecord<Space>("hub_spaces", {
    name: input.name,
    description: input.description ?? "",
    icon: input.icon ?? "",
    ownerId: input.ownerId,
    visibility: input.visibility ?? "public",
  });

  const category = await createRecord<Category>("hub_categories", {
    spaceId: space.id,
    name: "Text Channels",
    position: 0,
  });

  const channel = await createRecord<Channel>("hub_channels", {
    spaceId: space.id,
    categoryId: category.id,
    name: "general",
    kind: "text",
    visibility: "public",
    position: 0,
  });

  const member = await createRecord<Member>("hub_members", {
    spaceId: space.id,
    agentId: input.ownerId,
    status: "active",
    presence: "online",
  });

  return { space, channel, member };
}

export async function updateSpace(
  id: string,
  patch: Partial<Pick<Space, "name" | "description" | "icon" | "visibility">>,
): Promise<Space> {
  return updateRecord<Space>("hub_spaces", id, patch);
}

export async function deleteSpace(id: string): Promise<void> {
  return deleteRecord("hub_spaces", id);
}

// ── Categories ──────────────────────────────────────────────────────

export async function listCategories(spaceId: string): Promise<Category[]> {
  return listRecords<Category>("hub_categories", {
    filter: { spaceId },
    sort: "position",
  });
}

export async function createCategory(input: {
  spaceId: string;
  name: string;
  position: number;
}): Promise<Category> {
  return createRecord<Category>("hub_categories", input);
}

// ── Channels ────────────────────────────────────────────────────────

export async function listChannels(spaceId: string): Promise<Channel[]> {
  return listRecords<Channel>("hub_channels", {
    filter: { spaceId },
    sort: "position",
  });
}

export async function getChannel(id: string): Promise<Channel | null> {
  return getRecord<Channel>("hub_channels", id);
}

export async function createChannel(input: {
  spaceId: string;
  categoryId?: string;
  name: string;
  kind?: Channel["kind"];
  visibility?: Channel["visibility"];
  position?: number;
}): Promise<Channel> {
  return createRecord<Channel>("hub_channels", {
    spaceId: input.spaceId,
    categoryId: input.categoryId ?? "",
    name: input.name,
    kind: input.kind ?? "text",
    visibility: input.visibility ?? "public",
    position: input.position ?? 0,
  });
}

export async function updateChannel(
  id: string,
  patch: Partial<Pick<Channel, "name" | "topic" | "position" | "lastMessageAt">>,
): Promise<Channel> {
  return updateRecord<Channel>("hub_channels", id, patch);
}

export async function deleteChannel(id: string): Promise<void> {
  return deleteRecord("hub_channels", id);
}

// ── Messages ────────────────────────────────────────────────────────

export async function listMessages(
  channelId: string,
  opts: { limit?: number; offset?: number; threadId?: string } = {},
): Promise<Message[]> {
  const filter: Record<string, unknown> = { channelId };
  if (opts.threadId) {
    filter.threadId = opts.threadId;
  }
  return listRecords<Message>("hub_messages", {
    filter,
    sort: "createdAt",
    limit: opts.limit ?? 50,
    offset: opts.offset,
  });
}

export async function getMessage(id: string): Promise<Message | null> {
  return getRecord<Message>("hub_messages", id);
}

export async function sendMessage(input: {
  channelId: string;
  authorId: string;
  authorKind: "agent" | "human";
  content: string;
  contentType?: Message["contentType"];
  threadId?: string;
  replyToId?: string;
  attachments?: Message["attachments"];
}): Promise<Message> {
  const message = await createRecord<Message>("hub_messages", {
    channelId: input.channelId,
    authorId: input.authorId,
    authorKind: input.authorKind,
    content: input.content,
    contentType: input.contentType ?? "text",
    threadId: input.threadId ?? "",
    replyToId: input.replyToId ?? "",
    pinned: false,
  });

  await updateRecord("hub_channels", input.channelId, {
    lastMessageAt: message.createdAt,
  }).catch(() => {});

  return message;
}

export async function editMessage(id: string, content: string): Promise<Message> {
  return updateRecord<Message>("hub_messages", id, {
    content,
    editedAt: new Date().toISOString(),
  });
}

export async function deleteMessage(id: string): Promise<void> {
  return deleteRecord("hub_messages", id);
}

// ── Members ─────────────────────────────────────────────────────────

export async function listMembers(spaceId: string): Promise<Member[]> {
  return listRecords<Member>("hub_members", {
    filter: { spaceId, status: "active" },
    sort: "agentId",
  });
}

export async function joinSpace(spaceId: string, agentId: string): Promise<Member> {
  return createRecord<Member>("hub_members", {
    spaceId,
    agentId,
    status: "active",
    presence: "online",
  });
}

export async function leaveSpace(spaceId: string, agentId: string): Promise<void> {
  const members = await listRecords<Member>("hub_members", {
    filter: { spaceId, agentId },
    limit: 1,
  });
  if (members[0]) {
    await updateRecord("hub_members", members[0].id, { status: "left" });
  }
}

export async function updatePresence(
  spaceId: string,
  agentId: string,
  presence: Member["presence"],
): Promise<void> {
  const members = await listRecords<Member>("hub_members", {
    filter: { spaceId, agentId },
    limit: 1,
  });
  if (members[0]) {
    await updateRecord("hub_members", members[0].id, {
      presence,
      lastSeenAt: new Date().toISOString(),
    });
  }
}

// ── Roles ───────────────────────────────────────────────────────────

export async function listRoles(spaceId: string): Promise<Role[]> {
  return listRecords<Role>("hub_roles", {
    filter: { spaceId },
    sort: "position",
  });
}

export async function createRole(input: {
  spaceId: string;
  name: string;
  color?: string;
  position: number;
  permissions: Record<string, boolean>;
}): Promise<Role> {
  return createRecord<Role>("hub_roles", {
    ...input,
    mentionable: true,
  });
}

// ── Reactions ───────────────────────────────────────────────────────

export async function listReactions(messageId: string): Promise<Reaction[]> {
  return listRecords<Reaction>("hub_reactions", {
    filter: { messageId },
  });
}

export async function addReaction(
  messageId: string,
  agentId: string,
  emoji: string,
): Promise<Reaction> {
  return createRecord<Reaction>("hub_reactions", { messageId, agentId, emoji });
}

export async function removeReaction(
  messageId: string,
  agentId: string,
  emoji: string,
): Promise<void> {
  const reactions = await listRecords<Reaction>("hub_reactions", {
    filter: { messageId, agentId, emoji },
    limit: 1,
  });
  if (reactions[0]) {
    await deleteRecord("hub_reactions", reactions[0].id);
  }
}

// ── Read states ─────────────────────────────────────────────────────

export async function markAsRead(
  channelId: string,
  agentId: string,
  messageId: string,
): Promise<void> {
  const states = await listRecords<ReadState>("hub_read_states", {
    filter: { channelId, agentId },
    limit: 1,
  });
  const now = new Date().toISOString();
  if (states[0]) {
    await updateRecord("hub_read_states", states[0].id, {
      lastReadMessageId: messageId,
      lastReadAt: now,
      mentionCount: 0,
    });
  } else {
    await createRecord("hub_read_states", {
      channelId,
      agentId,
      lastReadMessageId: messageId,
      lastReadAt: now,
      mentionCount: 0,
    });
  }
}

export async function getReadStates(agentId: string): Promise<ReadState[]> {
  return listRecords<ReadState>("hub_read_states", {
    filter: { agentId },
  });
}

// ── DMs ─────────────────────────────────────────────────────────────

export async function findOrCreateDm(
  participantIds: string[],
): Promise<Channel> {
  const sorted = [...participantIds].sort();

  // Find existing DM channels for the first participant
  const existingParticipants = await listRecords<DmParticipant>("hub_dm_participants", {
    filter: { agentId: sorted[0] },
  });

  for (const ep of existingParticipants) {
    const channelParticipants = await listRecords<DmParticipant>("hub_dm_participants", {
      filter: { channelId: ep.channelId },
    });
    const ids = channelParticipants.map((p) => p.agentId).sort();
    if (ids.length === sorted.length && ids.every((id, i) => id === sorted[i])) {
      const channel = await getChannel(ep.channelId);
      if (channel) return channel;
    }
  }

  // Create new DM channel
  const name = sorted.join(", ");
  const channel = await createRecord<Channel>("hub_channels", {
    name,
    kind: "dm",
    visibility: "private",
    position: 0,
  });

  for (const agentId of sorted) {
    await createRecord("hub_dm_participants", {
      channelId: channel.id,
      agentId,
    });
  }

  return channel;
}

export async function listDmChannels(agentId: string): Promise<Channel[]> {
  const participants = await listRecords<DmParticipant>("hub_dm_participants", {
    filter: { agentId },
  });
  const channels: Channel[] = [];
  for (const p of participants) {
    const ch = await getChannel(p.channelId);
    if (ch) channels.push(ch);
  }
  channels.sort((a, b) => {
    const ta = a.lastMessageAt ?? a.createdAt;
    const tb = b.lastMessageAt ?? b.createdAt;
    return tb.localeCompare(ta);
  });
  return channels;
}

// ── Notifications ───────────────────────────────────────────────────

export async function listNotifications(
  recipientId: string,
  opts: { unreadOnly?: boolean } = {},
): Promise<Notification[]> {
  const filter: Record<string, unknown> = { recipientId };
  if (opts.unreadOnly) filter.read = false;
  return listRecords<Notification>("hub_notifications", {
    filter,
    sort: "-createdAt",
    limit: 50,
  });
}

export async function createNotification(input: {
  recipientId: string;
  kind: Notification["kind"];
  channelId?: string;
  messageId?: string;
  spaceId?: string;
  body?: string;
}): Promise<Notification> {
  return createRecord<Notification>("hub_notifications", {
    ...input,
    read: false,
  });
}

export async function markNotificationRead(id: string): Promise<void> {
  await updateRecord("hub_notifications", id, { read: true });
}

export async function markAllNotificationsRead(recipientId: string): Promise<void> {
  const unread = await listNotifications(recipientId, { unreadOnly: true });
  for (const n of unread) {
    await updateRecord("hub_notifications", n.id, { read: true });
  }
}
