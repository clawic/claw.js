import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── CRM / Contacts Demo ─────────────────────────────────────────────────────

export function mountCRM(container) {
  // AI agents that manage contacts
  const AGENTS = {
    sales:     { name: "Sales Agent",     initials: "SA", color: "#a1a1aa" },
    outreach:  { name: "Outreach Agent",  initials: "OA", color: "#71717a" },
    scheduler: { name: "Scheduler Agent", initials: "SC", color: "#a1a1aa" },
    insight:   { name: "Insight Agent",   initials: "IA", color: "#71717a" },
  };

  const contacts = [
    { id: "c1", name: "Laura Kemp",      photo: "https://randomuser.me/api/portraits/women/44.jpg", role: "VP of Engineering",  company: "Windmark Corp",     email: "l.kemp@windmark.io",     phone: "+1 415-229-8841", lastContact: "2h ago",  agent: "sales",     category: "work" },
    { id: "c2", name: "Noel Briggs",     photo: "https://randomuser.me/api/portraits/men/32.jpg",   role: "Founder & CEO",      company: "Fathom Labs",       email: "noel@fathomlabs.co",     phone: "+1 628-445-1120", lastContact: "1d ago",  agent: "outreach",  category: "work" },
    { id: "c3", name: "Ingrid Holm",     photo: "https://randomuser.me/api/portraits/women/65.jpg", role: "Managing Partner",   company: "Northvane Capital",  email: "ingrid@northvane.com",   phone: "+46 70-123-4567", lastContact: "3d ago",  agent: "insight",   category: "work" },
    { id: "c4", name: "Sam Whitfield",   photo: "https://randomuser.me/api/portraits/men/75.jpg",   role: "Brother",            company: null,                 email: "sam.whitfield@mail.com", phone: "+1 312-555-0198", lastContact: "5d ago",  agent: null,        category: "personal" },
    { id: "c5", name: "Anya Desai",      photo: "https://randomuser.me/api/portraits/women/79.jpg", role: "CTO",                company: "Riven Systems",      email: "anya@rivensys.dev",      phone: "+91 98765-43210", lastContact: "12h ago", agent: "scheduler", category: "work" },
    { id: "c6", name: "Leo Navarro",     photo: "https://randomuser.me/api/portraits/men/86.jpg",   role: "Head of Product",    company: "Vantage",            email: "leo@vantage.io",         phone: "+34 612-345-678", lastContact: "6h ago",  agent: "sales",     category: "work" },
    { id: "c7", name: "Hana Mori",       photo: "https://randomuser.me/api/portraits/women/51.jpg", role: "Mentor",             company: null,                 email: "hana.mori@hey.com",      phone: "+81 90-1234-5678", lastContact: "2w ago", agent: null,        category: "personal" },
    { id: "c8", name: "Owen Radcliffe",  photo: "https://randomuser.me/api/portraits/men/52.jpg",   role: "Managing Director",  company: "Fielding Group",     email: "owen@fieldinggroup.com", phone: "+44 20-7946-0958", lastContact: "4d ago", agent: "insight",   category: "work" },
  ];

  let selectedId = "c1";
  let activeFilter = "all";

  // ── Build shell ──
  const shell = h("div", { className: "crm-shell" });

  // ── Top bar ──
  const topbar = h("div", { className: "crm-topbar" });
  const topLeft = h("div", { className: "crm-topbar__left" });
  topLeft.innerHTML = `<img src="/logo.png" alt="" class="crm-topbar__logo"><span class="crm-topbar__brand">ClawJS</span><span class="crm-topbar__sep">/</span><span class="crm-topbar__page">Contacts</span>`;
  const topMeta = h("div", { className: "crm-topbar__meta" });
  topMeta.innerHTML = `<span class="crm-topbar__count">8 contacts</span>`;
  topbar.append(topLeft, topMeta);
  shell.append(topbar);

  // ── Body (sidebar + detail + feed) ──
  const body = h("div", { className: "crm-body" });

  // ── LEFT: Contact list sidebar ──
  const sidebar = h("div", { className: "crm-sidebar" });

  // Search bar
  const searchWrap = h("div", { className: "crm-sidebar__search" });
  searchWrap.innerHTML = `<svg class="crm-sidebar__search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
  const searchInput = h("input", { className: "crm-sidebar__input", type: "text", placeholder: "Search contacts..." });
  searchWrap.append(searchInput);
  sidebar.append(searchWrap);

  // Filter tabs
  const filters = h("div", { className: "crm-sidebar__filters" });
  const filterItems = [
    { id: "all", label: "All" },
    { id: "work", label: "Work" },
    { id: "personal", label: "Personal" },
    { id: "vip", label: "VIP" },
  ];
  const filterEls = {};
  filterItems.forEach((f) => {
    const btn = h("button", { className: `crm-filter ${f.id === activeFilter ? "crm-filter--active" : ""}` }, f.label);
    btn.addEventListener("click", () => {
      activeFilter = f.id;
      Object.values(filterEls).forEach((el) => el.classList.remove("crm-filter--active"));
      btn.classList.add("crm-filter--active");
      renderContactList();
    });
    filterEls[f.id] = btn;
    filters.append(btn);
  });
  sidebar.append(filters);

  // Contact count (hidden, used internally)
  const countEl = h("div", { className: "crm-sidebar__count" });

  // Contact list
  const contactList = h("div", { className: "crm-sidebar__list" });
  sidebar.append(contactList);
  body.append(sidebar);

  // ── CENTER: Contact detail ──
  const detail = h("div", { className: "crm-detail" });
  body.append(detail);

  // ── RIGHT: Agent activity feed ──
  const feed = h("div", { className: "crm-feed" });
  const feedHeader = h("div", { className: "crm-feed__header" });
  const feedDot = h("span", { className: "crm-feed__live-dot" });
  feedHeader.append(feedDot, h("span", {}, "Agent Activity"));
  feed.append(feedHeader);
  const feedList = h("div", { className: "crm-feed__list" });
  feed.append(feedList);
  body.append(feed);

  shell.append(body);
  container.append(shell);

  // ── Render contact list item ──
  function renderContactItem(contact) {
    const item = h("div", {
      className: `crm-contact ${contact.id === selectedId ? "crm-contact--active" : ""}`,
    });
    item.dataset.id = contact.id;

    const avatar = h("img", { className: "crm-contact__avatar", src: contact.photo, alt: "" });

    const info = h("div", { className: "crm-contact__info" });
    info.append(h("span", { className: "crm-contact__name" }, contact.name));
    const subtitle = contact.company || contact.role;
    info.append(h("div", { className: "crm-contact__subtitle" }, subtitle));

    item.append(avatar, info);
    if (contact.lastContact) {
      item.append(h("span", { className: "crm-contact__time" }, contact.lastContact));
    }

    item.addEventListener("click", () => {
      selectedId = contact.id;
      renderContactList();
      renderDetail();
    });

    return item;
  }

  // ── Render contact list ──
  function renderContactList() {
    const filtered = contacts.filter((c) => {
      if (activeFilter === "work") return c.category === "work";
      if (activeFilter === "personal") return c.category === "personal";
      if (activeFilter === "vip") return c.status === "vip" || c.status === "partner";
      return true;
    });
    contactList.innerHTML = "";
    filtered.forEach((c) => contactList.append(renderContactItem(c)));
    countEl.textContent = `${filtered.length} contacts`;
  }

  // ── Render detail panel ──
  function renderDetail() {
    const contact = contacts.find((c) => c.id === selectedId);
    if (!contact) return;
    detail.innerHTML = "";

    // Profile header: big photo + name + role
    const header = h("div", { className: "crm-detail__header" });
    const bigAvatar = h("img", { className: "crm-detail__avatar", src: contact.photo, alt: "" });

    const headerInfo = h("div", { className: "crm-detail__header-info" });
    headerInfo.append(h("h3", { className: "crm-detail__name" }, contact.name));
    const roleText = contact.company ? `${contact.role}, ${contact.company}` : contact.role;
    headerInfo.append(h("div", { className: "crm-detail__role" }, roleText));

    // Agent assigned
    if (contact.agent) {
      const agentData = AGENTS[contact.agent];
      const agentRow = h("div", { className: "crm-detail__agent" });
      const pulse = h("span", { className: "crm-detail__agent-pulse" });
      agentRow.append(pulse, h("span", { className: "crm-detail__agent-name" }, `Managed by ${agentData.name}`));
      headerInfo.append(agentRow);
    }

    const profile = h("div", { className: "crm-detail__profile" });
    profile.append(bigAvatar, headerInfo);
    header.append(profile);

    // Quick actions
    const actions = h("div", { className: "crm-detail__actions" });
    const actionItems = [
      { icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>`, label: "Call" },
      { icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`, label: "Email" },
      { icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`, label: "Meet" },
    ];
    actionItems.forEach((a) => {
      const btn = h("button", { className: "crm-detail__action-btn" });
      btn.innerHTML = a.icon;
      btn.append(h("span", {}, a.label));
      actions.append(btn);
    });
    header.append(actions);
    detail.append(header);

    // Contact info (simple row)
    const infoRow = h("div", { className: "crm-detail__info-row" });
    infoRow.append(
      h("span", { className: "crm-detail__info-value" }, contact.email),
      h("span", { className: "crm-detail__info-sep" }, "\u00B7"),
      h("span", { className: "crm-detail__info-value" }, contact.phone),
      h("span", { className: "crm-detail__info-sep" }, "\u00B7"),
      h("span", { className: "crm-detail__info-value" }, `Last contact: ${contact.lastContact}`)
    );
    detail.append(infoRow);

    // Live activity log for this contact
    const activitySection = h("div", { className: "crm-detail__activity" });
    activitySection.append(h("div", { className: "crm-detail__activity-label" }, "Activity"));
    const activityList = h("div", { className: "crm-detail__activity-list" });
    const contactLogs = (contactActivity[contact.id] || []).slice(0, 4);
    if (contactLogs.length) {
      contactLogs.forEach((log) => {
        const row = h("div", { className: "crm-detail__activity-item" });
        row.append(
          h("span", { className: "crm-detail__activity-icon", innerHTML: log.icon }),
          h("span", { className: "crm-detail__activity-text" }, log.text),
          h("span", { className: "crm-detail__activity-time" }, log.time)
        );
        activityList.append(row);
      });
    } else {
      activityList.append(h("div", { className: "crm-detail__activity-empty" }, "No recent activity"));
    }
    activitySection.append(activityList);
    detail.append(activitySection);

    fadeIn(detail);
  }

  // Per-contact activity log
  const contactActivity = {};
  const ICON_CALL = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>`;
  const ICON_EMAIL = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;
  const ICON_MEET = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  const ICON_NOTE = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;

  // Seed initial activity
  function seedActivity() {
    contactActivity["c1"] = [
      { icon: ICON_EMAIL, text: "Sent Q2 partnership proposal", time: "2h ago" },
      { icon: ICON_CALL,  text: "Call completed, 12 min", time: "1d ago" },
    ];
    contactActivity["c2"] = [
      { icon: ICON_NOTE, text: "Profile enriched from public data", time: "5m ago" },
    ];
    contactActivity["c5"] = [
      { icon: ICON_MEET, text: "Renewal meeting booked for Thursday", time: "11m ago" },
    ];
    contactActivity["c8"] = [
      { icon: ICON_NOTE, text: "Flagged: no contact in 4 days", time: "18m ago" },
    ];
  }

  // ── Feed ──
  const seedLogs = [
    { agent: "sales",     text: "Sent partnership proposal to Laura Kemp",        time: "2m ago" },
    { agent: "outreach",  text: "Enriched Noel Briggs profile from public data",  time: "5m ago" },
    { agent: "scheduler", text: "Booked renewal call with Anya for Thursday",     time: "11m ago" },
    { agent: "insight",   text: "Flagged Owen Radcliffe: no contact in 4 days",   time: "18m ago" },
  ];

  function createFeedItem(agentKey, text, timeText) {
    const item = h("div", { className: "crm-feed__item" });
    const agentData = AGENTS[agentKey];
    const avatar = h("span", { className: "crm-feed__avatar" });
    avatar.textContent = agentData.initials;
    avatar.style.background = agentData.color + "20";
    avatar.style.color = agentData.color;
    const content = h("div", { className: "crm-feed__content" });
    content.append(
      h("span", { className: "crm-feed__name" }, agentData.name),
      h("span", { className: "crm-feed__text" }, text)
    );
    const time = h("span", { className: "crm-feed__time" }, timeText);
    item.append(avatar, content, time);
    return item;
  }

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

  // ── Visual overlay system ──
  function showOverlay(contact, type, data, duration) {
    // Select the contact first so the overlay is contextual
    selectedId = contact.id;
    renderContactList();
    renderDetail();

    const overlay = h("div", { className: "crm-overlay" });
    overlay.style.opacity = "0";

    if (type === "call") {
      const card = h("div", { className: "crm-overlay__card crm-overlay__card--call" });
      const photo = h("img", { className: "crm-overlay__photo", src: contact.photo, alt: "" });
      const ring = h("div", { className: "crm-overlay__ring" });
      ring.append(photo);
      card.append(ring);
      card.append(h("div", { className: "crm-overlay__name" }, contact.name));
      const statusEl = h("div", { className: "crm-overlay__call-status" }, "Calling...");
      card.append(statusEl);
      const timerEl = h("div", { className: "crm-overlay__timer" });
      timerEl.style.display = "none";
      card.append(timerEl);
      overlay.append(card);

      // Ringing -> connected -> timer
      setTimeout(() => {
        statusEl.textContent = "Connected";
        timerEl.style.display = "";
        let sec = 0;
        const tick = setInterval(() => {
          sec++;
          const m = Math.floor(sec / 60);
          const s = String(sec % 60).padStart(2, "0");
          timerEl.textContent = `${m}:${s}`;
        }, 1000);
        setTimeout(() => clearInterval(tick), duration - 1500);
      }, 1200);
    }

    if (type === "email") {
      const card = h("div", { className: "crm-overlay__card crm-overlay__card--email" });
      const header = h("div", { className: "crm-overlay__email-header" });
      header.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><span>New Email</span>`;
      card.append(header);
      card.append(h("div", { className: "crm-overlay__email-field" }, `To: ${contact.email}`));
      card.append(h("div", { className: "crm-overlay__email-field" }, `Subject: ${data.subject}`));
      const bodyEl = h("div", { className: "crm-overlay__email-body" });
      card.append(bodyEl);
      overlay.append(card);

      // Type out the email body
      let idx = 0;
      const bodyText = data.body;
      const typeInterval = setInterval(() => {
        if (idx < bodyText.length) {
          bodyEl.textContent += bodyText[idx];
          idx++;
        } else {
          clearInterval(typeInterval);
        }
      }, 25);
      setTimeout(() => clearInterval(typeInterval), duration - 500);
    }

    if (type === "meeting") {
      const card = h("div", { className: "crm-overlay__card crm-overlay__card--meeting" });
      const header = h("div", { className: "crm-overlay__meeting-header" });
      header.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>Meeting Scheduled</span>`;
      card.append(header);
      const meetInfo = h("div", { className: "crm-overlay__meeting-info" });
      const meetPhoto = h("img", { className: "crm-overlay__meeting-photo", src: contact.photo, alt: "" });
      const meetDetails = h("div", { className: "crm-overlay__meeting-details" });
      meetDetails.append(
        h("div", { className: "crm-overlay__meeting-title" }, data.title),
        h("div", { className: "crm-overlay__meeting-meta" }, data.when),
        h("div", { className: "crm-overlay__meeting-meta" }, `with ${contact.name}`)
      );
      meetInfo.append(meetPhoto, meetDetails);
      card.append(meetInfo);
      overlay.append(card);
    }

    detail.style.position = "relative";
    detail.append(overlay);
    requestAnimationFrame(() => {
      overlay.style.transition = "opacity 300ms ease";
      overlay.style.opacity = "1";
    });

    // Dismiss
    setTimeout(() => {
      overlay.style.transition = "opacity 400ms ease";
      overlay.style.opacity = "0";
      setTimeout(() => overlay.remove(), 400);
    }, duration);
  }

  // ── Animation sequence: agents doing real CRM work ──
  const animations = [
    { delay: 2500,  agent: "sales",     contactId: "c6", icon: ICON_CALL,  type: "call",    data: {},                                                                                       activity: "Called Leo, discussed roadmap",      log: "Called Leo Navarro, 8 min conversation",  overlayDuration: 4500 },
    { delay: 8500,  agent: "outreach",  contactId: "c2", icon: ICON_EMAIL, type: "email",   data: { subject: "Intro + Case Study", body: "Hi Noel, following up on our conversation. I wanted to share a relevant case study from a similar company in your space..." }, activity: "Sent intro email with case study",   log: "Sent intro email to Noel Briggs",         overlayDuration: 4500 },
    { delay: 15000, agent: "scheduler", contactId: "c3", icon: ICON_MEET,  type: "meeting", data: { title: "Coffee Chat", when: "Monday, Apr 7 at 10:00 AM" },                              activity: "Booked coffee chat for Monday",     log: "Scheduled meeting with Ingrid Holm",      overlayDuration: 3500 },
    { delay: 20500, agent: "sales",     contactId: "c1", icon: ICON_CALL,  type: "call",    data: {},                                                                                       activity: "Follow-up call, contract discussed", log: "Called Laura Kemp, renewal confirmed",    overlayDuration: 4500 },
    { delay: 27000, agent: "outreach",  contactId: "c5", icon: ICON_EMAIL, type: "email",   data: { subject: "Renewal Reminder", body: "Hi Anya, just a heads up that your annual subscription renewal is coming up next month. Happy to jump on a quick call to discuss..." }, activity: "Sent renewal reminder to Anya",  log: "Emailed Anya Desai renewal reminder", overlayDuration: 4500 },
  ];

  // Save initial last contacts for reset
  const initialLastContacts = {};
  contacts.forEach((c) => { initialLastContacts[c.id] = c.lastContact; });

  function applyAnimation(anim) {
    const contact = contacts.find((c) => c.id === anim.contactId);
    if (!contact) return;

    contact.lastContact = "Just now";

    // Add to per-contact activity log
    if (!contactActivity[contact.id]) contactActivity[contact.id] = [];
    contactActivity[contact.id].unshift({ icon: anim.icon, text: anim.activity, time: "Just now" });
    if (contactActivity[contact.id].length > 4) contactActivity[contact.id].pop();

    addFeedEntry(anim.agent, anim.log);

    // Flash the contact in the sidebar
    const contactEl = contactList.querySelector(`[data-id="${anim.contactId}"]`);
    if (contactEl) {
      contactEl.classList.add("crm-contact--flash");
      setTimeout(() => contactEl.classList.remove("crm-contact--flash"), 800);
    }

    // Show visual overlay
    if (anim.type) {
      showOverlay(contact, anim.type, anim.data, anim.overlayDuration);
    } else {
      if (selectedId === anim.contactId) renderDetail();
      renderContactList();
    }
  }

  function scheduleAnimations() {
    // Reset state
    contacts.forEach((c) => { c.lastContact = initialLastContacts[c.id]; });
    Object.keys(contactActivity).forEach((k) => delete contactActivity[k]);
    seedActivity();
    selectedId = "c1";
    activeFilter = "all";
    Object.values(filterEls).forEach((el) => el.classList.remove("crm-filter--active"));
    filterEls["all"].classList.add("crm-filter--active");

    feedList.innerHTML = "";
    seedLogs.forEach((l) => feedList.append(createFeedItem(l.agent, l.text, l.time)));

    renderContactList();
    renderDetail();

    animations.forEach((a) => {
      setTimeout(() => applyAnimation(a), a.delay);
    });

    setTimeout(scheduleAnimations, 35000);
  }

  scheduleAnimations();
}


