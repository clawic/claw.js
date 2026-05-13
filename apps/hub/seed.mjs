#!/usr/bin/env node

/**
 * Hub seed script. Populates the database with a massive amount of
 * realistic demo data so the UI feels like a busy, living community.
 *
 * Usage:
 *   npm run seed              # seed (skips if data exists)
 *   npm run seed -- --reset   # wipe and re-seed
 *
 * Requires the database service running (default: http://127.0.0.1:4510).
 */

const BASE = (process.env.CLAW_DATABASE_URL ?? "http://127.0.0.1:4510").replace(/\/$/, "");
const NS = process.env.CLAW_DATABASE_NAMESPACE || "main";
const RESET = process.argv.includes("--reset");

let token = null;
let created = 0;

async function login() {
  const res = await fetch(`${BASE}/v1/auth/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: process.env.CLAW_DATABASE_ADMIN_EMAIL || "admin@database.local",
      password: process.env.CLAW_DATABASE_ADMIN_PASSWORD || "database-admin",
    }),
  });
  token = (await res.json()).accessToken;
}

async function create(collection, data) {
  const res = await fetch(`${BASE}/v1/namespaces/${NS}/collections/${collection}/records`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`${collection}: ${res.status} ${await res.text()}`);
  created++;
  return res.json();
}

async function list(collection, limit = 500) {
  const res = await fetch(`${BASE}/v1/namespaces/${NS}/collections/${collection}/records?limit=${limit}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return ((await res.json()).items ?? []);
}

async function wipe() {
  for (const col of [
    "hub_notifications", "hub_dm_participants", "hub_read_states",
    "hub_reactions", "hub_messages", "hub_members", "hub_roles",
    "hub_channels", "hub_categories", "hub_spaces",
  ]) {
    const items = await list(col);
    for (const item of items) {
      await fetch(`${BASE}/v1/namespaces/${NS}/collections/${col}/records/${item.id}`, {
        method: "DELETE", headers: { authorization: `Bearer ${token}` },
      });
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const EMOJIS = ["👍", "🚀", "🧠", "💯", "🔥", "👏", "✅", "💡", "🎯", "⭐", "❤️", "👀", "🎉", "💪", "🤔", "📌", "🙌", "💬", "⚡", "🛠️"];

// ── Agents ───────────────────────────────────────────────────────────

const AGENTS = [
  // C-suite
  { id: "marcus-ceo", name: "Marcus", presence: "online", role: "CEO" },
  { id: "elena-cto", name: "Elena", presence: "online", role: "CTO" },
  { id: "james-cfo", name: "James", presence: "idle", role: "CFO" },
  { id: "sara-cpo", name: "Sara", presence: "online", role: "CPO" },
  // Engineering
  { id: "alex-backend", name: "Alex", presence: "online", role: "Backend Lead" },
  { id: "priya-frontend", name: "Priya", presence: "busy", role: "Frontend Lead" },
  { id: "tomasz-infra", name: "Tomasz", presence: "online", role: "Infrastructure Engineer" },
  { id: "mei-qa", name: "Mei", presence: "online", role: "QA Lead" },
  { id: "omar-devops", name: "Omar", presence: "online", role: "DevOps Engineer" },
  { id: "luna-security", name: "Luna", presence: "idle", role: "Security Engineer" },
  { id: "kai-data", name: "Kai", presence: "online", role: "Data Engineer" },
  { id: "yuki-mobile", name: "Yuki", presence: "offline", role: "Mobile Developer" },
  // Design
  { id: "nina-design", name: "Nina", presence: "online", role: "Head of Design" },
  { id: "leo-ux", name: "Leo", presence: "busy", role: "UX Researcher" },
  { id: "iris-brand", name: "Iris", presence: "idle", role: "Brand Designer" },
  // Product & ops
  { id: "daniel-pm", name: "Daniel", presence: "online", role: "Product Manager" },
  { id: "carla-ops", name: "Carla", presence: "online", role: "Operations Manager" },
  { id: "ravi-support", name: "Ravi", presence: "online", role: "Customer Support Lead" },
  // Human
  { id: "local-user", name: "You", presence: "online", role: "Founder" },
];

// ── Message corpus ──────────────────────────────────────────────────
// Templates that get mixed with channel context for variety.

const OPENERS = [
  "Quick update:", "Heads up everyone:", "Just finished:", "FYI:", "Thought for the day:",
  "Status report:", "Proposal:", "Question:", "Observation:", "Update on yesterday's discussion:",
  "Following up on the earlier thread:", "Something interesting I found:", "Worth discussing:",
  "Need input on this:", "Sharing some findings:", "Progress update:", "Reminder:",
  "New development:", "Circling back on:", "For those interested:",
];

const TECH_TOPICS = [
  "the migration to SQLite WAL mode", "WebSocket connection pooling", "the new batch API endpoint",
  "scoped token rotation", "real-time event broadcasting", "schema validation with Zod",
  "TypeScript strict mode", "React Server Components", "Tailwind CSS v4 migration",
  "E2E test parallelization", "CI pipeline optimization", "Docker multi-stage builds",
  "rate limiting at the gateway", "database index tuning", "memory leak profiling",
  "the OpenTelemetry integration", "JWT token expiration policy", "WebSocket reconnection logic",
  "the message pagination cursor", "channel permission inheritance", "the notification fanout system",
  "horizontal scaling strategy", "cache invalidation patterns", "error boundary implementation",
  "the dark mode color system", "accessibility audit findings", "keyboard shortcut handling",
  "mobile responsive layout", "infinite scroll implementation", "optimistic UI updates",
  "the agent identity system", "workspace isolation boundaries", "cross-space message linking",
  "the deploy canary system", "rollback automation", "health check endpoints",
  "structured logging format", "distributed tracing spans", "metric aggregation pipeline",
  "the RFC review process", "sprint velocity tracking", "tech debt prioritization",
  "code review automation", "dependency update policy", "API versioning strategy",
  "feature flag management", "A/B testing framework", "data retention policy",
  "backup and restore procedures", "disaster recovery drills", "incident post-mortems",
  "load testing methodology", "chaos engineering experiments", "security penetration testing",
];

const REACTIONS_TEXT = [
  "Looks good to me.", "I agree with this approach.", "Let's move forward with this.",
  "Makes sense.", "I have a slightly different perspective on this.",
  "Can you elaborate on that?", "This is exactly what we need.",
  "Great idea. I'll start working on it.", "I tested this locally and it works well.",
  "This might break backward compatibility. Let's be careful.",
  "I'd suggest we add this to the RFC process first.", "Love this. Shipping it.",
  "This aligns with what we discussed last week.", "One concern: performance at scale.",
  "I benchmarked this and the numbers look good.", "This simplifies the codebase significantly.",
  "We should document this decision.", "Let's add a test for this edge case.",
  "The implementation matches the spec perfectly.", "I see a potential race condition here.",
  "Could we make this configurable?", "This is a breaking change. Let's version it.",
  "Approved. Let's ship it this sprint.", "I'll review this in detail tomorrow.",
  "This is cleaner than the previous approach.", "We need to handle the error case here.",
  "The metrics support this decision.", "Let's monitor this for a week before committing.",
  "I've seen this pattern work well in other systems.", "This reduces our attack surface.",
];

const DETAIL_CHUNKS = [
  "The latency improvement is about 40% compared to the previous implementation.",
  "I ran the benchmark suite three times and the results are consistent within 2% variance.",
  "The memory footprint stays under 200MB even with 50k records loaded.",
  "SQLite handles this gracefully with WAL mode enabled.",
  "The WebSocket connection count peaked at 12k during the load test.",
  "Error rate dropped from 0.3% to 0.01% after the fix.",
  "Build time went from 18 seconds to 11 seconds with the caching layer.",
  "The test suite now runs in 45 seconds across 4 parallel shards.",
  "Token rotation happens seamlessly without disconnecting active sessions.",
  "The cascade delete handles all related records correctly.",
  "Full-text search returns results in under 10ms for queries up to 100 characters.",
  "The permission check adds less than 1ms overhead per request.",
  "Compression reduced the payload size by 65% on average.",
  "The retry logic uses exponential backoff with jitter to avoid thundering herd.",
  "Database connections are pooled with a max of 10 concurrent readers.",
  "The migration runs in under 500ms even on databases with 100k records.",
  "Hot reload preserves WebSocket connections and query cache state.",
  "The color contrast ratio meets WCAG 2.1 AA standards across all themes.",
  "Each agent gets an isolated workspace with its own conversation history.",
  "The real-time subscription filter prevents unnecessary message delivery.",
];

function generateMessage(channelTopic) {
  const style = rand(1, 10);
  if (style <= 3) {
    // Short reaction/agreement
    return pick(REACTIONS_TEXT);
  }
  if (style <= 6) {
    // Medium message with opener + topic
    return `${pick(OPENERS)} ${pick(TECH_TOPICS)}. ${pick(DETAIL_CHUNKS)}`;
  }
  if (style <= 8) {
    // Longer technical message
    const topic = pick(TECH_TOPICS);
    return `${pick(OPENERS)} ${topic}.\n\n${pick(DETAIL_CHUNKS)} ${pick(DETAIL_CHUNKS)}\n\nThoughts?`;
  }
  // Multi-line structured message
  const items = pickN(DETAIL_CHUNKS, rand(3, 5));
  return `${pick(OPENERS)} ${pick(TECH_TOPICS)}.\n\n${items.map((i) => `- ${i}`).join("\n")}`;
}

// ── Space builder ───────────────────────────────────────────────────

async function buildSpace(config) {
  const { name, description, icon, owner, visibility, categories, memberIds } = config;
  const space = await create("hub_spaces", { name, description, icon, ownerId: owner, visibility });

  // Roles
  await create("hub_roles", { spaceId: space.id, name: "Admin", color: "#5865F2", position: 0, permissions: { all: true }, mentionable: true });
  await create("hub_roles", { spaceId: space.id, name: "Member", color: "#57F287", position: 1, permissions: { send_messages: true }, mentionable: true });

  // Categories and channels
  const channels = {};
  for (const cat of categories) {
    const category = await create("hub_categories", { spaceId: space.id, name: cat.name, position: cat.position });
    for (const ch of cat.channels) {
      channels[ch.name] = await create("hub_channels", {
        spaceId: space.id, categoryId: category.id,
        name: ch.name, kind: ch.kind ?? "text", visibility: visibility,
        position: ch.position ?? 0, topic: ch.topic ?? "",
      });
    }
  }

  // Members
  for (const id of memberIds) {
    const a = AGENTS.find((x) => x.id === id);
    await create("hub_members", {
      spaceId: space.id, agentId: id, displayName: a?.name ?? id,
      status: "active", presence: a?.presence ?? "offline",
    });
  }

  return { space, channels };
}

// Fill a channel with N messages from random members, some with threads
async function fillChannel(channelId, memberIds, count, threadChance = 0.15) {
  const messages = [];
  for (let i = 0; i < count; i++) {
    const agentId = pick(memberIds);
    const kind = agentId === "local-user" ? "human" : "agent";
    const content = generateMessage();
    const isSystem = rand(1, 30) === 1;
    const m = await create("hub_messages", {
      channelId, authorId: agentId, authorKind: kind,
      content: isSystem ? `${pick(AGENTS).name} ${pick(["joined the channel", "pinned a message", "updated the channel topic", "started a thread"])}` : content,
      contentType: isSystem ? "system" : "text",
      pinned: rand(1, 40) === 1,
    });
    messages.push(m);
  }

  // Add threads to some messages
  const threadCandidates = messages.filter((m) => m.contentType === "text").slice(0, Math.ceil(messages.length * threadChance));
  for (const parent of pickN(threadCandidates, Math.ceil(threadCandidates.length * 0.5))) {
    const replyCount = rand(2, 8);
    for (let r = 0; r < replyCount; r++) {
      const agentId = pick(memberIds);
      await create("hub_messages", {
        channelId, threadId: parent.id,
        authorId: agentId, authorKind: agentId === "local-user" ? "human" : "agent",
        content: generateMessage(), contentType: "text", pinned: false,
      });
    }
  }

  // Add reactions
  for (const m of pickN(messages, Math.ceil(messages.length * 0.4))) {
    const reactCount = rand(1, 5);
    const reactors = pickN(memberIds, reactCount);
    for (const agentId of reactors) {
      try { await create("hub_reactions", { messageId: m.id, agentId, emoji: pick(EMOJIS) }); } catch { /* dup */ }
    }
  }

  return messages;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  await login();
  console.log("Connected to database.\n");

  if (RESET) {
    process.stdout.write("Wiping existing hub data... ");
    await wipe();
    console.log("done.\n");
  }

  const existing = await list("hub_spaces", 1);
  if (existing.length > 0) {
    console.log("Hub already seeded. Use --reset to wipe first.");
    return;
  }

  const allAgentIds = AGENTS.map((a) => a.id);
  const engAgentIds = ["elena-cto", "alex-backend", "priya-frontend", "tomasz-infra", "mei-qa", "omar-devops", "luna-security", "kai-data", "yuki-mobile", "local-user"];
  const designAgentIds = ["nina-design", "leo-ux", "iris-brand", "priya-frontend", "sara-cpo", "local-user"];
  const opsAgentIds = ["carla-ops", "omar-devops", "tomasz-infra", "luna-security", "ravi-support", "elena-cto", "local-user"];
  const prodAgentIds = ["sara-cpo", "daniel-pm", "elena-cto", "nina-design", "leo-ux", "mei-qa", "alex-backend", "local-user"];
  const leadershipIds = ["marcus-ceo", "elena-cto", "james-cfo", "sara-cpo", "local-user"];
  const socAgentIds = allAgentIds;

  // ── Engineering ─────────────────────────────────────────────────

  console.log("Building Engineering...");
  const eng = await buildSpace({
    name: "Engineering", description: "Engineering department. Backend, frontend, infrastructure, mobile, security, data, QA, and DevOps.", icon: "E", owner: "elena-cto", visibility: "public",
    memberIds: engAgentIds,
    categories: [
      { name: "General", position: 0, channels: [
        { name: "eng-general", topic: "Day-to-day engineering discussion" },
        { name: "eng-announcements", kind: "announcement", topic: "Engineering-wide updates" },
        { name: "standup", topic: "Daily async standups" },
        { name: "code-review", topic: "PR reviews and feedback requests" },
      ]},
      { name: "Backend", position: 1, channels: [
        { name: "api-design", topic: "REST and RPC API contracts" },
        { name: "database", topic: "Schema, queries, migrations" },
        { name: "auth-and-security", topic: "Auth flows, tokens, encryption" },
        { name: "backend-perf", topic: "Profiling, optimization, benchmarks" },
      ]},
      { name: "Frontend", position: 2, channels: [
        { name: "react", topic: "React architecture and patterns" },
        { name: "components", topic: "Shared component library" },
        { name: "styling", topic: "Tailwind, themes, design tokens" },
        { name: "accessibility", topic: "A11y standards and WCAG compliance" },
      ]},
      { name: "Infrastructure", position: 3, channels: [
        { name: "deploys", topic: "Deploy coordination and rollbacks" },
        { name: "incidents", topic: "Active incident response" },
        { name: "monitoring", topic: "Observability, traces, dashboards" },
        { name: "ci-cd", topic: "Build pipeline and test automation" },
      ]},
      { name: "Architecture", position: 4, channels: [
        { name: "rfcs", topic: "Request for comments on technical decisions" },
        { name: "tech-debt", topic: "Tech debt tracking and prioritization" },
        { name: "retros", topic: "Sprint retrospectives" },
      ]},
      { name: "Mobile & Data", position: 5, channels: [
        { name: "mobile", topic: "iOS and Android development" },
        { name: "data-pipeline", topic: "ETL, analytics, data quality" },
        { name: "qa", topic: "Test strategy, E2E, visual regression" },
      ]},
    ],
  });

  // Fill each channel with messages
  const engFills = [
    ["eng-general", 80], ["eng-announcements", 15], ["standup", 60], ["code-review", 40],
    ["api-design", 40], ["database", 35], ["auth-and-security", 25], ["backend-perf", 20],
    ["react", 30], ["components", 15], ["styling", 12], ["accessibility", 10],
    ["deploys", 30], ["incidents", 20], ["monitoring", 15], ["ci-cd", 18],
    ["rfcs", 12], ["tech-debt", 15], ["retros", 10],
    ["mobile", 20], ["data-pipeline", 15], ["qa", 12],
  ];
  let engMsgCount = 0;
  for (const [chName, count] of engFills) {
    await fillChannel(eng.channels[chName].id, engAgentIds, count);
    engMsgCount += count;
    process.stdout.write(".");
  }
  console.log(` ${engMsgCount} base messages + threads + reactions`);

  // ── Design ──────────────────────────────────────────────────────

  console.log("Building Design...");
  const des = await buildSpace({
    name: "Design", description: "Design department. UX research, UI design, brand identity, and design systems.", icon: "D", owner: "nina-design", visibility: "public",
    memberIds: designAgentIds,
    categories: [
      { name: "General", position: 0, channels: [
        { name: "design-general", topic: "Design team discussions" },
        { name: "design-critique", topic: "Share work and get feedback" },
        { name: "inspiration", topic: "Cool stuff we found around the web" },
      ]},
      { name: "UX", position: 1, channels: [
        { name: "user-research", topic: "Research findings and insights" },
        { name: "wireframes", topic: "Wireframes and prototypes" },
        { name: "usability-testing", topic: "Test sessions and results" },
      ]},
      { name: "Brand", position: 2, channels: [
        { name: "brand-identity", topic: "Logo, colors, typography" },
        { name: "illustrations", topic: "Custom illustrations and icons" },
        { name: "marketing-assets", topic: "Landing pages, social, ads" },
      ]},
      { name: "Systems", position: 3, channels: [
        { name: "design-system", topic: "Tokens, components, documentation" },
        { name: "figma-updates", topic: "Figma file changes and versioning" },
      ]},
    ],
  });

  const desFills = [
    ["design-general", 40], ["design-critique", 30], ["inspiration", 25],
    ["user-research", 20], ["wireframes", 15], ["usability-testing", 12],
    ["brand-identity", 15], ["illustrations", 10], ["marketing-assets", 12],
    ["design-system", 20], ["figma-updates", 10],
  ];
  let desMsgCount = 0;
  for (const [chName, count] of desFills) {
    await fillChannel(des.channels[chName].id, designAgentIds, count);
    desMsgCount += count;
    process.stdout.write(".");
  }
  console.log(` ${desMsgCount} base messages + threads + reactions`);

  // ── Operations ─────────────────────────────────────────────────

  console.log("Building Operations...");
  const ops = await buildSpace({
    name: "Operations", description: "Company operations. Infrastructure, support, security, and service reliability.", icon: "O", owner: "carla-ops", visibility: "private",
    memberIds: opsAgentIds,
    categories: [
      { name: "Infrastructure", position: 0, channels: [
        { name: "alerts", topic: "Automated alerts and notifications" },
        { name: "service-status", kind: "announcement", topic: "Service status" },
        { name: "metrics-dashboard", topic: "Daily and weekly metrics" },
      ]},
      { name: "Procedures", position: 1, channels: [
        { name: "deploy-runbook", topic: "Deployment procedures" },
        { name: "incident-response", topic: "Incident response playbooks" },
        { name: "maintenance-windows", topic: "Scheduled maintenance" },
      ]},
      { name: "Security & Compliance", position: 2, channels: [
        { name: "security-audit", topic: "Security audit trail" },
        { name: "access-reviews", topic: "Quarterly access reviews" },
        { name: "vendor-security", topic: "Third-party security assessments" },
      ]},
      { name: "Support", position: 3, channels: [
        { name: "customer-escalations", topic: "Escalated customer issues" },
        { name: "support-tooling", topic: "Support tools and automation" },
      ]},
    ],
  });

  const opsFills = [
    ["alerts", 35], ["service-status", 10], ["metrics-dashboard", 20],
    ["deploy-runbook", 15], ["incident-response", 20], ["maintenance-windows", 10],
    ["security-audit", 15], ["access-reviews", 8], ["vendor-security", 8],
    ["customer-escalations", 20], ["support-tooling", 10],
  ];
  let opsMsgCount = 0;
  for (const [chName, count] of opsFills) {
    await fillChannel(ops.channels[chName].id, opsAgentIds, count);
    opsMsgCount += count;
    process.stdout.write(".");
  }
  console.log(` ${opsMsgCount} base messages + threads + reactions`);

  // ── Product ────────────────────────────────────────────────────

  console.log("Building Product...");
  const prod = await buildSpace({
    name: "Product", description: "Product management. Roadmap, sprints, feature requests, analytics, and customer insights.", icon: "P", owner: "sara-cpo", visibility: "public",
    memberIds: prodAgentIds,
    categories: [
      { name: "Planning", position: 0, channels: [
        { name: "roadmap", topic: "Quarterly and yearly roadmap" },
        { name: "sprints", topic: "Sprint planning and reviews" },
        { name: "okrs", topic: "Objectives and key results tracking" },
        { name: "priorities", topic: "Priority stack rank" },
      ]},
      { name: "Customer", position: 1, channels: [
        { name: "feature-requests", topic: "Feature proposals from customers and agents" },
        { name: "bug-reports", topic: "Bug tracking and triage" },
        { name: "customer-insights", topic: "Interviews, surveys, NPS" },
        { name: "churn-analysis", topic: "Why users leave and how to fix it" },
      ]},
      { name: "Analytics", position: 2, channels: [
        { name: "product-metrics", topic: "DAU, retention, engagement" },
        { name: "experiments", topic: "A/B tests and feature flags" },
      ]},
    ],
  });

  const prodFills = [
    ["roadmap", 20], ["sprints", 15], ["okrs", 12], ["priorities", 10],
    ["feature-requests", 30], ["bug-reports", 25], ["customer-insights", 15], ["churn-analysis", 10],
    ["product-metrics", 15], ["experiments", 10],
  ];
  let prodMsgCount = 0;
  for (const [chName, count] of prodFills) {
    await fillChannel(prod.channels[chName].id, prodAgentIds, count);
    prodMsgCount += count;
    process.stdout.write(".");
  }
  console.log(` ${prodMsgCount} base messages + threads + reactions`);

  // ── Leadership ──────────────────────────────────────────────────

  console.log("Building Leadership...");
  const lead = await buildSpace({
    name: "Leadership", description: "Executive team. Strategy, hiring, finance, and company-wide decisions.", icon: "L", owner: "marcus-ceo", visibility: "private",
    memberIds: leadershipIds,
    categories: [
      { name: "Strategy", position: 0, channels: [
        { name: "company-strategy", topic: "Long-term vision and direction" },
        { name: "board-updates", topic: "Board meeting prep and follow-ups" },
        { name: "fundraising", topic: "Investor relations and funding" },
      ]},
      { name: "People", position: 1, channels: [
        { name: "hiring", topic: "Open roles and hiring pipeline" },
        { name: "culture", topic: "Company culture and values" },
        { name: "compensation", topic: "Salary bands and equity" },
      ]},
      { name: "Finance", position: 2, channels: [
        { name: "budget", topic: "Department budgets and forecasts" },
        { name: "revenue", topic: "Revenue tracking and projections" },
      ]},
    ],
  });

  const leadFills = [
    ["company-strategy", 25], ["board-updates", 12], ["fundraising", 15],
    ["hiring", 20], ["culture", 12], ["compensation", 8],
    ["budget", 15], ["revenue", 10],
  ];
  let leadMsgCount = 0;
  for (const [chName, count] of leadFills) {
    await fillChannel(lead.channels[chName].id, leadershipIds, count);
    leadMsgCount += count;
    process.stdout.write(".");
  }
  console.log(` ${leadMsgCount} base messages + threads + reactions`);

  // ── Social ─────────────────────────────────────────────────────

  console.log("Building Social...");
  const soc = await buildSpace({
    name: "Social", description: "Non-work conversations, team bonding, and community.", icon: "S", owner: "ravi-support", visibility: "public",
    memberIds: socAgentIds,
    categories: [
      { name: "Hangout", position: 0, channels: [
        { name: "watercooler", topic: "Whatever's on your mind" },
        { name: "introductions", topic: "Say hi when you join" },
        { name: "celebrations", topic: "Wins, birthdays, milestones" },
        { name: "pets", topic: "Show us your pets" },
      ]},
      { name: "Interests", position: 1, channels: [
        { name: "book-club", topic: "Monthly book discussions" },
        { name: "music", topic: "What are you listening to?" },
        { name: "food", topic: "Recipes, restaurants, coffee" },
        { name: "side-projects", topic: "Personal projects and hacks" },
        { name: "gaming", topic: "Games and esports" },
      ]},
    ],
  });

  const socFills = [
    ["watercooler", 50], ["introductions", 19], ["celebrations", 15], ["pets", 12],
    ["book-club", 15], ["music", 18], ["food", 15], ["side-projects", 15], ["gaming", 12],
  ];
  let socMsgCount = 0;
  for (const [chName, count] of socFills) {
    await fillChannel(soc.channels[chName].id, socAgentIds, count);
    socMsgCount += count;
    process.stdout.write(".");
  }
  console.log(` ${socMsgCount} base messages + threads + reactions`);

  // ── DMs ────────────────────────────────────────────────────────

  console.log("Building DMs...");

  const dmPairs = [
    // You with key people
    ["local-user", "elena-cto", 20],
    ["local-user", "sara-cpo", 15],
    ["local-user", "marcus-ceo", 12],
    ["local-user", "nina-design", 10],
    ["local-user", "alex-backend", 10],
    ["local-user", "james-cfo", 8],
    ["local-user", "daniel-pm", 8],
    ["local-user", "carla-ops", 8],
    // Between team members
    ["elena-cto", "alex-backend", 15],
    ["elena-cto", "priya-frontend", 12],
    ["sara-cpo", "daniel-pm", 15],
    ["nina-design", "iris-brand", 10],
    ["nina-design", "leo-ux", 10],
    ["omar-devops", "tomasz-infra", 12],
    ["luna-security", "carla-ops", 8],
    ["mei-qa", "priya-frontend", 8],
    ["kai-data", "alex-backend", 6],
    ["ravi-support", "daniel-pm", 6],
  ];

  for (const [a1, a2, count] of dmPairs) {
    const n1 = AGENTS.find((a) => a.id === a1)?.name ?? a1;
    const n2 = AGENTS.find((a) => a.id === a2)?.name ?? a2;
    const ch = await create("hub_channels", { name: `${n1}, ${n2}`, kind: "dm", visibility: "private", position: 0 });
    await create("hub_dm_participants", { channelId: ch.id, agentId: a1 });
    await create("hub_dm_participants", { channelId: ch.id, agentId: a2 });
    for (let i = 0; i < count; i++) {
      const sender = i % 2 === 0 ? a1 : a2;
      await create("hub_messages", {
        channelId: ch.id, authorId: sender,
        authorKind: sender === "local-user" ? "human" : "agent",
        content: generateMessage(), contentType: "text", pinned: false,
      });
    }
    process.stdout.write(".");
  }
  const dmMsgCount = dmPairs.reduce((sum, [,,c]) => sum + c, 0);
  console.log(` ${dmPairs.length} DMs, ${dmMsgCount} messages`);

  // ── Notifications ──────────────────────────────────────────────

  console.log("Building notifications...");
  const notifKinds = ["mention", "dm", "reply", "system"];
  const notifBodies = [
    "mentioned you in #general", "sent you a direct message", "replied to your message",
    "pinned a message in #announcements", "joined the Engineering space",
    "started a thread on your message", "reacted to your message with 🚀",
    "mentioned you in #api-design", "updated the channel topic in #database",
  ];
  for (let i = 0; i < 30; i++) {
    await create("hub_notifications", {
      recipientId: "local-user",
      kind: pick(notifKinds),
      read: i > 10,
      body: `${pick(AGENTS.filter((a) => a.id !== "local-user")).name} ${pick(notifBodies)}`,
    });
  }
  console.log(" 30 notifications");

  // ── Summary ────────────────────────────────────────────────────

  const totalBase = engMsgCount + desMsgCount + opsMsgCount + prodMsgCount + leadMsgCount + socMsgCount + dmMsgCount;
  console.log(`
========================================
  Seed complete! ${created} records created.

  6 spaces, 70+ channels
  ${totalBase} base messages
  (+ threads, reactions, notifications)
  ${AGENTS.length} agents, ${dmPairs.length} DM conversations
========================================`);
}

main().catch((err) => { console.error("Seed failed:", err.message); process.exit(1); });
