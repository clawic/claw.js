// @clawjs/index — structured capture of agent-read internet.
//
// The full implementation (HTTP routes, SQLite store, scheduler, alert
// evaluator, MCP tools, cron parser, type schemas for the 16 canonical
// entities — Product, Listing, Article, Post, Video, Episode, Paper,
// Profile, Place, Channel, Doc, Repo, Event, Job, Intent, Review — and bearer
// auth) lives in sibling modules and is loaded via `buildIndexApp` by
// `bin/index-server-launcher.mjs` in @clawjs/cli. The macOS Clawix
// supervisor spawns this on `127.0.0.1:7796` once the daemon-bundled
// `node_modules/@clawjs/cli/bin/index-server-launcher.mjs` is present.
//
// This file is the entry surface that supervisor scripts and bundled
// dependents import.
export * from "./app.ts";
export * from "./auth.ts";
export * from "./client.ts";
export * from "./config.ts";
export * from "./cron.ts";
export * from "./alerts.ts";
export * from "./mp-store.ts";
export * from "./mp-types.ts";
export * from "./realtime.ts";
export * from "./scheduler.ts";
export * from "./store.ts";
export * from "./types.ts";
export { canonicalTypes, getCanonicalByName } from "./schema/registry.ts";
