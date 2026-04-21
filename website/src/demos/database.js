import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── DATABASE DEMO ───────────────────────────────────────────────────────────

export function mountDatabase(container) {
  const svgNS = "http://www.w3.org/2000/svg";
  const robo = (seed) => `https://robohash.org/${encodeURIComponent(seed)}?set=set1&size=80x80&bgset=bg2`;

  function dbIcon(d, size = 14) {
    const el = document.createElementNS(svgNS, "svg");
    el.setAttribute("viewBox", "0 0 24 24");
    el.setAttribute("width", String(size));
    el.setAttribute("height", String(size));
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", "currentColor");
    el.setAttribute("stroke-width", "2");
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    el.innerHTML = d;
    return el;
  }
  const I = {
    tasks:   '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    notes:   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>',
    people:  '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    events:  '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    inbox:   '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    memory:  '<path d="M12 2a8 8 0 0 0-8 8c0 1.5.4 2.9 1 4l-1 4 4-1c1.1.6 2.5 1 4 1a8 8 0 1 0 0-16z"/>',
    routines:'<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/>',
    images:  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    plus:    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    search:  '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    db:      '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  };

  const COLLECTIONS = [
    { id: "tasks",    name: "tasks",    icon: "tasks",    count: 24,  type: "base" },
    { id: "notes",    name: "notes",    icon: "notes",    count: 47,  type: "base" },
    { id: "people",   name: "people",   icon: "people",   count: 158, type: "base" },
    { id: "events",   name: "events",   icon: "events",   count: 12,  type: "base" },
    { id: "inbox",    name: "inbox",    icon: "inbox",    count: 89,  type: "base" },
    { id: "memory",   name: "memory",   icon: "memory",   count: 203, type: "base" },
    { id: "routines", name: "routines", icon: "routines", count: 8,   type: "base" },
    { id: "images",   name: "images",   icon: "images",   count: 36,  type: "view" },
  ];

  const AGENTS = [
    { id: "planner",  name: "Planner",  hue: "blue"   },
    { id: "devops",   name: "DevOps",   hue: "pink"   },
    { id: "designer", name: "Designer", hue: "purple" },
    { id: "tutor",    name: "Tutor",    hue: "amber"  },
    { id: "analyst",  name: "Analyst",  hue: "green"  },
  ];

  // Real face photos for people / inbox / events
  const FACE = {
    laura:  "https://randomuser.me/api/portraits/women/44.jpg",
    noel:   "https://randomuser.me/api/portraits/men/32.jpg",
    ingrid: "https://randomuser.me/api/portraits/women/65.jpg",
    anya:   "https://randomuser.me/api/portraits/women/79.jpg",
    leo:    "https://randomuser.me/api/portraits/men/86.jpg",
    owen:   "https://randomuser.me/api/portraits/men/52.jpg",
    sam:    "https://randomuser.me/api/portraits/men/75.jpg",
    hana:   "https://randomuser.me/api/portraits/women/51.jpg",
  };
  const pic = (seed) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/96/96`;

  // ── Per-collection schema: each collection picks its own columns ──
  const COLLECTIONS_CONFIG = {
    tasks: {
      columns: [
        { key: "title",  label: "title",    type: "title",   width: "minmax(0, 1fr)" },
        { key: "status", label: "status",   type: "status",  width: "84px" },
        { key: "agent",  label: "assignee", type: "chip",    width: "108px" },
        { key: "due",    label: "due",      type: "updated", width: "52px" },
      ],
      rows: [
        { id: "t_028", title: "Review Q4 docs drift",       status: "open",  agent: "designer", due: "16:00", desc: "Audit openclaw plugin docs and reconcile examples with the live API surface.", meta: [["priority", "high"], ["labels", "docs · q4"]] },
        { id: "t_027", title: "Triage onboarding feedback", status: "open",  agent: "tutor",    due: "Apr 8", desc: "Cluster the 47 onboarding survey responses and write up the top three friction points.", meta: [["priority", "med"], ["labels", "growth"]] },
        { id: "t_026", title: "Migrate auth middleware",    status: "doing", agent: "devops",   due: "Apr 9", desc: "Replace legacy session middleware with the new compliant token store.", meta: [["priority", "high"], ["labels", "infra · sec"]] },
        { id: "t_025", title: "Draft release notes",        status: "doing", agent: "analyst",  due: "Apr 10",desc: "Pull diff from main since 0.4.0 and group by feature / fix / chore.", meta: [["priority", "med"], ["labels", "release"]] },
        { id: "t_024", title: "Refactor login flow",        status: "open",  agent: "devops",   due: "Apr 11",desc: "Collapse the four entry points into one reusable challenge component.", meta: [["priority", "med"], ["labels", "ui · auth"]] },
        { id: "t_023", title: "Add dark mode toggle",       status: "open",  agent: "designer", due: "Apr 12",desc: "Surface theme preference in the workspace header next to the avatar.", meta: [["priority", "low"], ["labels", "ui"]] },
        { id: "t_022", title: "Optimize image cache",       status: "doing", agent: "devops",   due: "Apr 8", desc: "Move the resize pipeline behind a CDN-friendly cache key.", meta: [["priority", "med"], ["labels", "perf"]] },
        { id: "t_021", title: "Schema for notifications",   status: "done",  agent: "devops",   due: "Apr 6", desc: "Add a notifications table with topic + payload + read flag.", meta: [["priority", "med"], ["labels", "schema"]] },
      ],
    },
    notes: {
      columns: [
        { key: "title",   label: "title",  type: "title",   width: "minmax(0, 1fr)" },
        { key: "tag",     label: "tag",    type: "badge",   width: "82px" },
        { key: "author",  label: "author", type: "chip",    width: "108px" },
        { key: "updated", label: "upd",    type: "updated", width: "40px" },
      ],
      rows: [
        { id: "n_044", title: "Migration playbook",    tag: "runbook",  author: "devops",   updated: "1h", desc: "Step-by-step rollout for the auth middleware swap, with rollback hooks.", meta: [["words", "1.2k"]] },
        { id: "n_043", title: "Q2 OKR draft",          tag: "planning", author: "planner",  updated: "3h", desc: "Three objectives, each with two key results. Awaiting review.", meta: [["words", "640"]] },
        { id: "n_042", title: "Weekly retro · Apr 5",  tag: "retro",    author: "tutor",    updated: "2d", desc: "Wins, blockers, action items. Two follow-ups assigned.", meta: [["words", "320"]] },
        { id: "n_041", title: "API design — sessions", tag: "design",   author: "analyst",  updated: "4h", desc: "Resource shape, pagination, and the streaming endpoint contract.", meta: [["words", "1.8k"]] },
        { id: "n_040", title: "User research notes",   tag: "research", author: "designer", updated: "6h", desc: "Five interviews. Recurring pain: switching context between projects.", meta: [["words", "2.4k"]] },
        { id: "n_039", title: "Cost model v2",         tag: "finance",  author: "analyst",  updated: "1d", desc: "Updated unit economics with new inference pricing.", meta: [["words", "780"]] },
      ],
    },
    people: {
      columns: [
        { key: "person",  label: "name",    type: "avatar",  width: "minmax(0, 1fr)" },
        { key: "role",    label: "role",    type: "text",    width: "104px" },
        { key: "company", label: "company", type: "text",    width: "92px" },
      ],
      rows: [
        { id: "p_007", title: "Laura Kemp",     person: { name: "Laura Kemp",     photo: FACE.laura,  sub: "l.kemp@windmark.io" },     role: "VP Engineering",  company: "Windmark",  desc: "Owns the integration pilot. Warm and detail-oriented.", meta: [["timezone","PT"],["last","2h"]] },
        { id: "p_006", title: "Noel Briggs",    person: { name: "Noel Briggs",    photo: FACE.noel,   sub: "noel@fathomlabs.co" },     role: "Founder & CEO",   company: "Fathom",    desc: "Warm intro from Hana. Founder of Fathom Labs.", meta: [["timezone","ET"],["last","1d"]] },
        { id: "p_005", title: "Ingrid Holm",    person: { name: "Ingrid Holm",    photo: FACE.ingrid, sub: "ingrid@northvane.com" },   role: "Managing Partner",company: "Northvane", desc: "Northvane Capital. Quarterly LP report incoming.", meta: [["timezone","CET"],["last","3d"]] },
        { id: "p_004", title: "Anya Desai",     person: { name: "Anya Desai",     photo: FACE.anya,   sub: "anya@rivensys.dev" },      role: "CTO",             company: "Riven",     desc: "Technical champion for the rollout.", meta: [["timezone","IST"],["last","12h"]] },
        { id: "p_003", title: "Leo Navarro",    person: { name: "Leo Navarro",    photo: FACE.leo,    sub: "leo@vantage.io" },         role: "Head of Product", company: "Vantage",   desc: "Wants the design system audit.", meta: [["timezone","CET"],["last","6h"]] },
        { id: "p_002", title: "Owen Radcliffe", person: { name: "Owen Radcliffe", photo: FACE.owen,   sub: "owen@fieldinggroup.com" }, role: "Managing Director",company: "Fielding", desc: "Long-time advisor.", meta: [["timezone","GMT"],["last","4d"]] },
      ],
    },
    events: {
      columns: [
        { key: "title",  label: "title",     type: "title",  width: "minmax(0, 1fr)" },
        { key: "when",   label: "when",      type: "dim",    width: "98px" },
        { key: "people", label: "attendees", type: "stack",  width: "78px" },
      ],
      rows: [
        { id: "e_012", title: "Kickoff · Windmark pilot",   when: "Apr 9 · 10:00", people: [FACE.laura, FACE.noel, FACE.anya, FACE.leo],                          peopleCount: 4,  desc: "30 min. Walk through goals, success metrics, and the first milestone.", meta: [["room","Zoom"],["owner","planner"]] },
        { id: "e_011", title: "Design review",              when: "Apr 9 · 15:00", people: [FACE.leo, FACE.ingrid, FACE.anya, FACE.owen, FACE.laura, FACE.noel], peopleCount: 6,  desc: "Theme tokens, density, and the new empty states.", meta: [["room","Figma"],["owner","designer"]] },
        { id: "e_010", title: "All-hands",                  when: "Apr 11 · 17:00",people: [FACE.hana, FACE.sam, FACE.laura, FACE.noel, FACE.anya],               peopleCount: 23, desc: "Quarterly update and Q&A.", meta: [["room","Town hall"],["owner","planner"]] },
        { id: "e_009", title: "Postmortem · auth incident", when: "Apr 4 · 11:00", people: [FACE.owen, FACE.anya, FACE.leo, FACE.noel, FACE.laura],               peopleCount: 5,  desc: "Timeline, contributing factors, follow-ups.", meta: [["room","Meet"],["owner","devops"]] },
        { id: "e_008", title: "Customer dinner · Fathom",   when: "Apr 12 · 20:00",people: [FACE.noel, FACE.laura, FACE.ingrid],                                  peopleCount: 3,  desc: "Informal. Bring printed roadmap.", meta: [["room","Bestia LA"],["owner","planner"]] },
      ],
    },
    inbox: {
      columns: [
        { key: "from",    label: "from",   type: "avatar", width: "minmax(0, 1fr)" },
        { key: "source",  label: "source", type: "badge",  width: "78px" },
        { key: "updated", label: "upd",    type: "updated",width: "40px" },
      ],
      rows: [
        { id: "i_205", title: "Pilot kickoff date?",     from: { name: "Laura Kemp",  photo: FACE.laura,  sub: "Pilot kickoff date?" },     source: "slack",   updated: "5m",  desc: "Wants to confirm the pilot start date for next week.", meta: [["thread","#pilot"]] },
        { id: "i_204", title: "Term sheet feedback",     from: { name: "Noel Briggs", photo: FACE.noel,   sub: "Term sheet feedback" },     source: "email",   updated: "20m", desc: "Two minor redlines on section 4.", meta: [["thread","investors"]] },
        { id: "i_203", title: "Q2 LP update",            from: { name: "Ingrid Holm", photo: FACE.ingrid, sub: "Q2 LP update" },            source: "email",   updated: "1h",  desc: "Asking when the Q2 update goes out.", meta: [["thread","LPs"]] },
        { id: "i_202", title: "Tech review next week",   from: { name: "Anya Desai",  photo: FACE.anya,   sub: "Tech review next week" },   source: "slack",   updated: "2h",  desc: "Schedule confirmed for Tuesday.", meta: [["thread","#riven"]] },
        { id: "i_201", title: "Design tokens question",  from: { name: "Leo Navarro", photo: FACE.leo,    sub: "Design tokens question" },  source: "github",  updated: "3h",  desc: "Comment on PR #214.", meta: [["thread","#214"]] },
      ],
    },
    memory: {
      columns: [
        { key: "title",      label: "fact",       type: "title",  width: "minmax(0, 1fr)" },
        { key: "scope",      label: "scope",      type: "badge",  width: "76px" },
        { key: "confidence", label: "conf",       type: "dim",    width: "44px" },
      ],
      rows: [
        { id: "m_512", title: "User prefers concise replies", scope: "user",     confidence: "0.92", desc: "Confirmed across the last 12 sessions.", meta: [["age","persistent"]] },
        { id: "m_511", title: "Project freeze until Apr 12",  scope: "project",  confidence: "1.00", desc: "No risky merges before mobile release cut.", meta: [["expires","Apr 13"]] },
        { id: "m_510", title: "Repo uses pnpm not npm",       scope: "project",  confidence: "1.00", desc: "Detected from lockfile.", meta: [["age","persistent"]] },
        { id: "m_509", title: "Laura is the Windmark POC",    scope: "contact",  confidence: "0.97", desc: "Single point of contact for the pilot.", meta: [["age","persistent"]] },
        { id: "m_508", title: "Default model: claude-sonnet", scope: "config",   confidence: "1.00", desc: "Override per-skill if needed.", meta: [["age","persistent"]] },
      ],
    },
    routines: {
      columns: [
        { key: "title",  label: "name",   type: "title",  width: "minmax(0, 1fr)" },
        { key: "cron",   label: "cron",   type: "dim",    width: "92px" },
        { key: "status", label: "status", type: "status", width: "76px" },
      ],
      rows: [
        { id: "r_008", title: "Daily standup digest", cron: "0 9 * * *", status: "doing", desc: "Posts the previous-day summary at 09:00.",     meta: [["next","tomorrow 09:00"],["owner","tutor"]] },
        { id: "r_007", title: "Stale PR sweep",       cron: "0 10 * * 1", status: "open", desc: "Pings PR authors on inactive branches.",       meta: [["next","Mon 10:00"],["owner","devops"]] },
        { id: "r_006", title: "Cost report",          cron: "0 8 * * 1",  status: "done", desc: "Weekly inference + infra spend snapshot.",     meta: [["next","Mon 08:00"],["owner","analyst"]] },
        { id: "r_005", title: "Backup snapshot",      cron: "0 3 * * *",  status: "done", desc: "Encrypted nightly snapshot to cold storage.",  meta: [["next","tonight 03:00"],["owner","devops"]] },
      ],
    },
    images: {
      columns: [
        { key: "image", label: "image", type: "thumb", width: "minmax(0, 1fr)" },
        { key: "size",  label: "size",  type: "dim",   width: "68px" },
        { key: "kind",  label: "type",  type: "badge", width: "52px" },
      ],
      rows: [
        { id: "im_036", title: "hero-orbit.png",       image: { thumb: pic("hero"),    name: "hero-orbit.png" },     size: "248 KB", kind: "png",  desc: "1920×1080. Hero background.",         meta: [["bucket","assets"]] },
        { id: "im_035", title: "logo-mark.svg",        image: { thumb: pic("logo"),    name: "logo-mark.svg" },      size: "12 KB",  kind: "svg",  desc: "Vector · monochrome.",                meta: [["bucket","brand"]] },
        { id: "im_034", title: "og-card-april.png",    image: { thumb: pic("ogcard"),  name: "og-card-april.png" },  size: "184 KB", kind: "png",  desc: "1200×630. Awaiting copy.",            meta: [["bucket","social"]] },
        { id: "im_033", title: "onboarding-slide.png", image: { thumb: pic("onb"),     name: "onboarding-slide.png" },size: "412 KB",kind: "png",  desc: "Slide 3 of the onboarding tour.",     meta: [["bucket","onboarding"]] },
        { id: "im_032", title: "product-shot.jpg",     image: { thumb: pic("product"), name: "product-shot.jpg" },   size: "892 KB", kind: "jpg",  desc: "Marketing site hero.",                meta: [["bucket","marketing"]] },
      ],
    },
  };

  const getCfg = (id) => COLLECTIONS_CONFIG[id] || COLLECTIONS_CONFIG.tasks;
  const getRows = (id) => getCfg(id).rows;

  // ── Scripted demo actions ──
  // Inspector stays closed most of the time. Only opens on two select moments,
  // and is explicitly closed shortly after.
  const ACTIONS = [
    { kind: "select",  collection: "tasks",  row: "t_028" },
    { kind: "close" },
    { kind: "filter",  collection: "tasks",  value: "open" },
    { kind: "filter",  collection: "tasks",  value: "all" },
    { kind: "switch",  collection: "notes" },
    { kind: "switch",  collection: "people" },
    { kind: "select",  collection: "people", row: "p_007" },
    { kind: "close" },
    { kind: "switch",  collection: "events" },
    { kind: "switch",  collection: "images" },
    { kind: "switch",  collection: "tasks" },
    { kind: "create",  collection: "tasks", agent: "planner",  record: { id: "t_029", title: "Add SSO support",     status: "open",  agent: "planner",  due: "Apr 14", desc: "Wire SAML + OIDC behind the new auth middleware.", meta: [["priority","high"],["labels","auth"]] } },
    { kind: "update",  collection: "tasks", agent: "devops",   target: "t_026", patch: { status: "done" }, label: "marked complete" },
    { kind: "query",   collection: "tasks", agent: "analyst",  label: "ran query" },
    { kind: "create",  collection: "tasks", agent: "designer", record: { id: "t_030", title: "Polish empty states", status: "open",  agent: "designer", due: "Apr 15", desc: "Friendlier copy + a small illustration on each empty list.", meta: [["priority","low"],["labels","ui"]] } },
  ];

  // 2-COLUMN EXPERIENCE: db window (left) + terminal (right)
  const exp = h("div", { className: "db-experience" });

  // ── LEFT: Database window ──
  const shell = h("div", { className: "db-shell" });

  const topbar = h("div", { className: "db-topbar" },
    h("img", { className: "db-topbar__logo", src: "/logo.png", alt: "" }),
    h("span", { className: "db-topbar__brand" }, "ClawJS"),
    h("span", { className: "db-topbar__sep" }, "/"),
    h("span", { className: "db-topbar__page" }, "Database"),
    h("div", { className: "db-topbar__pill" },
      h("span", { className: "db-topbar__dot" }),
      "5 agents"
    ),
  );
  shell.append(topbar);

  const body = h("div", { className: "db-body" });

  // Sidebar
  const sidebar = h("div", { className: "db-sidebar" });
  sidebar.append(
    h("div", { className: "db-sidebar__head" },
      h("span", { className: "db-sidebar__head-icon" }, dbIcon(I.db, 12)),
      h("span", {}, "Collections"),
      h("span", { className: "db-sidebar__count" }, String(COLLECTIONS.length))
    )
  );
  const collNodes = {};
  COLLECTIONS.forEach((c) => {
    const row = h("div", {
      className: `db-coll ${c.id === "tasks" ? "db-coll--active" : ""}`,
      "data-id": c.id,
    },
      h("span", { className: "db-coll__icon" }, dbIcon(I[c.icon], 13)),
      h("span", { className: "db-coll__name" }, c.name),
      h("span", { className: "db-coll__count" }, String(c.count)),
    );
    row.addEventListener("click", () => switchCollection(c.id, true));
    collNodes[c.id] = row;
    sidebar.append(row);
  });
  sidebar.append(
    h("div", { className: "db-sidebar__add" },
      dbIcon(I.plus, 12),
      h("span", {}, "New collection")
    ),
    h("div", { className: "db-sidebar__foot" },
      h("div", { className: "db-sidebar__foot-row" }, "Realtime", h("span", { className: "db-sidebar__foot-on" }, "live")),
    )
  );
  body.append(sidebar);

  // Records
  const records = h("div", { className: "db-records" });

  const recHead = h("div", { className: "db-records__head" });
  const recTitle = h("div", { className: "db-records__title" },
    h("span", { className: "db-records__title-name" }, "tasks"),
    h("span", { className: "db-records__title-count" }, "8 records"),
  );
  recHead.append(recTitle);

  // Search input
  const search = h("div", { className: "db-records__search" },
    dbIcon(I.search, 11),
    h("span", { className: "db-records__search-input" }, ""),
    h("span", { className: "db-records__search-cursor" }),
  );
  recHead.append(search);

  const recActions = h("div", { className: "db-records__actions" });
  const filterPill = h("div", { className: "db-records__filter" },
    "status",
    h("span", { className: "db-records__filter-val" }, "all"),
  );
  filterPill.addEventListener("click", () => cycleFilter(true));
  recActions.append(filterPill);
  recActions.append(
    h("div", { className: "db-records__btn" },
      dbIcon(I.plus, 12),
      h("span", {}, "New"),
    )
  );
  recHead.append(recActions);
  records.append(recHead);

  const tableWrap = h("div", { className: "db-table" });
  const tableHead = h("div", { className: "db-table__head" });
  tableWrap.append(tableHead);
  const tbody = h("div", { className: "db-table__body" });
  tableWrap.append(tbody);
  records.append(tableWrap);
  body.append(records);

  // ── State ──
  let currentCollection = "tasks";
  let currentFilter = "all";
  let selectedRowId = null;
  let hoverPaused = false;
  let resumingFromHover = false;

  // Render a single cell based on column type
  function renderCell(col, row) {
    const cell = h("div", { className: `db-table__col db-table__col--${col.type}` });
    const v = row[col.key];
    switch (col.type) {
      case "title": {
        cell.append(
          h("div", { className: "db-row__title" }, row.title),
          h("div", { className: "db-row__id" }, row.id),
        );
        break;
      }
      case "text": {
        cell.textContent = v || "";
        break;
      }
      case "dim":
      case "updated": {
        cell.textContent = v || "";
        break;
      }
      case "status": {
        cell.append(
          h("span", { className: `db-status db-status--${v}` },
            h("span", { className: "db-status__dot" }),
            h("span", { className: "db-status__label" }, v),
          )
        );
        break;
      }
      case "chip": {
        const ag = AGENTS.find((a) => a.id === v) || { name: v || "—", hue: "gray" };
        cell.append(
          h("span", { className: `db-chip db-chip--${ag.hue}` },
            h("img", { className: "db-chip__avatar", src: robo(ag.name), alt: "" }),
            h("span", { className: "db-chip__name" }, ag.name),
          )
        );
        break;
      }
      case "avatar": {
        const p = v || {};
        cell.append(
          h("img", { className: "db-row__photo", src: p.photo || "", alt: "" }),
          h("div", { className: "db-row__person" },
            h("div", { className: "db-row__name" }, p.name || row.title),
            h("div", { className: "db-row__sub" }, p.sub || row.id),
          ),
        );
        break;
      }
      case "badge": {
        cell.append(h("span", { className: `db-badge db-badge--${v}` }, v || ""));
        break;
      }
      case "stack": {
        const arr = v || [];
        const stack = h("div", { className: "db-stack" });
        arr.slice(0, 3).forEach((src) => {
          stack.append(h("img", { className: "db-stack__avatar", src, alt: "" }));
        });
        const total = row.peopleCount || arr.length;
        if (total > 3) {
          stack.append(h("span", { className: "db-stack__more" }, "+" + (total - 3)));
        }
        cell.append(stack);
        break;
      }
      case "thumb": {
        const im = v || {};
        cell.append(
          h("img", { className: "db-row__thumb", src: im.thumb || "", alt: "" }),
          h("div", { className: "db-row__person" },
            h("div", { className: "db-row__name" }, im.name || row.title),
            h("div", { className: "db-row__sub" }, row.id),
          ),
        );
        break;
      }
    }
    return cell;
  }

  function gridTemplate(cfg) {
    return cfg.columns.map((c) => c.width).join(" ");
  }

  function renderHead() {
    const cfg = getCfg(currentCollection);
    tableHead.innerHTML = "";
    cfg.columns.forEach((col) => {
      tableHead.append(
        h("div", { className: `db-table__col db-table__col--${col.type}` }, col.label)
      );
    });
    tableHead.style.gridTemplateColumns = gridTemplate(cfg);
  }

  function renderRow(t) {
    const cfg = getCfg(currentCollection);
    const row = h("div", { className: "db-row", "data-id": t.id });
    cfg.columns.forEach((col) => row.append(renderCell(col, t)));
    row.style.gridTemplateColumns = gridTemplate(cfg);
    row.addEventListener("click", () => selectRow(t.id, true));
    return row;
  }

  // Build the value side of an inspector field for a given column type
  function inspectorValue(col, row) {
    const wrap = h("div", { className: "db-insp__v" });
    const v = row[col.key];
    switch (col.type) {
      case "status": {
        if (!v) { wrap.textContent = "—"; break; }
        wrap.append(
          h("span", { className: `db-status db-status--${v}` },
            h("span", { className: "db-status__dot" }),
            h("span", { className: "db-status__label" }, v),
          )
        );
        break;
      }
      case "chip": {
        const ag = AGENTS.find((a) => a.id === v) || { name: v || "—", hue: "gray" };
        wrap.append(
          h("span", { className: `db-chip db-chip--${ag.hue} db-chip--sm` },
            h("img", { className: "db-chip__avatar", src: robo(ag.name), alt: "" }),
            h("span", { className: "db-chip__name" }, ag.name),
          )
        );
        break;
      }
      case "badge": {
        wrap.append(h("span", { className: `db-badge db-badge--${v}` }, v || "—"));
        break;
      }
      case "stack": {
        const arr = v || [];
        const stack = h("div", { className: "db-stack" });
        arr.slice(0, 5).forEach((src) => stack.append(h("img", { className: "db-stack__avatar", src, alt: "" })));
        const total = row.peopleCount || arr.length;
        if (total > 5) stack.append(h("span", { className: "db-stack__more" }, "+" + (total - 5)));
        wrap.append(stack);
        break;
      }
      case "dim":
      case "updated":
      case "text":
      default:
        wrap.textContent = v || "—";
        if (col.type === "dim" || col.type === "updated") wrap.classList.add("db-insp__v--mono");
    }
    return wrap;
  }

  function renderInspectorContent(row) {
    const cfg = getCfg(currentCollection);

    // Refresh breadcrumb with current collection
    const crumb = inspector.querySelector(".db-inspector__crumb-coll");
    if (crumb) crumb.textContent = currentCollection;

    inspectorBody.innerHTML = "";

    // Hero block: depends on what kind of row
    const hero = h("div", { className: "db-insp__hero" });
    if (row.person) {
      hero.append(
        h("img", { className: "db-insp__photo", src: row.person.photo, alt: "" }),
        h("div", { className: "db-insp__hero-text" },
          h("div", { className: "db-insp__title" }, row.person.name || row.title),
          h("div", { className: "db-insp__sub" }, row.person.sub || ""),
        ),
      );
    } else if (row.image) {
      hero.append(
        h("img", { className: "db-insp__thumbBig", src: row.image.thumb, alt: "" }),
        h("div", { className: "db-insp__hero-text" },
          h("div", { className: "db-insp__title" }, row.image.name || row.title),
          h("div", { className: "db-insp__sub" }, row.size || ""),
        ),
      );
    } else if (row.from) {
      hero.append(
        h("img", { className: "db-insp__photo", src: row.from.photo, alt: "" }),
        h("div", { className: "db-insp__hero-text" },
          h("div", { className: "db-insp__title" }, row.title),
          h("div", { className: "db-insp__sub" }, "from " + row.from.name),
        ),
      );
    } else {
      hero.append(h("div", { className: "db-insp__hero-text" },
        h("div", { className: "db-insp__title" }, row.title),
      ));
    }
    inspectorBody.append(hero);

    if (row.desc) {
      inspectorBody.append(
        h("div", { className: "db-insp__section" },
          h("div", { className: "db-insp__sec-label" }, "description"),
          h("div", { className: "db-insp__desc" }, row.desc),
        )
      );
    }

    // Fields from columns (excluding the title/avatar/thumb that are already in hero)
    const fieldSec = h("div", { className: "db-insp__section" });
    fieldSec.append(h("div", { className: "db-insp__sec-label" }, "fields"));
    cfg.columns.forEach((col) => {
      if (col.type === "title" || col.type === "avatar" || col.type === "thumb") return;
      const f = h("div", { className: "db-insp__field" });
      f.append(h("div", { className: "db-insp__k" }, col.label));
      f.append(inspectorValue(col, row));
      fieldSec.append(f);
    });
    // Meta rows
    (row.meta || []).forEach(([k, v]) => {
      const f = h("div", { className: "db-insp__field" });
      f.append(h("div", { className: "db-insp__k" }, k));
      f.append(h("div", { className: "db-insp__v" }, v));
      fieldSec.append(f);
    });
    inspectorBody.append(fieldSec);

    // System section
    const sysSec = h("div", { className: "db-insp__section" });
    sysSec.append(h("div", { className: "db-insp__sec-label" }, "system"));
    const sysFields = [
      ["id", row.id, true],
      ["collection", currentCollection, false],
    ];
    sysFields.forEach(([k, v, mono]) => {
      const f = h("div", { className: "db-insp__field" });
      f.append(h("div", { className: "db-insp__k" }, k));
      const val = h("div", { className: "db-insp__v" + (mono ? " db-insp__v--mono" : "") }, v);
      f.append(val);
      sysSec.append(f);
    });
    inspectorBody.append(sysSec);
  }

  function collectionHasStatus(id) {
    return getCfg(id).columns.some((c) => c.type === "status");
  }

  function applyFilter() {
    const rows = getRows(currentCollection);
    const hasStatus = collectionHasStatus(currentCollection);
    [...tbody.querySelectorAll(".db-row")].forEach((r) => {
      const id = r.getAttribute("data-id");
      const t = rows.find((x) => x.id === id);
      const hide = hasStatus && currentFilter !== "all" && t && t.status !== currentFilter;
      r.classList.toggle("db-row--hidden", !!hide);
      const det = r.nextElementSibling;
      if (det && det.classList && det.classList.contains("db-detail")) {
        det.classList.toggle("db-row--hidden", !!hide);
      }
    });
  }

  function renderCollection(id) {
    currentCollection = id;
    const rows = getRows(id);
    renderHead();
    tbody.innerHTML = "";
    rows.forEach((t) => tbody.append(renderRow(t)));
    recTitle.querySelector(".db-records__title-name").textContent = id;
    const total = (COLLECTIONS.find((c) => c.id === id) || {}).count || rows.length;
    recTitle.querySelector(".db-records__title-count").textContent = `${total} records`;
    // Hide filter pill on collections without a status column
    filterPill.classList.toggle("db-records__filter--off", !collectionHasStatus(id));
    selectedRowId = null;
    applyFilter();
  }

  function switchCollection(id, fromUser) {
    if (id === currentCollection) return;
    Object.values(collNodes).forEach((n) => n.classList.remove("db-coll--active"));
    if (collNodes[id]) collNodes[id].classList.add("db-coll--active");
    pulseCollection(id);
    tableWrap.classList.add("db-table--switching");
    setTimeout(() => {
      renderCollection(id);
      tableWrap.classList.remove("db-table--switching");
    }, 220);
    if (fromUser) typeSearch("");
  }

  function clearSelection() {
    [...tbody.querySelectorAll(".db-row")].forEach((r) => r.classList.remove("db-row--selected"));
    selectedRowId = null;
  }

  function closeInspector() {
    inspector.classList.remove("db-inspector--open");
    clearSelection();
  }

  function selectRow(id, fromUser) {
    // Toggle off if same row
    if (selectedRowId === id) {
      closeInspector();
      return;
    }
    const row = tbody.querySelector(`.db-row[data-id="${id}"]`);
    if (!row) return;
    const t = getRows(currentCollection).find((x) => x.id === id);
    if (!t) return;
    // If the row is filtered out, clear the filter so it becomes visible
    if (row.classList.contains("db-row--hidden")) {
      currentFilter = "all";
      filterPill.querySelector(".db-records__filter-val").textContent = "all";
      applyFilter();
    }
    [...tbody.querySelectorAll(".db-row")].forEach((r) => r.classList.remove("db-row--selected"));
    row.classList.add("db-row--selected");
    selectedRowId = id;
    renderInspectorContent(t);
    inspector.classList.add("db-inspector--open");
  }

  function cycleFilter(fromUser) {
    const order = ["all", "open", "doing", "done"];
    const i = order.indexOf(currentFilter);
    currentFilter = order[(i + 1) % order.length];
    filterPill.querySelector(".db-records__filter-val").textContent = currentFilter;
    filterPill.classList.add("db-records__filter--ping");
    setTimeout(() => filterPill.classList.remove("db-records__filter--ping"), 900);
    applyFilter();
  }

  // Animated search (auto-types a query)
  function typeSearch(text) {
    const inp = search.querySelector(".db-records__search-input");
    inp.textContent = "";
    let i = 0;
    const step = () => {
      if (i < text.length) {
        inp.textContent += text[i++];
        setTimeout(step, 60);
      }
    };
    step();
  }

  renderCollection("tasks");

  shell.append(body);

  // ── Inspector sidebar (slides in from the right) ──
  const inspector = h("div", { className: "db-inspector" });
  const inspectorHead = h("div", { className: "db-inspector__head" },
    h("div", { className: "db-inspector__crumb" },
      h("span", { className: "db-inspector__crumb-coll" }, currentCollection),
      h("span", { className: "db-inspector__crumb-sep" }, "/"),
      h("span", {}, "record"),
    ),
    h("button", { className: "db-inspector__close", title: "Close" }, "×"),
  );
  const inspectorBody = h("div", { className: "db-inspector__body" });
  inspector.append(inspectorHead);
  inspector.append(inspectorBody);
  shell.append(inspector);
  inspector.querySelector(".db-inspector__close").addEventListener("click", closeInspector);

  // ── Hover pause: stop the auto-demo while the user is exploring the shell ──
  shell.addEventListener("mouseenter", () => { hoverPaused = true; });
  shell.addEventListener("mouseleave", () => {
    hoverPaused = false;
    resumingFromHover = true;
  });

  // Floating agent toast
  const toast = h("div", { className: "db-agent-toast" },
    h("img", { className: "db-agent-toast__avatar", src: robo("Planner"), alt: "" }),
    h("div", { className: "db-agent-toast__body" },
      h("div", { className: "db-agent-toast__top" },
        h("span", { className: "db-agent-toast__name" }, "Planner Agent"),
        h("span", { className: "db-agent-toast__verb" }, "creating"),
      ),
      h("div", { className: "db-agent-toast__detail" }, ""),
    ),
  );
  shell.append(toast);

  exp.append(shell);

  // ── RIGHT: stacked terminal (top) + code block (bottom) ──
  const right = h("div", { className: "db-right" });

  // Top: animated CLI terminal (matches the .cli-terminal style used elsewhere)
  const term = h("div", { className: "db-term cli-terminal" });
  term.append(
    h("div", { className: "cli-terminal__bar" },
      h("span", { className: "cli-terminal__dot" }),
      h("span", { className: "cli-terminal__dot" }),
      h("span", { className: "cli-terminal__dot" }),
      h("span", { className: "cli-terminal__title" }, "tasks.sh"),
    )
  );
  const termBody = h("div", { className: "cli-terminal__body db-term__body" });
  term.append(termBody);
  right.append(term);

  // Bottom: static TypeScript snippet (matches the .code-block style elsewhere)
  const code = h("div", { className: "db-code code-block" });
  code.append(
    h("div", { className: "code-block__header" },
      h("span", { className: "code-block__dot" }),
      h("span", { className: "code-block__dot" }),
      h("span", { className: "code-block__dot" }),
      h("span", { className: "code-block__filename" }, "tasks.ts"),
    )
  );
  const pre = document.createElement("pre");
  pre.innerHTML =
`<span class="comment">// Same database, type-safe and live</span>
<span class="keyword">import</span> { claw } <span class="keyword">from</span> <span class="string">"clawjs"</span>;

<span class="keyword">const</span> task = <span class="keyword">await</span> claw.<span class="property">tasks</span>.<span class="function">create</span>({
  <span class="property">title</span>: <span class="string">"Add SSO support"</span>,
  <span class="property">assigneeId</span>: <span class="string">"agent_planner"</span>,
});

claw.<span class="property">tasks</span>.<span class="function">watch</span>((event) =&gt; <span class="function">render</span>(event));`;
  code.append(pre);
  right.append(code);

  exp.append(right);

  container.append(exp);

  // ─── Animated terminal (typewriter) ────────────────────────────────────
  const termScenes = [
    {
      cmd: 'claw tasks list --status=open',
      output: [
        '<span class="cli-dim">ID    TITLE                          DUE</span>',
        't_28  Review Q4 docs drift           Today 16:00',
        't_27  Triage onboarding feedback     Tomorrow 10:00',
        't_24  Refactor login flow            Apr 11',
        '<span class="cli-dim">3 records · 8ms</span>',
      ],
    },
    {
      cmd: 'claw tasks create --title "Add SSO support"',
      output: [
        '<span class="cli-ok">✓</span> Created task <span class="cli-cmd">t_29</span>',
        '  <span class="cli-dim">assignee:</span> planner',
        '  <span class="cli-dim">status:</span>   <span class="cli-warn">open</span>',
      ],
    },
    {
      cmd: 'claw tasks watch',
      output: [
        '<span class="cli-dim">◌</span> Streaming live changes...',
        '<span class="cli-ok">▸</span> update t_26 status=done',
        '<span class="cli-ok">▸</span> create t_30 "Polish empty states"',
      ],
    },
  ];

  let termTimers = [];
  function termClear() { termTimers.forEach(clearTimeout); termTimers = []; }

  function termAddLine(html) {
    const div = document.createElement("div");
    div.className = "cli-line";
    div.innerHTML = html;
    termBody.appendChild(div);
    requestAnimationFrame(() => div.classList.add("cli-line--visible"));
    termBody.scrollTop = termBody.scrollHeight;
    return div;
  }

  function termType(text, done) {
    const line = document.createElement("div");
    line.className = "cli-line cli-line--visible";
    line.innerHTML = '<span class="cli-prompt">$</span> <span class="cli-cmd"></span><span class="cli-cursor"></span>';
    termBody.appendChild(line);
    const cmdSpan = line.querySelector(".cli-cmd");
    const cursor = line.querySelector(".cli-cursor");
    let i = 0;
    function step() {
      if (i < text.length) {
        cmdSpan.textContent += text[i++];
        termBody.scrollTop = termBody.scrollHeight;
        termTimers.push(setTimeout(step, 30 + Math.random() * 30));
      } else {
        cursor.remove();
        termTimers.push(setTimeout(done, 380));
      }
    }
    termTimers.push(setTimeout(step, 200));
  }

  function termOutput(lines, done) {
    let i = 0;
    function step() {
      if (i < lines.length) {
        termAddLine(lines[i++]);
        termTimers.push(setTimeout(step, 120));
      } else {
        termTimers.push(setTimeout(done, 1200));
      }
    }
    step();
  }

  let sceneIdx = 0;
  function termPlay() {
    const scene = termScenes[sceneIdx % termScenes.length];
    sceneIdx++;
    if (termBody.children.length > 0) termAddLine("");
    if (termBody.children.length > 18) termBody.innerHTML = "";
    termType(scene.cmd, () => termOutput(scene.output, termPlay));
  }
  setTimeout(termPlay, 600);

  // ─────────────────────────────────────────────────────────────────────
  // ANIMATION
  // ─────────────────────────────────────────────────────────────────────

  let actionIndex = 0;
  let dbTimers = [];
  function dbClearTimers() { dbTimers.forEach(clearTimeout); dbTimers = []; }

  function showAgentToast(action) {
    const ag = AGENTS.find((a) => a.id === action.agent);
    if (!ag) return;
    toast.querySelector(".db-agent-toast__avatar").src = robo(ag.name);
    toast.querySelector(".db-agent-toast__name").textContent = `${ag.name} Agent`;
    toast.querySelector(".db-agent-toast__verb").textContent = action.kind;
    let detail = "";
    if (action.kind === "create" && action.record) {
      detail = `+ ${action.collection} · "${action.record.title}"`;
    } else if (action.kind === "update") {
      detail = `${action.collection}/${action.target} · ${action.label || "updated"}`;
    } else if (action.kind === "query") {
      detail = `SELECT * FROM ${action.collection}`;
    }
    toast.querySelector(".db-agent-toast__detail").textContent = detail;
    toast.classList.add("db-agent-toast--show");
    setTimeout(() => toast.classList.remove("db-agent-toast--show"), 2400);
  }

  function pulseCollection(id) {
    const node = collNodes[id];
    if (!node) return;
    node.classList.add("db-coll--ping");
    setTimeout(() => node.classList.remove("db-coll--ping"), 1100);
  }

  function runAction() {
    // Pause while user hovers the shell — keep polling until they leave
    if (hoverPaused) {
      dbTimers.push(setTimeout(runAction, 500));
      return;
    }

    // First tick after the user stops hovering: animate the inspector closed
    // before continuing with the demo, so the user's selection isn't yanked away.
    if (resumingFromHover) {
      resumingFromHover = false;
      if (inspector.classList.contains("db-inspector--open")) {
        closeInspector();
        dbTimers.push(setTimeout(runAction, 450));
        return;
      }
    }

    const action = ACTIONS[actionIndex % ACTIONS.length];
    actionIndex++;

    let nextDelay = 3200;

    if (action.kind === "close") {
      closeInspector();
      nextDelay = 1400;
    } else if (action.kind === "switch") {
      switchCollection(action.collection, false);
      nextDelay = 2600;
    } else if (action.kind === "select") {
      if (currentCollection !== action.collection) switchCollection(action.collection, false);
      setTimeout(() => selectRow(action.row, false), 280);
      nextDelay = 3400;
    } else if (action.kind === "filter") {
      if (currentCollection !== action.collection) switchCollection(action.collection, false);
      cycleFilter(false);
      nextDelay = 2400;
    } else if (action.kind === "create" && action.record) {
      if (currentCollection !== action.collection) switchCollection(action.collection, false);
      showAgentToast(action);
      pulseCollection(action.collection);
      setTimeout(() => {
        const row = renderRow(action.record);
        row.classList.add("db-row--new");
        tbody.prepend(row);
        requestAnimationFrame(() => row.classList.add("db-row--in"));
        // Trim if too long
        const allRows = tbody.querySelectorAll(".db-row");
        if (allRows.length > 9) {
          const last = allRows[allRows.length - 1];
          const lastDet = last.nextElementSibling;
          if (lastDet && lastDet.classList && lastDet.classList.contains("db-detail")) lastDet.remove();
          last.remove();
        }
        const cntEl = recTitle.querySelector(".db-records__title-count");
        if (cntEl) {
          const m = cntEl.textContent.match(/(\d+)/);
          const n = m ? parseInt(m[1], 10) + 1 : 9;
          cntEl.textContent = `${n} records`;
        }
        setTimeout(() => row.classList.remove("db-row--new"), 1800);
      }, 280);
      nextDelay = 3600;
    } else if (action.kind === "update" && action.target) {
      if (currentCollection !== action.collection) switchCollection(action.collection, false);
      showAgentToast(action);
      pulseCollection(action.collection);
      setTimeout(() => {
        const row = tbody.querySelector(`.db-row[data-id="${action.target}"]`);
        if (row && action.patch && action.patch.status) {
          row.classList.add("db-row--ping");
          const statusEl = row.querySelector(".db-status");
          const labelEl = row.querySelector(".db-status__label");
          if (statusEl) statusEl.className = `db-status db-status--${action.patch.status}`;
          if (labelEl) labelEl.textContent = action.patch.status;
          setTimeout(() => row.classList.remove("db-row--ping"), 1500);
        }
      }, 280);
      nextDelay = 3000;
    } else if (action.kind === "query") {
      showAgentToast(action);
      pulseCollection(action.collection);
      tableWrap.classList.add("db-table--ping");
      setTimeout(() => tableWrap.classList.remove("db-table--ping"), 1100);
      nextDelay = 2400;
    }

    dbTimers.push(setTimeout(runAction, nextDelay));
  }

  setTimeout(() => {
    dbClearTimers();
    runAction();
  }, 1000);
}

