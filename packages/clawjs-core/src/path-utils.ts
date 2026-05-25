export function normalizeClawPathSeparators(value: string): string {
  const forwardSlashes = value.replace(/\\/g, "/");
  const hasUncRoot = forwardSlashes.startsWith("//") && !forwardSlashes.startsWith("///");
  const normalized = forwardSlashes.replace(/\/+/g, "/").replace(/\/$/, "");
  return hasUncRoot && normalized.startsWith("/") ? `/${normalized}` : normalized;
}

export function resolveClawPathLike(value: string): string {
  const normalized = normalizeClawPathSeparators(value);
  const absolute = normalized.startsWith("/");
  const hasUncRoot = normalized.startsWith("//");
  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") {
        parts.pop();
      } else if (!absolute) {
        parts.push(part);
      }
      continue;
    }
    parts.push(part);
  }
  const prefix = hasUncRoot ? "//" : absolute ? "/" : "";
  return `${prefix}${parts.join("/")}` || (absolute ? "/" : ".");
}

export function joinClawPath(...parts: string[]): string {
  return resolveClawPathLike(parts.filter(Boolean).join("/"));
}
