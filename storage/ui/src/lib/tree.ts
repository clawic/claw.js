import type { StorageObject } from "./types";

export interface FolderEntry {
  kind: "folder";
  name: string;
  prefix: string;
  childCount: number;
}

export interface FileEntry {
  kind: "file";
  name: string;
  object: StorageObject;
}

export type Entry = FolderEntry | FileEntry;

export function buildEntries(
  objects: StorageObject[],
  currentPrefix: string,
): Entry[] {
  const folders = new Map<string, FolderEntry>();
  const files: FileEntry[] = [];
  const base = currentPrefix.endsWith("/") || currentPrefix === ""
    ? currentPrefix
    : `${currentPrefix}/`;

  for (const object of objects) {
    if (!object.key.startsWith(base)) continue;
    const remainder = object.key.slice(base.length);
    const slash = remainder.indexOf("/");
    if (slash === -1) {
      if (remainder.length === 0) continue;
      files.push({ kind: "file", name: remainder, object });
      continue;
    }
    const folderName = remainder.slice(0, slash);
    const folderPrefix = `${base}${folderName}/`;
    const existing = folders.get(folderPrefix);
    if (existing) {
      existing.childCount += 1;
    } else {
      folders.set(folderPrefix, {
        kind: "folder",
        name: folderName,
        prefix: folderPrefix,
        childCount: 1,
      });
    }
  }

  const folderList = [...folders.values()].sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...folderList, ...files];
}

export function breadcrumbs(prefix: string): Array<{ label: string; prefix: string }> {
  if (!prefix) return [];
  const parts = prefix.split("/").filter(Boolean);
  let cumulative = "";
  return parts.map((part) => {
    cumulative = cumulative ? `${cumulative}${part}/` : `${part}/`;
    return { label: part, prefix: cumulative };
  });
}
