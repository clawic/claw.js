import { z } from "zod";

export const editorialStatus = z.enum([
  "idea",
  "drafting",
  "in_review",
  "ready",
  "archived",
  "published",
]);

export const publishStatus = z.enum([
  "unscheduled",
  "scheduled",
  "queued",
  "publishing",
  "partially_published",
  "published",
  "failed",
  "cancelled",
  "deleted",
]);

export const role = z.enum(["owner", "admin", "editor", "member", "guest"]);

export const postBlock = z.object({
  body: z.string(),
  url: z.string().url().optional(),
  media_ids: z.array(z.string()).optional(),
  video_thumb_overrides: z
    .array(z.object({ media_id: z.string(), thumb_media_id: z.string() }))
    .optional(),
  poll: z
    .object({
      question: z.string(),
      options: z.array(z.string()),
      duration_seconds: z.number().int().positive(),
    })
    .optional(),
  mentions: z
    .array(
      z.object({
        handle: z.string(),
        provider_id: z.string().optional(),
        range: z.tuple([z.number().int(), z.number().int()]),
      }),
    )
    .optional(),
  hashtags: z.array(z.string()).optional(),
  link_card: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      image_media_id: z.string().optional(),
      fetched_at: z.string().optional(),
    })
    .optional(),
});

export const variantSpec = z.object({
  is_original: z.boolean().optional(),
  channel_account_id: z.string().nullable().optional(),
  locale: z.string().nullable().optional(),
  blocks: z.array(postBlock).min(1),
  options: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const scheduleSpec = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("datetime"),
    at: z.string(),
    timezone: z.string().optional(),
  }),
  z.object({ kind: z.literal("now") }),
  z.object({ kind: z.literal("queue"), queue_id: z.string() }),
  z.object({ kind: z.literal("unscheduled") }),
]);

export const postSpec = z.object({
  idempotency_key: z.string().nullable().optional(),
  campaign_id: z.string().nullable().optional(),
  template_id: z.string().nullable().optional(),
  labels: z.array(z.string()).optional(),
  accounts: z.array(z.string()).min(1),
  editorial_status: editorialStatus.optional(),
  schedule: scheduleSpec.optional(),
  approval: z.object({ workflow_id: z.string().nullable().optional() }).optional(),
  variants: z.array(variantSpec).min(1),
});

export const queueSlotInput = z.object({
  day_of_week: z.number().int().min(0).max(6),
  time_of_day: z.string().regex(/^\d{2}:\d{2}$/),
  enabled: z.boolean().optional(),
});

export const queueInput = z.object({
  name: z.string(),
  description: z.string().optional(),
  default_timezone: z.string().optional(),
  default_locale: z.string().optional(),
  priority: z.number().int().optional(),
});

export const recurrenceInput = z.object({
  name: z.string(),
  rule: z.string(), // RRULE
  template_id: z.string().nullable().optional(),
  source_post_id: z.string().nullable().optional(),
  until_at: z.string().nullable().optional(),
});

export const webhookInput = z.object({
  name: z.string(),
  callback_url: z.string().url(),
  http_method: z.enum(["POST", "PUT"]).optional(),
  content_type: z.enum(["application/json", "application/x-www-form-urlencoded"]).optional(),
  events: z.array(z.string()).min(1),
  secret: z.string().optional(),
  max_attempts: z.number().int().optional(),
});

export const labelInput = z.object({
  name: z.string(),
  color: z.string().optional(),
  kind: z.enum(["tag", "category", "priority"]).optional(),
});

export const campaignInput = z.object({
  name: z.string(),
  description: z.string().optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  utm_template_id: z.string().nullable().optional(),
  goals: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

export const templateInput = z.object({
  name: z.string(),
  blocks: z.array(postBlock).min(1),
  variables: z.record(z.unknown()).optional(),
  applicable_families: z.array(z.string()).optional(),
});

export const channelAccountInput = z.object({
  family_id: z.string(),
  provider_account_id: z.string(),
  display_name: z.string(),
  handle: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  credentials_vault_ref: z.string().optional(),
  scopes: z.array(z.string()).optional(),
});

export const workspaceInput = z.object({
  name: z.string(),
  slug: z.string().optional(),
  default_timezone: z.string().optional(),
  default_locale: z.string().optional(),
  branding: z.record(z.unknown()).optional(),
});

export const memberInput = z.object({
  email: z.string().email(),
  role: role,
  scoped_account_ids: z.array(z.string()).nullable().optional(),
});

export const approvalWorkflowInput = z.object({
  name: z.string(),
  stages: z
    .array(
      z.object({
        order: z.number().int(),
        name: z.string(),
        required_role: role.optional(),
        required_user_ids: z.array(z.string()).optional(),
        all_required: z.boolean().optional(),
      }),
    )
    .min(1),
});

export const tokenInput = z.object({
  name: z.string(),
  scopes: z.array(z.string()).optional(),
  expires_at: z.string().nullable().optional(),
});

export type PostSpec = z.infer<typeof postSpec>;
export type QueueInput = z.infer<typeof queueInput>;
export type WebhookInput = z.infer<typeof webhookInput>;
