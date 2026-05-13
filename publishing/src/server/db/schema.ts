// All CREATE TABLE statements live here. Schema-as-code, applied on every boot
// (CREATE TABLE IF NOT EXISTS). Forward-only changes go through the migrations
// table (publishing_migrations) for ordering.

export const DDL: string[] = [
  // ─── Tenancy and identity ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS workspace (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    branding TEXT NOT NULL DEFAULT '{}',
    default_timezone TEXT NOT NULL DEFAULT 'UTC',
    week_starts_on TEXT NOT NULL DEFAULT 'mon',
    default_locale TEXT NOT NULL DEFAULT 'en',
    settings TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    twofa_secret_vault_ref TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS workspace_member (
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    scoped_account_ids TEXT,
    invited_at INTEGER NOT NULL,
    accepted_at INTEGER,
    PRIMARY KEY (workspace_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS workspace_invitation (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    accepted_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS api_token (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    user_id TEXT,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    scopes TEXT NOT NULL DEFAULT '[]',
    last_used_at INTEGER,
    expires_at INTEGER,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_event (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    actor_user_id TEXT,
    actor_token_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    payload TEXT NOT NULL DEFAULT '{}',
    ip TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS audit_event_ws_idx ON audit_event(workspace_id, created_at)`,

  // ─── Channels ─────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS channel_family (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "group" TEXT NOT NULL,
    auth_kind TEXT NOT NULL,
    capability_schema_version INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    adapter_module TEXT NOT NULL,
    capabilities TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE TABLE IF NOT EXISTS channel_account (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    family_id TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    handle TEXT,
    avatar_url TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    credentials_vault_ref TEXT,
    scopes TEXT NOT NULL DEFAULT '[]',
    token_expires_at INTEGER,
    refresh_strategy TEXT NOT NULL DEFAULT 'auto',
    authorized INTEGER NOT NULL DEFAULT 1,
    last_authorized_at INTEGER,
    last_unauthorized_at INTEGER,
    disabled_at INTEGER,
    capabilities_snapshot TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    UNIQUE (workspace_id, family_id, provider_account_id)
  )`,
  `CREATE TABLE IF NOT EXISTS channel_account_health (
    channel_account_id TEXT PRIMARY KEY,
    last_probe_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '{}'
  )`,

  // ─── Content ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS post (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    author_user_id TEXT,
    editorial_status TEXT NOT NULL DEFAULT 'drafting',
    publish_status TEXT NOT NULL DEFAULT 'unscheduled',
    scheduled_at INTEGER,
    published_at INTEGER,
    idempotency_key TEXT,
    campaign_id TEXT,
    template_id TEXT,
    bulk_import_batch_id TEXT,
    recurrence_id TEXT,
    parent_post_id TEXT,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (workspace_id, idempotency_key)
  )`,
  `CREATE INDEX IF NOT EXISTS post_ws_status_idx ON post(workspace_id, publish_status, scheduled_at)`,

  `CREATE TABLE IF NOT EXISTS post_account (
    post_id TEXT NOT NULL,
    channel_account_id TEXT NOT NULL,
    provider_post_id TEXT,
    provider_data TEXT NOT NULL DEFAULT '{}',
    errors TEXT NOT NULL DEFAULT '[]',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER,
    publish_state TEXT NOT NULL DEFAULT 'pending',
    dispatched_at INTEGER,
    PRIMARY KEY (post_id, channel_account_id)
  )`,
  `CREATE INDEX IF NOT EXISTS post_account_state_idx ON post_account(publish_state)`,

  `CREATE TABLE IF NOT EXISTS post_variant (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    channel_account_id TEXT,
    is_original INTEGER NOT NULL DEFAULT 0,
    locale TEXT,
    blocks TEXT NOT NULL DEFAULT '[]',
    options TEXT NOT NULL DEFAULT '{}',
    metadata TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE INDEX IF NOT EXISTS post_variant_post_idx ON post_variant(post_id)`,

  `CREATE TABLE IF NOT EXISTS post_label (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    kind TEXT NOT NULL DEFAULT 'tag',
    UNIQUE (workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS post_label_pivot (
    post_id TEXT NOT NULL,
    label_id TEXT NOT NULL,
    PRIMARY KEY (post_id, label_id)
  )`,

  `CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    disk TEXT NOT NULL DEFAULT 'local',
    path TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    alt_text TEXT,
    transcript TEXT,
    conversions TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT 'upload',
    source_ref TEXT,
    size_total INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS post_media_pivot (
    variant_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    block_index INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'primary',
    PRIMARY KEY (variant_id, media_id, position, block_index)
  )`,

  `CREATE TABLE IF NOT EXISTS post_activity (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    actor_user_id TEXT,
    event TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    reactions TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS post_activity_post_idx ON post_activity(post_id, created_at)`,

  // ─── Calendar / queues ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS queue (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    default_timezone TEXT NOT NULL DEFAULT 'UTC',
    default_locale TEXT NOT NULL DEFAULT 'en',
    priority INTEGER NOT NULL DEFAULT 0,
    paused INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS queue_slot (
    id TEXT PRIMARY KEY,
    queue_id TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    time_of_day TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS queue_account (
    queue_id TEXT NOT NULL,
    channel_account_id TEXT NOT NULL,
    PRIMARY KEY (queue_id, channel_account_id)
  )`,
  `CREATE TABLE IF NOT EXISTS queue_entry (
    id TEXT PRIMARY KEY,
    queue_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    slot_id TEXT,
    resolved_for_datetime INTEGER,
    position INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'pending'
  )`,
  `CREATE INDEX IF NOT EXISTS queue_entry_q_idx ON queue_entry(queue_id, state, resolved_for_datetime)`,
  `CREATE TABLE IF NOT EXISTS blackout_window (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    channel_account_id TEXT,
    starts_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    reason TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS recurrence (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    rule TEXT NOT NULL,
    template_id TEXT,
    source_post_id TEXT,
    until_at INTEGER,
    next_run_at INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS recurrence_next_idx ON recurrence(active, next_run_at)`,
  `CREATE TABLE IF NOT EXISTS bulk_import_batch (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    source TEXT NOT NULL,
    source_ref TEXT,
    total_rows INTEGER NOT NULL DEFAULT 0,
    succeeded_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,

  // ─── Campaigns / templates / recycling / A/B ──────────────────────────────
  `CREATE TABLE IF NOT EXISTS campaign (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    starts_at INTEGER,
    ends_at INTEGER,
    utm_template_id TEXT,
    goals TEXT NOT NULL DEFAULT '{}',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS template (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    blocks TEXT NOT NULL DEFAULT '[]',
    variables TEXT NOT NULL DEFAULT '{}',
    applicable_families TEXT NOT NULL DEFAULT '[]',
    created_by_user_id TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS hashtag_group (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    hashtags TEXT NOT NULL DEFAULT '[]',
    applicable_families TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS dynamic_variable (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '{}',
    cache_ttl_seconds INTEGER NOT NULL DEFAULT 60,
    UNIQUE (workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS evergreen_pool (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    cooldown_days INTEGER NOT NULL DEFAULT 30,
    max_publish_count INTEGER NOT NULL DEFAULT 0,
    applicable_queue_ids TEXT NOT NULL DEFAULT '[]',
    paused INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS evergreen_pool_member (
    pool_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    published_count INTEGER NOT NULL DEFAULT 0,
    last_published_at INTEGER,
    retired_at INTEGER,
    PRIMARY KEY (pool_id, post_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ab_variant_set (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    campaign_id TEXT,
    winner_metric TEXT NOT NULL DEFAULT 'engagement_rate',
    evaluation_window_hours INTEGER NOT NULL DEFAULT 24,
    auto_pause_loser INTEGER NOT NULL DEFAULT 0,
    decided_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ab_variant_member (
    set_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    arm_label TEXT NOT NULL,
    share REAL NOT NULL DEFAULT 0.5,
    PRIMARY KEY (set_id, post_id)
  )`,

  // ─── Links ────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS utm_template (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    source_template TEXT,
    medium_template TEXT,
    campaign_template TEXT,
    term_template TEXT,
    content_template TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS tracked_link (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    post_id TEXT,
    variant_id TEXT,
    original_url TEXT NOT NULL,
    utm_resolved_url TEXT NOT NULL,
    short_code TEXT,
    provider_short_url TEXT,
    clicks_count INTEGER NOT NULL DEFAULT 0,
    last_clicked_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS link_shortener_provider (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    credentials_vault_ref TEXT,
    is_default INTEGER NOT NULL DEFAULT 0
  )`,

  // ─── Locale + targeting ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS locale_variant_policy (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    channel_account_id TEXT,
    locale TEXT NOT NULL,
    fallback_locale TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS audience_segment (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    channel_account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    criteria TEXT NOT NULL DEFAULT '{}'
  )`,

  // ─── Analytics ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS account_metric_daily (
    channel_account_id TEXT NOT NULL,
    date TEXT NOT NULL,
    metrics TEXT NOT NULL DEFAULT '{}',
    audience_total INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (channel_account_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS post_metric (
    post_id TEXT NOT NULL,
    channel_account_id TEXT NOT NULL,
    captured_at INTEGER NOT NULL,
    metrics TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (post_id, channel_account_id, captured_at)
  )`,
  `CREATE TABLE IF NOT EXISTS report (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    schedule_cron TEXT,
    recipients TEXT NOT NULL DEFAULT '[]',
    last_generated_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS report_export (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    format TEXT NOT NULL,
    disk TEXT NOT NULL DEFAULT 'local',
    path TEXT NOT NULL,
    size INTEGER NOT NULL,
    generated_at INTEGER NOT NULL
  )`,

  // ─── Imported posts / inbox ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS imported_post (
    id TEXT PRIMARY KEY,
    channel_account_id TEXT NOT NULL,
    provider_post_id TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    media_refs TEXT NOT NULL DEFAULT '[]',
    published_at INTEGER NOT NULL,
    metrics_snapshot TEXT NOT NULL DEFAULT '{}',
    UNIQUE (channel_account_id, provider_post_id)
  )`,
  `CREATE TABLE IF NOT EXISTS inbox_thread (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    channel_account_id TEXT NOT NULL,
    provider_thread_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    subject_post_id TEXT,
    last_message_at INTEGER NOT NULL,
    unread_count INTEGER NOT NULL DEFAULT 0,
    assigned_user_id TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    UNIQUE (channel_account_id, provider_thread_id)
  )`,
  `CREATE TABLE IF NOT EXISTS inbox_message (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    sender TEXT NOT NULL DEFAULT '{}',
    body TEXT NOT NULL DEFAULT '',
    media_refs TEXT NOT NULL DEFAULT '[]',
    provider_message_id TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS inbox_rule (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    match TEXT NOT NULL DEFAULT '{}',
    action TEXT NOT NULL DEFAULT '{}',
    priority INTEGER NOT NULL DEFAULT 0
  )`,

  // ─── Approvals ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS approval_workflow (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    stages TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS post_approval (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    current_stage_index INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    finalized_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS post_approval_decision (
    id TEXT PRIMARY KEY,
    approval_id TEXT NOT NULL,
    stage_index INTEGER NOT NULL,
    reviewer_user_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    comment TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS external_reviewer_link (
    id TEXT PRIMARY KEY,
    approval_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    email TEXT,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  )`,

  // ─── Webhooks / integrations / AI ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS webhook (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    callback_url TEXT NOT NULL,
    http_method TEXT NOT NULL DEFAULT 'POST',
    content_type TEXT NOT NULL DEFAULT 'application/json',
    events TEXT NOT NULL DEFAULT '[]',
    secret_vault_ref TEXT NOT NULL,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS webhook_delivery (
    id TEXT PRIMARY KEY,
    webhook_id TEXT NOT NULL,
    event_name TEXT NOT NULL,
    event_id TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    attempt INTEGER NOT NULL DEFAULT 1,
    request_headers TEXT NOT NULL DEFAULT '{}',
    response_status INTEGER,
    response_headers TEXT NOT NULL DEFAULT '{}',
    response_body TEXT,
    delivered_at INTEGER,
    failed_at INTEGER,
    next_retry_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS webhook_delivery_hook_idx ON webhook_delivery(webhook_id, delivered_at)`,
  `CREATE TABLE IF NOT EXISTS integration_service (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    provider TEXT NOT NULL,
    credentials_vault_ref TEXT NOT NULL,
    default_for_kind INTEGER NOT NULL DEFAULT 0,
    config TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ai_brand_voice (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    style_directives TEXT NOT NULL DEFAULT '{}',
    is_default INTEGER NOT NULL DEFAULT 0
  )`,

  // ─── Jobs / pipeline ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS job (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    batch_id TEXT,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    state TEXT NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    available_at INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS job_state_idx ON job(state, available_at)`,
  `CREATE TABLE IF NOT EXISTS job_batch (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    target_id TEXT,
    total INTEGER NOT NULL DEFAULT 0,
    succeeded INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'open',
    finalized_at INTEGER,
    created_at INTEGER NOT NULL
  )`,

  // ─── Settings + system ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS setting (
    scope TEXT NOT NULL,
    workspace_id TEXT,
    key TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (scope, workspace_id, key)
  )`,
  `CREATE TABLE IF NOT EXISTS system_status (
    id INTEGER PRIMARY KEY,
    last_checked_at INTEGER NOT NULL,
    data TEXT NOT NULL DEFAULT '{}'
  )`,

  // ─── Migrations bookkeeping ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS publishing_migrations (
    name TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`,
];
