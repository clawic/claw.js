// Built-in SecretTypeDeclaration catalog. ~25 vendor presets covering the
// services the user (and most others) is likely to hit. Each is purely
// declarative: fields + governance defaults. Domain executors and
// session strategies live in separate files and reference these types
// via their typeId.

import type { SecretTypeDeclaration } from "../types.ts";

const types: SecretTypeDeclaration[] = [
  // ---------- Generic / fallback ----------
  {
    typeId: "generic.api_key",
    label: "Generic API Key",
    description: "Single-secret credential injected as Bearer token by default.",
    fields: [{ name: "api_key", kind: "password", placement: "header", isSecret: true, required: true }],
    governanceDefaults: { allowedHeaders: ["Authorization"], allowInUrl: false, allowInBody: false },
    executorIds: ["broker.http"],
  },
  {
    typeId: "generic.basic_auth",
    label: "Basic Auth",
    fields: [
      { name: "username", kind: "text", placement: "none", isSecret: false, required: true },
      { name: "password", kind: "password", placement: "header", isSecret: true, required: true },
    ],
    governanceDefaults: { allowedHeaders: ["Authorization"] },
  },
  {
    typeId: "generic.oauth2",
    label: "OAuth 2.0",
    fields: [
      { name: "client_id", kind: "text", placement: "body", isSecret: false, required: true },
      { name: "client_secret", kind: "password", placement: "body", isSecret: true, required: true },
      { name: "refresh_token", kind: "password", placement: "body", isSecret: true },
      { name: "access_token", kind: "password", placement: "header", isSecret: true },
    ],
    governanceDefaults: { allowedHeaders: ["Authorization"], allowInBody: true },
    sessionStrategyId: "oauth2.refresh",
  },

  // ---------- Source control / package registries ----------
  {
    typeId: "github.pat",
    label: "GitHub Personal Access Token",
    vendor: "github",
    fields: [
      { name: "username", kind: "text", placement: "none", isSecret: false },
      { name: "token", kind: "password", placement: "header", isSecret: true, required: true },
    ],
    governanceDefaults: {
      allowedHosts: ["github.com", "api.github.com", "uploads.github.com"],
      allowedHeaders: ["Authorization", "X-GitHub-Api-Version"],
    },
    executorIds: ["git.push", "git.fetch", "github.release_create", "broker.http"],
    permissionModelId: "github.repos-and-permissions",
  },
  {
    typeId: "npm.token",
    label: "npm Access Token",
    vendor: "npm",
    fields: [{ name: "token", kind: "password", placement: "header", isSecret: true, required: true }],
    governanceDefaults: {
      allowedHosts: ["registry.npmjs.org", "registry.yarnpkg.com"],
      allowedHeaders: ["Authorization"],
    },
    executorIds: ["npm.publish", "npm.whoami", "broker.http"],
    permissionModelId: "npm.packages-and-versions",
  },
  {
    typeId: "ssh.identity",
    label: "SSH Identity (hardware-backed)",
    fields: [
      { name: "public_key", kind: "text", placement: "none", isSecret: false, required: true },
      { name: "private_key_path", kind: "text", placement: "none", isSecret: false, required: true,
        description: "Path to the openssh stub for the SK key (Secure Enclave or YubiKey)." },
      { name: "known_hosts", kind: "note", placement: "none", isSecret: false },
    ],
    executorIds: ["ssh.connect"],
  },

  // ---------- Apple ecosystem ----------
  {
    typeId: "appstoreconnect.api_key",
    label: "App Store Connect API Key",
    vendor: "apple",
    fields: [
      { name: "key_id", kind: "text", placement: "none", isSecret: false, required: true },
      { name: "issuer_id", kind: "text", placement: "none", isSecret: false, required: true },
      { name: "private_key_pem", kind: "password", placement: "none", isSecret: true, required: true },
    ],
    governanceDefaults: { allowedHosts: ["api.appstoreconnect.apple.com"] },
    executorIds: ["broker.http"],
    permissionModelId: "appstoreconnect.apps-and-actions",
    brandSyncId: "appstoreconnect.appsync",
  },
  {
    typeId: "apple.notarization",
    label: "Apple Notarization",
    vendor: "apple",
    fields: [
      { name: "apple_id", kind: "email", placement: "none", isSecret: false, required: true },
      { name: "team_id", kind: "text", placement: "none", isSecret: false, required: true },
      { name: "app_specific_password", kind: "password", placement: "none", isSecret: true, required: true,
        description: "App-specific password generated at appleid.apple.com" },
    ],
  },
  {
    typeId: "apple.ads",
    label: "Apple Search Ads",
    vendor: "apple",
    fields: [
      { name: "client_id", kind: "text", placement: "none", isSecret: false, required: true },
      { name: "team_id", kind: "text", placement: "none", isSecret: false },
      { name: "key_id", kind: "text", placement: "none", isSecret: false, required: true },
      { name: "private_key_pem", kind: "password", placement: "none", isSecret: true, required: true },
    ],
    governanceDefaults: { allowedHosts: ["api.searchads.apple.com"] },
    executorIds: ["broker.http"],
  },

  // ---------- Cloud platforms ----------
  {
    typeId: "aws.access_key",
    label: "AWS Access Key",
    vendor: "aws",
    fields: [
      { name: "access_key_id", kind: "text", placement: "none", isSecret: false, required: true },
      { name: "secret_access_key", kind: "password", placement: "none", isSecret: true, required: true },
      { name: "region", kind: "text", placement: "none", isSecret: false, defaultValue: "us-east-1" },
    ],
    sessionStrategyId: "aws.sts.assume-role",
  },
  {
    typeId: "gcp.service_account",
    label: "GCP Service Account",
    vendor: "gcp",
    fields: [
      { name: "client_email", kind: "email", placement: "none", isSecret: false, required: true },
      { name: "private_key", kind: "password", placement: "none", isSecret: true, required: true },
      { name: "project_id", kind: "text", placement: "none", isSecret: false, required: true },
    ],
    governanceDefaults: { allowedHosts: ["googleapis.com"] },
    sessionStrategyId: "oauth2.refresh",
  },

  // ---------- Communication ----------
  {
    typeId: "slack.bot_token",
    label: "Slack Bot Token",
    vendor: "slack",
    fields: [{ name: "bot_token", kind: "password", placement: "header", isSecret: true, required: true }],
    governanceDefaults: { allowedHosts: ["slack.com"], allowedHeaders: ["Authorization"] },
    executorIds: ["broker.http"],
  },
  {
    typeId: "telegram.bot_token",
    label: "Telegram Bot Token",
    vendor: "telegram",
    fields: [{ name: "bot_token", kind: "password", placement: "url", isSecret: true, required: true } as any],
    governanceDefaults: { allowedHosts: ["api.telegram.org"], allowInUrl: true },
    executorIds: ["broker.http"],
  },
  {
    typeId: "pushover.token",
    label: "Pushover",
    vendor: "pushover",
    fields: [
      { name: "app_token", kind: "password", placement: "body", isSecret: true, required: true },
      { name: "user_key", kind: "password", placement: "body", isSecret: true, required: true },
    ],
    governanceDefaults: { allowedHosts: ["api.pushover.net"], allowInBody: true },
    executorIds: ["broker.http"],
  },
  {
    typeId: "sendgrid.api_key",
    label: "SendGrid",
    vendor: "sendgrid",
    fields: [{ name: "api_key", kind: "password", placement: "header", isSecret: true, required: true }],
    governanceDefaults: { allowedHosts: ["api.sendgrid.com"], allowedHeaders: ["Authorization"] },
    executorIds: ["broker.http"],
  },
  {
    typeId: "twilio.auth",
    label: "Twilio",
    vendor: "twilio",
    fields: [
      { name: "account_sid", kind: "text", placement: "none", isSecret: false, required: true },
      { name: "auth_token", kind: "password", placement: "header", isSecret: true, required: true },
    ],
    governanceDefaults: { allowedHosts: ["api.twilio.com"], allowedHeaders: ["Authorization"] },
    executorIds: ["broker.http"],
  },

  // ---------- AI / generation ----------
  {
    typeId: "openai.api_key",
    label: "OpenAI",
    vendor: "openai",
    fields: [{ name: "api_key", kind: "password", placement: "header", isSecret: true, required: true }],
    governanceDefaults: { allowedHosts: ["api.openai.com"], allowedHeaders: ["Authorization"] },
    executorIds: ["openai.image_generate", "broker.http"],
  },

  // ---------- Payments / billing ----------
  {
    typeId: "stripe.secret_key",
    label: "Stripe",
    vendor: "stripe",
    fields: [
      { name: "secret_key", kind: "password", placement: "header", isSecret: true, required: true },
      { name: "publishable_key", kind: "text", placement: "none", isSecret: false },
      { name: "webhook_signing_secret", kind: "password", placement: "none", isSecret: true },
    ],
    governanceDefaults: { allowedHosts: ["api.stripe.com"], allowedHeaders: ["Authorization"] },
    executorIds: ["broker.http"],
  },
  {
    typeId: "revenuecat.api_key",
    label: "RevenueCat",
    vendor: "revenuecat",
    fields: [
      { name: "api_key", kind: "password", placement: "header", isSecret: true, required: true },
      { name: "project_id", kind: "text", placement: "none", isSecret: false },
      { name: "api_version", kind: "text", placement: "none", isSecret: false, defaultValue: "v2",
        description: "v1 (legacy) or v2 (current)." },
    ],
    governanceDefaults: { allowedHosts: ["api.revenuecat.com"], allowedHeaders: ["Authorization"] },
    executorIds: ["broker.http"],
  },

  // ---------- Domain / DNS ----------
  {
    typeId: "namecheap.api",
    label: "Namecheap",
    vendor: "namecheap",
    fields: [
      { name: "api_user", kind: "text", placement: "query", isSecret: false, required: true },
      { name: "api_key", kind: "password", placement: "query", isSecret: true, required: true },
      { name: "client_ip", kind: "text", placement: "query", isSecret: false, required: true },
    ],
    governanceDefaults: {
      allowedHosts: ["api.namecheap.com"],
      allowInUrl: true,
    },
    executorIds: ["broker.http"],
  },

  // ---------- Backend-as-a-service / databases-with-API ----------
  {
    typeId: "pocketbase.identity",
    label: "PocketBase",
    vendor: "pocketbase",
    fields: [
      { name: "base_url", kind: "url", placement: "none", isSecret: false, required: true },
      { name: "auth_collection", kind: "text", placement: "none", isSecret: false, defaultValue: "_superusers" },
      { name: "identity", kind: "email", placement: "body", isSecret: false, required: true },
      { name: "password", kind: "password", placement: "body", isSecret: true, required: true },
    ],
    governanceDefaults: { allowedHeaders: ["Authorization"], allowInBody: true },
    executorIds: ["broker.http"],
    sessionStrategyId: "jwt.bearer.refresh",
    permissionModelId: "pocketbase.collections",
  },
  {
    typeId: "supabase.api",
    label: "Supabase",
    vendor: "supabase",
    fields: [
      { name: "project_url", kind: "url", placement: "none", isSecret: false, required: true },
      { name: "anon_key", kind: "password", placement: "header", isSecret: true },
      { name: "service_role_key", kind: "password", placement: "header", isSecret: true },
    ],
    governanceDefaults: { allowedHeaders: ["Authorization", "apikey"] },
    executorIds: ["broker.http"],
    permissionModelId: "supabase.schemas-and-tables",
  },
  {
    typeId: "airtable.api_token",
    label: "Airtable",
    vendor: "airtable",
    fields: [{ name: "personal_access_token", kind: "password", placement: "header", isSecret: true, required: true }],
    governanceDefaults: { allowedHosts: ["api.airtable.com"], allowedHeaders: ["Authorization"] },
    executorIds: ["broker.http"],
    permissionModelId: "airtable.bases-and-tables",
  },

  // ---------- Storage / VPS ----------
  {
    typeId: "synology.api",
    label: "Synology DSM",
    vendor: "synology",
    fields: [
      { name: "host_url", kind: "url", placement: "none", isSecret: false, required: true },
      { name: "account", kind: "text", placement: "body", isSecret: false, required: true },
      { name: "password", kind: "password", placement: "body", isSecret: true, required: true },
    ],
    governanceDefaults: { allowInBody: true, allowLocalNetwork: true },
    executorIds: ["broker.http"],
  },
];

export const BUILTIN_TYPES: ReadonlyArray<SecretTypeDeclaration> = types;
