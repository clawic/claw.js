// ─── USER DEMO ───────────────────────────────────────────────────────────────
// Agents build a structured profile of you over time. Proposed facts arrive on
// the left as a feed; you verify or dismiss them. Verified facts compile into
// USER.md on the right. Packs gate which areas of life are visible at all,
// profiles narrow what the agent loads at runtime.

import { h } from "./shared.js";

const PACKS = [
  { id: "practical",    label: "Practical",    emoji: "🏠", hint: "Home, devices, residence", sensitivity: "personal"  },
  { id: "professional", label: "Professional", emoji: "💼", hint: "Work, education, skills",  sensitivity: "personal"  },
  { id: "wellbeing",    label: "Wellbeing",    emoji: "🌿", hint: "Routines, family, health", sensitivity: "sensitive" },
];

const PROFILES = [
  { id: "general",   label: "General"   },
  { id: "work",      label: "Work"      },
  { id: "family",    label: "Family"    },
  { id: "travel",    label: "Travel"    },
  { id: "wellbeing", label: "Wellbeing" },
];

const PROFILE_SECTIONS = {
  general:   ["identity", "residence", "work", "education", "skills", "projects", "devices", "tastes", "routines", "family"],
  work:      ["identity", "work", "education", "skills", "projects"],
  family:    ["identity", "family", "routines", "residence"],
  travel:    ["identity", "residence", "devices"],
  wellbeing: ["identity", "routines", "family"],
};

const SECTION_PACK = {
  identity:  null,
  residence: "practical",
  devices:   "practical",
  tastes:    "practical",
  work:      "professional",
  education: "professional",
  skills:    "professional",
  projects:  "professional",
  routines:  "wellbeing",
  family:    "wellbeing",
};

const SECTION_LABEL = {
  identity:  "Identity",
  residence: "Residence",
  devices:   "Devices",
  tastes:    "Tastes",
  work:      "Work",
  education: "Education",
  skills:    "Skills",
  projects:  "Projects",
  routines:  "Routines",
  family:    "Family",
};

const SEED_FACTS = [
  { id: "f-name",    section: "identity",  field: "Display Name", value: "Alice",                    text: "Her name is Alice",                    source: "from a recent intro message",  status: "verified" },
  { id: "f-langs",   section: "identity",  field: "Languages",    value: "English, Spanish",         text: "Speaks English and Spanish",           source: "from chat patterns",           status: "verified" },
  { id: "f-company", section: "work",      field: "Company",      value: "Acme Corp",                text: "Works at Acme Corp",                   source: "from a Slack thread",          status: "verified" },
  { id: "f-role",    section: "work",      field: "Title",        value: "Software Engineer",        text: "Software engineer is her title",       source: "from her email signature",     status: "pending"  },
  { id: "f-school",  section: "education", field: "School",       value: "MIT",                      text: "Studied at MIT",                       source: "from a calendar invite",       status: "pending"  },
  { id: "f-degree",  section: "education", field: "Degree",       value: "BS Computer Science",      text: "BS in Computer Science",               source: "from her résumé",              status: "verified" },
  { id: "f-skills",  section: "skills",    field: "Top",          value: "TypeScript, Rust",         text: "Strong in TypeScript and Rust",        source: "from her GitHub activity",     status: "pending"  },
  { id: "f-project", section: "projects",  field: "Lead",         value: "Aurora (active)",          text: "Leads the Aurora project at Acme",     source: "from a project doc",           status: "pending"  },
  { id: "f-city",    section: "residence", field: "City",         value: "Berlin, Germany",          text: "Lives in Berlin, Germany",             source: "from a recent calendar event", status: "verified" },
  { id: "f-area",    section: "residence", field: "Area",         value: "Prenzlauer Berg",          text: "Apartment in Prenzlauer Berg",         source: "from a billing address",       status: "pending"  },
  { id: "f-laptop",  section: "devices",   field: "Laptop",       value: "MacBook Pro M3",           text: "Uses a MacBook Pro M3",                source: "from device fingerprint",      status: "pending"  },
  { id: "f-coffee",  section: "tastes",    field: "Coffee",       value: "Oat milk, no sugar",       text: "Prefers oat milk, no sugar",           source: "from a takeaway order",        status: "pending"  },
  { id: "f-routine", section: "routines",  field: "Mornings",     value: "Runs at 7am",              text: "Morning runs around 7am",              source: "from her calendar",            status: "pending"  },
  { id: "f-sleep",   section: "routines",  field: "Sleep",        value: "Asleep by 11pm",           text: "Tries to be asleep by 11pm",           source: "from her calendar",            status: "pending"  },
  { id: "f-partner", section: "family",    field: "Partner",      value: "Carla",                    text: "Lives with her partner Carla",         source: "from a photo caption",         status: "pending"  },
  { id: "f-pet",     section: "family",    field: "Pet",          value: "Pixel (dog)",              text: "Has a dog named Pixel",                source: "from a calendar entry",        status: "pending"  },
];

const PACK_PALETTE = {
  practical:    { color: "#7dd3fc", soft: "rgba(125, 211, 252, 0.12)", border: "rgba(125, 211, 252, 0.32)" },
  professional: { color: "#c4b5fd", soft: "rgba(196, 181, 253, 0.12)", border: "rgba(196, 181, 253, 0.32)" },
  wellbeing:    { color: "#86efac", soft: "rgba(134, 239, 172, 0.12)", border: "rgba(134, 239, 172, 0.32)" },
  identity:     { color: "#fda4af", soft: "rgba(253, 164, 175, 0.12)", border: "rgba(253, 164, 175, 0.32)" },
};

function packFor(section) { return SECTION_PACK[section] || "identity"; }
function paletteFor(section) { return PACK_PALETTE[packFor(section)]; }

export function mountUser(container) {
  const state = {
    packs: { practical: true, professional: true, wellbeing: true },
    profile: "general",
    facts: SEED_FACTS.map((f) => ({ ...f })),
    interacted: false,
  };

  let cycleTimer = null;
  let prevLines  = [];
  const factEls  = new Map();

  const root = h("div", { className: "us-root" });

  const packsRow = h("div", { className: "us-packs" });
  PACKS.forEach((p) => {
    const card = h("div", { className: "us-pack" });
    card.dataset.pack = p.id;
    card.style.setProperty("--pack-color", PACK_PALETTE[p.id].color);
    card.style.setProperty("--pack-soft",  PACK_PALETTE[p.id].soft);
    card.style.setProperty("--pack-border", PACK_PALETTE[p.id].border);

    card.append(
      h("span", { className: "us-pack__icon" }, p.emoji),
      h("div", { className: "us-pack__body" },
        h("div", { className: "us-pack__label" }, p.label),
        h("div", { className: "us-pack__hint" }, p.hint),
      ),
    );

    const sw = h("button", { className: "us-switch us-switch--on" }, h("span", { className: "us-switch__thumb" }));
    sw.addEventListener("click", (e) => { e.stopPropagation(); mark(); togglePack(p.id); });
    card.append(sw);
    packsRow.append(card);
  });

  const profileBar = h("div", { className: "us-profile" });
  profileBar.append(h("span", { className: "us-profile__label" }, "Compile profile"));
  const profileWrap = h("div", { className: "us-profile__opts" });
  const profileBtns = {};
  PROFILES.forEach((p) => {
    const btn = h("button", { className: "us-profile__opt" }, p.label);
    btn.addEventListener("click", () => { mark(); selectProfile(p.id); });
    profileBtns[p.id] = btn;
    profileWrap.append(btn);
  });
  profileBar.append(profileWrap);

  const grid = h("div", { className: "us-grid" });

  const feed = h("div", { className: "us-feed" });
  feed.append(
    h("div", { className: "us-feed__head" },
      h("span", { className: "us-feed__title" }, "Recent observations"),
      h("span", { className: "us-feed__hint" }, "Verify what's true · dismiss what's not"),
    ),
  );
  const feedList = h("div", { className: "us-feed__list" });
  feed.append(feedList);

  const preview = h("div", { className: "us-preview" });
  const previewHead = h("div", { className: "us-preview__head" },
    h("span", { className: "us-preview__title" }, "USER.md"),
    h("span", { className: "us-preview__profile" }, ""),
  );
  const mdView = h("div", { className: "us-md" });
  preview.append(previewHead, mdView);

  grid.append(feed, preview);
  root.append(packsRow, profileBar, grid);
  container.append(root);

  selectProfile(state.profile, true);
  buildFeed(true);
  renderMarkdown(true);
  scheduleCycle();

  function togglePack(id) {
    state.packs[id] = !state.packs[id];
    const card = packsRow.querySelector(`[data-pack="${id}"]`);
    card.querySelector(".us-switch").classList.toggle("us-switch--on", state.packs[id]);
    card.classList.toggle("us-pack--off", !state.packs[id]);
    refreshFeed();
    renderMarkdown();
  }

  function selectProfile(id, initial = false) {
    state.profile = id;
    Object.entries(profileBtns).forEach(([k, b]) => b.classList.toggle("us-profile__opt--active", k === id));
    previewHead.querySelector(".us-preview__profile").textContent = `· ${PROFILES.find((p) => p.id === id).label.toLowerCase()}`;
    if (!initial) renderMarkdown();
  }

  function visibleFacts() {
    return state.facts.filter((f) => {
      const pk = SECTION_PACK[f.section];
      return pk === null || state.packs[pk];
    });
  }

  function buildFeed(initial = false) {
    feedList.innerHTML = "";
    factEls.clear();
    visibleFacts().forEach((f) => {
      const node = buildFactNode(f, initial);
      feedList.append(node);
      factEls.set(f.id, node);
    });
  }

  function buildFactNode(f, initial = false) {
    const pal = paletteFor(f.section);
    const node = h("div", { className: `us-fact us-fact--${f.status}` });
    node.dataset.factId = f.id;
    node.style.setProperty("--accent", pal.color);
    node.style.setProperty("--accent-soft", pal.soft);
    node.style.setProperty("--accent-border", pal.border);

    const head = h("div", { className: "us-fact__head" });
    head.append(
      h("span", { className: "us-fact__pill" }, SECTION_LABEL[f.section]),
      h("span", { className: "us-fact__source" }, f.source),
    );
    node.append(head);

    node.append(h("div", { className: "us-fact__text" }, `"${f.text}"`));

    const actions = h("div", { className: "us-fact__actions" });
    const verifyBtn = h("button", { className: "us-btn us-btn--verify" });
    verifyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Verify`;
    verifyBtn.addEventListener("click", () => { mark(); verifyFact(f.id); });
    const dismissBtn = h("button", { className: "us-btn us-btn--dismiss" });
    dismissBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Dismiss`;
    dismissBtn.addEventListener("click", () => { mark(); dismissFact(f.id); });
    actions.append(verifyBtn, dismissBtn);

    const stamp = h("div", { className: "us-fact__stamp" });
    stamp.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> verified`;

    node.append(actions, stamp);

    if (!initial) {
      node.classList.add("us-fact--enter");
      requestAnimationFrame(() => node.classList.remove("us-fact--enter"));
    }
    return node;
  }

  function refreshFeed() {
    state.facts.forEach((f) => {
      const node = factEls.get(f.id);
      if (!node) return;
      const pk = SECTION_PACK[f.section];
      const visible = pk === null || state.packs[pk];
      node.classList.toggle("us-fact--hidden", !visible);
    });
  }

  function verifyFact(id) {
    const f = state.facts.find((x) => x.id === id);
    if (!f || f.status !== "pending") return;
    f.status = "verified";
    const node = factEls.get(id);
    if (node) {
      node.classList.remove("us-fact--pending");
      node.classList.add("us-fact--verified", "us-fact--just-verified");
      setTimeout(() => node.classList.remove("us-fact--just-verified"), 900);
    }
    renderMarkdown();
  }

  function dismissFact(id) {
    const node = factEls.get(id);
    if (!node) return;
    node.classList.add("us-fact--leaving");
    setTimeout(() => {
      const idx = state.facts.findIndex((x) => x.id === id);
      if (idx >= 0) state.facts.splice(idx, 1);
      node.remove();
      factEls.delete(id);
    }, 280);
  }

  function compileLines() {
    const allowed = new Set(PROFILE_SECTIONS[state.profile]);
    const sectionsOrder = PROFILE_SECTIONS.general;
    const lines = [];
    lines.push({ key: "h1",      text: `# ${(state.facts.find((f) => f.id === "f-name") || {}).value || "User"}`, kind: "h1" });
    lines.push({ key: "blank-1", text: "", kind: "blank" });
    lines.push({ key: "comment", text: `<!-- Generated from ClawJS UserSpec (${state.profile}). Edit the structured user source, not this block. -->`, kind: "comment" });
    lines.push({ key: "blank-2", text: "", kind: "blank" });

    sectionsOrder.forEach((sec) => {
      if (!allowed.has(sec)) return;
      const pk = SECTION_PACK[sec];
      if (pk && !state.packs[pk]) return;
      const facts = state.facts.filter((f) => f.section === sec && f.status === "verified" && f.id !== "f-name");
      if (!facts.length) return;
      lines.push({ key: `h2-${sec}`, text: `## ${SECTION_LABEL[sec]}`, kind: "h2", section: sec });
      facts.forEach((f) => {
        lines.push({ key: `${sec}-${f.id}`, text: `- ${f.field}: ${f.value}`, kind: "li", section: sec });
      });
      lines.push({ key: `blank-${sec}`, text: "", kind: "blank" });
    });

    return lines;
  }

  function renderMarkdown(initial = false) {
    const lines = compileLines();
    const prevByKey = new Map(prevLines.map((l) => [l.key, l]));
    const nextKeys = new Set(lines.map((l) => l.key));
    const existing = new Map();
    mdView.querySelectorAll("[data-key]").forEach((el) => existing.set(el.dataset.key, el));

    existing.forEach((el, key) => {
      if (nextKeys.has(key)) return;
      el.classList.add("us-mdline--leave");
      setTimeout(() => el.remove(), 240);
    });

    let cursor = null;
    lines.forEach((line) => {
      let el = existing.get(line.key);
      const wasNew = !el || el.classList.contains("us-mdline--leave");
      if (wasNew) {
        el = h("div", { className: "us-mdline" });
        el.dataset.key = line.key;
      }
      el.classList.toggle("us-mdline--blank",   line.kind === "blank");
      el.classList.toggle("us-mdline--h1",      line.kind === "h1");
      el.classList.toggle("us-mdline--h2",      line.kind === "h2");
      el.classList.toggle("us-mdline--li",      line.kind === "li");
      el.classList.toggle("us-mdline--comment", line.kind === "comment");
      el.classList.remove("us-mdline--leave");

      if (line.section) {
        const pal = paletteFor(line.section);
        el.style.setProperty("--accent", pal.color);
      } else {
        el.style.removeProperty("--accent");
      }

      if (line.kind === "blank") el.innerHTML = "&nbsp;";
      else el.textContent = line.text;

      const ref = cursor ? cursor.nextSibling : mdView.firstChild;
      if (ref !== el) mdView.insertBefore(el, ref);
      cursor = el;

      if (!initial && wasNew) {
        el.classList.remove("us-mdline--enter");
        void el.offsetWidth;
        el.classList.add("us-mdline--enter");
      }
    });

    prevLines = lines;
  }

  function scheduleCycle() {
    clearTimeout(cycleTimer);
    if (state.interacted) return;
    cycleTimer = setTimeout(() => {
      if (state.interacted) return;
      const pending = visibleFacts().filter((f) => f.status === "pending");
      if (pending.length) {
        const pick = pending[Math.floor(Math.random() * pending.length)];
        verifyFact(pick.id);
      }
      scheduleCycle();
    }, 2200);
  }

  function mark() {
    if (state.interacted) return;
    state.interacted = true;
    clearTimeout(cycleTimer);
  }
}
