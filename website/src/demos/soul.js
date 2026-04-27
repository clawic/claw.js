// ─── SOUL DEMO ───────────────────────────────────────────────────────────────
// Personalize-your-agent panel. 14 persona icons + a small mix of input types
// (segmented, dropdown, chips, slider) on the left, a calm profile card with
// typewriter animation on the right.

import { h } from "./shared.js";

const PERSONAS = [
  { id: "balanced",            label: "Balanced",  emoji: "⚖️",  role: "general-purpose agent",      archetype: "balanced operator",         descriptors: ["direct", "calm", "competent"] },
  { id: "operator",            label: "Operator",  emoji: "🎯",  role: "operations agent",           archetype: "decisive operator",         descriptors: ["decisive", "direct", "calm"] },
  { id: "engineer",            label: "Engineer",  emoji: "🔧",  role: "software engineering agent", archetype: "principled engineer",       descriptors: ["precise", "pragmatic", "calm"] },
  { id: "researcher",          label: "Research",  emoji: "🔭",  role: "research agent",             archetype: "evidence-first researcher", descriptors: ["thorough", "skeptical", "curious"] },
  { id: "analyst",             label: "Analyst",   emoji: "📊",  role: "analyst",                    archetype: "rigorous analyst",          descriptors: ["rigorous", "exact", "structured"] },
  { id: "creative",            label: "Creative",  emoji: "🎨",  role: "creative partner",           archetype: "inventive collaborator",    descriptors: ["inventive", "sharp", "tasteful"] },
  { id: "tutor",               label: "Tutor",     emoji: "📚",  role: "tutor",                      archetype: "patient coach",             descriptors: ["patient", "clear", "encouraging"] },
  { id: "product",             label: "Product",   emoji: "🧭",  role: "product agent",              archetype: "product strategist",        descriptors: ["strategic", "user-focused", "decisive"] },
  { id: "support",             label: "Support",   emoji: "🤝",  role: "support agent",              archetype: "calm support lead",         descriptors: ["warm", "calm", "diplomatic"] },
  { id: "sales",               label: "Sales",     emoji: "💼",  role: "sales agent",                archetype: "trusted sales partner",     descriptors: ["warm", "direct", "credible"] },
  { id: "writing",             label: "Writer",    emoji: "✍️",  role: "writing agent",              archetype: "voice-matching editor",     descriptors: ["clear", "specific", "natural"] },
  { id: "executive",           label: "Exec",      emoji: "👔",  role: "executive agent",            archetype: "strategic operator",        descriptors: ["concise", "strategic", "calm"] },
  { id: "companion",           label: "Companion", emoji: "💬",  role: "companion agent",            archetype: "warm companion",            descriptors: ["warm", "patient", "thoughtful"] },
  { id: "personal-assistant",  label: "Assistant", emoji: "📋",  role: "personal assistant",         archetype: "trusted PA",                descriptors: ["organized", "helpful", "discreet"] },
];

const VOICE = [{ id: "direct", label: "Direct" }, { id: "balanced", label: "Balanced" }, { id: "detailed", label: "Detailed" }];
const TONE  = [{ id: "casual", label: "Casual" }, { id: "neutral",  label: "Neutral" },  { id: "formal",   label: "Formal" }];
const AUTO_OPTS = [
  { id: "ask",   label: "Always ask first",        hint: "Confirms every external action" },
  { id: "smart", label: "Smart, asks if risky",    hint: "Acts on safe things, asks otherwise" },
  { id: "auto",  label: "Just do it, report back", hint: "Acts and reports back" },
];
const UNCERTAIN_OPTS = [
  { id: "state_confidence", label: "State its confidence" },
  { id: "say_unknown",      label: "Say it doesn't know" },
  { id: "ask_clarifying",   label: "Ask a clarifying question" },
];
const PRIVACY_LEVELS = ["very_low", "low", "medium", "high", "very_high"];
const PRIVACY_LABEL  = { very_low: "very low", low: "low", medium: "medium", high: "high", very_high: "very high" };
const VIBE_POOL = ["direct", "calm", "precise", "decisive", "inventive", "sharp", "tasteful", "patient", "encouraging", "thorough", "curious", "skeptical", "warm", "pragmatic"];

const PERSONA_DEFAULTS = {
  balanced:           { voice: "balanced", tone: "neutral", autonomy: "smart", uncertain: "state_confidence", privacy: "very_high", vibe: ["direct", "calm", "competent"] },
  operator:           { voice: "direct",   tone: "neutral", autonomy: "auto",  uncertain: "state_confidence", privacy: "high",      vibe: ["decisive", "direct", "calm"] },
  engineer:           { voice: "balanced", tone: "neutral", autonomy: "smart", uncertain: "state_confidence", privacy: "very_high", vibe: ["precise", "pragmatic", "calm"] },
  researcher:         { voice: "detailed", tone: "neutral", autonomy: "ask",   uncertain: "say_unknown",      privacy: "very_high", vibe: ["thorough", "skeptical", "curious"] },
  analyst:            { voice: "detailed", tone: "neutral", autonomy: "smart", uncertain: "state_confidence", privacy: "very_high", vibe: ["rigorous", "precise", "thorough"] },
  creative:           { voice: "balanced", tone: "casual",  autonomy: "smart", uncertain: "state_confidence", privacy: "high",      vibe: ["inventive", "sharp", "tasteful"] },
  tutor:              { voice: "balanced", tone: "neutral", autonomy: "ask",   uncertain: "ask_clarifying",   privacy: "high",      vibe: ["patient", "clear", "encouraging"] },
  product:            { voice: "balanced", tone: "neutral", autonomy: "smart", uncertain: "state_confidence", privacy: "high",      vibe: ["strategic", "decisive", "calm"] },
  support:            { voice: "balanced", tone: "casual",  autonomy: "ask",   uncertain: "ask_clarifying",   privacy: "very_high", vibe: ["warm", "calm", "patient"] },
  sales:              { voice: "balanced", tone: "casual",  autonomy: "smart", uncertain: "state_confidence", privacy: "high",      vibe: ["warm", "direct", "credible"] },
  writing:            { voice: "detailed", tone: "neutral", autonomy: "ask",   uncertain: "ask_clarifying",   privacy: "high",      vibe: ["clear", "specific", "tasteful"] },
  executive:          { voice: "direct",   tone: "formal",  autonomy: "auto",  uncertain: "state_confidence", privacy: "very_high", vibe: ["concise", "strategic", "calm"] },
  companion:          { voice: "balanced", tone: "casual",  autonomy: "ask",   uncertain: "ask_clarifying",   privacy: "very_high", vibe: ["warm", "patient", "thoughtful"] },
  "personal-assistant": { voice: "balanced", tone: "neutral", autonomy: "smart", uncertain: "state_confidence", privacy: "very_high", vibe: ["organized", "helpful", "discreet"] },
};

const VOICE_PHRASE = { direct: "in short, direct replies", balanced: "with balanced replies", detailed: "with detailed explanations" };
const TONE_PHRASE  = { casual: "a casual tone", neutral: "a neutral tone", formal: "a formal tone" };
const AUTO_PHRASE  = {
  ask:   "Asks before acting on anything that touches the outside world.",
  smart: "Acts on safe things on its own, checks in for the risky stuff.",
  auto:  "Acts and reports back, only stopping for the truly risky.",
};
const UNCERTAIN_PHRASE = {
  state_confidence: "When unsure, states its confidence rather than guessing.",
  say_unknown:      "When unsure, says it doesn't know rather than guessing.",
  ask_clarifying:   "When unsure, asks a clarifying question.",
};

// SOUL.md generation — mirrors @clawjs/node renderMarkdown(spec)
const VOICE_LEVEL     = { direct: "very high", balanced: "high",     detailed: "high" };
const VOICE_VERBOSITY = { direct: "concise",   balanced: "balanced", detailed: "detailed" };
const AUTO_POLICY = {
  ask:   { ask: "ask before external", external: "ask first" },
  smart: { ask: "ask before external", external: "ask first for risky" },
  auto:  { ask: "act then report",     external: "auto for low risk" },
};
const UNCERTAIN_POLICY = { state_confidence: "state confidence", say_unknown: "say unknown", ask_clarifying: "ask clarifying" };

function listText(arr) {
  if (!arr?.length) return "";
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;
}

function compileSoul(s) {
  const p = PERSONAS.find((x) => x.id === s.personaId);
  const aut = AUTO_POLICY[s.autonomy];
  const lines = [];
  lines.push({ key: "h1",       text: `# ${p.label} Soul`, kind: "h1" });
  lines.push({ key: "blank-1",  text: "",                  kind: "blank" });
  lines.push({ key: "comment",  text: "<!-- Generated from ClawJS SoulSpec. Edit the structured soul source, not this block. -->", kind: "comment" });
  lines.push({ key: "blank-2",  text: "",                  kind: "blank" });
  lines.push({ key: "identity", text: `You are ${p.role} with the posture of a ${p.archetype}.`, kind: "p" });
  lines.push({ key: "rel",      text: "Relate to the user as trusted collaborator.",            kind: "p" });
  lines.push({ key: "comm",     text: `Communicate with ${VOICE_LEVEL[s.voice]} directness, ${VOICE_VERBOSITY[s.voice]} detail, and a ${s.tone} tone.`, kind: "p" });
  lines.push({ key: "cog",      text: `Prefer ${UNCERTAIN_POLICY[s.uncertain]} when uncertain.`, kind: "p" });
  lines.push({ key: "auto",     text: `Use autonomy policy ${aut.ask}; external actions are ${aut.external}.`, kind: "p" });
  lines.push({ key: "bound",    text: `Handle private context with ${PRIVACY_LABEL[s.privacy]} care.`, kind: "p" });
  lines.push({ key: "vibe",     text: `The overall feel should be ${listText(s.vibe)}.`, kind: "p" });
  return lines;
}

export function mountSoul(container) {
  const state = { personaId: "balanced", ...PERSONA_DEFAULTS.balanced, view: "card", interacted: false };
  let prevLines = [];
  let cycleTimer = null;
  let typeToken = 0;

  // ── Layout ────────────────────────────────────────────────────────────────
  const root = h("div", { className: "sl-root" });

  // Persona icon grid
  const personaWrap = h("div", { className: "sl-personaWrap" });
  const personaGrid = h("div", { className: "sl-personas" });
  const personaBtns = {};
  PERSONAS.forEach((p) => {
    const btn = h("button", { className: "sl-persona", title: p.role });
    btn.append(
      h("span", { className: "sl-persona__icon" }, p.emoji),
      h("span", { className: "sl-persona__label" }, p.label),
    );
    btn.addEventListener("click", () => { mark(); selectPersona(p.id); });
    personaBtns[p.id] = btn;
    personaGrid.append(btn);
  });
  personaWrap.append(personaGrid);

  // Two-column body
  const grid = h("div", { className: "sl-grid" });

  // ── Left controls ──
  const controls = h("div", { className: "sl-controls" });
  const segApis = {
    voice: buildSegmented({ label: "Voice", opts: VOICE, get: () => state.voice, set: (v) => state.voice = v }),
    tone:  buildSegmented({ label: "Tone",  opts: TONE,  get: () => state.tone,  set: (v) => state.tone  = v }),
  };
  const ddApis = {
    autonomy:  buildDropdown({ label: "Autonomy",  opts: AUTO_OPTS,      get: () => state.autonomy,  set: (v) => state.autonomy  = v }),
    uncertain: buildDropdown({ label: "When unsure", opts: UNCERTAIN_OPTS, get: () => state.uncertain, set: (v) => state.uncertain = v }),
  };
  const sliderApi = buildSlider({ label: "Privacy care", levels: PRIVACY_LEVELS, get: () => state.privacy, set: (v) => state.privacy = v });
  const chipsApi  = buildChips({   label: "Vibe",         pool:   VIBE_POOL,      get: () => state.vibe,    set: (v) => state.vibe    = v, max: 3 });

  controls.append(
    segApis.voice.row,
    segApis.tone.row,
    h("div", { className: "sl-row2col" }, ddApis.autonomy.row, ddApis.uncertain.row),
    sliderApi.row,
    chipsApi.row,
  );

  // ── Right preview ──
  const preview = h("div", { className: "sl-preview" });
  const previewHead = h("div", { className: "sl-preview__head" },
    h("span", { className: "sl-preview__title" }, "Soul preview"),
  );
  const viewToggle = h("button", { className: "sl-viewtoggle", title: "View as SOUL.md" });
  viewToggle.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> SOUL.md`;
  viewToggle.addEventListener("click", () => { mark(); setView(state.view === "card" ? "md" : "card"); });
  previewHead.append(viewToggle);

  const cardView = h("div", { className: "sl-cardview" });
  const avatar   = h("div", { className: "sl-avatar" });
  const nameEl   = h("div", { className: "sl-name" });
  const subEl    = h("div", { className: "sl-sub" });
  const paraEl   = h("p", { className: "sl-para" });
  const traitsEl = h("div", { className: "sl-traits" });
  cardView.append(
    h("div", { className: "sl-cardhead" }, avatar, h("div", { className: "sl-namebox" }, nameEl, subEl)),
    paraEl,
    traitsEl,
  );

  const mdView = h("div", { className: "sl-md" });
  mdView.style.display = "none";

  preview.append(previewHead, cardView, mdView);

  grid.append(controls, preview);
  root.append(personaWrap, grid);
  container.append(root);

  selectPersona(state.personaId, true);
  scheduleCycle();

  // ── Builders ──────────────────────────────────────────────────────────────
  function buildSegmented({ label, opts, get, set }) {
    const row = h("div", { className: "sl-row" });
    row.append(h("div", { className: "sl-row__label" }, label));
    const seg = h("div", { className: "sl-seg" });
    seg.style.setProperty("--n", String(opts.length));
    seg.append(h("span", { className: "sl-seg__pill" }));
    const items = opts.map((opt) => {
      const item = h("button", { className: "sl-seg__item" }, opt.label);
      item.addEventListener("click", () => { set(opt.id); setActive(opt.id); mark(); renderPreview(); });
      return item;
    });
    items.forEach((it) => seg.append(it));
    row.append(seg);
    function setActive(id) {
      const idx = opts.findIndex((o) => o.id === id);
      seg.style.setProperty("--i", String(idx));
      items.forEach((el, i) => el.classList.toggle("sl-seg__item--active", i === idx));
    }
    setActive(get());
    return { row, setActive };
  }

  function buildDropdown({ label, opts, get, set }) {
    const row = h("div", { className: "sl-row" });
    row.append(h("div", { className: "sl-row__label" }, label));
    const dd = h("div", { className: "sl-dd" });
    const trigger = h("button", { className: "sl-dd__trigger" });
    const triggerLabel = h("span", { className: "sl-dd__triggerLabel" });
    const chev = h("span", { className: "sl-dd__chev" });
    chev.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
    trigger.append(triggerLabel, chev);
    const menu = h("div", { className: "sl-dd__menu" });

    opts.forEach((opt) => {
      const item = h("div", { className: "sl-dd__item" });
      item.append(h("div", { className: "sl-dd__itemLabel" }, opt.label));
      if (opt.hint) item.append(h("div", { className: "sl-dd__itemHint" }, opt.hint));
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        set(opt.id);
        setActive(opt.id);
        closeMenu();
        mark();
        renderPreview();
      });
      menu.append(item);
    });

    function openMenu()  { dd.classList.add("sl-dd--open");  document.addEventListener("click", outside, true); }
    function closeMenu() { dd.classList.remove("sl-dd--open"); document.removeEventListener("click", outside, true); }
    function outside(e)  { if (!dd.contains(e.target)) closeMenu(); }

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      mark();
      if (dd.classList.contains("sl-dd--open")) closeMenu();
      else openMenu();
    });

    dd.append(trigger, menu);
    row.append(dd);

    function setActive(id) {
      const opt = opts.find((o) => o.id === id);
      if (!opt) return;
      triggerLabel.textContent = opt.label;
      menu.querySelectorAll(".sl-dd__item").forEach((el, i) => el.classList.toggle("sl-dd__item--active", opts[i].id === id));
    }
    setActive(get());
    return { row, setActive };
  }

  function buildSlider({ label, levels, get, set }) {
    const row = h("div", { className: "sl-row" });
    const head = h("div", { className: "sl-slider__head" });
    head.append(
      h("div", { className: "sl-row__label" }, label),
      h("div", { className: "sl-slider__value" }, PRIVACY_LABEL[get()]),
    );
    row.append(head);
    const track = h("div", { className: "sl-slider" });
    const dots = levels.map((lvl, i) => {
      const dot = h("button", { className: "sl-slider__dot", title: PRIVACY_LABEL[lvl] });
      dot.addEventListener("click", () => { set(lvl); setActive(lvl); mark(); renderPreview(); });
      return dot;
    });
    dots.forEach((d) => track.append(d));
    row.append(track);

    function setActive(id) {
      const idx = levels.indexOf(id);
      dots.forEach((d, i) => {
        d.classList.toggle("sl-slider__dot--on", i <= idx);
        d.classList.toggle("sl-slider__dot--active", i === idx);
      });
      head.querySelector(".sl-slider__value").textContent = PRIVACY_LABEL[id];
    }
    setActive(get());
    return { row, setActive };
  }

  function buildChips({ label, pool, get, set, max }) {
    const row = h("div", { className: "sl-row" });
    row.append(
      h("div", { className: "sl-row__head" },
        h("div", { className: "sl-row__label" }, label),
        h("div", { className: "sl-row__count" }, ""),
      ),
    );
    const wrap = h("div", { className: "sl-chips" });
    pool.forEach((opt) => {
      const chip = h("button", { className: "sl-chip" }, opt);
      chip.addEventListener("click", () => {
        let next = (get() || []).slice();
        if (next.includes(opt)) next = next.filter((x) => x !== opt);
        else next = [...next, opt].slice(-max);
        set(next);
        setActive(next);
        mark();
        renderPreview();
      });
      wrap.append(chip);
    });
    row.append(wrap);

    function setActive(values) {
      wrap.querySelectorAll(".sl-chip").forEach((el) => el.classList.toggle("sl-chip--on", values.includes(el.textContent)));
      row.querySelector(".sl-row__count").textContent = `${values.length}/${max}`;
    }
    setActive(get());
    return { row, setActive };
  }

  // ── Persona handling ──────────────────────────────────────────────────────
  function selectPersona(id, initial = false) {
    const wasId = state.personaId;
    state.personaId = id;
    Object.assign(state, PERSONA_DEFAULTS[id]);
    state.vibe = state.vibe.filter((v) => VIBE_POOL.includes(v));
    Object.entries(personaBtns).forEach(([k, b]) => b.classList.toggle("sl-persona--active", k === id));

    // Make the selection visible
    if (!initial && id !== wasId) {
      personaBtns[id].classList.remove("sl-persona--ping");
      void personaBtns[id].offsetWidth;
      personaBtns[id].classList.add("sl-persona--ping");
    }

    segApis.voice.setActive(state.voice);
    segApis.tone.setActive(state.tone);
    ddApis.autonomy.setActive(state.autonomy);
    ddApis.uncertain.setActive(state.uncertain);
    sliderApi.setActive(state.privacy);
    chipsApi.setActive(state.vibe);
    renderPreview(initial);
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  function renderPreview(initial = false) {
    const p = PERSONAS.find((x) => x.id === state.personaId);

    // Avatar swap
    if (!initial) {
      avatar.classList.remove("sl-avatar--swap");
      void avatar.offsetWidth;
      avatar.classList.add("sl-avatar--swap");
    }
    avatar.textContent = p.emoji;
    nameEl.textContent = `${p.label} Soul`;
    subEl.textContent  = p.role;

    const paragraph = `Replies ${VOICE_PHRASE[state.voice]} in ${TONE_PHRASE[state.tone]}. ${AUTO_PHRASE[state.autonomy]} ${UNCERTAIN_PHRASE[state.uncertain]}`;
    if (initial) {
      paraEl.textContent = paragraph;
    } else {
      typeParagraph(paragraph);
    }

    // Traits with stagger
    traitsEl.innerHTML = "";
    state.vibe.forEach((d, i) => {
      const t = h("span", { className: "sl-trait" }, d);
      t.style.animationDelay = `${i * 80}ms`;
      traitsEl.append(t);
    });

    renderMarkdown(initial);
  }

  function typeParagraph(text) {
    const my = ++typeToken;
    paraEl.textContent = "";
    paraEl.classList.add("sl-para--typing");
    let i = 0;
    function step() {
      if (my !== typeToken) return;
      if (i >= text.length) {
        paraEl.classList.remove("sl-para--typing");
        return;
      }
      const chunk = Math.min(2, text.length - i);
      paraEl.textContent = text.slice(0, i + chunk);
      i += chunk;
      setTimeout(step, 11);
    }
    step();
  }

  function renderMarkdown(initial) {
    const lines = compileSoul(state);
    const prevByKey = new Map(prevLines.map((l) => [l.key, l]));
    const nextKeys = new Set(lines.map((l) => l.key));
    const existing = new Map();
    mdView.querySelectorAll("[data-key]").forEach((el) => existing.set(el.dataset.key, el));
    existing.forEach((el, key) => { if (!nextKeys.has(key)) el.remove(); });

    let cursor = null;
    lines.forEach((line) => {
      let el = existing.get(line.key);
      const wasNew = !el;
      const wasChanged = !wasNew && prevByKey.get(line.key)?.text !== line.text;
      if (!el) { el = h("div", { className: "sl-mdline" }); el.dataset.key = line.key; }
      el.classList.toggle("sl-mdline--blank",   line.kind === "blank");
      el.classList.toggle("sl-mdline--h1",      line.kind === "h1");
      el.classList.toggle("sl-mdline--comment", line.kind === "comment");
      if (line.kind === "blank") el.innerHTML = "&nbsp;";
      else if (wasChanged) el.innerHTML = highlightDiff(prevByKey.get(line.key).text, line.text);
      else el.textContent = line.text;
      const ref = cursor ? cursor.nextSibling : mdView.firstChild;
      if (ref !== el) mdView.insertBefore(el, ref);
      cursor = el;
      if (!initial && (wasNew || wasChanged)) {
        el.classList.remove("sl-mdline--pulse");
        void el.offsetWidth;
        el.classList.add("sl-mdline--pulse");
      }
    });
    prevLines = lines;
  }

  function highlightDiff(prev, next) {
    let s = 0;
    while (s < prev.length && s < next.length && prev[s] === next[s]) s++;
    let ep = prev.length, en = next.length;
    while (ep > s && en > s && prev[ep - 1] === next[en - 1]) { ep--; en--; }
    if (s === en) return esc(next);
    return `${esc(next.slice(0, s))}<span class="sl-mdline__hl">${esc(next.slice(s, en))}</span>${esc(next.slice(en))}`;
  }

  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]); }

  function setView(v) {
    state.view = v;
    cardView.style.display = v === "card" ? "" : "none";
    mdView.style.display   = v === "md"   ? "" : "none";
    viewToggle.classList.toggle("sl-viewtoggle--on", v === "md");
  }

  // ── Auto-cycle ────────────────────────────────────────────────────────────
  function scheduleCycle() {
    clearTimeout(cycleTimer);
    if (state.interacted) return;
    cycleTimer = setTimeout(() => {
      if (state.interacted) return;
      const order = PERSONAS.map((p) => p.id);
      const next = order[(order.indexOf(state.personaId) + 1) % order.length];
      selectPersona(next);
      scheduleCycle();
    }, 4000);
  }

  function mark() {
    if (state.interacted) return;
    state.interacted = true;
    clearTimeout(cycleTimer);
  }
}
