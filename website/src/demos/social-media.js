import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── Social Media Manager Demo (v2 – 2-col, inline agents, toasts) ──────────

export function mountSocialMedia(container) {
  const PLATFORMS = {
    instagram: { name: "Instagram", color: "#E1306C", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/></svg>` },
    twitter:   { name: "X / Twitter", color: "#1DA1F2", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>` },
    linkedin:  { name: "LinkedIn", color: "#0A66C2", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>` },
    tiktok:    { name: "TikTok", color: "#ff0050", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13a8.28 8.28 0 005.58 2.16V11.7a4.85 4.85 0 01-3.58-1.43V6.69h3.58z"/></svg>` },
    facebook:  { name: "Facebook", color: "#1877F2", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>` },
  };

  const AGENTS = {
    content:   { name: "Content Agent",   initials: "CA", color: "#a78bfa" },
    scheduler: { name: "Scheduler Agent", initials: "SA", color: "#34d399" },
    engage:    { name: "Engage Agent",    initials: "EA", color: "#fbbf24" },
    analytics: { name: "Analytics Agent", initials: "AA", color: "#60a5fa" },
  };

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const posts = [
    { id: "p1", day: 0, time: "9:00 AM",  platform: "instagram", type: "image",     caption: "Behind the scenes of our new product launch. Stay tuned for something big...",                          status: "published", agent: "analytics", engagement: { likes: 2847, comments: 184, shares: 67 },    image: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400&h=400&fit=crop&q=80" },
    { id: "p2", day: 0, time: "2:00 PM",  platform: "twitter",   type: "text",      caption: "We just crossed 50K users. What started as a weekend project is now powering teams at 200+ companies.", status: "published", agent: "engage",    engagement: { likes: 1203, comments: 89, shares: 341 },    image: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&h=400&fit=crop&q=80" },
    { id: "p3", day: 1, time: "10:00 AM", platform: "linkedin",  type: "article",   caption: "Why AI-first companies will dominate the next decade. Insights from scaling 0 to 50K users.",          status: "published", agent: "analytics", engagement: { likes: 956, comments: 43, shares: 128 },     image: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=400&h=400&fit=crop&q=80" },
    { id: "p4", day: 1, time: "6:00 PM",  platform: "tiktok",    type: "video",     caption: "POV: Your AI agent replies to 200 comments while you sleep",                                          status: "published", agent: "engage",    engagement: { likes: 18400, comments: 743, shares: 2100 }, image: "https://images.unsplash.com/photo-1626544827763-d516dce335e2?w=400&h=400&fit=crop&q=80" },
    { id: "p5", day: 2, time: "8:30 AM",  platform: "instagram", type: "carousel",  caption: "5 tools every founder needs in 2026. Swipe to see our picks.",                                        status: "scheduled", agent: "scheduler", engagement: null,                                           image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=400&fit=crop&q=80" },
    { id: "p6", day: 2, time: "1:00 PM",  platform: "facebook",  type: "image",     caption: "Meet the team behind the magic. We are hiring across engineering, design, and growth.",                 status: "scheduled", agent: "scheduler", engagement: null,                                           image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=400&h=400&fit=crop&q=80" },
    { id: "p7", day: 3, time: "11:00 AM", platform: "twitter",   type: "thread",    caption: "Thread: How we reduced churn by 40% using AI agents for customer success.",                            status: "draft",     agent: "content",   engagement: null,                                           image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=400&fit=crop&q=80" },
    { id: "p8", day: 3, time: "4:00 PM",  platform: "linkedin",  type: "post",      caption: "Excited to announce our Series A. $12M to bring AI agents to every team.",                             status: "draft",     agent: "content",   engagement: null,                                           image: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400&h=400&fit=crop&q=80" },
    { id: "p9", day: 4, time: "9:00 AM",  platform: "tiktok",    type: "video",     caption: "Day in the life of an AI startup founder (things got weird)",                                          status: "draft",     agent: "content",   engagement: null,                                           image: "https://images.unsplash.com/photo-1536240478700-b869070f9279?w=400&h=400&fit=crop&q=80" },
    { id: "p10", day: 5, time: "10:00 AM", platform: "instagram", type: "reel",     caption: "From idea to 50K users in 8 months. The real story.",                                                  status: "draft",     agent: "content",   engagement: null,                                           image: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=400&h=400&fit=crop&q=80" },
  ];

  let selectedPostId = "p1";

  const ICON_HEART = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`;
  const ICON_COMMENT = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`;
  const ICON_SHARE = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
  const ICON_DRAFT = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const ICON_CHART = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
  const ICON_CLOCK = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  const ICON_CHECK = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const ICON_PLAY = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  const ICON_BOT = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="11"/><circle cx="8" cy="16" r="1" fill="currentColor"/><circle cx="16" cy="16" r="1" fill="currentColor"/></svg>`;

  function statusColor(s) { return s === "published" ? "#34d399" : s === "scheduled" ? "#60a5fa" : "#a1a1aa"; }
  function statusLabel(s) { return s === "published" ? "Published" : s === "scheduled" ? "Scheduled" : "Draft"; }
  function formatNum(n) { return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(n); }

  // ── Build shell ──
  const shell = h("div", { className: "sm-shell" });

  // ── Top bar ──
  const topbar = h("div", { className: "sm-topbar" });
  const topLeft = h("div", { className: "sm-topbar__left" });
  topLeft.innerHTML = `<img src="/logo.png" alt="" class="sm-topbar__logo"><span class="sm-topbar__brand">ClawJS</span><span class="sm-topbar__sep">/</span><span class="sm-topbar__page">Social Media</span>`;
  const topRight = h("div", { className: "sm-topbar__right" });
  const platformRow = h("div", { className: "sm-topbar__platforms" });
  Object.values(PLATFORMS).forEach((p) => {
    const dot = h("span", { className: "sm-topbar__platform", innerHTML: p.icon });
    dot.style.color = p.color;
    platformRow.append(dot);
  });
  topRight.append(platformRow);
  const liveChip = h("span", { className: "sm-topbar__live" });
  liveChip.innerHTML = `<span class="sm-topbar__live-dot"></span>4 agents active`;
  topRight.append(liveChip);
  topbar.append(topLeft, topRight);
  shell.append(topbar);

  // ── Body (2-col: queue + detail) ──
  const body = h("div", { className: "sm-body" });

  // ── LEFT: Post queue ──
  const sidebar = h("div", { className: "sm-sidebar" });
  const sidebarHeader = h("div", { className: "sm-sidebar__header" });
  sidebarHeader.innerHTML = `<span class="sm-sidebar__title">Content Queue</span><span class="sm-sidebar__count">${posts.length} posts</span>`;
  sidebar.append(sidebarHeader);
  const postListArea = h("div", { className: "sm-sidebar__list" });
  sidebar.append(postListArea);
  body.append(sidebar);

  // ── RIGHT: Post detail (full width, no feed column) ──
  const detail = h("div", { className: "sm-detail" });
  body.append(detail);

  shell.append(body);

  // ── Toast container (overlays on shell) ──
  const toastContainer = h("div", { className: "sm-toasts" });
  shell.append(toastContainer);

  container.append(shell);

  // ── Toast system ──
  function smToast(agentKey, text) {
    const agentData = AGENTS[agentKey];
    const toast = h("div", { className: "sm-toast" });
    toast.style.borderLeftColor = agentData.color;
    const avatar = h("span", { className: "sm-toast__avatar" }, agentData.initials);
    avatar.style.background = agentData.color + "20";
    avatar.style.color = agentData.color;
    const content = h("div", { className: "sm-toast__content" });
    const nameEl = h("span", { className: "sm-toast__name" }, agentData.name);
    nameEl.style.color = agentData.color;
    content.append(nameEl, h("span", { className: "sm-toast__text" }, text));
    toast.append(avatar, content);

    // Push existing toasts down
    const existing = toastContainer.querySelectorAll(".sm-toast");
    existing.forEach((t, i) => {
      if (i >= 2) { t.remove(); return; }
      t.style.transform = `translateY(${(i + 1) * 46}px)`;
      t.style.opacity = "0.5";
    });

    toast.style.transform = "translateX(110%)";
    toastContainer.append(toast);
    requestAnimationFrame(() => {
      toast.style.transition = "transform 350ms cubic-bezier(0.16,1,0.3,1), opacity 300ms ease";
      toast.style.transform = "translateX(0)";
    });
    setTimeout(() => {
      toast.style.transform = "translateX(110%)";
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  }

  // ── Render post queue ──
  function renderQueue() {
    postListArea.innerHTML = "";
    const grouped = {};
    posts.forEach((p) => { if (!grouped[p.day]) grouped[p.day] = []; grouped[p.day].push(p); });

    Object.keys(grouped).sort((a, b) => a - b).forEach((dayIdx) => {
      const dayPosts = grouped[dayIdx];
      const dayHeader = h("div", { className: "sm-queue__day" });
      dayHeader.append(h("span", { className: "sm-queue__day-name" }, DAYS[dayIdx]));
      dayHeader.append(h("span", { className: "sm-queue__day-count" }, `${dayPosts.length} post${dayPosts.length > 1 ? "s" : ""}`));
      postListArea.append(dayHeader);

      dayPosts.forEach((p) => {
        const plat = PLATFORMS[p.platform];
        const agentData = AGENTS[p.agent];
        const card = h("div", { className: `sm-queue__card ${p.id === selectedPostId ? "sm-queue__card--active" : ""}` });
        card.dataset.id = p.id;

        // Thumbnail
        const thumb = h("div", { className: "sm-queue__thumb" });
        const img = h("img", { className: "sm-queue__thumb-img", src: p.image, alt: "", loading: "lazy" });
        thumb.append(img);
        if (p.type === "video" || p.type === "reel") {
          thumb.append(h("span", { className: "sm-queue__play", innerHTML: ICON_PLAY }));
        }
        const platChip = h("span", { className: "sm-queue__plat-chip", innerHTML: plat.icon });
        platChip.style.color = plat.color;
        platChip.style.background = "rgba(0,0,0,0.65)";
        thumb.append(platChip);

        // Info
        const info = h("div", { className: "sm-queue__info" });
        const topRow = h("div", { className: "sm-queue__top-row" });
        topRow.append(h("span", { className: "sm-queue__time" }, p.time));
        topRow.append(h("span", { className: "sm-queue__type" }, p.type));
        const statusEl = h("span", { className: "sm-queue__status" }, statusLabel(p.status));
        statusEl.style.color = statusColor(p.status);
        topRow.append(statusEl);
        info.append(topRow);

        const captionEl = h("div", { className: "sm-queue__caption" }, p.caption.length > 60 ? p.caption.slice(0, 60) + "..." : p.caption);
        info.append(captionEl);

        // Agent badge inline on card
        const agentBadge = h("div", { className: "sm-queue__agent" });
        const agentDot = h("span", { className: "sm-queue__agent-dot" });
        agentDot.style.background = agentData.color;
        agentBadge.append(agentDot, h("span", { className: "sm-queue__agent-name" }, agentData.name));
        info.append(agentBadge);

        card.append(thumb, info);
        card.addEventListener("click", () => { selectedPostId = p.id; renderQueue(); renderDetail(); });
        postListArea.append(card);
      });
    });
  }

  // ── Render detail panel ──
  function renderDetail() {
    const post = posts.find((p) => p.id === selectedPostId);
    if (!post) return;
    detail.innerHTML = "";
    const plat = PLATFORMS[post.platform];
    const agentData = AGENTS[post.agent];

    // Hero image
    const imgWrap = h("div", { className: "sm-detail__img-wrap" });
    const img = h("img", { className: "sm-detail__img", src: post.image, alt: "" });
    const imgOverlay = h("div", { className: "sm-detail__img-overlay" });
    const platChip = h("div", { className: "sm-detail__img-plat" });
    platChip.innerHTML = plat.icon + `<span>${plat.name}</span>`;
    platChip.style.color = "#fff";
    imgOverlay.append(platChip);
    const imgStatus = h("span", { className: "sm-detail__img-status" }, statusLabel(post.status));
    imgStatus.style.background = statusColor(post.status);
    imgOverlay.append(imgStatus);
    if (post.type === "video" || post.type === "reel") {
      const bigPlay = h("div", { className: "sm-detail__play" });
      bigPlay.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      imgWrap.append(bigPlay);
    }
    imgWrap.append(img, imgOverlay);
    detail.append(imgWrap);

    // Content area (scrollable)
    const content = h("div", { className: "sm-detail__content" });

    // Agent bar (inline, prominent)
    const agentBar = h("div", { className: "sm-detail__agent-bar" });
    agentBar.style.borderLeftColor = agentData.color;
    const agentAvatar = h("span", { className: "sm-detail__agent-avatar" }, agentData.initials);
    agentAvatar.style.background = agentData.color + "20";
    agentAvatar.style.color = agentData.color;
    const agentInfo = h("div", { className: "sm-detail__agent-info" });
    const agentName = h("span", { className: "sm-detail__agent-name" }, agentData.name);
    agentName.style.color = agentData.color;
    const agentTask = h("span", { className: "sm-detail__agent-task" });
    if (post.status === "published") agentTask.textContent = "Monitoring engagement";
    else if (post.status === "scheduled") agentTask.textContent = "Ready to publish";
    else agentTask.textContent = "Drafting content...";
    agentInfo.append(agentName, agentTask);
    const agentPulse = h("span", { className: "sm-detail__agent-pulse" });
    agentPulse.style.background = agentData.color;
    agentBar.append(agentAvatar, agentInfo, agentPulse);
    content.append(agentBar);

    // Time + type
    content.append(h("div", { className: "sm-detail__meta" }, `${DAYS[post.day]} · ${post.time} · ${post.type}`));

    // Caption
    const captionSection = h("div", { className: "sm-detail__caption-section" });
    captionSection.append(h("div", { className: "sm-detail__caption-label" }, "Caption"));
    captionSection.append(h("div", { className: "sm-detail__caption" }, post.caption));
    content.append(captionSection);

    // Engagement metrics
    if (post.engagement) {
      const metrics = h("div", { className: "sm-detail__metrics" });
      [
        { icon: ICON_HEART, label: "Likes", value: formatNum(post.engagement.likes), color: "#E1306C" },
        { icon: ICON_COMMENT, label: "Comments", value: formatNum(post.engagement.comments), color: "#60a5fa" },
        { icon: ICON_SHARE, label: "Shares", value: formatNum(post.engagement.shares), color: "#34d399" },
      ].forEach((m) => {
        const card = h("div", { className: "sm-detail__metric" });
        const iconEl = h("span", { className: "sm-detail__metric-icon", innerHTML: m.icon });
        iconEl.style.color = m.color;
        card.append(iconEl, h("span", { className: "sm-detail__metric-value" }, m.value), h("span", { className: "sm-detail__metric-label" }, m.label));
        metrics.append(card);
      });
      content.append(metrics);
    }

    // Activity timeline (inline, below content)
    const activitySection = h("div", { className: "sm-detail__activity" });
    activitySection.append(h("div", { className: "sm-detail__activity-label" }, "Activity"));
    const activityList = h("div", { className: "sm-detail__activity-list" });
    const logEntries = postLogs[post.id] || [];
    if (logEntries.length) {
      logEntries.slice(0, 4).forEach((log) => {
        const row = h("div", { className: "sm-detail__activity-item" });
        const logAgent = AGENTS[log.agent];
        const logAvatar = h("span", { className: "sm-detail__log-avatar" }, logAgent.initials);
        logAvatar.style.background = logAgent.color + "18";
        logAvatar.style.color = logAgent.color;
        row.append(
          logAvatar,
          h("span", { className: "sm-detail__activity-text" }, log.text),
          h("span", { className: "sm-detail__activity-time" }, log.time)
        );
        activityList.append(row);
      });
    } else {
      activityList.append(h("div", { className: "sm-detail__activity-empty" }, "No activity yet"));
    }
    activitySection.append(activityList);
    content.append(activitySection);

    detail.append(content);
    fadeIn(detail);
  }

  // ── Per-post activity logs (now with agent key) ──
  const postLogs = {};
  function seedPostLogs() {
    postLogs["p1"] = [
      { agent: "scheduler", text: "Published to Instagram", time: "2h ago" },
      { agent: "analytics", text: "Engagement above average (+34%)", time: "1h ago" },
    ];
    postLogs["p2"] = [
      { agent: "scheduler", text: "Published to X / Twitter", time: "5h ago" },
      { agent: "engage", text: "Replied to 12 comments", time: "3h ago" },
    ];
    postLogs["p3"] = [{ agent: "scheduler", text: "Published to LinkedIn", time: "1d ago" }];
    postLogs["p4"] = [
      { agent: "scheduler", text: "Published to TikTok", time: "18h ago" },
      { agent: "analytics", text: "Trending: 18.4K likes", time: "6h ago" },
    ];
    postLogs["p5"] = [
      { agent: "scheduler", text: "Scheduled for Wednesday 8:30 AM", time: "4h ago" },
      { agent: "content", text: "Finished carousel design", time: "5h ago" },
    ];
  }

  // ── Overlay system ──
  function showOverlay(post, type, data, duration) {
    selectedPostId = post.id;
    renderQueue();
    renderDetail();

    const overlay = h("div", { className: "sm-overlay" });
    overlay.style.opacity = "0";

    if (type === "publishing") {
      const plat = PLATFORMS[post.platform];
      const card = h("div", { className: "sm-overlay__card sm-overlay__card--publish" });
      if (post.image) card.append(h("img", { className: "sm-overlay__pub-preview", src: post.image, alt: "" }));
      const iconWrap = h("div", { className: "sm-overlay__pub-icon", innerHTML: plat.icon });
      iconWrap.style.color = plat.color;
      const ringEl = h("div", { className: "sm-overlay__pub-ring" });
      ringEl.style.borderColor = plat.color + "60";
      ringEl.append(iconWrap);
      card.append(ringEl, h("div", { className: "sm-overlay__pub-title" }, `Publishing to ${plat.name}`));
      const statusEl = h("div", { className: "sm-overlay__pub-status" }, "Uploading...");
      card.append(statusEl);
      const progressWrap = h("div", { className: "sm-overlay__progress" });
      const progressBar = h("div", { className: "sm-overlay__progress-bar" });
      progressBar.style.background = plat.color;
      progressWrap.append(progressBar);
      card.append(progressWrap);
      overlay.append(card);
      setTimeout(() => { progressBar.style.width = "60%"; statusEl.textContent = "Processing..."; }, 600);
      setTimeout(() => { progressBar.style.width = "100%"; statusEl.textContent = "Published!"; }, duration * 0.65);
    }

    if (type === "engagement") {
      const card = h("div", { className: "sm-overlay__card sm-overlay__card--engage" });
      card.append(h("div", { className: "sm-overlay__engage-header", innerHTML: `${ICON_COMMENT}<span>Auto-Reply</span>` }));
      card.append(h("div", { className: "sm-overlay__engage-user" }, `@${data.user}`));
      card.append(h("div", { className: "sm-overlay__engage-comment" }, `"${data.comment}"`));
      const replySection = h("div", { className: "sm-overlay__engage-reply" });
      replySection.append(h("span", { className: "sm-overlay__engage-reply-label" }, "Agent reply:"));
      const replyBody = h("div", { className: "sm-overlay__engage-reply-text" });
      card.append(replySection, replyBody);
      overlay.append(card);
      let idx = 0;
      const replyText = data.reply;
      const typeInterval = setInterval(() => { if (idx < replyText.length) { replyBody.textContent += replyText[idx]; idx++; } else { clearInterval(typeInterval); } }, 25);
      setTimeout(() => clearInterval(typeInterval), duration - 500);
    }

    if (type === "analytics") {
      const card = h("div", { className: "sm-overlay__card sm-overlay__card--analytics" });
      card.append(h("div", { className: "sm-overlay__analytics-header", innerHTML: `${ICON_CHART}<span>Engagement Report</span>` }));
      const chartWrap = h("div", { className: "sm-overlay__chart" });
      [{ label: "Mon", value: 78, color: "#E1306C" }, { label: "Tue", value: 95, color: "#1DA1F2" }, { label: "Wed", value: 45, color: "#0A66C2" }, { label: "Thu", value: 62, color: "#ff0050" }, { label: "Fri", value: 88, color: "#1877F2" }].forEach((b) => {
        const col = h("div", { className: "sm-overlay__chart-col" });
        const bar = h("div", { className: "sm-overlay__chart-bar" });
        bar.style.background = b.color; bar.style.height = "0%";
        col.append(bar, h("span", { className: "sm-overlay__chart-label" }, b.label));
        chartWrap.append(col);
        setTimeout(() => { bar.style.height = b.value + "%"; }, 300);
      });
      card.append(chartWrap);
      const statRow = h("div", { className: "sm-overlay__stat-row" });
      statRow.append(
        h("div", { className: "sm-overlay__stat", innerHTML: `<span class="sm-overlay__stat-val">+34%</span><span class="sm-overlay__stat-label">Engagement</span>` }),
        h("div", { className: "sm-overlay__stat", innerHTML: `<span class="sm-overlay__stat-val">23.4K</span><span class="sm-overlay__stat-label">Reach</span>` }),
        h("div", { className: "sm-overlay__stat", innerHTML: `<span class="sm-overlay__stat-val">4.8%</span><span class="sm-overlay__stat-label">CTR</span>` })
      );
      card.append(statRow);
      overlay.append(card);
    }

    detail.style.position = "relative";
    detail.append(overlay);
    requestAnimationFrame(() => { overlay.style.transition = "opacity 300ms ease"; overlay.style.opacity = "1"; });
    setTimeout(() => { overlay.style.transition = "opacity 400ms ease"; overlay.style.opacity = "0"; setTimeout(() => overlay.remove(), 400); }, duration);
  }

  // ── Animation sequence ──
  const animations = [
    { delay: 2500,  agent: "content",   postId: "p7",  type: null,         toast: "Drafted thread for X / Twitter",               activity: "Drafted thread for Thursday" },
    { delay: 7000,  agent: "engage",    postId: "p2",  type: "engagement", toast: "Replying to comment on X post",                 activity: "Replied to @sarah_dev",        data: { user: "sarah_dev", comment: "This is amazing! How did you grow so fast?", reply: "Thanks Sarah! Consistency and listening to users were key. We share tips in our weekly newsletter." }, overlayDuration: 5000 },
    { delay: 14000, agent: "scheduler", postId: "p5",  type: "publishing", toast: "Publishing carousel to Instagram",              activity: "Publishing to Instagram",      overlayDuration: 3800 },
    { delay: 20000, agent: "analytics", postId: "p1",  type: "analytics",  toast: "Engagement up 34% this week",                   activity: "Generated engagement report",  overlayDuration: 4500 },
    { delay: 26500, agent: "engage",    postId: "p4",  type: "engagement", toast: "Replying to TikTok comment",                    activity: "Replied to @techbro_42",       data: { user: "techbro_42", comment: "No way this is real, AI can't do this lol", reply: "It is very real! Our agents handle thousands of interactions daily. Want to see a live demo?" }, overlayDuration: 5000 },
    { delay: 33000, agent: "content",   postId: "p9",  type: null,         toast: "Generated video caption for TikTok",            activity: "Caption generated" },
  ];

  function applyAnimation(anim) {
    const post = posts.find((p) => p.id === anim.postId);
    if (!post) return;
    if (!postLogs[post.id]) postLogs[post.id] = [];
    postLogs[post.id].unshift({ agent: anim.agent, text: anim.activity, time: "Just now" });
    if (postLogs[post.id].length > 4) postLogs[post.id].pop();

    // Show toast
    smToast(anim.agent, anim.toast);

    // Flash card in queue
    const postEl = postListArea.querySelector(`[data-id="${anim.postId}"]`);
    if (postEl) {
      postEl.classList.add("sm-queue__card--flash");
      setTimeout(() => postEl.classList.remove("sm-queue__card--flash"), 800);
    }

    if (anim.type) {
      showOverlay(post, anim.type, anim.data || {}, anim.overlayDuration);
    } else {
      if (selectedPostId === anim.postId) renderDetail();
      renderQueue();
    }
  }

  function scheduleAnimations() {
    Object.keys(postLogs).forEach((k) => delete postLogs[k]);
    seedPostLogs();
    selectedPostId = "p1";
    renderQueue();
    renderDetail();
    animations.forEach((a) => { setTimeout(() => applyAnimation(a), a.delay); });
    setTimeout(scheduleAnimations, 38000);
  }

  scheduleAnimations();
}


