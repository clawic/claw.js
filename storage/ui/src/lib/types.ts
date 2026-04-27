export type StorageVisibility = "internal" | "drive";

export interface StorageRef {
  bucket: string;
  key: string;
}

export interface StorageObject extends StorageRef {
  sizeBytes: number;
  contentType: string;
  sha256: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdByAgentId: string;
  filePath: string;
  visibility: StorageVisibility;
}

export interface StorageShare {
  id: string;
  bucket: string;
  key: string;
  label: string;
  mode: "read";
  url: string;
  externalItemId?: string;
  externalShareId?: string;
  createdAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
}
