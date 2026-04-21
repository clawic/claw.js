import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── MAC APP SIMULATION ──────────────────────────────────────────────────────

export function mountMacApp(container) {
  const svgNS = "http://www.w3.org/2000/svg";
  function icon(path, size = 16) {
    const el = document.createElementNS(svgNS, "svg");
    el.setAttribute("viewBox", "0 0 24 24");
    el.setAttribute("width", String(size));
    el.setAttribute("height", String(size));
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", "currentColor");
    el.setAttribute("stroke-width", "2");
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    el.innerHTML = path;
    return el;
  }
  const ICONS = {
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    server: '<rect x="2" y="3" width="20" height="6" rx="1"/><rect x="2" y="15" width="20" height="6" rx="1"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
    bubble: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    arrowUp: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    speaker: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>',
    thumbsUp: '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>',
    thumbsDown: '<path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/>',
    share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
  };

  ICONS.folder = '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>';
  ICONS.pie    = '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>';
  ICONS.map    = '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>';

  // ── Multi-conversation data, each with its own agent & messages ──
  const CONVERSATIONS = [
    {
      id: "mc1", title: "Refactor login flow", unread: false,
      agent: "DevOps", role: "Code Assistant", ic: "server",
      messages: [
        { role: "user",  text: "Can you review the login flow and suggest a cleaner structure?" },
        { role: "agent", text: "Of course. The current **AuthManager** mixes two responsibilities: token storage and request signing. I'd split it into:\n\n- **TokenStore**, handles persistence and refresh\n- **AuthInterceptor**, signs outgoing requests\n\nThat way you can swap providers without touching the network layer." },
        { role: "user",  text: "That makes sense. Where would you put the OAuth callback handling?" },
        { role: "agent", text: "Inside a small **OAuthCoordinator** that only cares about the redirect flow. It hands the resulting tokens to `TokenStore`, so responsibilities stay tight and you can add PKCE later without ripples." },
      ],
    },
    {
      id: "mc2", title: "Optimize image cache", unread: true,
      agent: "DevOps", role: "Code Assistant", ic: "server",
      messages: [
        { role: "user",  text: "The image cache hits memory limits on low-end devices. Any ideas?" },
        { role: "agent", text: "Switch to a two-tier cache:\n\n- Small **in-memory NSCache** bounded by count\n- Disk-backed cache under `~/Library/Caches`\n\nUse `ImageIO` to downsample on decode so you never hold full-res bitmaps in RAM. I measured a **62% drop** in peak memory on an iPhone SE." },
        { role: "user",  text: "Nice. Can you draft the PR?" },
        { role: "agent", text: "Pushed to `feat/image-cache-v2`. Changes touch 6 files, adds `ImageCache.swift`, updates callers to use the new API. CI is green." },
      ],
    },
    {
      id: "mc3", title: "A/B test landing hero", unread: true,
      agent: "Analyst", role: "Growth Assistant", ic: "pie",
      messages: [
        { role: "user",  text: "Pull the results of last week's landing hero A/B test." },
        { role: "agent", text: "Variant **B** (\"Agents Everywhere\") is winning:\n\n- CTR **4.8%** vs 3.1% on control\n- Signup **2.2%** vs 1.4%\n- Statistical significance **98.7%**\n\nSample size is 24,108 visitors split 50/50. Safe to ship." },
      ],
    },
    {
      id: "mc4", title: "Schema for notifications", unread: false,
      agent: "Planner", role: "Architect", ic: "map",
      messages: [
        { role: "user",  text: "Design a notifications table that supports read state per user." },
        { role: "agent", text: "Two tables:\n\n- `notifications` with id, kind, payload (jsonb), created_at\n- `notification_reads` with notification_id, user_id, read_at (composite PK)\n\nUnread count is a LEFT OUTER join, which stays fast thanks to the composite index. Scales past a few million rows before sharding." },
      ],
    },
    {
      id: "mc5", title: "Migrate to Postgres 16", unread: false,
      agent: "DevOps", role: "Code Assistant", ic: "server",
      messages: [
        { role: "user",  text: "What do I need to watch for when upgrading from pg14 to pg16?" },
        { role: "agent", text: "Main things to check:\n\n- **Collation changes** between glibc versions can break indexes, reindex text columns after upgrade\n- **pg_stat_statements** format changed, dashboards need updates\n- **Logical replication** upgraded, double check publication and subscription state\n\nRun `pg_upgrade --check` on a staging clone first. Takes about 4 minutes on your dataset." },
      ],
    },
  ];
  const PROJECTS = [
    "Acme Dashboard",
    "Mobile Banking",
    "Recipe Finder",
    "Indoor Maps",
  ];
  const AGENT_RESPONSES = [
    "Got it. Let me dig in.\n\n- Scanning the relevant files\n- Cross-checking with the docs\n- Drafting a focused change\n\nShould take a few seconds.",
    "On it. Here's what I found:\n\n- The root cause is in `src/core/handler.ts:247`\n- A missing null check trips the guard\n- **Fix applied**, tests passing locally\n\nWant me to open the PR?",
    "Understood. Here's my plan:\n\n- **Step 1** map existing behavior\n- **Step 2** implement the change behind a flag\n- **Step 3** flip the flag once tests are green\n\nStarting now.",
    "Done. Pushed to `feat/update-branch`, 4 files changed, **42 lines added**, 18 removed. CI is green and I ran the integration suite twice to be safe.",
  ];

  // ── Build frame ──
  const win = h("div", { className: "macwin" });

  const title = h("div", { className: "macwin__titlebar" });
  title.append(
    h("div", { className: "macwin__lights" },
      h("div", { className: "macwin__light macwin__light--red" }),
      h("div", { className: "macwin__light macwin__light--yellow" }),
      h("div", { className: "macwin__light macwin__light--green" }),
    ),
    h("div", { className: "macwin__title" }, "ClawJS"),
  );
  win.append(title);

  const body = h("div", { className: "macwin__body" });

  // ── Sidebar ──
  const sb = h("div", { className: "macwin__sidebar" });
  sb.append(
    h("div", { className: "macwin__brand" },
      h("img", { className: "macwin__brand-logo", src: "/logo.png", alt: "" }),
      h("div", { className: "macwin__brand-name" }, "ClawJS"),
    ),
  );
  const newChatBtn = h("div", { className: "macwin__newchat" }, icon(ICONS.edit, 14), "New Chat");
  sb.append(newChatBtn);

  sb.append(h("div", { className: "macwin__sect" }, "Projects"));
  PROJECTS.forEach((p) => {
    const row = h("div", { className: "macwin__sb-row macwin__sb-row--project" },
      icon(ICONS.folder, 14),
      h("div", { className: "macwin__sb-row__title" }, p),
    );
    row.addEventListener("click", () => {
      pauseAutoplay();
      sb.querySelectorAll(".macwin__sb-row--project").forEach((r) => r.classList.remove("macwin__sb-row--active"));
      row.classList.add("macwin__sb-row--active");
    });
    sb.append(row);
  });

  sb.append(h("div", { className: "macwin__sect" }, "Conversations"));
  const convListWrap = h("div", { className: "macwin__sb-convs" });
  sb.append(convListWrap);

  body.append(sb);

  // ── Chat area ──
  const chat = h("div", { className: "macwin__chat" });

  const chatAvatar = h("div", { className: "macwin__chat-avatar" }, icon(ICONS.server, 16));
  const chatName = h("div", { className: "macwin__chat-name" }, "DevOps");
  const chatStatus = h("div", { className: "macwin__chat-status" }, "Code Assistant");
  const chatHdr = h("div", { className: "macwin__chat-header" },
    chatAvatar,
    h("div", { className: "macwin__chat-meta" }, chatName, chatStatus),
    h("div", { className: "macwin__chat-actions" },
      icon(ICONS.search, 16),
      icon(ICONS.more, 16),
    ),
  );
  chat.append(chatHdr);

  const msgs = h("div", { className: "macwin__msgs" });
  chat.append(msgs);

  // Typeable composer
  const inputField = h("div", {
    className: "macwin__input-field",
    contentEditable: "true",
    role: "textbox",
  });
  inputField.dataset.placeholder = "Message…";
  const sendBtn = h("div", { className: "macwin__input-send" }, icon(ICONS.arrowUp, 14));
  const input = h("div", { className: "macwin__input" },
    icon(ICONS.plus, 14),
    inputField,
    sendBtn,
  );
  chat.append(input);

  body.append(chat);
  win.append(body);
  container.append(win);

  // ── State & helpers ──
  let activeId = CONVERSATIONS[0].id;
  let timers = [];
  let autoplayToken = 0;
  let userPaused = false;
  let sessionCounter = 0;
  let thinkingEl = null;

  function pushTimer(t) { timers.push(t); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }

  function renderMarkdown(text) {
    let html = text
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const blocks = html.split(/\n\n/);
    return blocks.map((block) => {
      const lines = block.split("\n");
      const isList = lines.length > 0 && lines.every((l) => l.startsWith("- "));
      if (isList) return "<ul>" + lines.map((l) => `<li>${l.slice(2)}</li>`).join("") + "</ul>";
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    }).join("");
  }

  function addUserBubble(text) {
    const wrap = h("div", { className: "mac-msg mac-msg--user mac-msg--in" },
      h("div", { className: "mac-msg__bubble" }, text),
    );
    msgs.append(wrap);
    requestAnimationFrame(() => wrap.classList.add("mac-msg--shown"));
    scrollDown();
  }

  function addAgentShell() {
    const text = h("div", { className: "mac-msg__text" });
    const wrap = h("div", { className: "mac-msg mac-msg--agent mac-msg--in" }, text);
    msgs.append(wrap);
    requestAnimationFrame(() => wrap.classList.add("mac-msg--shown"));
    return { wrap, text };
  }

  function addAgentActions(wrap) {
    const acts = h("div", { className: "mac-msg__actions" });
    ["copy","speaker","thumbsUp","thumbsDown","share","more"].forEach((k) => {
      acts.append(icon(ICONS[k], 14));
    });
    wrap.append(acts);
  }

  function showThinking() {
    thinkingEl = h("div", { className: "mac-msg mac-msg--agent mac-msg--in mac-msg--shown" },
      h("div", { className: "mac-thinking" }, h("span"), h("span"), h("span")),
    );
    msgs.append(thinkingEl);
    scrollDown();
  }
  function hideThinking() {
    if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
  }

  function streamAgentMessage(text, token, onDone) {
    const { wrap, text: txt } = addAgentShell();
    let i = 0;
    function tick() {
      if (token !== autoplayToken) return;
      if (i >= text.length) {
        txt.innerHTML = renderMarkdown(text);
        addAgentActions(wrap);
        scrollDown();
        onDone?.();
        return;
      }
      i = Math.min(text.length, i + 2);
      txt.innerHTML = renderMarkdown(text.slice(0, i));
      scrollDown();
      pushTimer(setTimeout(tick, 12));
    }
    tick();
  }

  function renderSidebar() {
    convListWrap.innerHTML = "";
    CONVERSATIONS.forEach((c) => {
      const isActive = c.id === activeId;
      const cls = "macwin__sb-row macwin__sb-row--conv" + (isActive ? " macwin__sb-row--active" : "");
      const row = h("div", { className: cls },
        icon(ICONS.bubble, 14),
        h("div", { className: "macwin__sb-row__title" }, c.title),
      );
      if (c.unread && !isActive) row.append(h("div", { className: "macwin__sb-row__dot" }));
      row.addEventListener("click", () => {
        if (c.id === activeId) return;
        c.unread = false;
        switchConversation(c.id, true);
      });
      convListWrap.append(row);
    });
  }

  function updateHeader(conv) {
    chatAvatar.innerHTML = "";
    chatAvatar.append(icon(ICONS[conv.ic] || ICONS.server, 16));
    chatName.textContent = conv.agent;
    chatStatus.textContent = conv.role;
  }

  function switchConversation(id, userInitiated) {
    clearTimers();
    hideThinking();
    autoplayToken++;
    const token = autoplayToken;
    activeId = id;
    const conv = CONVERSATIONS.find((c) => c.id === id);
    if (!conv) return;
    conv.unread = false;
    renderSidebar();
    updateHeader(conv);
    msgs.innerHTML = "";
    if (userInitiated) userPaused = true;
    pushTimer(setTimeout(() => playMessage(conv, 0, token), 420));
  }

  function playMessage(conv, idx, token) {
    if (token !== autoplayToken) return;
    if (idx >= conv.messages.length) {
      if (!userPaused) {
        pushTimer(setTimeout(() => {
          if (token !== autoplayToken) return;
          const i = CONVERSATIONS.findIndex((c) => c.id === activeId);
          const next = CONVERSATIONS[(i + 1) % CONVERSATIONS.length];
          switchConversation(next.id, false);
        }, 3400));
      }
      return;
    }
    const m = conv.messages[idx];
    if (m.role === "user") {
      addUserBubble(m.text);
      pushTimer(setTimeout(() => playMessage(conv, idx + 1, token), 720));
    } else {
      showThinking();
      pushTimer(setTimeout(() => {
        if (token !== autoplayToken) return;
        hideThinking();
        streamAgentMessage(m.text, token, () => {
          pushTimer(setTimeout(() => playMessage(conv, idx + 1, token), 900));
        });
      }, 850));
    }
  }

  function pauseAutoplay() { userPaused = true; }

  // ── Composer behavior ──
  function sendCurrentText() {
    const txt = inputField.textContent.trim();
    if (!txt) return;
    pauseAutoplay();
    clearTimers();
    hideThinking();
    autoplayToken++;
    const token = autoplayToken;
    inputField.textContent = "";
    addUserBubble(txt);
    pushTimer(setTimeout(() => {
      if (token !== autoplayToken) return;
      showThinking();
      pushTimer(setTimeout(() => {
        if (token !== autoplayToken) return;
        hideThinking();
        const resp = AGENT_RESPONSES[Math.floor(Math.random() * AGENT_RESPONSES.length)];
        streamAgentMessage(resp, token, () => {});
      }, 750));
    }, 360));
  }

  inputField.addEventListener("focus", pauseAutoplay);
  inputField.addEventListener("keydown", (e) => {
    pauseAutoplay();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCurrentText();
    }
  });
  sendBtn.addEventListener("click", (e) => { e.preventDefault(); sendCurrentText(); });

  newChatBtn.addEventListener("click", () => {
    pauseAutoplay();
    clearTimers();
    hideThinking();
    autoplayToken++;
    sessionCounter++;
    const id = "mnew" + sessionCounter;
    CONVERSATIONS.unshift({
      id, title: "New chat", unread: false,
      agent: "DevOps", role: "Code Assistant", ic: "server",
      messages: [],
    });
    activeId = id;
    renderSidebar();
    updateHeader(CONVERSATIONS[0]);
    msgs.innerHTML = "";
    inputField.focus();
  });

  // ── Start autoplay on first visibility ──
  renderSidebar();
  updateHeader(CONVERSATIONS[0]);

  let started = false;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && !started) {
        started = true;
        switchConversation(CONVERSATIONS[0].id, false);
      }
    });
  }, { threshold: 0.15 });
  io.observe(win);
}

