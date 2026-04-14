import type { DatabaseRecord } from "./database-client";

export interface Space extends DatabaseRecord {
  name: string;
  description?: string;
  icon?: string;
  ownerId: string;
  visibility: "public" | "private";
  metadata?: Record<string, unknown>;
}

export interface Category extends DatabaseRecord {
  spaceId: string;
  name: string;
  position: number;
}

export interface Channel extends DatabaseRecord {
  spaceId?: string;
  categoryId?: string;
  name: string;
  topic?: string;
  kind: "text" | "voice" | "announcement" | "dm";
  visibility: "public" | "private";
  position?: number;
  lastMessageAt?: string;
}

export interface Message extends DatabaseRecord {
  channelId: string;
  threadId?: string;
  authorId: string;
  authorKind: "agent" | "human";
  content: string;
  contentType: "text" | "system" | "embed" | "file";
  editedAt?: string;
  replyToId?: string;
  attachments?: Array<{ fileId: string; filename: string; contentType: string }>;
  pinned?: boolean;
}

export interface Member extends DatabaseRecord {
  spaceId: string;
  agentId: string;
  displayName?: string;
  roles?: string[];
  status: "active" | "banned" | "left";
  presence?: "online" | "idle" | "busy" | "offline";
  lastSeenAt?: string;
}

export interface Role extends DatabaseRecord {
  spaceId: string;
  name: string;
  color?: string;
  position: number;
  permissions: Record<string, boolean>;
  mentionable?: boolean;
}

export interface Reaction extends DatabaseRecord {
  messageId: string;
  agentId: string;
  emoji: string;
}

export interface ReadState extends DatabaseRecord {
  channelId: string;
  agentId: string;
  lastReadMessageId?: string;
  lastReadAt?: string;
  mentionCount?: number;
}

export interface DmParticipant extends DatabaseRecord {
  channelId: string;
  agentId: string;
}

export interface Notification extends DatabaseRecord {
  recipientId: string;
  kind: "mention" | "dm" | "reply" | "system";
  channelId?: string;
  messageId?: string;
  spaceId?: string;
  read: boolean;
  body?: string;
}
