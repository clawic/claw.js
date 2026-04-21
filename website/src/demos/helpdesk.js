import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── Help Desk Demo ─────────────────────────────────────────────────────────

export function mountHelpDesk(container) {
  const AGENTS = {
    triage:   { name: "Triage Agent",   initials: "TA", color: "#3b82f6", photo: "https://randomuser.me/api/portraits/men/45.jpg" },
    support:  { name: "Support Agent",  initials: "SP", color: "#34d399", photo: "https://randomuser.me/api/portraits/women/33.jpg" },
    billing:  { name: "Billing Agent",  initials: "BA", color: "#fbbf24", photo: "https://randomuser.me/api/portraits/men/67.jpg" },
    escalate: { name: "Escalation Agent", initials: "EA", color: "#f472b6", photo: "https://randomuser.me/api/portraits/women/17.jpg" },
  };

  const PRIORITY_COLORS = { urgent: "#ef4444", high: "#f59e0b", normal: "#3b82f6", low: "#71717a" };

  const HD_ICONS = {
    ticket: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"/></svg>`,
    reply: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>`,
    check: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    alert: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    clock: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    tag: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
    star: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    close: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    send: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    user: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    bot: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="11"/><line x1="8" y1="16" x2="8" y2="16.01"/><line x1="16" y1="16" x2="16" y2="16.01"/></svg>`,
    escalation: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>`,
    resolved: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  };

  const tickets = [
    { id: "T-1042", subject: "Cannot access billing portal", from: "James Wilson", photo: "https://randomuser.me/api/portraits/men/22.jpg", email: "james@acme.co", priority: "urgent", status: "open", channel: "email", created: "4m ago", agent: "billing", tags: ["billing", "access"], sla: "15m" },
    { id: "T-1041", subject: "API rate limits too restrictive", from: "Sarah Chen", photo: "https://randomuser.me/api/portraits/women/68.jpg", email: "sarah@startup.io", priority: "high", status: "open", channel: "chat", created: "12m ago", agent: "support", tags: ["api", "limits"], sla: "1h" },
    { id: "T-1040", subject: "How to set up SSO?", from: "Mike Torres", photo: "https://randomuser.me/api/portraits/men/41.jpg", email: "mike@bigcorp.com", priority: "normal", status: "open", channel: "email", created: "28m ago", agent: "support", tags: ["sso", "setup"], sla: "4h" },
    { id: "T-1039", subject: "Webhook deliveries failing", from: "Priya Patel", photo: "https://randomuser.me/api/portraits/women/90.jpg", email: "priya@devhub.dev", priority: "high", status: "open", channel: "chat", created: "45m ago", agent: "triage", tags: ["webhooks", "bug"], sla: "1h" },
    { id: "T-1038", subject: "Request to upgrade plan", from: "Alex Morgan", photo: "https://randomuser.me/api/portraits/men/55.jpg", email: "alex@shopfront.co", priority: "normal", status: "open", channel: "email", created: "1h ago", agent: "billing", tags: ["billing", "upgrade"], sla: "4h" },
    { id: "T-1037", subject: "Dashboard loading slowly", from: "Lisa Park", photo: "https://randomuser.me/api/portraits/women/26.jpg", email: "lisa@analytics.io", priority: "low", status: "resolved", channel: "chat", created: "2h ago", agent: "support", tags: ["performance"], sla: "8h" },
    { id: "T-1036", subject: "Need invoice for March", from: "Tom Baker", photo: "https://randomuser.me/api/portraits/men/76.jpg", email: "tom@retail.com", priority: "low", status: "resolved", channel: "email", created: "3h ago", agent: "billing", tags: ["billing", "invoice"], sla: "8h" },
  ];

  const conversations = {
    "T-1042": [
      { from: "customer", name: "James Wilson", text: "I keep getting a 403 error when trying to open the billing page. This is blocking our payment update.", time: "4m ago" },
      { from: "agent", agent: "billing", text: "Looking into your account permissions now. I can see the issue, your role was recently changed and billing access was revoked.", time: "2m ago" },
    ],
    "T-1041": [
      { from: "customer", name: "Sarah Chen", text: "We're hitting the rate limit at just 100 req/s. Our integration needs at least 500. Can you increase this?", time: "12m ago" },
      { from: "agent", agent: "support", text: "I can see your current plan allows 100 req/s. Let me check if we can temporarily increase your limit while we discuss an upgrade.", time: "8m ago" },
    ],
    "T-1040": [
      { from: "customer", name: "Mike Torres", text: "Hi, we need to configure SSO with Okta for our team. Is there a guide or can you walk me through it?", time: "28m ago" },
    ],
    "T-1039": [
      { from: "customer", name: "Priya Patel", text: "Our webhook endpoint is returning 200 but ClawJS shows deliveries as failed. Started about 2 hours ago.", time: "45m ago" },
      { from: "agent", agent: "triage", text: "I can confirm there's a known issue with webhook delivery status tracking. Engineering is aware. Let me escalate this.", time: "30m ago" },
    ],
    "T-1038": [
      { from: "customer", name: "Alex Morgan", text: "We'd like to move from the Starter plan to Business. Can you help with the transition?", time: "1h ago" },
    ],
    "T-1037": [
      { from: "customer", name: "Lisa Park", text: "The main dashboard takes 15+ seconds to load. It was fine last week.", time: "2h ago" },
      { from: "agent", agent: "support", text: "We identified a query optimization issue and deployed a fix. Please try again and let me know if the performance is better.", time: "1h ago" },
      { from: "customer", name: "Lisa Park", text: "Yes, it's much faster now. Thanks!", time: "50m ago" },
    ],
    "T-1036": [
      { from: "customer", name: "Tom Baker", text: "Can you send me the invoice for March? I need it for our accounting.", time: "3h ago" },
      { from: "agent", agent: "billing", text: "I've generated your March invoice and sent it to tom@retail.com. Let me know if you need anything else.", time: "2h ago" },
    ],
  };

  let selectedId = "T-1042";
  let activeFilter = "open";

  // ── Build shell ──
  const shell = h("div", { className: "hd-shell" });

  // ── Top bar ──
  const topbar = h("div", { className: "hd-topbar" });
  const topLeft = h("div", { className: "hd-topbar__left" });
  topLeft.innerHTML = `<img src="/logo.png" alt="" class="hd-topbar__logo"><span class="hd-topbar__brand">ClawJS</span><span class="hd-topbar__sep">/</span><span class="hd-topbar__page">Help Desk</span>`;
  const topRight = h("div", { className: "hd-topbar__meta" });

  // Metrics bar
  const metricsBar = h("div", { className: "hd-topbar__metrics" });
  const metricOpen = h("span", { className: "hd-metric" });
  metricOpen.innerHTML = `<span class="hd-metric__dot hd-metric__dot--open"></span><span class="hd-metric__val" id="hd-metric-open">5</span><span class="hd-metric__label">Open</span>`;
  const metricAvg = h("span", { className: "hd-metric" });
  metricAvg.innerHTML = `<span class="hd-metric__dot hd-metric__dot--avg"></span><span class="hd-metric__val">2.4m</span><span class="hd-metric__label">Avg Reply</span>`;
  const metricCsat = h("span", { className: "hd-metric" });
  metricCsat.innerHTML = `<span class="hd-metric__dot hd-metric__dot--csat"></span><span class="hd-metric__val">98%</span><span class="hd-metric__label">CSAT</span>`;
  metricsBar.append(metricOpen, metricAvg, metricCsat);
  topRight.append(metricsBar);
  topbar.append(topLeft, topRight);
  shell.append(topbar);

  // ── Body ──
  const body = h("div", { className: "hd-body" });

  // ── LEFT: Ticket inbox ──
  const inbox = h("div", { className: "hd-inbox" });

  // Search
  const searchWrap = h("div", { className: "hd-inbox__search" });
  searchWrap.innerHTML = `<svg class="hd-inbox__search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
  const searchInput = h("input", { className: "hd-inbox__input", type: "text", placeholder: "Search tickets..." });
  searchWrap.append(searchInput);
  inbox.append(searchWrap);

  // Status filters
  const filters = h("div", { className: "hd-inbox__filters" });
  const filterItems = [
    { id: "open", label: "Open" },
    { id: "resolved", label: "Resolved" },
    { id: "all", label: "All" },
  ];
  const filterEls = {};
  filterItems.forEach((f) => {
    const btn = h("button", { className: `hd-filter ${f.id === activeFilter ? "hd-filter--active" : ""}` }, f.label);
    btn.addEventListener("click", () => {
      activeFilter = f.id;
      Object.values(filterEls).forEach((el) => el.classList.remove("hd-filter--active"));
      btn.classList.add("hd-filter--active");
      renderInbox();
    });
    filterEls[f.id] = btn;
    filters.append(btn);
  });
  inbox.append(filters);

  // Ticket list
  const ticketList = h("div", { className: "hd-inbox__list" });
  inbox.append(ticketList);
  body.append(inbox);

  // ── CENTER: Conversation ──
  const convo = h("div", { className: "hd-convo" });
  body.append(convo);

  // ── RIGHT: Ticket detail + agent feed ──
  const sidebar = h("div", { className: "hd-sidebar" });
  body.append(sidebar);

  shell.append(body);
  container.append(shell);

  // ── Render inbox item ──
  function renderTicketItem(ticket) {
    const item = h("div", { className: `hd-ticket ${ticket.id === selectedId ? "hd-ticket--active" : ""}` });
    item.dataset.id = ticket.id;

    const avatarWrap = h("div", { className: "hd-ticket__avatar-wrap" });
    const avatar = h("img", { className: "hd-ticket__avatar", src: ticket.photo, alt: "" });
    const priorityDot = h("span", { className: "hd-ticket__priority" });
    priorityDot.style.background = PRIORITY_COLORS[ticket.priority];
    if (ticket.priority === "urgent") priorityDot.classList.add("hd-ticket__priority--pulse");
    avatarWrap.append(avatar, priorityDot);

    const info = h("div", { className: "hd-ticket__info" });
    const topRow = h("div", { className: "hd-ticket__top" });
    topRow.append(
      h("span", { className: "hd-ticket__id" }, ticket.id),
      h("span", { className: "hd-ticket__time" }, ticket.created)
    );
    info.append(topRow);
    info.append(h("div", { className: "hd-ticket__subject" }, ticket.subject));

    const bottomRow = h("div", { className: "hd-ticket__bottom" });
    bottomRow.append(h("span", { className: "hd-ticket__from" }, ticket.from));
    if (ticket.status === "resolved") {
      const badge = h("span", { className: "hd-ticket__badge hd-ticket__badge--resolved" }, "Resolved");
      bottomRow.append(badge);
    } else {
      const badge = h("span", { className: `hd-ticket__badge hd-ticket__badge--${ticket.priority}` }, ticket.priority);
      bottomRow.append(badge);
    }
    info.append(bottomRow);

    item.append(avatarWrap, info);

    item.addEventListener("click", () => {
      selectedId = ticket.id;
      renderInbox();
      renderConversation();
      renderSidebar();
    });

    return item;
  }

  // ── Render inbox ──
  function renderInbox() {
    const filtered = tickets.filter((t) => {
      if (activeFilter === "open") return t.status === "open";
      if (activeFilter === "resolved") return t.status === "resolved";
      return true;
    });
    ticketList.innerHTML = "";
    filtered.forEach((t) => ticketList.append(renderTicketItem(t)));
  }

  // ── Render conversation ──
  function renderConversation() {
    const ticket = tickets.find((t) => t.id === selectedId);
    if (!ticket) return;
    convo.innerHTML = "";

    // Conversation header
    const header = h("div", { className: "hd-convo__header" });
    const headerLeft = h("div", { className: "hd-convo__header-left" });
    const headerMeta = h("div", { className: "hd-convo__header-meta" });
    const customerPhoto = h("img", { className: "hd-convo__customer-photo", src: ticket.photo, alt: "" });
    const headerTexts = h("div", { className: "hd-convo__header-texts" });
    headerTexts.append(
      h("span", { className: "hd-convo__title" }, ticket.subject),
      h("span", { className: "hd-convo__meta" }, `${ticket.from} via ${ticket.channel}`)
    );
    headerMeta.append(customerPhoto, headerTexts);
    headerLeft.append(headerMeta);
    const headerRight = h("div", { className: "hd-convo__header-right" });
    if (ticket.status !== "resolved") {
      const slaEl = h("span", { className: "hd-convo__sla" });
      slaEl.innerHTML = `${HD_ICONS.clock}<span>SLA: ${ticket.sla}</span>`;
      headerRight.append(slaEl);
    } else {
      const resolvedEl = h("span", { className: "hd-convo__resolved-badge" });
      resolvedEl.innerHTML = `${HD_ICONS.resolved}<span>Resolved</span>`;
      headerRight.append(resolvedEl);
    }
    header.append(headerLeft, headerRight);
    convo.append(header);

    // Messages
    const messages = h("div", { className: "hd-convo__messages" });
    const msgs = conversations[ticket.id] || [];
    msgs.forEach((msg) => {
      const bubble = h("div", { className: `hd-msg ${msg.from === "agent" ? "hd-msg--agent" : "hd-msg--customer"}` });

      const avatarEl = h("img", { className: `hd-msg__avatar ${msg.from === "agent" ? "hd-msg__avatar--agent" : ""}`, alt: "" });
      if (msg.from === "agent") {
        const agentData = AGENTS[msg.agent];
        avatarEl.src = agentData.photo;
        avatarEl.style.boxShadow = `0 0 0 2px ${agentData.color}44`;
      } else {
        avatarEl.src = ticket.photo;
      }

      const content = h("div", { className: "hd-msg__content" });
      const nameRow = h("div", { className: "hd-msg__meta" });
      const senderName = msg.from === "agent" ? AGENTS[msg.agent].name : msg.name;
      nameRow.append(
        h("span", { className: "hd-msg__name" }, senderName),
        h("span", { className: "hd-msg__time" }, msg.time)
      );
      content.append(nameRow);
      content.append(h("div", { className: "hd-msg__text" }, msg.text));

      bubble.append(avatarEl, content);
      messages.append(bubble);
    });
    convo.append(messages);

    // Reply bar (non-functional, decorative)
    if (ticket.status !== "resolved") {
      const replyBar = h("div", { className: "hd-convo__reply" });
      replyBar.innerHTML = `<span class="hd-convo__reply-text">Agent composing reply...</span><span class="hd-convo__reply-send">${HD_ICONS.send}</span>`;
      convo.append(replyBar);
    }

    fadeIn(convo);
  }

  // ── Render sidebar ──
  function renderSidebar() {
    const ticket = tickets.find((t) => t.id === selectedId);
    if (!ticket) return;
    sidebar.innerHTML = "";

    // Ticket detail section
    const detailSection = h("div", { className: "hd-sidebar__section" });
    detailSection.append(h("div", { className: "hd-sidebar__label" }, "Ticket Details"));

    const rows = [
      { label: "Status", value: ticket.status, isStatus: true },
      { label: "Priority", value: ticket.priority, isPriority: true },
      { label: "Assigned", value: ticket.agent ? AGENTS[ticket.agent].name : "Unassigned", isAgent: true },
      { label: "Channel", value: ticket.channel },
      { label: "SLA", value: ticket.sla },
    ];

    rows.forEach((r) => {
      const row = h("div", { className: "hd-sidebar__row" });
      row.append(h("span", { className: "hd-sidebar__row-label" }, r.label));
      const val = h("span", { className: "hd-sidebar__row-value" });
      if (r.isStatus) {
        const dot = h("span", { className: "hd-sidebar__status-dot" });
        dot.style.background = ticket.status === "resolved" ? "#34d399" : "#3b82f6";
        val.append(dot);
        val.append(document.createTextNode(r.value));
      } else if (r.isPriority) {
        const dot = h("span", { className: "hd-sidebar__priority-dot" });
        dot.style.background = PRIORITY_COLORS[ticket.priority];
        val.append(dot);
        val.append(document.createTextNode(r.value));
      } else if (r.isAgent && ticket.agent) {
        const agentPhoto = h("img", { className: "hd-sidebar__agent-photo", src: AGENTS[ticket.agent].photo, alt: "" });
        val.append(agentPhoto);
        val.append(document.createTextNode(r.value));
      } else {
        val.textContent = r.value;
      }
      row.append(val);
      detailSection.append(row);
    });

    // Tags
    const tagsRow = h("div", { className: "hd-sidebar__tags" });
    ticket.tags.forEach((tag) => {
      tagsRow.append(h("span", { className: "hd-sidebar__tag" }, tag));
    });
    detailSection.append(tagsRow);
    sidebar.append(detailSection);

    // Agent activity feed
    const feedSection = h("div", { className: "hd-sidebar__section hd-sidebar__section--feed" });
    const feedHeader = h("div", { className: "hd-sidebar__feed-header" });
    const liveDot = h("span", { className: "hd-sidebar__live-dot" });
    feedHeader.append(liveDot, h("span", {}, "Agent Activity"));
    feedSection.append(feedHeader);

    const feedListEl = h("div", { className: "hd-sidebar__feed-list" });
    feedSection.append(feedListEl);
    sidebar.append(feedSection);

    fadeIn(sidebar);
  }

  // ── Feed management ──
  function addFeedEntry(agentKey, text) {
    const feedListEl = sidebar.querySelector(".hd-sidebar__feed-list");
    if (!feedListEl) return;
    const item = h("div", { className: "hd-feed__item" });
    const agentData = AGENTS[agentKey];
    const avatar = h("img", { className: "hd-feed__avatar", src: agentData.photo, alt: "" });
    const content = h("div", { className: "hd-feed__content" });
    content.append(
      h("span", { className: "hd-feed__name" }, agentData.name),
      h("span", { className: "hd-feed__text" }, text)
    );
    const time = h("span", { className: "hd-feed__time" }, "Just now");
    item.append(avatar, content, time);
    item.style.opacity = "0";
    item.style.transform = "translateY(-6px)";
    feedListEl.insertBefore(item, feedListEl.firstChild);
    requestAnimationFrame(() => {
      item.style.transition = "opacity 300ms ease, transform 300ms ease";
      item.style.opacity = "1";
      item.style.transform = "translateY(0)";
    });
    while (feedListEl.children.length > 6) feedListEl.lastChild.remove();
  }

  // ── Typing indicator ──
  function showTypingIndicator(agentKey) {
    const messages = convo.querySelector(".hd-convo__messages");
    if (!messages) return null;
    const agentData = AGENTS[agentKey];
    const bubble = h("div", { className: "hd-msg hd-msg--agent hd-msg--typing" });
    const avatarEl = h("img", { className: "hd-msg__avatar hd-msg__avatar--agent", src: agentData.photo, alt: "" });
    avatarEl.style.boxShadow = `0 0 0 2px ${agentData.color}44`;
    const content = h("div", { className: "hd-msg__content" });
    const nameRow = h("div", { className: "hd-msg__meta" });
    nameRow.append(h("span", { className: "hd-msg__name" }, agentData.name));
    content.append(nameRow);
    const dots = h("div", { className: "hd-typing" });
    dots.innerHTML = `<span class="hd-typing__dot"></span><span class="hd-typing__dot"></span><span class="hd-typing__dot"></span>`;
    content.append(dots);
    bubble.append(avatarEl, content);
    bubble.style.opacity = "0";
    messages.append(bubble);
    messages.scrollTop = messages.scrollHeight;
    requestAnimationFrame(() => {
      bubble.style.transition = "opacity 300ms ease";
      bubble.style.opacity = "1";
    });
    return bubble;
  }

  // ── Add message to conversation ──
  function addMessage(agentKey, text) {
    const ticket = tickets.find((t) => t.id === selectedId);
    if (!ticket) return;
    const messages = convo.querySelector(".hd-convo__messages");
    if (!messages) return;

    // Remove typing indicator
    const typing = messages.querySelector(".hd-msg--typing");
    if (typing) typing.remove();

    const agentData = AGENTS[agentKey];
    const bubble = h("div", { className: "hd-msg hd-msg--agent" });
    const avatarEl = h("img", { className: "hd-msg__avatar hd-msg__avatar--agent", src: agentData.photo, alt: "" });
    avatarEl.style.boxShadow = `0 0 0 2px ${agentData.color}44`;
    const content = h("div", { className: "hd-msg__content" });
    const nameRow = h("div", { className: "hd-msg__meta" });
    nameRow.append(
      h("span", { className: "hd-msg__name" }, agentData.name),
      h("span", { className: "hd-msg__time" }, "Just now")
    );
    content.append(nameRow);

    // Type out the message
    const textEl = h("div", { className: "hd-msg__text" });
    content.append(textEl);
    bubble.append(avatarEl, content);
    bubble.style.opacity = "0";
    messages.append(bubble);
    messages.scrollTop = messages.scrollHeight;
    requestAnimationFrame(() => {
      bubble.style.transition = "opacity 300ms ease";
      bubble.style.opacity = "1";
    });

    let idx = 0;
    const typeInterval = setInterval(() => {
      if (idx < text.length) {
        textEl.textContent += text[idx];
        idx++;
        messages.scrollTop = messages.scrollHeight;
      } else {
        clearInterval(typeInterval);
      }
    }, 20);

    // Also add to data
    if (!conversations[ticket.id]) conversations[ticket.id] = [];
    conversations[ticket.id].push({ from: "agent", agent: agentKey, text, time: "Just now" });
  }

  // ── Overlay: escalation ──
  function showEscalationOverlay(ticket, fromAgent, toAgent, reason) {
    const overlay = h("div", { className: "hd-overlay" });
    overlay.style.opacity = "0";
    const card = h("div", { className: "hd-overlay__card" });

    const iconWrap = h("div", { className: "hd-overlay__icon hd-overlay__icon--escalation" });
    iconWrap.innerHTML = HD_ICONS.escalation;
    card.append(iconWrap);

    card.append(h("div", { className: "hd-overlay__title" }, "Escalation"));
    card.append(h("div", { className: "hd-overlay__ticket-id" }, ticket.id));

    const flow = h("div", { className: "hd-overlay__flow" });
    const fromEl = h("span", { className: "hd-overlay__agent-badge" });
    fromEl.style.borderColor = AGENTS[fromAgent].color + "44";
    fromEl.style.color = AGENTS[fromAgent].color;
    fromEl.textContent = AGENTS[fromAgent].name;
    const arrow = h("span", { className: "hd-overlay__arrow" });
    arrow.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
    const toEl = h("span", { className: "hd-overlay__agent-badge" });
    toEl.style.borderColor = AGENTS[toAgent].color + "44";
    toEl.style.color = AGENTS[toAgent].color;
    toEl.textContent = AGENTS[toAgent].name;
    flow.append(fromEl, arrow, toEl);
    card.append(flow);

    card.append(h("div", { className: "hd-overlay__reason" }, reason));

    overlay.append(card);
    convo.style.position = "relative";
    convo.append(overlay);
    requestAnimationFrame(() => {
      overlay.style.transition = "opacity 300ms ease";
      overlay.style.opacity = "1";
    });
    setTimeout(() => {
      overlay.style.transition = "opacity 400ms ease";
      overlay.style.opacity = "0";
      setTimeout(() => overlay.remove(), 400);
    }, 3500);
  }

  // ── Overlay: resolution ──
  function showResolvedOverlay(ticket) {
    const overlay = h("div", { className: "hd-overlay" });
    overlay.style.opacity = "0";
    const card = h("div", { className: "hd-overlay__card hd-overlay__card--resolved" });

    const iconWrap = h("div", { className: "hd-overlay__icon hd-overlay__icon--resolved" });
    iconWrap.innerHTML = HD_ICONS.resolved;
    card.append(iconWrap);

    card.append(h("div", { className: "hd-overlay__title" }, "Ticket Resolved"));
    card.append(h("div", { className: "hd-overlay__ticket-id" }, ticket.id));

    const stats = h("div", { className: "hd-overlay__stats" });
    stats.append(createOverlayStat("Reply Time", "2.1m"));
    stats.append(createOverlayStat("Messages", "3"));
    stats.append(createOverlayStat("CSAT", "5/5"));
    card.append(stats);

    overlay.append(card);
    convo.style.position = "relative";
    convo.append(overlay);
    requestAnimationFrame(() => {
      overlay.style.transition = "opacity 300ms ease";
      overlay.style.opacity = "1";
    });
    setTimeout(() => {
      overlay.style.transition = "opacity 400ms ease";
      overlay.style.opacity = "0";
      setTimeout(() => overlay.remove(), 400);
    }, 3500);
  }

  function createOverlayStat(label, value) {
    const stat = h("div", { className: "hd-overlay__stat" });
    stat.append(
      h("span", { className: "hd-overlay__stat-val" }, value),
      h("span", { className: "hd-overlay__stat-label" }, label)
    );
    return stat;
  }

  // ── Overlay: new ticket incoming ──
  function showNewTicketOverlay(ticket) {
    const overlay = h("div", { className: "hd-overlay" });
    overlay.style.opacity = "0";
    const card = h("div", { className: "hd-overlay__card hd-overlay__card--new" });

    const iconWrap = h("div", { className: "hd-overlay__icon hd-overlay__icon--new" });
    iconWrap.innerHTML = HD_ICONS.ticket;
    card.append(iconWrap);

    card.append(h("div", { className: "hd-overlay__title" }, "New Ticket"));
    card.append(h("div", { className: "hd-overlay__ticket-id" }, ticket.id));
    card.append(h("div", { className: "hd-overlay__new-subject" }, ticket.subject));

    const meta = h("div", { className: "hd-overlay__new-meta" });
    meta.append(h("span", {}, `From: ${ticket.from}`));
    const prBadge = h("span", { className: "hd-overlay__priority-badge" });
    prBadge.style.color = PRIORITY_COLORS[ticket.priority];
    prBadge.style.borderColor = PRIORITY_COLORS[ticket.priority] + "44";
    prBadge.textContent = ticket.priority;
    meta.append(prBadge);
    card.append(meta);

    overlay.append(card);
    convo.style.position = "relative";
    convo.append(overlay);
    requestAnimationFrame(() => {
      overlay.style.transition = "opacity 300ms ease";
      overlay.style.opacity = "1";
    });
    setTimeout(() => {
      overlay.style.transition = "opacity 400ms ease";
      overlay.style.opacity = "0";
      setTimeout(() => overlay.remove(), 400);
    }, 3000);
  }

  // ── Chat bubble (floating in bottom-right) ──
  function showChatBubble() {
    const existing = shell.querySelector(".hd-chat-bubble");
    if (existing) existing.remove();
    const bubble = h("div", { className: "hd-chat-bubble" });
    bubble.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`;
    const badge = h("span", { className: "hd-chat-bubble__badge" }, "1");
    bubble.append(badge);
    shell.append(bubble);
    requestAnimationFrame(() => {
      bubble.style.transition = "transform 400ms cubic-bezier(0.16,1,0.3,1), opacity 300ms ease";
      bubble.style.transform = "scale(1)";
      bubble.style.opacity = "1";
    });
    return bubble;
  }

  // ── Seed feed ──
  const seedFeedItems = [
    { agent: "triage", text: "Classified T-1042 as urgent, billing issue" },
    { agent: "support", text: "Replied to Sarah Chen about API rate limits" },
    { agent: "billing", text: "Checking permissions for James Wilson" },
    { agent: "triage", text: "Routed T-1040 to support queue" },
  ];

  function seedFeed() {
    const feedListEl = sidebar.querySelector(".hd-sidebar__feed-list");
    if (!feedListEl) return;
    feedListEl.innerHTML = "";
    seedFeedItems.forEach((item) => {
      const el = h("div", { className: "hd-feed__item" });
      const agentData = AGENTS[item.agent];
      const avatar = h("img", { className: "hd-feed__avatar", src: agentData.photo, alt: "" });
      const content = h("div", { className: "hd-feed__content" });
      content.append(
        h("span", { className: "hd-feed__name" }, agentData.name),
        h("span", { className: "hd-feed__text" }, item.text)
      );
      const time = h("span", { className: "hd-feed__time" }, "2m ago");
      el.append(avatar, content, time);
      feedListEl.append(el);
    });
  }

  // ── Animation sequence ──
  const animations = [
    // 1. Agent replies to current ticket (T-1042)
    { delay: 2500, action: "reply", ticketId: "T-1042", agent: "billing", typingDuration: 1800, message: "I've restored your billing access. The permission was removed during a recent role migration. You should be able to access the portal now.", feedText: "Restored billing access for James Wilson" },

    // 2. Flash new incoming ticket in sidebar
    { delay: 8000, action: "flash", ticketId: "T-1039", feedAgent: "triage", feedText: "Analyzing webhook delivery failures" },

    // 3. Escalation: triage escalates T-1039 to support
    { delay: 11000, action: "escalate", ticketId: "T-1039", fromAgent: "triage", toAgent: "escalate", reason: "Known infrastructure issue, needs engineering coordination" },

    // 4. Switch to T-1041 and reply
    { delay: 15500, action: "select", ticketId: "T-1041" },
    { delay: 17000, action: "reply", ticketId: "T-1041", agent: "support", typingDuration: 1500, message: "I've temporarily increased your rate limit to 500 req/s for the next 72 hours. Let's schedule a call to discuss upgrading your plan for a permanent increase.", feedText: "Increased rate limit for Sarah Chen" },

    // 5. Chat bubble appears
    { delay: 22000, action: "chat-bubble" },

    // 6. Switch to T-1040, reply + resolve
    { delay: 24000, action: "select", ticketId: "T-1040" },
    { delay: 25500, action: "reply", ticketId: "T-1040", agent: "support", typingDuration: 1400, message: "Hi Mike! Here's our SSO setup guide for Okta: I've also pre-configured your SAML settings. Just add our metadata URL in your Okta admin panel and you're good to go.", feedText: "Sent SSO guide to Mike Torres" },

    // 7. Resolve T-1042
    { delay: 30000, action: "resolve", ticketId: "T-1042" },

    // 8. New ticket arrives
    { delay: 33000, action: "new-ticket" },
  ];

  // Save initial state for reset
  const initialStatuses = {};
  tickets.forEach((t) => { initialStatuses[t.id] = t.status; });
  const initialConversations = {};
  Object.keys(conversations).forEach((k) => { initialConversations[k] = [...conversations[k]]; });

  function scheduleAnimations() {
    // Reset
    tickets.forEach((t) => { t.status = initialStatuses[t.id]; });
    Object.keys(initialConversations).forEach((k) => { conversations[k] = [...initialConversations[k]]; });
    selectedId = "T-1042";
    activeFilter = "open";
    Object.values(filterEls).forEach((el) => el.classList.remove("hd-filter--active"));
    filterEls["open"].classList.add("hd-filter--active");
    const existingBubble = shell.querySelector(".hd-chat-bubble");
    if (existingBubble) existingBubble.remove();

    renderInbox();
    renderConversation();
    renderSidebar();
    seedFeed();

    animations.forEach((a) => {
      setTimeout(() => {
        if (a.action === "reply") {
          if (selectedId === a.ticketId) {
            showTypingIndicator(a.agent);
            setTimeout(() => addMessage(a.agent, a.message), a.typingDuration);
          }
          if (a.feedText) setTimeout(() => addFeedEntry(a.agent, a.feedText), a.typingDuration + 200);
        }

        if (a.action === "flash") {
          const el = ticketList.querySelector(`[data-id="${a.ticketId}"]`);
          if (el) {
            el.classList.add("hd-ticket--flash");
            setTimeout(() => el.classList.remove("hd-ticket--flash"), 800);
          }
          if (a.feedAgent && a.feedText) addFeedEntry(a.feedAgent, a.feedText);
        }

        if (a.action === "escalate") {
          const ticket = tickets.find((t) => t.id === a.ticketId);
          if (ticket) {
            ticket.agent = a.toAgent;
            showEscalationOverlay(ticket, a.fromAgent, a.toAgent, a.reason);
            addFeedEntry(a.fromAgent, `Escalated ${a.ticketId} to ${AGENTS[a.toAgent].name}`);
          }
        }

        if (a.action === "select") {
          selectedId = a.ticketId;
          renderInbox();
          renderConversation();
          renderSidebar();
          seedFeed();
        }

        if (a.action === "resolve") {
          const ticket = tickets.find((t) => t.id === a.ticketId);
          if (ticket) {
            ticket.status = "resolved";
            renderInbox();
            if (selectedId === a.ticketId) {
              showResolvedOverlay(ticket);
              addFeedEntry(ticket.agent, `Resolved ${a.ticketId}: ${ticket.subject}`);
            }
          }
        }

        if (a.action === "chat-bubble") {
          showChatBubble();
        }

        if (a.action === "new-ticket") {
          const newTicket = { id: "T-1043", subject: "Integration with Slack broken", from: "Nina Zhao", photo: "https://randomuser.me/api/portraits/women/42.jpg", email: "nina@flow.app", priority: "high", status: "open", channel: "chat", created: "Just now", agent: "triage", tags: ["integration", "slack"], sla: "1h" };
          // Only add if not already present
          if (!tickets.find((t) => t.id === "T-1043")) tickets.push(newTicket);
          else { const idx = tickets.findIndex((t) => t.id === "T-1043"); tickets[idx] = newTicket; }
          conversations["T-1043"] = [
            { from: "customer", name: "Nina Zhao", text: "Our Slack integration stopped posting notifications about 30 minutes ago. Nothing changed on our end.", time: "Just now" },
          ];
          if (activeFilter === "open" || activeFilter === "all") {
            renderInbox();
            // Flash the new ticket
            setTimeout(() => {
              const el = ticketList.querySelector(`[data-id="T-1043"]`);
              if (el) {
                el.classList.add("hd-ticket--flash");
                setTimeout(() => el.classList.remove("hd-ticket--flash"), 800);
              }
            }, 100);
          }
          showNewTicketOverlay(newTicket);
          addFeedEntry("triage", "New ticket T-1043: Slack integration broken");
        }
      }, a.delay);
    });

    setTimeout(scheduleAnimations, 37000);
  }

  scheduleAnimations();
}


