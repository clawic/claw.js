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
