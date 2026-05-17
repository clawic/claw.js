import { platform as nodePlatform } from "node:os";

export type SupportedPlatform = "darwin" | "linux" | "win32" | "other";

export function detectPlatform(): SupportedPlatform {
  const p = nodePlatform();
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  return "other";
}
