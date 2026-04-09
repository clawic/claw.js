import { watchWorkspaceFile, type WatchCallback, type WatchOptions } from "./index.ts";

export function watchSessionTranscript(
  workspaceDir: string,
  sessionId: string,
  callback: WatchCallback,
  options?: WatchOptions,
): () => void {
  return watchWorkspaceFile(workspaceDir, `.clawjs/sessions/${sessionId}.jsonl`, callback, options);
}
