import type { ContentChangeEvent } from "./types.ts";

export type ContentRealtimeEvent = ContentChangeEvent | {
  type: "ready";
  at: string;
};
