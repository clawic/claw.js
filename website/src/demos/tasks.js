import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── TASKS / KANBAN DEMO ────────────────────────────────────────────────────

export function mountTasks(container) {
  const COLUMNS = [
    { id: "backlog", label: "Backlog",     dot: "var(--gray-600)" },
    { id: "todo",    label: "To Do",       dot: "#f59e0b" },
    { id: "doing",   label: "In Progress", dot: "#3b82f6" },
    { id: "done",    label: "Done",        dot: "#34d399" },
  ];

  const PRIORITY_COLORS = { urgent: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#6b7280" };
  const PRIORITY_LABELS = { urgent: "Urgent", high: "High", medium: "Med", low: "Low" };
  const TAG_COLORS = {
    onboarding: { bg: "rgba(52,211,153,0.12)", color: "#34d399" },
    marketing:  { bg: "rgba(59,130,246,0.12)", color: "#60a5fa" },
    support:    { bg: "rgba(244,114,182,0.12)", color: "#f472b6" },
    finance:    { bg: "rgba(251,191,36,0.12)", color: "#fbbf24" },
    ops:        { bg: "rgba(168,85,247,0.12)", color: "#a855f7" },
    product:    { bg: "rgba(99,102,241,0.12)", color: "#818cf8" },
    sales:      { bg: "rgba(236,72,153,0.12)", color: "#ec4899" },
    hr:         { bg: "rgba(20,184,166,0.12)", color: "#14b8a6" },
  };

  // Named AI agents
  const AGENTS = {
    ops:       { name: "Ops Agent",       initials: "OA", color: "#a855f7" },
    marketing: { name: "Marketing Agent", initials: "MA", color: "#60a5fa" },
    support:   { name: "Support Agent",   initials: "SA", color: "#f472b6" },
    finance:   { name: "Finance Agent",   initials: "FA", color: "#fbbf24" },
    hr:        { name: "HR Agent",        initials: "HR", color: "#14b8a6" },
    sales:     { name: "Sales Agent",     initials: "SL", color: "#ec4899" },
  };

  const cards = [
    { id: "t1", title: "Draft Q2 campaign brief",          col: "doing",   priority: "high",   tags: ["marketing"],            agent: "marketing", progress: 65, due: "Today" },
    { id: "t2", title: "Resolve billing escalation #4021", col: "todo",    priority: "urgent", tags: ["support", "finance"],   agent: "support",   due: "Today" },
    { id: "t3", title: "Send offer letter to M. Torres",   col: "todo",    priority: "high",   tags: ["hr"],                  agent: "hr",        due: "Tomorrow" },
    { id: "t4", title: "Audit AWS spend for March",        col: "doing",   priority: "high",   tags: ["ops", "finance"],      agent: "finance",   progress: 40, subtasks: [3, 7] },
    { id: "t5", title: "Update pricing page copy",         col: "backlog", priority: "medium", tags: ["marketing", "product"], agent: null },
    { id: "t6", title: "Prepare investor deck update",     col: "backlog", priority: "medium", tags: ["finance"],             agent: null,        due: "Apr 2" },
    { id: "t7", title: "Close Acme Corp renewal",          col: "done",    priority: "high",   tags: ["sales"],               agent: "sales",     progress: 100 },
    { id: "t8", title: "Deploy monitoring dashboards",     col: "done",    priority: "medium", tags: ["ops"],                 agent: "ops",       progress: 100 },
    { id: "t9", title: "Schedule team retrospective",      col: "todo",    priority: "low",    tags: ["ops", "hr"],           agent: null,        due: "Mar 31" },
  ];

  // Animation sequence: agents pick up, work, complete
  const animations = [
    { cardId: "t2", to: "doing",  delay: 3000,  agent: "support",   log: "Picked up billing escalation #4021" },
    { cardId: "t3", to: "doing",  delay: 6500,  agent: "hr",        log: "Started drafting offer letter" },
    { cardId: "t9", to: "doing",  delay: 10000, agent: "ops",       log: "Scheduled retro for Friday 3pm" },
    { cardId: "t2", to: "done",   delay: 14000, agent: "support",   log: "Resolved escalation, refund issued" },
    { cardId: "t5", to: "todo",   delay: 17000, agent: "marketing", log: "Queued pricing page for review" },
    { cardId: "t4", to: "done",   delay: 20500, agent: "finance",   log: "Completed AWS audit, saved $2.4k" },
    { cardId: "t3", to: "done",   delay: 24000, agent: "hr",        log: "Sent offer letter to M. Torres" },
  ];

  const columnEls = {};
  const cardEls = {};
  const countEls = {};

  // ── Build shell ──
  const shell = h("div", { className: "kb-shell" });

  // ── Kanban board (left) ──
  const board = h("div", { className: "kb-board" });

  // Top bar with logo
  const topbar = h("div", { className: "kb-topbar" });
  const topLeft = h("div", { className: "kb-topbar__left" });
  topLeft.innerHTML = `<img src="/logo.png" alt="" class="kb-topbar__logo"><span class="kb-topbar__brand">ClawJS</span><span class="kb-topbar__sep">/</span><span class="kb-topbar__page">Task Board</span>`;
  const topMeta = h("div", { className: "kb-topbar__meta" });
  const totalCount = h("span", { className: "kb-topbar__count" }, `${cards.length} tasks`);
  const filterBtn = h("button", { className: "kb-topbar__filter" });
  filterBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg><span>Filter</span>`;
  topMeta.append(totalCount, filterBtn);
  topbar.append(topLeft, topMeta);
  board.append(topbar);

  // Columns
  const columnsWrap = h("div", { className: "kb-columns" });

  COLUMNS.forEach((col) => {
    const colEl = h("div", { className: "kb-col" });
    const colHeader = h("div", { className: "kb-col__header" });
    const colDot = h("span", { className: "kb-col__dot" });
    colDot.style.background = col.dot;
    const colLabel = h("span", { className: "kb-col__label" }, col.label);
    const colCount = h("span", { className: "kb-col__count" });
    countEls[col.id] = colCount;
    colHeader.append(colDot, colLabel, colCount);
    colEl.append(colHeader);
    const colBody = h("div", { className: "kb-col__body" });
    columnEls[col.id] = colBody;
    colEl.append(colBody);
    columnsWrap.append(colEl);
  });

  board.append(columnsWrap);
  shell.append(board);

  // ── Activity feed (right sidebar) ──
  const feed = h("div", { className: "kb-feed" });
  const feedHeader = h("div", { className: "kb-feed__header" });
  const feedDot = h("span", { className: "kb-feed__live-dot" });
  feedHeader.append(feedDot, h("span", {}, "Agent Activity"));
  feed.append(feedHeader);
  const feedList = h("div", { className: "kb-feed__list" });

  // Seed initial feed items
  const seedLogs = [
    { agent: "ops",       text: "Deployed monitoring dashboards to prod", time: "2m ago" },
    { agent: "sales",     text: "Closed Acme Corp renewal for $48k ARR",  time: "8m ago" },
    { agent: "marketing", text: "Campaign brief at 65%, pulling Q1 data", time: "12m ago" },
    { agent: "finance",   text: "Started AWS cost audit for March",       time: "18m ago" },
  ];

  function createFeedItem(agentKey, text, timeText) {
    const item = h("div", { className: "kb-feed__item" });
    const agentData = AGENTS[agentKey];
    const avatar = h("span", { className: "kb-feed__avatar" });
    avatar.textContent = agentData.initials;
    avatar.style.background = agentData.color + "20";
    avatar.style.color = agentData.color;
    const content = h("div", { className: "kb-feed__content" });
    content.append(
      h("span", { className: "kb-feed__name" }, agentData.name),
      h("span", { className: "kb-feed__text" }, text)
    );
    const time = h("span", { className: "kb-feed__time" }, timeText);
    item.append(avatar, content, time);
    return item;
  }

  seedLogs.forEach((l) => feedList.append(createFeedItem(l.agent, l.text, l.time)));
  feed.append(feedList);
  shell.append(feed);

  container.append(shell);

  // ── Render a card ──
  function renderCard(card) {
    const el = h("div", { className: "kb-card" });
    el.dataset.id = card.id;

    // Top row: priority + due
    const top = h("div", { className: "kb-card__top" });
    const priBadge = h("span", { className: "kb-card__priority" });
    priBadge.textContent = PRIORITY_LABELS[card.priority];
    priBadge.style.color = PRIORITY_COLORS[card.priority];
    priBadge.style.background = PRIORITY_COLORS[card.priority] + "18";
    top.append(priBadge);
    if (card.due) {
      const due = h("span", { className: "kb-card__due" }, card.due);
      if (card.due === "Today" || card.due === "Tomorrow") due.classList.add("kb-card__due--soon");
      top.append(due);
    }
    el.append(top);

    // Title
    el.append(h("div", { className: `kb-card__title ${card.col === "done" ? "kb-card__title--done" : ""}` }, card.title));

    // Tags
    if (card.tags?.length) {
      const tagsRow = h("div", { className: "kb-card__tags" });
      card.tags.forEach((t) => {
        const tag = h("span", { className: "kb-card__tag" }, t);
        const tc = TAG_COLORS[t] || TAG_COLORS.product;
        tag.style.background = tc.bg;
        tag.style.color = tc.color;
        tagsRow.append(tag);
      });
      el.append(tagsRow);
    }

    // Bottom row: agent badge + progress
    const bottom = h("div", { className: "kb-card__bottom" });
    const left = h("div", { className: "kb-card__bottom-left" });

    if (card.agent) {
      const agentData = AGENTS[card.agent];
      const agentBadge = h("div", { className: "kb-card__agent" });
      const av = h("span", { className: "kb-card__avatar" }, agentData.initials);
      av.style.background = agentData.color + "20";
      av.style.color = agentData.color;
      agentBadge.append(av);
      if (card.col === "doing") {
        const pulse = h("span", { className: "kb-card__pulse" });
        pulse.style.background = agentData.color;
        agentBadge.append(pulse);
      }
      left.append(agentBadge);
    }

    if (card.subtasks) {
      left.append(h("span", { className: "kb-card__subtasks" }, `${card.subtasks[0]}/${card.subtasks[1]}`));
    }
    bottom.append(left);

    if (card.progress != null && card.progress > 0 && card.progress < 100) {
      const bar = h("div", { className: "kb-card__bar" });
      const fill = h("div", { className: "kb-card__bar-fill" });
      fill.style.width = card.progress + "%";
      bar.append(fill);
      bottom.append(bar);
    }

    el.append(bottom);
    if (card.col === "done") el.classList.add("kb-card--done");
    return el;
  }

  // ── Counts ──
  function updateCounts() {
    COLUMNS.forEach((col) => {
      countEls[col.id].textContent = cards.filter((c) => c.col === col.id).length;
    });
  }

  cards.forEach((card) => {
    const el = renderCard(card);
    cardEls[card.id] = el;
    columnEls[card.col].append(el);
  });
  updateCounts();

  // ── Add feed entry with animation ──
  function addFeedEntry(agentKey, text) {
    const item = createFeedItem(agentKey, text, "Just now");
    item.style.opacity = "0";
    item.style.transform = "translateY(-6px)";
    feedList.insertBefore(item, feedList.firstChild);
    requestAnimationFrame(() => {
      item.style.transition = "opacity 300ms ease, transform 300ms ease";
      item.style.opacity = "1";
      item.style.transform = "translateY(0)";
    });
    while (feedList.children.length > 6) feedList.lastChild.remove();
  }

  // ── Move card with agent context ──
  function moveCard(cardId, toCol, agentKey, logText) {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.col === toCol) return;
    if (agentKey) card.agent = agentKey;

    const el = cardEls[cardId];
    el.style.transition = "opacity 250ms ease, transform 250ms ease";
    el.style.opacity = "0";
    el.style.transform = "scale(0.95)";

    setTimeout(() => {
      card.col = toCol;
      el.remove();

      if (toCol === "done") {
        card.progress = 100;
        el.classList.add("kb-card--done");
        const titleEl = el.querySelector(".kb-card__title");
        if (titleEl) titleEl.classList.add("kb-card__title--done");
        const bar = el.querySelector(".kb-card__bar");
        if (bar) bar.parentElement.remove();
        const pulse = el.querySelector(".kb-card__pulse");
        if (pulse) pulse.remove();
      } else if (toCol === "doing" && card.agent) {
        // Add agent + pulse when agent picks up task
        let agentBadge = el.querySelector(".kb-card__agent");
        if (!agentBadge) {
          agentBadge = h("div", { className: "kb-card__agent" });
          const agentData = AGENTS[card.agent];
          const av = h("span", { className: "kb-card__avatar" }, agentData.initials);
          av.style.background = agentData.color + "20";
          av.style.color = agentData.color;
          agentBadge.append(av);
          const bottomLeft = el.querySelector(".kb-card__bottom-left");
          if (bottomLeft) bottomLeft.prepend(agentBadge);
        }
        if (!agentBadge.querySelector(".kb-card__pulse")) {
          const pulse = h("span", { className: "kb-card__pulse" });
          pulse.style.background = AGENTS[card.agent].color;
          agentBadge.append(pulse);
        }
      }

      const target = columnEls[toCol];
      if (target.firstChild) target.insertBefore(el, target.firstChild);
      else target.append(el);

      el.style.opacity = "0";
      el.style.transform = "translateY(-8px) scale(0.97)";
      requestAnimationFrame(() => {
        el.style.transition = "opacity 300ms ease, transform 300ms ease";
        el.style.opacity = "1";
        el.style.transform = "translateY(0) scale(1)";
      });

      updateCounts();
      if (logText && agentKey) addFeedEntry(agentKey, logText);
    }, 260);
  }

  // Progress animations
  function animateProgress(cardId, from, to, duration) {
    const el = cardEls[cardId];
    if (!el) return;
    const fill = el.querySelector(".kb-card__bar-fill");
    if (!fill) return;
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      fill.style.width = (from + (to - from) * t) + "%";
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // Save initial state for loop
  const initialState = {};
  cards.forEach((c) => { initialState[c.id] = { col: c.col, progress: c.progress, agent: c.agent }; });

  function scheduleAnimations() {
    // Reset
    cards.forEach((c) => {
      const s = initialState[c.id];
      c.col = s.col; c.progress = s.progress; c.agent = s.agent;
    });
    COLUMNS.forEach((col) => { columnEls[col.id].innerHTML = ""; });
    cards.forEach((card) => {
      const el = renderCard(card);
      cardEls[card.id] = el;
      columnEls[card.col].append(el);
    });
    updateCounts();
    feedList.innerHTML = "";
    seedLogs.forEach((l) => feedList.append(createFeedItem(l.agent, l.text, l.time)));

    // Progress ticks
    setTimeout(() => animateProgress("t1", 65, 90, 8000), 2000);
    setTimeout(() => animateProgress("t4", 40, 75, 6000), 4000);

    // Card moves + feed entries
    animations.forEach((a) => {
      setTimeout(() => moveCard(a.cardId, a.to, a.agent, a.log), a.delay);
    });

    setTimeout(scheduleAnimations, 28000);
  }

  scheduleAnimations();
}

