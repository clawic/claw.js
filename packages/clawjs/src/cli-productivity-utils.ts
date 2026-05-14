import { CORE_PRODUCTIVITY_DB_COLLECTIONS } from "./cli-constants.ts";

export function coreProductivityCollection(rawCollection: string | undefined): string | null {
  if (!rawCollection) return null;
  return CORE_PRODUCTIVITY_DB_COLLECTIONS[rawCollection.trim().toLowerCase()] ?? null;
}

export function singularCoreCollection(collectionName: string): string {
  if (collectionName === "people") return "person";
  if (collectionName.endsWith("s")) return collectionName.slice(0, -1);
  return collectionName;
}

export function pickCoreTitle(collectionName: string, payload: Record<string, unknown>, fallback?: string): string | undefined {
  const primary = collectionName === "people" ? "displayName" : ["projects", "cycles", "saved_views", "custom_fields", "templates"].includes(collectionName) ? "name" : collectionName === "field_values" ? "fieldId" : collectionName === "comments" ? "body" : "title";
  const value = payload[primary] ?? payload.title ?? payload.name ?? payload.displayName ?? fallback;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

