import { platform as nodePlatform } from "node:os";

export type SupportedPlatform = "darwin" | "linux" | "win32" | "other";

export function detectPlatform(): SupportedPlatform {
  const p = nodePlatform();
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  return "other";
}

export const isMacOS = (): boolean => detectPlatform() === "darwin";
export const isLinux = (): boolean => detectPlatform() === "linux";
export const isWindows = (): boolean => detectPlatform() === "win32";

export const TCC_CAPABILITY_IDS = [
  "tcc.computer.screenshot",
  "tcc.computer.input.keystroke",
  "tcc.computer.input.click",
  "tcc.terminal.spawn",
] as const;

export type TccCapabilityId = (typeof TCC_CAPABILITY_IDS)[number];
