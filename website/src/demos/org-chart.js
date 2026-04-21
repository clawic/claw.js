import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── Org Chart / Team Builder Demo ───────────────────────────────────────────

const ORG_ICONS = {
  deploy: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`,
  email: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  git: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>`,
  check: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  code: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  chart: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  dollar: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  user: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  file: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  terminal: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
};

export function mountOrgChart(container) {
  const ROLE_COLORS = { executive: { bg: "rgba(212,50,74,0.12)", border: "rgba(212,50,74,0.3)", color: "#e33d55", glow: "rgba(212,50,74,0.15)" }, growth: { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.3)", color: "#3b82f6", glow: "rgba(59,130,246,0.15)" }, tech: { bg: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.3)", color: "#a855f7", glow: "rgba(168,85,247,0.15)" }, ops: { bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.3)", color: "#34d399", glow: "rgba(52,211,153,0.15)" }, finance: { bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.3)", color: "#fbbf24", glow: "rgba(251,191,36,0.15)" }, product: { bg: "rgba(244,114,182,0.12)", border: "rgba(244,114,182,0.3)", color: "#f472b6", glow: "rgba(244,114,182,0.15)" } };
  const nodes = [
    { id: "ceo", label: "CEO", initials: "CE", dept: "executive", parentId: null, agent: "Strategy Agent", status: "active", task: "Reviewing Q2 roadmap" },
    { id: "cmo", label: "CMO", initials: "CM", dept: "growth", parentId: "ceo", agent: "Growth Agent", status: "active", task: "Planning launch campaign" },
    { id: "cto", label: "CTO", initials: "CT", dept: "tech", parentId: "ceo", agent: "Tech Lead Agent", status: "active", task: "Evaluating infra costs" },
    { id: "coo", label: "COO", initials: "CO", dept: "ops", parentId: "ceo", agent: "Ops Agent", status: "active", task: "Optimizing workflows" },
    { id: "mkt", label: "Marketing Lead", initials: "ML", dept: "growth", parentId: "cmo", agent: "Content Agent", status: "active", task: "Drafting blog posts" },
    { id: "sales", label: "Sales Lead", initials: "SL", dept: "growth", parentId: "cmo", agent: "Sales Agent", status: "busy", task: "Closing Acme deal" },
    { id: "eng", label: "Lead Engineer", initials: "LE", dept: "tech", parentId: "cto", agent: "Code Agent", status: "active", task: "Shipping v2.1 release" },
    { id: "data", label: "Data Lead", initials: "DL", dept: "tech", parentId: "cto", agent: "Analytics Agent", status: "idle", task: null },
    { id: "hr", label: "People & Culture", initials: "HR", dept: "ops", parentId: "coo", agent: "HR Agent", status: "active", task: "Screening candidates" },
    { id: "fin", label: "Finance Lead", initials: "FL", dept: "finance", parentId: "coo", agent: "Finance Agent", status: "idle", task: null },
  ];
  const nodeEls = {}; let selectedId = "ceo"; let svgEl = null;
  const shell = h("div", { className: "org-shell" });
  const topbar = h("div", { className: "org-topbar" });
  const topLeft = h("div", { className: "org-topbar__left" });
  topLeft.innerHTML = `<img src="/logo.png" alt="" class="org-topbar__logo"><span class="org-topbar__brand">ClawJS</span><span class="org-topbar__sep">/</span><span class="org-topbar__page">Team Builder</span>`;
  const topMeta = h("div", { className: "org-topbar__meta" });
  const addBtn = h("button", { className: "org-topbar__add" });
  addBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Add Agent</span>`;
  topMeta.append(h("span", { className: "org-topbar__count" }, `${nodes.length} agents`), addBtn);
  topbar.append(topLeft, topMeta); shell.append(topbar);
  const body = h("div", { className: "org-body" });
  const chart = h("div", { className: "org-chart" });
  svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgEl.classList.add("org-chart__lines");
  svgEl.setAttribute("width", "100%"); svgEl.setAttribute("height", "100%");
  svgEl.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:visible";
  chart.append(svgEl);
  const nodesWrap = h("div", { className: "org-chart__nodes" });
  [["ceo"], ["cmo", "cto", "coo"], ["mkt", "sales", "eng", "data", "hr", "fin"]].forEach((levelIds, li) => {
    const row = h("div", { className: "org-chart__level" });
    if (li === 0) row.classList.add("org-chart__level--root");
    levelIds.forEach((id) => {
      const node = nodes.find((n) => n.id === id); const colors = ROLE_COLORS[node.dept];
      const el = h("div", { className: `org-node ${id === selectedId ? "org-node--selected" : ""} ${node.status === "idle" ? "org-node--idle" : ""}` });
      el.dataset.id = id;
      el.style.setProperty("--node-color", colors.color); el.style.setProperty("--node-bg", colors.bg);
      el.style.setProperty("--node-border", colors.border); el.style.setProperty("--node-glow", colors.glow);
      const avatarWrap = h("div", { className: "org-node__avatar-wrap" });
      const avatar = h("div", { className: "org-node__avatar" }); avatar.textContent = node.initials;
      avatar.style.background = colors.bg; avatar.style.color = colors.color; avatar.style.borderColor = colors.border;
      const sc = { active: "#34d399", busy: "#f59e0b", idle: "#3f3f46" };
      const dot = h("span", { className: `org-node__dot ${node.status !== "idle" ? "org-node__dot--active" : ""}` });
      dot.style.background = sc[node.status]; avatarWrap.append(avatar, dot);
      const info = h("div", { className: "org-node__info" });
      info.append(h("div", { className: "org-node__label" }, node.label), h("div", { className: "org-node__agent" }, node.agent));
      const editBtn = h("button", { className: "org-node__edit" });
      editBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
      el.append(avatarWrap, info, editBtn);
      if (node.task) { const tb = h("div", { className: "org-node__task" }); const tp = h("span", { className: "org-node__task-pulse" }); tp.style.background = colors.color; tb.append(tp, h("span", { className: "org-node__task-text" }, node.task)); el.append(tb); }
      el.addEventListener("click", () => { selectedId = id; Object.values(nodeEls).forEach((ne) => ne.classList.remove("org-node--selected")); el.classList.add("org-node--selected"); renderDetail(); });
      nodeEls[id] = el; row.append(el);
    }); nodesWrap.append(row);
  });
  chart.append(nodesWrap); body.append(chart);
  const sidebar = h("div", { className: "org-sidebar" }); const detail = h("div", { className: "org-detail" }); sidebar.append(detail);
  const feed = h("div", { className: "org-feed" }); const feedHeader = h("div", { className: "org-feed__header" });
  feedHeader.append(h("span", { className: "org-feed__live-dot" }), h("span", {}, "Team Activity"));
  feed.append(feedHeader); const feedList = h("div", { className: "org-feed__list" }); feed.append(feedList); sidebar.append(feed);
  body.append(sidebar); shell.append(body); container.append(shell);

  function renderDetail() {
    const node = nodes.find((n) => n.id === selectedId); if (!node) return; detail.innerHTML = "";
    const colors = ROLE_COLORS[node.dept];
    const header = h("div", { className: "org-detail__header" });
    const ba = h("div", { className: "org-detail__avatar" }); ba.textContent = node.initials;
    ba.style.background = colors.bg; ba.style.color = colors.color; ba.style.borderColor = colors.border;
    const hi = h("div", { className: "org-detail__info" });
    hi.append(h("div", { className: "org-detail__label" }, node.label), h("div", { className: "org-detail__agent" }, node.agent));
    const sb = h("span", { className: "org-detail__status" }); const sl = { active: "Running", busy: "Busy", idle: "Idle" }; const sc2 = { active: "#34d399", busy: "#f59e0b", idle: "#3f3f46" };
    sb.textContent = sl[node.status]; sb.style.color = sc2[node.status]; sb.style.background = sc2[node.status] + "18"; hi.append(sb);
    header.append(ba, hi); detail.append(header);
    if (node.task) { const s = h("div", { className: "org-detail__section" }); s.append(h("div", { className: "org-detail__section-label" }, "Current Task")); const tc = h("div", { className: "org-detail__task" }); const tp = h("span", { className: "org-detail__task-pulse" }); tp.style.background = colors.color; tc.append(tp, h("span", {}, node.task)); s.append(tc); detail.append(s); }
    if (node.parentId) { const p = nodes.find((n) => n.id === node.parentId); if (p) { const s = h("div", { className: "org-detail__section" }); s.append(h("div", { className: "org-detail__section-label" }, "Reports To"), h("div", { className: "org-detail__meta" }, `${p.label} (${p.agent})`)); detail.append(s); } }
    const reps = nodes.filter((n) => n.parentId === node.id);
    if (reps.length) { const s = h("div", { className: "org-detail__section" }); s.append(h("div", { className: "org-detail__section-label" }, `Direct Reports (${reps.length})`)); reps.forEach((r) => { const rc = ROLE_COLORS[r.dept]; const row = h("div", { className: "org-detail__report" }); const ra = h("span", { className: "org-detail__report-avatar" }); ra.textContent = r.initials; ra.style.background = rc.bg; ra.style.color = rc.color; row.append(ra, h("span", { className: "org-detail__report-name" }, r.label)); const rd = h("span", { className: "org-detail__report-dot" }); rd.style.background = ({ active: "#34d399", busy: "#f59e0b", idle: "#3f3f46" })[r.status]; row.append(rd); s.append(row); }); detail.append(s); }
    const actions = h("div", { className: "org-detail__actions" });
    [{ icon: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`, label: "Edit" }, { icon: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`, label: "Reassign" }, { icon: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`, label: "Remove" }].forEach((a) => { const btn = h("button", { className: "org-detail__action-btn" }); btn.innerHTML = a.icon; btn.append(h("span", {}, a.label)); actions.append(btn); });
    detail.append(actions); fadeIn(detail);
  }

  function drawConnections() { svgEl.querySelectorAll("path").forEach((p) => p.remove()); const cr = chart.getBoundingClientRect(); nodes.forEach((node) => { if (!node.parentId) return; const pe = nodeEls[node.parentId], ce = nodeEls[node.id]; if (!pe || !ce) return; const pr = pe.getBoundingClientRect(), ccr = ce.getBoundingClientRect(); const x1 = pr.left + pr.width/2 - cr.left, y1 = pr.top + pr.height - cr.top, x2 = ccr.left + ccr.width/2 - cr.left, y2 = ccr.top - cr.top, my = y1 + (y2-y1)/2; const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`); path.setAttribute("fill", "none"); path.setAttribute("stroke", ROLE_COLORS[node.dept].border); path.setAttribute("stroke-width", "1.5"); path.setAttribute("stroke-dasharray", "4 3"); path.classList.add("org-line"); svgEl.append(path); }); }

  const seedLogs = [
    { node: "ceo", text: "Aligned Q2 OKRs with all departments", time: "3m ago", icon: "chart", iconColor: "#e33d55" },
    { node: "eng", text: "Deployed v2.1-rc.3 to staging", time: "8m ago", icon: "deploy", iconColor: "#a855f7" },
    { node: "sales", text: "Moved Acme Corp to final negotiation", time: "12m ago", icon: "dollar", iconColor: "#3b82f6" },
    { node: "hr", text: "Shortlisted 4 candidates for eng role", time: "15m ago", icon: "user", iconColor: "#34d399" },
    { node: "mkt", text: "Published blog post: AI Agents at Scale", time: "22m ago", icon: "file", iconColor: "#3b82f6" },
  ];
  function createFeedItem(nid, text, time, ik, ic) { const node = nodes.find((n) => n.id === nid); const colors = ROLE_COLORS[node.dept]; const item = h("div", { className: "org-feed__item" }); const av = h("span", { className: "org-feed__avatar" }); av.textContent = node.initials; av.style.background = colors.bg; av.style.color = colors.color; const ct = h("div", { className: "org-feed__content" }); ct.append(h("span", { className: "org-feed__name" }, node.agent)); const te = h("span", { className: "org-feed__text" }); if (ik && ORG_ICONS[ik]) { const ai = h("span", { className: "org-feed__action-icon" }); ai.innerHTML = ORG_ICONS[ik]; ai.style.color = ic || colors.color; te.append(ai); } te.append(document.createTextNode(text)); ct.append(te); item.append(av, ct, h("span", { className: "org-feed__time" }, time)); return item; }
  function addFeedEntry(nid, text, ik, ic) { const item = createFeedItem(nid, text, "Just now", ik, ic); item.style.opacity = "0"; item.style.transform = "translateY(-6px)"; feedList.insertBefore(item, feedList.firstChild); requestAnimationFrame(() => { item.style.transition = "opacity 300ms ease, transform 300ms ease"; item.style.opacity = "1"; item.style.transform = "translateY(0)"; }); while (feedList.children.length > 7) feedList.lastChild.remove(); }
  function flashNode(nid) { const el = nodeEls[nid]; if (!el) return; el.classList.add("org-node--flash"); setTimeout(() => el.classList.remove("org-node--flash"), 900); }
  function updateNodeTask(nid, newTask, newStatus) { const node = nodes.find((n) => n.id === nid); if (!node) return; node.task = newTask; if (newStatus) node.status = newStatus; const el = nodeEls[nid]; const colors = ROLE_COLORS[node.dept]; const sc = { active: "#34d399", busy: "#f59e0b", idle: "#3f3f46" }; const dot = el.querySelector(".org-node__dot"); if (dot) { dot.style.background = sc[node.status]; dot.classList.toggle("org-node__dot--active", node.status !== "idle"); } el.classList.toggle("org-node--idle", node.status === "idle"); let tb = el.querySelector(".org-node__task"); if (newTask) { if (!tb) { tb = h("div", { className: "org-node__task" }); const tp = h("span", { className: "org-node__task-pulse" }); tp.style.background = colors.color; tb.append(tp, h("span", { className: "org-node__task-text" }, newTask)); tb.style.opacity = "0"; el.append(tb); requestAnimationFrame(() => { tb.style.transition = "opacity 300ms ease"; tb.style.opacity = "1"; }); } else { const te = tb.querySelector(".org-node__task-text"); if (te) te.textContent = newTask; } } else if (tb) { tb.style.transition = "opacity 200ms ease"; tb.style.opacity = "0"; setTimeout(() => tb.remove(), 200); } if (selectedId === nid) renderDetail(); flashNode(nid); }

  function showActionOverlay(nid, type, text) { const el = nodeEls[nid]; if (!el) return; el.querySelector(".org-node__action-overlay")?.remove(); const ov = h("div", { className: `org-node__action-overlay org-node__action-overlay--${type}` }); const iw = h("span", { className: "action-icon" }); if (type === "deploy") { iw.innerHTML = ORG_ICONS.terminal; const tw = h("span", { className: "action-text" }); ov.append(iw, tw); el.append(ov); ov.style.opacity = "0"; requestAnimationFrame(() => { ov.style.transition = "opacity 200ms ease"; ov.style.opacity = "1"; }); let i = 0; const cur = h("span", { className: "action-cursor" }); tw.append(cur); (function tc() { if (i < text.length) { tw.insertBefore(document.createTextNode(text[i]), cur); i++; setTimeout(tc, 45 + Math.random() * 30); } })(); } else { const im = { email: ORG_ICONS.email, review: ORG_ICONS.git }; iw.innerHTML = im[type] || ORG_ICONS.check; ov.append(iw, h("span", { className: "action-text" }, text)); el.append(ov); ov.style.opacity = "0"; requestAnimationFrame(() => { ov.style.transition = "opacity 200ms ease"; ov.style.opacity = "1"; }); } setTimeout(() => { ov.style.opacity = "0"; setTimeout(() => ov.remove(), 250); }, 2200); }
  function showSuccess(nid) { const el = nodeEls[nid]; if (!el) return; el.classList.add("org-node--success"); const ck = h("div", { className: "org-node__action-overlay org-node__action-overlay--success" }); ck.innerHTML = ORG_ICONS.check; ck.style.opacity = "0"; el.append(ck); requestAnimationFrame(() => { ck.style.transition = "opacity 200ms ease"; ck.style.opacity = "1"; }); setTimeout(() => { el.classList.remove("org-node--success"); ck.style.opacity = "0"; setTimeout(() => ck.remove(), 250); }, 800); }
  function showFloatingMetric(nid, text, color) { const el = nodeEls[nid]; if (!el) return; const m = h("div", { className: "org-floating-metric" }); m.textContent = text; m.style.color = color || "#34d399"; m.style.borderColor = (color || "#34d399") + "33"; m.style.left = "50%"; m.style.top = "-4px"; m.style.transform = "translateX(-50%) translateY(-100%)"; el.append(m); requestAnimationFrame(() => { m.style.animation = "org-float-up 2s ease-out forwards"; }); setTimeout(() => m.remove(), 2100); }
  function cascadePulse() { const order = [["ceo"], ["cmo", "cto", "coo"], ["mkt", "sales", "eng", "data", "hr", "fin"]]; let d = 0; order.forEach((lv) => { lv.forEach((id, i) => { setTimeout(() => { const el = nodeEls[id]; if (!el) return; el.classList.remove("org-node--cascade-pulse"); void el.offsetWidth; el.classList.add("org-node--cascade-pulse"); setTimeout(() => el.classList.remove("org-node--cascade-pulse"), 600); }, d + i * 80); }); d += 150; }); }

  const animations = [
    { delay: 2000, nodeId: "mkt", task: "A/B testing landing pages", status: "busy", log: "Started A/B test on 3 landing pages", feedIcon: "chart", feedIconColor: "#3b82f6", action: { type: "deploy", text: "> Running 3 variants..." } },
    { delay: 5000, nodeId: "data", task: "Building churn prediction model", status: "active", log: "Kicked off churn analysis pipeline", feedIcon: "code", feedIconColor: "#a855f7", action: { type: "deploy", text: "> Training ML model..." } },
    { delay: 8500, nodeId: "sales", task: "Negotiating Acme renewal", status: "active", log: "Sent revised proposal to Acme Corp", feedIcon: "email", feedIconColor: "#3b82f6", action: { type: "email", text: "Proposal sent to Acme" }, metric: { text: "+$48K", color: "#34d399" } },
    { delay: 11500, nodeId: "fin", task: "Generating March P&L report", status: "active", log: "Started monthly financial close", feedIcon: "dollar", feedIconColor: "#fbbf24", action: { type: "deploy", text: "> Aggregating data..." } },
    { delay: 14500, nodeId: "eng", task: "Reviewing PR #347: auth refactor", status: "busy", log: "Code reviewing PR #347, 12 files", feedIcon: "git", feedIconColor: "#f472b6", action: { type: "review", text: "Reviewing 12 files" }, metric: { text: "12 files changed", color: "#f472b6" } },
    { delay: 17500, nodeId: "ceo", task: "Preparing board deck for Friday", status: "busy", log: "Pulled Q2 metrics for investor update", feedIcon: "chart", feedIconColor: "#e33d55", action: { type: "deploy", text: "> Compiling Q2 metrics..." } },
    { delay: 20500, nodeId: "hr", task: "Sending offer to J. Martinez", status: "active", log: "Drafted offer letter, pending approval", feedIcon: "email", feedIconColor: "#34d399", action: { type: "email", text: "Offer letter drafted" } },
    { delay: 23500, nodeId: "data", task: null, status: "idle", log: "Churn model complete, AUC 0.89", feedIcon: "check", feedIconColor: "#34d399", success: true, metric: { text: "AUC: 0.89", color: "#a855f7" } },
    { delay: 26000, nodeId: "mkt", task: "Writing Q2 newsletter", status: "active", log: "A/B test done, variant B won (+18%)", feedIcon: "chart", feedIconColor: "#34d399", success: true, metric: { text: "+18% conversion", color: "#3b82f6" } },
    { delay: 29000, nodeId: "fin", task: null, status: "idle", log: "March P&L report generated and shared", feedIcon: "file", feedIconColor: "#fbbf24", success: true, metric: { text: "$1.2M revenue", color: "#fbbf24" } },
  ];
  const initialState = {}; nodes.forEach((n) => { initialState[n.id] = { task: n.task, status: n.status }; });
  function scheduleAnimations() {
    nodes.forEach((n) => { const s = initialState[n.id]; n.task = s.task; n.status = s.status; });
    Object.entries(nodeEls).forEach(([id, el]) => { const node = nodes.find((n) => n.id === id); const colors = ROLE_COLORS[node.dept]; const sc = { active: "#34d399", busy: "#f59e0b", idle: "#3f3f46" }; const dot = el.querySelector(".org-node__dot"); if (dot) { dot.style.background = sc[node.status]; dot.classList.toggle("org-node__dot--active", node.status !== "idle"); } el.classList.toggle("org-node--idle", node.status === "idle"); el.classList.remove("org-node--flash", "org-node--success", "org-node--cascade-pulse"); el.querySelector(".org-node__action-overlay")?.remove(); el.querySelectorAll(".org-floating-metric").forEach((m) => m.remove()); const tb = el.querySelector(".org-node__task"); if (node.task) { if (tb) { const te = tb.querySelector(".org-node__task-text"); if (te) te.textContent = node.task; tb.style.opacity = "1"; } else { const nb = h("div", { className: "org-node__task" }); const tp = h("span", { className: "org-node__task-pulse" }); tp.style.background = colors.color; nb.append(tp, h("span", { className: "org-node__task-text" }, node.task)); el.append(nb); } } else if (tb) { tb.remove(); } });
    selectedId = "ceo"; Object.values(nodeEls).forEach((el) => el.classList.remove("org-node--selected")); nodeEls["ceo"].classList.add("org-node--selected"); renderDetail();
    feedList.innerHTML = ""; seedLogs.forEach((l) => feedList.append(createFeedItem(l.node, l.text, l.time, l.icon, l.iconColor)));
    animations.forEach((a) => { setTimeout(() => { updateNodeTask(a.nodeId, a.task, a.status); addFeedEntry(a.nodeId, a.log, a.feedIcon, a.feedIconColor); if (a.action) setTimeout(() => showActionOverlay(a.nodeId, a.action.type, a.action.text), 400); if (a.success) setTimeout(() => showSuccess(a.nodeId), 300); if (a.metric) setTimeout(() => showFloatingMetric(a.nodeId, a.metric.text, a.metric.color), 800); }, a.delay); });
    setTimeout(() => cascadePulse(), 31500); setTimeout(scheduleAnimations, 34000);
  }
  renderDetail(); seedLogs.forEach((l) => feedList.append(createFeedItem(l.node, l.text, l.time, l.icon, l.iconColor)));
  requestAnimationFrame(() => { requestAnimationFrame(() => drawConnections()); });
  window.addEventListener("resize", drawConnections);
  setTimeout(scheduleAnimations, 1500);
}

