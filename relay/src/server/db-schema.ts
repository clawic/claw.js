export const RELAY_SCHEMA_SQL = `
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memberships (
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        PRIMARY KEY (user_id, tenant_id)
      );
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        device_id TEXT,
        agent_id TEXT,
        workspace_id TEXT,
        expires_at INTEGER NOT NULL,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS connector_enrollments (
        token_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        connector_id TEXT,
        agent_id TEXT NOT NULL,
        description TEXT,
        token_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS connector_credentials (
        token_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        connector_id TEXT,
        agent_id TEXT NOT NULL,
        description TEXT,
        token_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_rotated_at INTEGER NOT NULL,
        revoked_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS connectors (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_seen_at INTEGER,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        label TEXT NOT NULL,
        platform TEXT,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        revoked_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS workspace_grants (
        tenant_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, device_id, agent_id, workspace_id)
      );
      CREATE TABLE IF NOT EXISTS pairing_sessions (
        id TEXT PRIMARY KEY,
        device_code_id TEXT NOT NULL UNIQUE,
        device_code_hash TEXT NOT NULL,
        user_code TEXT NOT NULL,
        requested_connector_id TEXT NOT NULL,
        requested_agent_id TEXT NOT NULL,
        requested_display_name TEXT,
        tenant_id TEXT,
        connector_id TEXT,
        agent_id TEXT,
        approved_by_user_id TEXT,
        connector_token_id TEXT,
        status TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_polled_at INTEGER,
        approved_at INTEGER,
        denied_at INTEGER,
        consumed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT,
        description TEXT,
        instructions TEXT,
        resource_refs_json TEXT,
        secret_refs_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        instructions TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE TABLE IF NOT EXISTS project_agents (
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        runtime_agent_id TEXT NOT NULL,
        display_name TEXT,
        instructions TEXT,
        resource_refs_json TEXT,
        secret_refs_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, project_id, agent_id)
      );
      CREATE TABLE IF NOT EXISTS project_resource_refs (
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        ref_id TEXT NOT NULL,
        label TEXT,
        uri TEXT,
        mode TEXT,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, project_id, ref_id)
      );
      CREATE TABLE IF NOT EXISTS project_secret_refs (
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        ref_id TEXT NOT NULL,
        label TEXT,
        secret_name TEXT,
        mode TEXT,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, project_id, ref_id)
      );
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, agent_id, id)
      );
      CREATE TABLE IF NOT EXISTS connector_sessions (
        id TEXT PRIMARY KEY,
        credential_token_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL,
        connected_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        capabilities_json TEXT,
        version TEXT
      );
      CREATE TABLE IF NOT EXISTS activity_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        agent_id TEXT,
        workspace_id TEXT,
        capability TEXT NOT NULL,
        status TEXT NOT NULL,
        detail TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        agent_id TEXT,
        workspace_id TEXT,
        tokens_in INTEGER NOT NULL,
        tokens_out INTEGER NOT NULL,
        estimated_cost_usd REAL NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS device_endpoints (
        device_id TEXT PRIMARY KEY,
        iroh_node_id TEXT,
        relay_url TEXT,
        public_addrs_json TEXT,
        last_seen_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_device_endpoints_node
        ON device_endpoints(iroh_node_id);
      CREATE TABLE IF NOT EXISTS magic_link_tokens (
        token_id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        email TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        purpose TEXT NOT NULL,
        device_label TEXT,
        platform TEXT,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_magic_link_email ON magic_link_tokens(email);
      CREATE TABLE IF NOT EXISTS preauth_keys (
        key_id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        created_by_user_id TEXT,
        label TEXT,
        scopes_json TEXT NOT NULL,
        reusable INTEGER NOT NULL DEFAULT 0,
        max_uses INTEGER,
        uses INTEGER NOT NULL DEFAULT 0,
        expires_at INTEGER,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS signaling_envelopes (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        from_device_id TEXT NOT NULL,
        to_device_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        delivered_at INTEGER,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_signaling_to
        ON signaling_envelopes(to_device_id, delivered_at);
    `;

export const RELAY_SCHEMA_COLUMN_MIGRATIONS = [
  {
    "tableName": "agents",
    "columnName": "role",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "agents",
    "columnName": "description",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "agents",
    "columnName": "instructions",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "agents",
    "columnName": "resource_refs_json",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "agents",
    "columnName": "secret_refs_json",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "projects",
    "columnName": "instructions",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "project_agents",
    "columnName": "instructions",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "project_agents",
    "columnName": "resource_refs_json",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "project_agents",
    "columnName": "secret_refs_json",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "project_agents",
    "columnName": "display_name",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "refresh_tokens",
    "columnName": "device_id",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "connector_enrollments",
    "columnName": "connector_id",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "connector_credentials",
    "columnName": "connector_id",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "connector_sessions",
    "columnName": "connector_id",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "devices",
    "columnName": "iroh_node_id",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "devices",
    "columnName": "preauth_key_id",
    "columnDefinition": "TEXT"
  },
  {
    "tableName": "devices",
    "columnName": "platform_version",
    "columnDefinition": "TEXT"
  }
] as const;
