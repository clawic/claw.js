import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── iOS APP SIMULATION ──────────────────────────────────────────────────────

export function mountIosApp(container) {
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
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
    pencil: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>',
    server: '<rect x="2" y="3" width="20" height="6" rx="1"/><rect x="2" y="15" width="20" height="6" rx="1"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    pie: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    brush: '<path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    arrowUp: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    speaker: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>',
    thumbsUp: '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>',
    thumbsDown: '<path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/>',
    share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  };

  const AGENTS = [
    { name: "DevOps",   ic: "server" },
    { name: "SEO",      ic: "chart"  },
    { name: "Analyst",  ic: "pie"    },
    { name: "Planner",  ic: "map"    },
    { name: "Tutor",    ic: "book"   },
    { name: "Designer", ic: "brush"  },
  ];
  const PROJECTS = [
    "Acme Dashboard",
    "Mobile Banking",
    "Recipe Finder",
    "Indoor Maps",
    "Photo Library",
  ];

  // Conversations with full message threads, cycled during autoplay
  const CONVERSATIONS = [
    {
      id: "ic1", title: "Refactor login flow", unread: true, agent: "DevOps", ic: "server",
      messages: [
        { role: "user",  text: "Can you review the login flow and suggest a cleaner structure?" },
        { role: "agent", text: "Sure. The current **AuthManager** mixes OAuth and JWT. I'd split it into a TokenStore and an AuthInterceptor, smaller responsibilities and easier to test." },
        { role: "user",  text: "Where would OAuth callback handling live?" },
        { role: "agent", text: "A tiny **OAuthCoordinator** that only handles the redirect flow, then hands tokens to `TokenStore`." },
      ],
    },
    {
      id: "ic2", title: "Optimize image cache", unread: true, agent: "DevOps", ic: "server",
      messages: [
        { role: "user",  text: "Image cache hits memory limits on low-end devices." },
        { role: "agent", text: "Move to a two-tier cache: a small NSCache plus disk under Library/Caches. Downsample on decode with ImageIO. Memory dropped **62%** on an iPhone SE." },
      ],
    },
    {
      id: "ic3", title: "A/B test landing hero", unread: true, agent: "Analyst", ic: "pie",
      messages: [
        { role: "user",  text: "Pull the results of last week's landing hero A/B test." },
        { role: "agent", text: "Variant **B** is winning:\n\n- CTR **4.8%** vs 3.1%\n- Signup **2.2%** vs 1.4%\n- Significance **98.7%**\n\nSafe to ship." },
      ],
    },
    {
      id: "ic4", title: "Schema for notifications", unread: true, agent: "Planner", ic: "map",
      messages: [
        { role: "user",  text: "Design a notifications table with read state per user." },
        { role: "agent", text: "Two tables: `notifications` for payloads, `notification_reads` with a composite PK of notification_id + user_id. Unread count is a LEFT OUTER join, scales past a few million rows before you'd want to shard." },
      ],
    },
    {
      id: "ic5", title: "Add dark mode support", unread: false, agent: "Designer", ic: "brush",
      messages: [
        { role: "user",  text: "How should we implement dark mode app-wide?" },
        { role: "agent", text: "Use semantic color tokens (`bg`, `fg`, `accent`) and let the system colorscheme drive them. Avoid hardcoded hex in components. I've got a migration plan ready." },
      ],
    },
  ];

  const AGENT_RESPONSES = [
    "Got it. Let me look into that.\n\n- Scanning the relevant code\n- Drafting a change\n\nBack in a sec.",
    "Sure. Here's what I found:\n\n- The guard in `handler.ts:247` is missing a null check\n- **Fix applied**, tests passing\n\nShall I open the PR?",
    "Understood. I'll tackle it in three steps: map the current behavior, ship the change behind a flag, then flip the flag once CI is green.",
    "Done. **4 files** changed, pushed to `feat/update`, CI is green.",
  ];

  // ── iPhone frame ──
  const phone = h("div", { className: "iphone" });
  const screen = h("div", { className: "iphone__screen" });
  phone.append(screen);

  // status bar
  const statusBar = h("div", { className: "iphone__statusbar" });
  statusBar.append(
    h("span", {}, "9:41"),
    (function () {
      const wrap = h("div", { className: "iphone__statusbar-icons" });
      // signal
      const sig = document.createElementNS(svgNS, "svg");
      sig.setAttribute("viewBox", "0 0 18 12");
      sig.setAttribute("width", "16");
      sig.setAttribute("height", "10");
      sig.innerHTML = '<rect x="0" y="8" width="3" height="4" rx="0.5"/><rect x="4" y="6" width="3" height="6" rx="0.5"/><rect x="8" y="3" width="3" height="9" rx="0.5"/><rect x="12" y="0" width="3" height="12" rx="0.5"/>';
      // wifi
      const wifi = document.createElementNS(svgNS, "svg");
      wifi.setAttribute("viewBox", "0 0 16 12");
      wifi.setAttribute("width", "15");
      wifi.setAttribute("height", "11");
      wifi.innerHTML = '<path d="M8 11 L9.5 9.5 A2 2 0 0 0 6.5 9.5 Z"/><path d="M3 6 A7 7 0 0 1 13 6 L11.5 7.5 A5 5 0 0 0 4.5 7.5 Z"/><path d="M0.5 3.5 A11 11 0 0 1 15.5 3.5 L14 5 A9 9 0 0 0 2 5 Z"/>';
      // battery
      const bat = document.createElementNS(svgNS, "svg");
      bat.setAttribute("viewBox", "0 0 26 12");
      bat.setAttribute("width", "24");
      bat.setAttribute("height", "11");
      bat.innerHTML = '<rect x="0.5" y="0.5" width="22" height="11" rx="2.5" fill="none" stroke="white" stroke-opacity="0.5"/><rect x="2" y="2" width="19" height="8" rx="1.5"/><rect x="23" y="4" width="2" height="4" rx="0.5"/>';
      wrap.append(sig, wifi, bat);
      return wrap;
    })()
  );
  screen.append(statusBar);

  const notch = h("div", { className: "iphone__notch" });
  screen.append(notch);

  // app container
  const app = h("div", { className: "iphone__app" });
  screen.append(app);
  screen.append(h("div", { className: "iphone__home-indicator" }));

  // ── Screen 1: Home ──
  const home = h("div", { className: "ios-screen ios-screen--active ios-home" });

  const topbar = h("div", { className: "ios-home__topbar" });
  topbar.append(
    h("div", { className: "ios-home__title" }, "ClawJS"),
    h("div", { className: "ios-home__actions" },
      h("div", { className: "ios-home__action" }, icon(ICONS.search, 22)),
      h("div", { className: "ios-home__action" }, icon(ICONS.menu, 22)),
    )
  );
  home.append(topbar);

  const agentsStrip = h("div", { className: "ios-agents" });
  AGENTS.forEach((a) => {
    agentsStrip.append(
      h("div", { className: "ios-agent-chip" },
        h("div", { className: "ios-agent-chip__avatar" }, icon(ICONS[a.ic] || ICONS.menu, 18)),
        h("div", { className: "ios-agent-chip__name" }, a.name),
      )
    );
  });
  agentsStrip.append(
    h("div", { className: "ios-agent-chip" },
      h("div", { className: "ios-agent-chip__avatar ios-agent-chip__avatar--add" }, icon(ICONS.plus, 18)),
      h("div", { className: "ios-agent-chip__name" }, "Create"),
    )
  );
  home.append(agentsStrip);

  home.append(h("div", { className: "ios-section-title" }, "Projects"));
  PROJECTS.forEach((p) => {
    home.append(
      h("div", { className: "ios-project-row" },
        h("div", { className: "ios-project-row__icon" }, icon(ICONS.folder, 16)),
        h("div", { className: "ios-project-row__name" }, p),
      )
    );
  });
  home.append(h("div", { className: "ios-see-all" }, "See all"));

  home.append(h("div", { className: "ios-section-title" }, "Conversations"));
  const convRowNodes = {};
  CONVERSATIONS.forEach((c) => {
    const row = h("div", { className: "ios-conv-row" },
      h("div", { className: "ios-conv-row__title" }, c.title),
    );
    const dot = h("div", { className: "ios-conv-row__dot" });
    if (c.unread) row.append(dot);
    row.addEventListener("click", () => {
      c.unread = false;
      if (dot.parentNode) dot.remove();
      userInteracted = true;
      openConversation(c.id, /*userInitiated*/ true);
    });
    convRowNodes[c.id] = { row, dot };
    home.append(row);
  });

  const fab = h("div", { className: "ios-fab" }, icon(ICONS.pencil, 14), "Chat");
  app.append(home, fab);

  // ── Screen 2: Chat ──
  const chat = h("div", { className: "ios-screen ios-chat" });

  const backBtn = h("div", { className: "ios-chat__back" }, icon(ICONS.chevronLeft, 16));
  const agentPill = h("div", { className: "ios-chat__agent" }, "DevOps");
  const navbar = h("div", { className: "ios-chat__navbar" });
  navbar.append(
    backBtn,
    agentPill,
    h("div", { className: "ios-chat__actions" },
      h("div", { className: "ios-chat__action" }, icon(ICONS.edit, 14)),
      h("div", { className: "ios-chat__action" }, icon(ICONS.menu, 14)),
    )
  );
  chat.append(navbar);

  const messages = h("div", { className: "ios-chat__messages" });
  chat.append(messages);

  // Typeable composer
  const inputField = h("div", {
    className: "ios-chat__input-field",
    contentEditable: "true",
    role: "textbox",
  });
  inputField.dataset.placeholder = "Message…";
  const sendBtn = h("div", { className: "ios-chat__input-send" }, icon(ICONS.arrowUp, 14));
  const input = h("div", { className: "ios-chat__input" }, inputField, sendBtn);
  chat.append(input);

  app.append(chat);
  container.append(phone);

  // ── State ──
  let timers = [];
  let autoplayToken = 0;
  let userInteracted = false;
  let activeConvId = null;
  let cycleIndex = 0;

  function pushTimer(t) { timers.push(t); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function scrollDown() { messages.scrollTop = messages.scrollHeight; }

  function renderMarkdown(text) {
    let html = text
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const blocks = html.split(/\n\n/);
    return blocks.map((block) => {
      const lines = block.split("\n");
      const isList = lines.length > 0 && lines.every((l) => l.startsWith("- "));
      if (isList) return "<ul>" + lines.map((l) => `<li>${l.slice(2)}</li>`).join("") + "</ul>";
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    }).join("");
  }

  function addUserMsg(text) {
    const wrap = h("div", { className: "ios-msg ios-msg--user ios-msg--in" },
      h("div", { className: "ios-msg__bubble" }, text),
    );
    messages.append(wrap);
    requestAnimationFrame(() => wrap.classList.add("ios-msg--shown"));
    scrollDown();
  }

  function addAgentShell() {
    const txt = h("div", { className: "ios-msg__text" });
    const wrap = h("div", { className: "ios-msg ios-msg--agent ios-msg--in" }, txt);
    messages.append(wrap);
    requestAnimationFrame(() => wrap.classList.add("ios-msg--shown"));
    return { wrap, txt };
  }
  function addAgentActions(wrap) {
    const acts = h("div", { className: "ios-msg__actions" });
    ["copy","speaker","thumbsUp","thumbsDown","share","more"].forEach((k) => {
      acts.append(icon(ICONS[k], 13));
    });
    wrap.append(acts);
  }

  let thinkingEl = null;
  function showThinking() {
    thinkingEl = h("div", { className: "ios-msg ios-msg--agent ios-msg--in ios-msg--shown" },
      h("div", { className: "ios-thinking" }, h("span"), h("span"), h("span")),
    );
    messages.append(thinkingEl);
    scrollDown();
  }
  function hideThinking() {
    if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
  }

  function streamAgentMessage(text, token, onDone) {
    const { wrap, txt } = addAgentShell();
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
      pushTimer(setTimeout(tick, 14));
    }
    tick();
  }

  function showHome() {
    chat.classList.remove("ios-screen--active");
    home.classList.add("ios-screen--active");
    fab.style.opacity = "1";
  }
  function showChat() {
    home.classList.remove("ios-screen--active");
    chat.classList.add("ios-screen--active");
    fab.style.opacity = "0";
  }

  function openConversation(id, userInitiated) {
    clearTimers();
    hideThinking();
    autoplayToken++;
    const token = autoplayToken;
    activeConvId = id;
    const conv = CONVERSATIONS.find((c) => c.id === id);
    if (!conv) return;
    if (convRowNodes[id] && convRowNodes[id].dot.parentNode) {
      convRowNodes[id].dot.remove();
    }
    agentPill.textContent = conv.agent;
    messages.innerHTML = "";
    showChat();
    if (userInitiated) userInteracted = true;
    pushTimer(setTimeout(() => playMessage(conv, 0, token), 500));
  }

  function playMessage(conv, idx, token) {
    if (token !== autoplayToken) return;
    if (idx >= conv.messages.length) {
      if (!userInteracted) {
        pushTimer(setTimeout(() => {
          if (token !== autoplayToken) return;
          showHome();
          pushTimer(setTimeout(() => {
            if (token !== autoplayToken) return;
            cycleIndex = (cycleIndex + 1) % CONVERSATIONS.length;
            openConversation(CONVERSATIONS[cycleIndex].id, false);
          }, 1400));
        }, 2400));
      }
      return;
    }
    const m = conv.messages[idx];
    if (m.role === "user") {
      addUserMsg(m.text);
      pushTimer(setTimeout(() => playMessage(conv, idx + 1, token), 700));
    } else {
      showThinking();
      pushTimer(setTimeout(() => {
        if (token !== autoplayToken) return;
        hideThinking();
        streamAgentMessage(m.text, token, () => {
          pushTimer(setTimeout(() => playMessage(conv, idx + 1, token), 850));
        });
      }, 800));
    }
  }

  // ── Composer behavior ──
  function sendCurrentText() {
    const text = inputField.textContent.trim();
    if (!text) return;
    userInteracted = true;
    clearTimers();
    hideThinking();
    autoplayToken++;
    const token = autoplayToken;
    inputField.textContent = "";
    addUserMsg(text);
    pushTimer(setTimeout(() => {
      if (token !== autoplayToken) return;
      showThinking();
      pushTimer(setTimeout(() => {
        if (token !== autoplayToken) return;
        hideThinking();
        const resp = AGENT_RESPONSES[Math.floor(Math.random() * AGENT_RESPONSES.length)];
        streamAgentMessage(resp, token, () => {});
      }, 700));
    }, 340));
  }

  inputField.addEventListener("focus", () => { userInteracted = true; });
  inputField.addEventListener("keydown", (e) => {
    userInteracted = true;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCurrentText();
    }
  });
  sendBtn.addEventListener("click", (e) => { e.preventDefault(); sendCurrentText(); });

  backBtn.addEventListener("click", () => {
    clearTimers();
    hideThinking();
    autoplayToken++;
    userInteracted = true;
    showHome();
  });

  fab.addEventListener("click", () => {
    userInteracted = true;
    if (CONVERSATIONS.length > 0) {
      openConversation(CONVERSATIONS[0].id, true);
    }
  });

  // ── Start autoplay on first visibility ──
  let started = false;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && !started) {
        started = true;
        cycleIndex = 0;
        openConversation(CONVERSATIONS[0].id, false);
      }
    });
  }, { threshold: 0.15 });
  io.observe(phone);
}

