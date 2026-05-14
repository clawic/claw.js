import { fromBase64, KEY_LENGTH } from "./crypto.ts";

export function loadPlatformKey(kekBase64?: string): Uint8Array | undefined {
  if (!kekBase64) return undefined;
  try {
    const key = fromBase64(kekBase64);
    if (key.length !== KEY_LENGTH) throw new Error(`expected ${KEY_LENGTH} bytes`);
    return key;
  } catch (error) {
    throw new Error(`Invalid CLAW_SECRETS_KEK_BASE64: ${error instanceof Error ? error.message : String(error)}`);
  }
}
