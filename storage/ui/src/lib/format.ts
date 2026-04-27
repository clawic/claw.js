export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function shortHash(value: string): string {
  return value ? value.slice(0, 10) : "";
}

const TEXT_PREFIXES = ["text/", "application/json", "application/xml"];

export function isTextLike(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  if (TEXT_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;
  if (lower.includes("javascript") || lower.includes("yaml")) return true;
  return false;
}

export function isImage(contentType: string): boolean {
  return contentType.toLowerCase().startsWith("image/");
}

export function isPdf(contentType: string): boolean {
  return contentType.toLowerCase() === "application/pdf";
}

export function isAudio(contentType: string): boolean {
  return contentType.toLowerCase().startsWith("audio/");
}

export function isVideo(contentType: string): boolean {
  return contentType.toLowerCase().startsWith("video/");
}
