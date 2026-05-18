import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── CHAT DEMO ──────────────────────────────────────────────────────────────

export function mountChat(container) {
  // ── Data: sessions with their own conversations ──
  const allSessions = [
    {
      id: "s1", title: "Generate invoice PDF", preview: "Created invoice #1042 for Acme Corp...", time: "2m ago",
      messages: [
        { role: "user", text: "Generate a PDF invoice for Acme Corp, order #1042, total $4,200. Use our standard template." },
        { role: "assistant", text: "On it. Here's what I did:\n\n- **Located template** at `~/templates/invoice-standard.html`\n- **Populated fields**: client Acme Corp, order #1042, total $4,200.00, date March 27 2026\n- **Rendered to PDF** using Puppeteer headless\n\nThe invoice is saved at `~/invoices/acme-corp-1042.pdf`. I also attached it to the Acme Corp record in your CRM.\n\nWant me to email it to their billing contact?" },
        { role: "user", text: "Prepare it for billing@acmecorp.com with our usual payment terms." },
        { role: "assistant", text: "Draft ready for review:\n\n- To: **billing@acmecorp.com**\n- Subject: *Invoice #1042 from ClawJS Inc*\n- PDF attached, 48 KB\n- Payment terms: **Net 30**\n\nI left payment instructions out of the draft until a human confirms the recipient, terms, and account details. The CRM timeline has a pending review note, not a sent email." },
      ],
    },
    {
      id: "s2", title: "Refactor auth module", preview: "Migrated session tokens to JWT...", time: "1h ago",
      messages: [
        { role: "user", text: "Refactor the auth module to use JWT instead of session cookies. Keep backwards compat for 2 weeks." },
        { role: "assistant", text: "I've analyzed the codebase. Here's the migration plan:\n\n- **8 files** need changes across `src/auth/` and `src/middleware/`\n- Added `jsonwebtoken` and `jose` as dependencies\n- Created a **dual-mode middleware** that accepts both JWT headers and legacy session cookies\n\nThe old cookie path logs a deprecation warning. I've already pushed the branch `feat/jwt-auth`.\n\nWant me to run the test suite?" },
        { role: "user", text: "Run tests and show me what breaks." },
        { role: "assistant", text: "Test results: **47 passed**, **3 failed**.\n\nThe failures are all in `auth.integration.test.ts`:\n\n- `test_session_refresh` expects a `Set-Cookie` header, now gets a `Authorization` header instead\n- `test_logout` was clearing cookies, needs to also invalidate the JWT\n- `test_csrf_check` no longer applies to JWT flow\n\nI've already fixed all three. Updated branch pushed. CI is green now." },
      ],
    },
    {
      id: "s3", title: "Deploy to staging", preview: "Ran migrations and deployed v2.3...", time: "3h ago",
      messages: [
        { role: "user", text: "Deploy the current main branch to staging. Run migrations first." },
        { role: "assistant", text: "Deploying to staging:\n\n- **Pulled** latest `main` (commit `a3f7c2e`)\n- **Ran 3 pending migrations**: `add_user_preferences`, `create_audit_log`, `index_sessions_table`\n- **Built** production bundle, 2.1 MB gzipped\n- **Deployed** to `staging.clawjs.dev`\n\nAll health checks are passing. The deploy took 48 seconds total." },
      ],
    },
    {
      id: "s4", title: "Scan project for TODOs", preview: "Found 14 pending TODOs across 8 files...", time: "Yesterday",
      messages: [
        { role: "user", text: "Scan the entire project for TODO and FIXME comments. Group by priority." },
        { role: "assistant", text: "Found **14 TODOs** and **3 FIXMEs** across 8 files:\n\n- **Critical (2)**: memory leak in `worker-pool.ts:142`, race condition in `queue.ts:89`\n- **High (4)**: missing input validation in 3 API routes, outdated error codes in `errors.ts`\n- **Medium (6)**: refactor suggestions, dead code removal\n- **Low (5)**: cosmetic improvements, typos in comments\n\nWant me to create GitHub issues for the critical ones?" },
      ],
    },
    {
      id: "s5", title: "Backup database", preview: "Exported prod snapshot to S3...", time: "Mar 22",
      messages: [
        { role: "user", text: "Take a full backup of the production database and upload it to S3." },
        { role: "assistant", text: "Backup complete:\n\n- **Exported** full `pg_dump` of `clawjs_prod`, 340 MB compressed\n- **Uploaded** to `s3://clawjs-backups/2026-03-22/prod-full.sql.gz`\n- **Verified** checksum: SHA-256 matches\n- **Retention**: tagged with 90-day lifecycle policy\n\nThe backup includes all schemas, extensions, and role grants. Restore tested successfully on a scratch instance." },
      ],
    },
  ];

  // Random agent responses for user-typed messages
  const agentResponses = [
    "Got it. I'll start working on that right away. Give me a moment to analyze the codebase and find the best approach.",
    "Understood. Let me check the project structure and dependencies first.\n\n- **Scanning** project files\n- **Analyzing** import graph\n- **Checking** for conflicts\n\nThis should take about 10 seconds.",
    "On it. I've found the relevant files and I'm making the changes now.\n\nI'll push a commit once everything looks clean.",
    "Sure. Let me break this down into steps:\n\n- **Step 1**: gather context from existing code\n- **Step 2**: implement the changes\n- **Step 3**: run tests to verify\n\nStarting now.",
    "Done. Everything has been updated and I've verified it works correctly.\n\nLet me know if you need anything else.",
    "I've looked into it. Here's what I found:\n\n- The issue is in `src/core/handler.ts` at line 247\n- A missing null check causes the crash\n- **Fix applied** and tests passing\n\nShould I open a PR?",
    "Already on it. I'm pulling the latest changes, running the build, and deploying.\n\nCurrent status: **building** (43% complete)",
    "I've created the file and added it to the project.\n\n- **Path**: `src/utils/helpers.ts`\n- **Exports**: 4 utility functions\n- **Tests**: added 12 test cases, all passing\n\nThe module is ready to use.",
  ];

  let activeSessionId = "s1";
  let autoplayTimer = null;
  let autoplayMsgIndex = 0;
  let isTypingResponse = false;
  let isRecording = false;
  let waveAnimFrame = null;
  let sessionCounter = allSessions.length;

  // ── Root layout ──
  const app = h("div", { className: "chat-app" });

  // ── Sidebar ──
  const sidebar = h("div", { className: "chat-sidebar" });

  const sidebarHeader = h("div", { className: "chat-sidebar__header" });
  const brand = h("div", { className: "chat-sidebar__brand" });
  brand.innerHTML = `<img src="/logo.png" alt="" class="chat-sidebar__logo"><span>ClawJS</span>`;
  const newBtn = h("button", { className: "chat-sidebar__new", title: "New chat" });
  newBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  sidebarHeader.append(brand, newBtn);
  sidebar.append(sidebarHeader);

  const sidebarLabel = h("div", { className: "chat-sidebar__label" }, "Recent");
  sidebar.append(sidebarLabel);

  const sessionList = h("div", { className: "chat-sidebar__list" });
  sidebar.append(sessionList);

  // Sidebar footer with settings
  const sidebarFooter = h("div", { className: "chat-sidebar__footer" });
  sidebarFooter.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg><span>Settings</span>`;
  sidebar.append(sidebarFooter);

  app.append(sidebar);

  // ── Main chat area ──
  const main = h("div", { className: "chat-main" });

  // Messages
  const messagesArea = h("div", { className: "chat-messages" });
  const messagesInner = h("div", { className: "chat-messages__inner" });
  messagesArea.append(messagesInner);

  let typingIndicator = null;
  const TYPING_SPEED = 16;
  const PAUSE_AFTER_MSG = 600;
  const PAUSE_BEFORE_ASSISTANT = 900;

  function scrollDown() { messagesArea.scrollTop = messagesArea.scrollHeight; }

  function addUserBubble(text) {
    const wrap = h("div", { className: "chat-msg chat-msg--user" });
    const bubble = h("div", { className: "chat-bubble chat-bubble--user" }, text);
    wrap.append(bubble);
    messagesInner.append(wrap);
    scrollDown();
  }

  function addVoiceBubble(durationStr) {
    const wrap = h("div", { className: "chat-msg chat-msg--user" });
    const bubble = h("div", { className: "chat-voice-bubble" });

    // Play/pause button
    const playBtn = h("button", { className: "chat-voice__play" });
    const vPlayIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4 11.9999V8.43989C4 4.01989 7.13 2.20989 10.96 4.41989L14.05 6.19989L17.14 7.97989C20.97 10.1899 20.97 13.8099 17.14 16.0199L14.05 17.7999L10.96 19.5799C7.13 21.7899 4 19.9799 4 15.5599V11.9999Z"/></svg>`;
    const vPauseIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10.65 19.11V4.89C10.65 3.54 10.08 3 8.64 3H5.01C3.57 3 3 3.54 3 4.89V19.11C3 20.46 3.57 21 5.01 21H8.64C10.08 21 10.65 20.46 10.65 19.11Z"/><path d="M21 19.11V4.89C21 3.54 20.43 3 18.99 3H15.36C13.93 3 13.35 3.54 13.35 4.89V19.11C13.35 20.46 13.92 21 15.36 21H18.99C20.43 21 21 20.46 21 19.11Z"/></svg>`;
    playBtn.innerHTML = vPlayIcon;
    let vPlaying = false;

    // Progress bar
    const progressWrap = h("div", { className: "chat-voice__track" });
    const progressFill = h("div", { className: "chat-voice__fill" });
    progressWrap.append(progressFill);

    // Duration
    const dur = h("span", { className: "chat-voice__dur" }, durationStr);

    // Fake playback animation
    playBtn.addEventListener("click", () => {
      if (vPlaying) {
        vPlaying = false;
        playBtn.innerHTML = vPlayIcon;
        return;
      }
      vPlaying = true;
      playBtn.innerHTML = vPauseIcon;
      let pct = 0;
      function tick() {
        if (!vPlaying || pct >= 100) {
          vPlaying = false;
          playBtn.innerHTML = vPlayIcon;
          progressFill.style.width = "0%";
          return;
        }
        pct += 0.8;
        progressFill.style.width = pct + "%";
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    bubble.append(playBtn, progressWrap, dur);
    wrap.append(bubble);
    messagesInner.append(wrap);
    scrollDown();
  }

  function showTypingIndicator() {
    typingIndicator = h("div", { className: "chat-msg chat-msg--assistant" });
    const dots = h("div", { className: "chat-typing" });
    dots.innerHTML = '<span></span><span></span><span></span>';
    typingIndicator.append(dots);
    messagesInner.append(typingIndicator);
    scrollDown();
  }

  function removeTypingIndicator() {
    if (typingIndicator) { typingIndicator.remove(); typingIndicator = null; }
  }

  function renderMarkdown(text) {
    let html = text
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");
    const blocks = html.split(/\n\n/);
    return blocks.map(block => {
      const lines = block.split("\n");
      const listItems = lines.filter(l => l.match(/^- /));
      if (listItems.length > 0 && listItems.length === lines.length) {
        return "<ul>" + listItems.map(l => `<li>${l.slice(2)}</li>`).join("") + "</ul>";
      }
      if (listItems.length > 0) {
        let result = "";
        let inList = false;
        for (const line of lines) {
          if (line.match(/^- /)) {
            if (!inList) { result += "<ul>"; inList = true; }
            result += `<li>${line.slice(2)}</li>`;
          } else {
            if (inList) { result += "</ul>"; inList = false; }
            result += `<p>${line}</p>`;
          }
        }
        if (inList) result += "</ul>";
        return result;
      }
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    }).join("");
  }

  function typeAssistantMessage(text, onDone) {
    const wrap = h("div", { className: "chat-msg chat-msg--assistant" });
    const bubble = h("div", { className: "chat-bubble chat-bubble--assistant" });
    wrap.append(bubble);
    messagesInner.append(wrap);
    scrollDown();
    isTypingResponse = true;
    let i = 0;
    function tick() {
      if (i >= text.length) { bubble.innerHTML = renderMarkdown(text); scrollDown(); isTypingResponse = false; onDone?.(); return; }
      const chunk = Math.min(2, text.length - i);
      i += chunk;
      bubble.innerHTML = renderMarkdown(text.slice(0, i));
      scrollDown();
      setTimeout(tick, TYPING_SPEED);
    }
    tick();
  }

  // ── Autoplay a session's conversation ──
  function stopAutoplay() {
    if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
    autoplayMsgIndex = 0;
  }

  function autoplaySession(session) {
    stopAutoplay();
    messagesInner.innerHTML = "";
    autoplayMsgIndex = 0;
    function playNext() {
      if (autoplayMsgIndex >= session.messages.length) return;
      const msg = session.messages[autoplayMsgIndex];
      autoplayMsgIndex++;
      if (msg.role === "user") {
        addUserBubble(msg.text);
        autoplayTimer = setTimeout(playNext, PAUSE_AFTER_MSG);
      } else {
        showTypingIndicator();
        autoplayTimer = setTimeout(() => {
          removeTypingIndicator();
          typeAssistantMessage(msg.text, () => {
            autoplayTimer = setTimeout(playNext, PAUSE_AFTER_MSG);
          });
        }, PAUSE_BEFORE_ASSISTANT);
      }
    }
    autoplayTimer = setTimeout(playNext, 400);
  }

  // ── Render sidebar session list ──
  function renderSessions() {
    sessionList.innerHTML = "";
    allSessions.forEach((s) => {
      const item = h("button", { className: `chat-session ${s.id === activeSessionId ? "chat-session--active" : ""}` });
      const title = h("div", { className: "chat-session__title" }, s.title);
      const preview = h("div", { className: "chat-session__preview" }, s.preview);
      const time = h("span", { className: "chat-session__time" }, s.time);
      item.append(title, preview, time);
      item.addEventListener("click", () => switchSession(s.id));
      sessionList.append(item);
    });
  }

  function switchSession(id) {
    if (id === activeSessionId && !isTypingResponse) return;
    stopAutoplay();
    removeTypingIndicator();
    isTypingResponse = false;
    activeSessionId = id;
    renderSessions();
    const session = allSessions.find(s => s.id === id);
    if (session) autoplaySession(session);
  }

  // ── New chat ──
  newBtn.addEventListener("click", () => {
    stopAutoplay();
    removeTypingIndicator();
    isTypingResponse = false;
    sessionCounter++;
    const newId = "s" + sessionCounter;
    allSessions.unshift({
      id: newId,
      title: "New chat",
      preview: "Start a new conversation...",
      time: "now",
      messages: [],
    });
    activeSessionId = newId;
    renderSessions();
    messagesInner.innerHTML = "";
    inputField.focus();
  });

  main.append(messagesArea);

  // ── Composer ──
  const composer = h("div", { className: "chat-composer" });
  const composerInner = h("div", { className: "chat-composer__inner" });

  // Plus button (rotates 45deg to become X when active)
  const plusBtn = h("button", { className: "chat-composer__plus" });
  plusBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

  // Input field (editable)
  const inputField = h("div", {
    className: "chat-composer__input",
    contentEditable: "true",
    role: "textbox",
  });
  inputField.dataset.placeholder = "Type a message...";

  // Recording UI container (hidden by default)
  const recWrap = h("div", { className: "chat-rec" });
  recWrap.style.display = "none";
  // Cancel
  const recCancelBtn = h("button", { className: "chat-rec__btn" });
  recCancelBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  // Red dot + timer group
  const recIndicator = h("div", { className: "chat-rec__indicator" });
  const recDot = h("span", { className: "chat-rec__dot" });
  const recTime = h("span", { className: "chat-rec__time" }, "0:00");
  recIndicator.append(recDot, recTime);
  // Waveform bars container
  const recBars = h("div", { className: "chat-rec__bars" });
  const BAR_COUNT = 48;
  const barEls = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = h("span", { className: "chat-rec__bar" });
    recBars.append(bar);
    barEls.push(bar);
  }
  // Pause/resume
  const recPauseBtn = h("button", { className: "chat-rec__btn" });
  const pauseIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="4" x2="8" y2="20"/><line x1="16" y1="4" x2="16" y2="20"/></svg>`;
  const playIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  recPauseBtn.innerHTML = pauseIcon;
  // Send recording
  const recSendBtn = h("button", { className: "chat-rec__btn chat-rec__btn--send" });
  recSendBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.51 4.23L18.07 8.51C21.91 10.43 21.91 13.57 18.07 15.49L9.51 19.77C3.89 22.58 1.42 20.11 4.23 14.49L5.12 12.68C5.32 12.28 5.32 11.72 5.12 11.32L4.23 9.51C1.42 3.89 3.89 1.42 9.51 4.23Z"/><path d="M5.44 12H10.84"/></svg>`;
  recWrap.append(recCancelBtn, recIndicator, recBars, recPauseBtn, recSendBtn);

  // Action button: overlays send + mic icons with crossfade
  const actionBtn = h("button", { className: "chat-composer__action" });
  // Send icon (from demo app)
  const sendIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  sendIcon.setAttribute("width", "18"); sendIcon.setAttribute("height", "18");
  sendIcon.setAttribute("viewBox", "0 0 24 24"); sendIcon.setAttribute("fill", "none");
  sendIcon.setAttribute("stroke", "currentColor"); sendIcon.setAttribute("stroke-width", "1.5");
  sendIcon.setAttribute("stroke-linecap", "round"); sendIcon.setAttribute("stroke-linejoin", "round");
  sendIcon.classList.add("chat-composer__icon", "chat-composer__icon--send");
  sendIcon.innerHTML = `<path d="M9.51 4.23L18.07 8.51C21.91 10.43 21.91 13.57 18.07 15.49L9.51 19.77C3.89 22.58 1.42 20.11 4.23 14.49L5.12 12.68C5.32 12.28 5.32 11.72 5.12 11.32L4.23 9.51C1.42 3.89 3.89 1.42 9.51 4.23Z"/><path d="M5.44 12H10.84"/>`;
  // Mic icon (from demo app)
  const micIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  micIcon.setAttribute("width", "18"); micIcon.setAttribute("height", "18");
  micIcon.setAttribute("viewBox", "0 0 24 24"); micIcon.setAttribute("fill", "none");
  micIcon.setAttribute("stroke", "currentColor"); micIcon.setAttribute("stroke-width", "1.5");
  micIcon.setAttribute("stroke-linecap", "round"); micIcon.setAttribute("stroke-linejoin", "round");
  micIcon.classList.add("chat-composer__icon", "chat-composer__icon--mic");
  micIcon.innerHTML = `<path d="M12 15.5C14.21 15.5 16 13.71 16 11.5V6C16 3.79 14.21 2 12 2C9.79 2 8 3.79 8 6V11.5C8 13.71 9.79 15.5 12 15.5Z"/><path d="M4.35 9.65V11.35C4.35 15.57 7.78 19 12 19C16.22 19 19.65 15.57 19.65 11.35V9.65"/><path d="M12 19V22"/>`;
  actionBtn.append(sendIcon, micIcon);

  // ── Waveform animation ──
  let waveStartTime = 0;
  let recPaused = false;
  let recPausedElapsed = 0;
  const barSeeds = [];
  for (let b = 0; b < BAR_COUNT; b++) barSeeds.push(0.2 + Math.random() * 0.3);

  function animateRecording() {
    if (!isRecording) return;
    const t = recPaused ? recPausedElapsed / 1000 : (Date.now() - waveStartTime) / 1000;
    // Update bars
    for (let i = 0; i < BAR_COUNT; i++) {
      const base = barSeeds[i];
      const level = recPaused ? 0.15 : base + 0.35 * Math.sin(t * 3.5 + i * 0.6) + 0.15 * Math.sin(t * 5.2 + i * 1.1);
      barEls[i].style.height = Math.max(3, level * 20) + "px";
    }
    // Timer
    const elapsed = recPaused ? recPausedElapsed / 1000 : t;
    const secs = Math.floor(elapsed) % 60;
    const mins = Math.floor(elapsed / 60);
    recTime.textContent = mins + ":" + (secs < 10 ? "0" : "") + secs;
    waveAnimFrame = requestAnimationFrame(animateRecording);
  }

  function startRecording() {
    isRecording = true;
    recPaused = false;
    recPausedElapsed = 0;
    waveStartTime = Date.now();
    plusBtn.style.display = "none";
    inputField.style.display = "none";
    recWrap.style.display = "flex";
    actionBtn.style.display = "none";
    recDot.classList.add("chat-rec__dot--active");
    recPauseBtn.innerHTML = pauseIcon;
    animateRecording();
  }

  function stopRecording(send) {
    isRecording = false;
    recPaused = false;
    if (waveAnimFrame) { cancelAnimationFrame(waveAnimFrame); waveAnimFrame = null; }
    recWrap.style.display = "none";
    plusBtn.style.display = "";
    inputField.style.display = "";
    actionBtn.style.display = "";
    updateActionIcon();
    if (send) {
      const elapsed = recPausedElapsed > 0 ? recPausedElapsed / 1000 : (Date.now() - waveStartTime) / 1000;
      const secs = Math.floor(elapsed) % 60;
      const mins = Math.floor(elapsed / 60);
      const durationStr = mins + ":" + (secs < 10 ? "0" : "") + secs;
      sendVoiceMessage(durationStr);
    }
  }

  recPauseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (recPaused) {
      // Resume
      recPaused = false;
      waveStartTime = Date.now() - recPausedElapsed;
      recDot.classList.add("chat-rec__dot--active");
      recPauseBtn.innerHTML = pauseIcon;
    } else {
      // Pause
      recPausedElapsed = Date.now() - waveStartTime;
      recPaused = true;
      recDot.classList.remove("chat-rec__dot--active");
      recPauseBtn.innerHTML = playIcon;
    }
  });

  recCancelBtn.addEventListener("click", (e) => { e.stopPropagation(); stopRecording(false); });
  recSendBtn.addEventListener("click", (e) => { e.stopPropagation(); stopRecording(true); });

  actionBtn.addEventListener("click", () => {
    const hasText = getInputText().length > 0;
    if (hasText) {
      sendMessage(getInputText());
    } else {
      startRecording();
    }
  });

  // ── Send logic ──
  function getInputText() { return inputField.textContent.trim(); }

  function updateActionIcon() {
    const hasText = getInputText().length > 0;
    sendIcon.classList.toggle("chat-composer__icon--visible", hasText);
    micIcon.classList.toggle("chat-composer__icon--visible", !hasText);
  }
  // Initialize icon state
  sendIcon.classList.remove("chat-composer__icon--visible");
  micIcon.classList.add("chat-composer__icon--visible");

  inputField.addEventListener("input", updateActionIcon);
  inputField.addEventListener("focus", () => composerInner.classList.add("chat-composer__inner--focus"));
  inputField.addEventListener("blur", () => composerInner.classList.remove("chat-composer__inner--focus"));

  function sendMessage(text) {
    if (isTypingResponse || !text) return;
    stopAutoplay();
    addUserBubble(text);
    inputField.textContent = "";
    updateActionIcon();

    // Update session data
    const session = allSessions.find(s => s.id === activeSessionId);
    if (session) {
      session.messages.push({ role: "user", text });
      session.preview = text.slice(0, 36) + (text.length > 36 ? "..." : "");
      if (session.title === "New chat") session.title = text.slice(0, 24) + (text.length > 24 ? "..." : "");
      session.time = "now";
      renderSessions();
    }

    // Respond with a random agent reply
    showTypingIndicator();
    const reply = agentResponses[Math.floor(Math.random() * agentResponses.length)];
    setTimeout(() => {
      removeTypingIndicator();
      typeAssistantMessage(reply, () => {
        if (session) session.messages.push({ role: "assistant", text: reply });
      });
    }, PAUSE_BEFORE_ASSISTANT);
  }

  function sendVoiceMessage(durationStr) {
    if (isTypingResponse) return;
    stopAutoplay();
    addVoiceBubble(durationStr);

    const session = allSessions.find(s => s.id === activeSessionId);
    if (session) {
      session.messages.push({ role: "user", text: "Voice message (" + durationStr + ")" });
      session.preview = "Voice message " + durationStr;
      if (session.title === "New chat") session.title = "Voice message";
      session.time = "now";
      renderSessions();
    }

    showTypingIndicator();
    const reply = agentResponses[Math.floor(Math.random() * agentResponses.length)];
    setTimeout(() => {
      removeTypingIndicator();
      typeAssistantMessage(reply, () => {
        if (session) session.messages.push({ role: "assistant", text: reply });
      });
    }, PAUSE_BEFORE_ASSISTANT);
  }

  inputField.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(getInputText());
    }
  });

  composerInner.append(plusBtn, inputField, recWrap, actionBtn);
  composer.append(composerInner);
  main.append(composer);

  app.append(main);
  container.append(app);

  // Initial render
  renderSessions();
  autoplaySession(allSessions[0]);
}
