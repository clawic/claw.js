import type { CliContext } from "../parser.ts";
import { out, readFileFlag } from "../parser.ts";
import { currentWorkspaceId } from "./workspaces.ts";

export async function recurrence(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command, id] = ctx.args.positional;
  if (!command || command === "list") { out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/recurrences`)); return 0; }
  if (command === "create") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/recurrences`, {
      name: ctx.args.flags.name ?? "recurrence",
      rule: ctx.args.flags.rrule ?? "FREQ=WEEKLY",
      template_id: ctx.args.flags.template ?? null,
      source_post_id: ctx.args.flags["source-post"] ?? null,
    }));
    return 0;
  }
  if (command === "cancel") { out(ctx, await ctx.client.delete(`/v1/workspaces/${ws}/recurrences/${id}`)); return 0; }
  ctx.host.stderr.write(`unknown recurrence command: ${command}\n`);
  return 64;
}

export async function templates(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command, id] = ctx.args.positional;
  if (!command || command === "list") { out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/templates`)); return 0; }
  if (command === "create") {
    const body = readFileFlag(ctx, "file") as Record<string, unknown>;
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/templates`, body));
    return 0;
  }
  if (command === "apply") {
    const vars: Record<string, string> = {};
    for (const v of ctx.args.positional.slice(3)) {
      const [k, val] = v.split("=");
      if (k && val) vars[k] = val;
    }
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/templates/${id}/apply`, vars));
    return 0;
  }
  ctx.host.stderr.write(`unknown templates command: ${command}\n`);
  return 64;
}

export async function evergreen(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command, sub, id] = ctx.args.positional;
  if (command === "pool" && sub === "create") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/evergreen-pools`, {
      name: ctx.args.flags.name ?? "evergreen",
      cooldown_days: ctx.args.flags["cooldown-days"] ? Number(ctx.args.flags["cooldown-days"]) : undefined,
      max_publish_count: ctx.args.flags["max"] ? Number(ctx.args.flags["max"]) : undefined,
    }));
    return 0;
  }
  if (command === "pool" && sub === "add") {
    const postId = ctx.args.positional[4];
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/evergreen-pools/${id}/posts`, { post_id: postId }));
    return 0;
  }
  ctx.host.stderr.write(`unknown evergreen command: ${command}\n`);
  return 64;
}

export async function ab(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command, id] = ctx.args.positional;
  if (command === "create") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/ab-sets`, {
      winner_metric: ctx.args.flags["winner-metric"] ?? "engagement_rate",
      evaluation_window_hours: Number(ctx.args.flags["window-hours"] ?? "24"),
      auto_pause_loser: !!ctx.args.bools["auto-pause"],
      campaign_id: ctx.args.flags.campaign ?? null,
    }));
    return 0;
  }
  if (command === "add-arm") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/ab-sets/${id}/arms`, {
      post_id: ctx.args.flags.post,
      arm_label: ctx.args.flags.label ?? "a",
      share: Number(ctx.args.flags.share ?? "0.5"),
    }));
    return 0;
  }
  ctx.host.stderr.write(`unknown ab command: ${command}\n`);
  return 64;
}

export async function campaigns(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command, id] = ctx.args.positional;
  if (!command || command === "list") { out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/campaigns`)); return 0; }
  if (command === "create") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/campaigns`, {
      name: ctx.args.flags.name ?? "campaign",
      starts_at: ctx.args.flags["starts-at"] ? Date.parse(ctx.args.flags["starts-at"]) : null,
      ends_at: ctx.args.flags["ends-at"] ? Date.parse(ctx.args.flags["ends-at"]) : null,
      utm_template_id: ctx.args.flags.utm ?? null,
    }));
    return 0;
  }
  if (command === "add-post") {
    const post = ctx.args.positional[3];
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/campaigns/${id}/posts`, { post_id: post }));
    return 0;
  }
  ctx.host.stderr.write(`unknown campaigns command: ${command}\n`);
  return 64;
}

export async function labels(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command] = ctx.args.positional;
  if (!command || command === "list") { out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/labels`)); return 0; }
  if (command === "create") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/labels`, {
      name: ctx.args.flags.name ?? "label",
      color: ctx.args.flags.color,
      kind: ctx.args.flags.kind,
    }));
    return 0;
  }
  ctx.host.stderr.write(`unknown labels command: ${command}\n`);
  return 64;
}

export async function utm(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command] = ctx.args.positional;
  if (!command || command === "list") { out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/utm-templates`)); return 0; }
  if (command === "create") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/utm-templates`, {
      name: ctx.args.flags.name ?? "default",
      source_template: ctx.args.flags["source-template"],
      medium_template: ctx.args.flags["medium-template"],
      campaign_template: ctx.args.flags["campaign-template"],
      term_template: ctx.args.flags["term-template"],
      content_template: ctx.args.flags["content-template"],
    }));
    return 0;
  }
  ctx.host.stderr.write(`unknown utm command: ${command}\n`);
  return 64;
}

export async function inbox(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command, id] = ctx.args.positional;
  if (!command || command === "list") {
    const params: string[] = [];
    if (ctx.args.flags.status) params.push(`status=${ctx.args.flags.status}`);
    if (ctx.args.flags.channel) params.push(`channel=${ctx.args.flags.channel}`);
    if (ctx.args.flags.assignee) params.push(`assignee=${ctx.args.flags.assignee}`);
    out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/inbox/threads${params.length ? `?${params.join("&")}` : ""}`));
    return 0;
  }
  if (command === "show") {
    out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/inbox/threads/${id}/messages`));
    return 0;
  }
  if (command === "reply") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/inbox/threads/${id}/messages`, { body: ctx.args.flags.body ?? "" }));
    return 0;
  }
  ctx.host.stderr.write(`unknown inbox command: ${command}\n`);
  return 64;
}

export async function approvals(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command, sub] = ctx.args.positional;
  if (command === "workflows" && sub === "create") {
    const body = readFileFlag(ctx, "file") as Record<string, unknown>;
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/approvals/workflows`, body));
    return 0;
  }
  if (command === "start") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/approvals`, { post_id: ctx.args.flags.post, workflow_id: ctx.args.flags.workflow }));
    return 0;
  }
  ctx.host.stderr.write(`unknown approvals command: ${command}\n`);
  return 64;
}

export async function metrics(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, kind] = ctx.args.positional;
  if (kind === "accounts") {
    const channel = ctx.args.flags.account;
    const from = ctx.args.flags.from ?? "1970-01-01";
    const to = ctx.args.flags.to ?? "2099-01-01";
    out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/metrics/accounts?channel=${channel}&from=${from}&to=${to}`));
    return 0;
  }
  if (kind === "posts") {
    out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/metrics/posts/${ctx.args.flags.post}`));
    return 0;
  }
  ctx.host.stderr.write(`unknown metrics command: ${kind}\n`);
  return 64;
}

export async function reports(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command] = ctx.args.positional;
  if (!command || command === "list") { out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/reports`)); return 0; }
  if (command === "create") {
    const body = readFileFlag(ctx, "file") as Record<string, unknown>;
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/reports`, body));
    return 0;
  }
  ctx.host.stderr.write(`unknown reports command: ${command}\n`);
  return 64;
}

export async function suggestTime(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/suggest-time?account=${ctx.args.flags.account}`));
  return 0;
}
