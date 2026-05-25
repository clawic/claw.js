import { watchWorkspaceFile, type WatchCallback, type WatchOptions } from "./index.ts";
import { assertSafeSessionId } from "../sessions/store.ts";

export function watchSessionTranscript(
  workspaceDir: string,
  sessionId: string,
  callback: WatchCallback,
  options?: WatchOptions,
): () => void {
  assertSafeSessionId(sessionId);
  return watchWorkspaceFile(workspaceDir, `.claw/sessions/${sessionId}.jsonl`, callback, options);
}
