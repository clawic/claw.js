import type {
  Attachment,
  ContextChip,
  DocumentRef,
  SessionSearchInput,
  SessionSearchResult,
  Message,
  SessionRecord,
  SessionSummary,
} from "@clawjs/core";

export type SessionMessage = Message;
export type SessionAttachment = Attachment;
export type SessionDocumentRef = DocumentRef;
export type SessionContextChip = ContextChip;
export type SessionRecordAlias = SessionRecord;
export type SessionSummaryAlias = SessionSummary;
export type SessionSearchInputAlias = SessionSearchInput;
export type SessionSearchResultAlias = SessionSearchResult;

export interface TranscriptMessageInput {
  role?: SessionMessage["role"] | string;
  content?: unknown;
  attachments?: unknown;
  documents?: unknown;
  contextChips?: unknown;
  metadata?: unknown;
}

export interface TranscriptEventInput {
  type?: string;
  id?: string;
  timestamp?: string;
  title?: string;
  message?: TranscriptMessageInput;
  role?: TranscriptMessageInput["role"];
  content?: unknown;
  attachments?: unknown;
  documents?: unknown;
  contextChips?: unknown;
  metadata?: unknown;
}
