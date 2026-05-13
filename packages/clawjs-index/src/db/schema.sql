-- @clawjs/index SQLite schema. Stable shape; future migrations append.
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS entity_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  schema_json TEXT NOT NULL,
  ui_hints_json TEXT,
  identity_fields_json TEXT NOT NULL,
  timeseries_fields_json TEXT NOT NULL,
  canonical INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type_id TEXT NOT NULL REFERENCES entity_types(id),
  identity_key TEXT NOT NULL,
  data_json TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  observation_count INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  title TEXT,
  thumbnail_url TEXT,
  UNIQUE (type_id, identity_key)
);

CREATE INDEX IF NOT EXISTS idx_entities_type_id ON entities(type_id);
CREATE INDEX IF NOT EXISTS idx_entities_last_seen ON entities(type_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  monitor_id TEXT,
  search_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  codex_session_id TEXT,
  error TEXT,
  entities_seen INTEGER NOT NULL DEFAULT 0,
  observations_count INTEGER NOT NULL DEFAULT 0,
  alerts_fired INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER,
  tokens_out INTEGER,
  prompt TEXT,
  log_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_monitor ON runs(monitor_id, started_at DESC);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  run_id TEXT,
  source_url TEXT,
  observed_at TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  changed_fields_json TEXT,
  agent_session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_run ON observations(run_id);

CREATE TABLE IF NOT EXISTS field_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,
  value_json TEXT,
  valid_from TEXT NOT NULL,
  run_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_field_history_lookup
  ON field_history(entity_id, field_path, valid_from DESC);

CREATE TABLE IF NOT EXISTS searches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type_id TEXT REFERENCES entity_types(id),
  criteria_json TEXT NOT NULL,
  prompt_template TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS monitors (
  id TEXT PRIMARY KEY,
  search_id TEXT NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  name TEXT,
  cron_expr TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_fire_at TEXT,
  next_fire_at TEXT,
  alert_rules_json TEXT NOT NULL DEFAULT '[]',
  mute_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_monitors_next_fire ON monitors(enabled, next_fire_at);

CREATE TABLE IF NOT EXISTS run_entities (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  position INTEGER,
  PRIMARY KEY (run_id, entity_id)
);

CREATE TABLE IF NOT EXISTS entity_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  attrs_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_relations_from ON entity_relations(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_to ON entity_relations(to_entity_id);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  monitor_id TEXT,
  run_id TEXT,
  entity_id TEXT,
  rule_id TEXT NOT NULL,
  rule_kind TEXT NOT NULL,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  payload_json TEXT NOT NULL,
  ack_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_unack ON alerts(ack_at);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entity_tags (
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (entity_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON entity_tags(tag_id);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'manual',
  criteria_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collection_members (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (collection_id, entity_id)
);

CREATE TABLE IF NOT EXISTS device_tokens (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  token TEXT NOT NULL,
  label TEXT,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (platform, token)
);

CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
  id UNINDEXED,
  type_id UNINDEXED,
  title,
  body,
  tokenize = 'porter unicode61'
);

-- ============================================================================
-- marketplace/1.0.0 · marketplace protocol tables
-- ============================================================================
-- All `*_keys` tables store encrypted private material; encryption is done in
-- the marketplace identity module (XChaCha20-Poly1305 with a passphrase-derived
-- key) before the bytes ever reach SQLite. Public keys are stored raw.

CREATE TABLE IF NOT EXISTS mp_root_keys (
  id              TEXT PRIMARY KEY,
  pubkey          BLOB NOT NULL UNIQUE,
  encrypted_seed  BLOB NOT NULL,
  encryption_meta TEXT NOT NULL,
  label           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at      TEXT
);

CREATE TABLE IF NOT EXISTS mp_device_keys (
  id              TEXT PRIMARY KEY,
  root_key_id     TEXT NOT NULL REFERENCES mp_root_keys(id) ON DELETE CASCADE,
  pubkey          BLOB NOT NULL UNIQUE,
  encrypted_priv  BLOB NOT NULL,
  encryption_meta TEXT NOT NULL,
  device_name     TEXT NOT NULL,
  certificate_cbor BLOB NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_mp_device_keys_root ON mp_device_keys(root_key_id);

CREATE TABLE IF NOT EXISTS mp_role_keys (
  id              TEXT PRIMARY KEY,
  root_key_id     TEXT NOT NULL REFERENCES mp_root_keys(id) ON DELETE CASCADE,
  pubkey          BLOB NOT NULL UNIQUE,
  encrypted_priv  BLOB NOT NULL,
  encryption_meta TEXT NOT NULL,
  role_name       TEXT NOT NULL,
  vertical        TEXT NOT NULL,
  certificate_cbor BLOB NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_mp_role_keys_root ON mp_role_keys(root_key_id);
CREATE INDEX IF NOT EXISTS idx_mp_role_keys_vertical ON mp_role_keys(vertical);

CREATE TABLE IF NOT EXISTS mp_cross_role_attestations (
  id              TEXT PRIMARY KEY,
  root_key_id     TEXT NOT NULL REFERENCES mp_root_keys(id) ON DELETE CASCADE,
  roles_json      TEXT NOT NULL,
  signed_payload  BLOB NOT NULL,
  signature       BLOB NOT NULL,
  issued_at       TEXT NOT NULL,
  expires_at      TEXT
);

CREATE TABLE IF NOT EXISTS mp_intents (
  id                  TEXT PRIMARY KEY,
  intent_id_hash      BLOB NOT NULL UNIQUE,
  side                TEXT NOT NULL CHECK (side IN ('offer', 'want')),
  role_key_id         TEXT REFERENCES mp_role_keys(id) ON DELETE SET NULL,
  ephemeral_pubkey    BLOB,
  vertical            TEXT NOT NULL,
  payload_json        TEXT NOT NULL,
  payload_cbor        BLOB NOT NULL,
  visibility_levels_json TEXT NOT NULL,
  reveal_keys_json    TEXT,
  signature_role      BLOB,
  signature_device    BLOB,
  provenance          TEXT NOT NULL CHECK (provenance IN ('native', 'observed')),
  observed_source     TEXT,
  observed_external_url TEXT,
  status              TEXT NOT NULL CHECK (status IN ('draft', 'published', 'withdrawn', 'expired')),
  expires_at          TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  published_at        TEXT,
  withdrawn_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_mp_intents_vertical ON mp_intents(vertical, status);
CREATE INDEX IF NOT EXISTS idx_mp_intents_role ON mp_intents(role_key_id);
CREATE INDEX IF NOT EXISTS idx_mp_intents_side ON mp_intents(side, status);

CREATE TABLE IF NOT EXISTS mp_intent_observations (
  id              TEXT PRIMARY KEY,
  intent_id       TEXT NOT NULL REFERENCES mp_intents(id) ON DELETE CASCADE,
  source_layer    TEXT NOT NULL CHECK (source_layer IN ('dht', 'broker', 'gossip', 'direct', 'local')),
  source_node     TEXT,
  observed_at     TEXT NOT NULL DEFAULT (datetime('now')),
  raw_blob        BLOB
);

CREATE INDEX IF NOT EXISTS idx_mp_intent_obs_intent ON mp_intent_observations(intent_id);

CREATE TABLE IF NOT EXISTS mp_peer_levels (
  id                  TEXT PRIMARY KEY,
  my_role_key_id      TEXT NOT NULL REFERENCES mp_role_keys(id) ON DELETE CASCADE,
  peer_pubkey         BLOB NOT NULL,
  current_level       INTEGER NOT NULL DEFAULT 0 CHECK (current_level BETWEEN 0 AND 5),
  intent_id           TEXT REFERENCES mp_intents(id) ON DELETE SET NULL,
  proofs_json         TEXT,
  last_updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (my_role_key_id, peer_pubkey, intent_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_peer_levels_role ON mp_peer_levels(my_role_key_id);

CREATE TABLE IF NOT EXISTS mp_inbound_messages (
  id                  TEXT PRIMARY KEY,
  recipient_role_key_id TEXT NOT NULL REFERENCES mp_role_keys(id) ON DELETE CASCADE,
  sender_pubkey       BLOB NOT NULL,
  thread_id           BLOB,
  in_reply_to         BLOB,
  intent_id_ref       TEXT REFERENCES mp_intents(id) ON DELETE SET NULL,
  kind                TEXT NOT NULL,
  plaintext_json      TEXT NOT NULL,
  signature_blob      BLOB,
  ttl_expires_at      TEXT,
  received_at         TEXT NOT NULL DEFAULT (datetime('now')),
  read_at             TEXT
);

CREATE INDEX IF NOT EXISTS idx_mp_inbound_recipient ON mp_inbound_messages(recipient_role_key_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mp_inbound_thread ON mp_inbound_messages(thread_id);

CREATE TABLE IF NOT EXISTS mp_outbound_messages (
  id                  TEXT PRIMARY KEY,
  sender_role_key_id  TEXT NOT NULL REFERENCES mp_role_keys(id) ON DELETE CASCADE,
  recipient_pubkey    BLOB NOT NULL,
  thread_id           BLOB,
  in_reply_to         BLOB,
  intent_id_ref       TEXT REFERENCES mp_intents(id) ON DELETE SET NULL,
  kind                TEXT NOT NULL,
  plaintext_json      TEXT NOT NULL,
  ciphertext_blob     BLOB,
  signature_blob      BLOB,
  sent_at             TEXT NOT NULL DEFAULT (datetime('now')),
  delivery_status     TEXT NOT NULL DEFAULT 'queued' CHECK (delivery_status IN ('queued','sent','delivered','failed'))
);

CREATE INDEX IF NOT EXISTS idx_mp_outbound_sender ON mp_outbound_messages(sender_role_key_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS mp_match_receipts (
  id                  TEXT PRIMARY KEY,
  receipt_hash        BLOB NOT NULL UNIQUE,
  my_role_key_id      TEXT NOT NULL REFERENCES mp_role_keys(id) ON DELETE CASCADE,
  peer_role_pubkey    BLOB NOT NULL,
  offer_intent_id     TEXT REFERENCES mp_intents(id) ON DELETE SET NULL,
  want_intent_id      TEXT REFERENCES mp_intents(id) ON DELETE SET NULL,
  reached_level       INTEGER NOT NULL,
  fields_revealed_json TEXT NOT NULL,
  contact_handover_json TEXT,
  my_signature        BLOB,
  peer_signature      BLOB,
  status              TEXT NOT NULL CHECK (status IN (
    'proposed_by_peer','proposed_by_me','awaiting_human_approval','signed','rejected','expired'
  )),
  proposed_at         TEXT NOT NULL DEFAULT (datetime('now')),
  signed_at           TEXT,
  rejected_at         TEXT,
  payload_cbor        BLOB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mp_match_receipts_role ON mp_match_receipts(my_role_key_id);
CREATE INDEX IF NOT EXISTS idx_mp_match_receipts_status ON mp_match_receipts(status);

CREATE TABLE IF NOT EXISTS mp_vouches_outbound (
  id                  TEXT PRIMARY KEY,
  voucher_role_key_id TEXT NOT NULL REFERENCES mp_role_keys(id) ON DELETE CASCADE,
  vouchee_pubkey      BLOB NOT NULL,
  context             TEXT NOT NULL,
  text                TEXT NOT NULL,
  signed_at           TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at          TEXT,
  signature_blob      BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS mp_vouches_inbound (
  id                  TEXT PRIMARY KEY,
  my_role_key_id      TEXT NOT NULL REFERENCES mp_role_keys(id) ON DELETE CASCADE,
  voucher_pubkey      BLOB NOT NULL,
  context             TEXT NOT NULL,
  text                TEXT NOT NULL,
  received_at         TEXT NOT NULL DEFAULT (datetime('now')),
  signature_blob      BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS mp_ratings (
  id                  TEXT PRIMARY KEY,
  match_receipt_id    TEXT NOT NULL REFERENCES mp_match_receipts(id) ON DELETE CASCADE,
  rater_role_pubkey   BLOB NOT NULL,
  score               INTEGER NOT NULL CHECK (score BETWEEN -5 AND 5),
  comment             TEXT,
  signed_at           TEXT NOT NULL DEFAULT (datetime('now')),
  signature_blob      BLOB NOT NULL,
  countersignature_blob BLOB,
  mutual_consent      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mp_known_brokers (
  id                  TEXT PRIMARY KEY,
  broker_pubkey       BLOB NOT NULL UNIQUE,
  endpoints_json      TEXT NOT NULL,
  verticals_supported_json TEXT NOT NULL,
  policies_json       TEXT,
  trust_local         INTEGER NOT NULL DEFAULT 0,
  last_seen_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mp_dht_records_cache (
  key                 BLOB NOT NULL,
  intent_id_hash      BLOB NOT NULL,
  value_blob          BLOB NOT NULL,
  ttl_expires_at      TEXT NOT NULL,
  source_node_id      TEXT,
  cached_at           TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (key, intent_id_hash)
);

CREATE TABLE IF NOT EXISTS mp_revocations (
  id                  TEXT PRIMARY KEY,
  revoked_pubkey      BLOB NOT NULL UNIQUE,
  revoked_kind        TEXT NOT NULL CHECK (revoked_kind IN ('device','role')),
  reason              TEXT,
  signed_at           TEXT NOT NULL,
  root_pubkey         BLOB NOT NULL,
  root_signature      BLOB NOT NULL,
  observed_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
