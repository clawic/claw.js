// @clawjs-persistent-surface-ddl-source
import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import {
  fromBase64Url,
  generateAgreementKeypair,
  generateSigningKeypair,
  toBase64Url,
} from "./crypto.ts";
import { generateBearerToken } from "./pairing.ts";
import { DEFAULT_MESH_ID, migrateMeshScopeColumn } from "./host-store.ts";

const DDL = `
CREATE TABLE IF NOT EXISTS node_identity (
  mesh_id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  signing_public_key TEXT NOT NULL,
  signing_private_key TEXT NOT NULL,
  agreement_public_key TEXT NOT NULL,
  agreement_private_key TEXT NOT NULL,
  bearer_token TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

interface IdentityRow {
  mesh_id: string;
  node_id: string;
  display_name: string;
  signing_public_key: string;
  signing_private_key: string;
  agreement_public_key: string;
  agreement_private_key: string;
  bearer_token: string;
  created_at: string;
}

export interface NodeIdentity {
  nodeId: string;
  displayName: string;
  signingPublicKey: Uint8Array;
  signingPrivateKey: Uint8Array;
  agreementPublicKey: Uint8Array;
  agreementPrivateKey: Uint8Array;
  bearerToken: string;
  createdAt: Date;
}

export class IdentityStore {
  private readonly db: Database.Database;
  private readonly meshId: string;

  constructor(db: Database.Database, meshId: string = DEFAULT_MESH_ID) {
    this.db = db;
    this.meshId = meshId;
    migrateMeshScopeColumn(this.db, "node_identity");
    this.db.exec(DDL);
  }

  get(): NodeIdentity | null {
    const row = this.db
      .prepare<[string], IdentityRow>(
        "SELECT * FROM node_identity WHERE mesh_id = ?",
      )
      .get(this.meshId);
    return row ? rowToIdentity(row) : null;
  }

  getOrCreate(displayName: string, now: Date = new Date()): NodeIdentity {
    const existing = this.get();
    if (existing) return existing;
    const signing = generateSigningKeypair();
    const agreement = generateAgreementKeypair();
    const identity: NodeIdentity = {
      nodeId: randomUUID(),
      displayName,
      signingPublicKey: signing.publicKey,
      signingPrivateKey: signing.privateKey,
      agreementPublicKey: agreement.publicKey,
      agreementPrivateKey: agreement.privateKey,
      bearerToken: generateBearerToken(),
      createdAt: now,
    };
    this.persist(identity);
    return identity;
  }

  setDisplayName(displayName: string): NodeIdentity {
    const current = this.get();
    if (!current) {
      throw new Error("identity not initialized; call getOrCreate first");
    }
    this.db
      .prepare(
        "UPDATE node_identity SET display_name = ? WHERE mesh_id = ?",
      )
      .run(displayName, this.meshId);
    return { ...current, displayName };
  }

  rotateBearerToken(): NodeIdentity {
    const current = this.get();
    if (!current) {
      throw new Error("identity not initialized; call getOrCreate first");
    }
    const bearerToken = generateBearerToken();
    this.db
      .prepare(
        "UPDATE node_identity SET bearer_token = ? WHERE mesh_id = ?",
      )
      .run(bearerToken, this.meshId);
    return { ...current, bearerToken };
  }

  private persist(identity: NodeIdentity): void {
    this.db
      .prepare(
        `INSERT INTO node_identity (
          mesh_id, node_id, display_name,
          signing_public_key, signing_private_key,
          agreement_public_key, agreement_private_key,
          bearer_token, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        this.meshId,
        identity.nodeId,
        identity.displayName,
        toBase64Url(identity.signingPublicKey),
        toBase64Url(identity.signingPrivateKey),
        toBase64Url(identity.agreementPublicKey),
        toBase64Url(identity.agreementPrivateKey),
        identity.bearerToken,
        identity.createdAt.toISOString(),
      );
  }
}

function rowToIdentity(row: IdentityRow): NodeIdentity {
  return {
    nodeId: row.node_id,
    displayName: row.display_name,
    signingPublicKey: fromBase64Url(row.signing_public_key),
    signingPrivateKey: fromBase64Url(row.signing_private_key),
    agreementPublicKey: fromBase64Url(row.agreement_public_key),
    agreementPrivateKey: fromBase64Url(row.agreement_private_key),
    bearerToken: row.bearer_token,
    createdAt: new Date(row.created_at),
  };
}
