import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── Presentations / Slide Deck ─────────────────────────────────────────────

export function mountDeck(container) {
  const robo = (seed) => `https://robohash.org/${encodeURIComponent(seed)}?set=set1&size=80x80&bgset=bg2`;

  const AGENTS = {
    design:  { name: "Design Agent",  color: "#a78bfa", avatar: robo("design-agent-claw-deck-4") },
    content: { name: "Content Agent", color: "#34d399", avatar: robo("content-agent-claw-deck-7") },
    data:    { name: "Data Agent",    color: "#60a5fa", avatar: robo("data-agent-claw-deck-2") },
  };

  // ── Slide content icons (inline SVG strings) ──
  const BI = {
    layers:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>`,
    signal:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h3"/><path d="M7 8v8"/><path d="M11 5v14"/><path d="M15 9v6"/><path d="M19 11v2"/></svg>`,
    bolt:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z"/></svg>`,
    spark:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="m5.6 5.6 2.8 2.8"/><path d="m15.6 15.6 2.8 2.8"/><path d="m5.6 18.4 2.8-2.8"/><path d="m15.6 8.4 2.8-2.8"/></svg>`,
    device:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="14" height="12" rx="2"/><rect x="17" y="8" width="5" height="12" rx="1"/><path d="M8 20h4"/></svg>`,
    flow:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M6 9v3h12V9"/><path d="M12 12v3"/></svg>`,
    shield:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>`,
    store:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    globe:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20"/></svg>`,
    users:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    sdk:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><rect x="8" y="8" width="8" height="8" rx="1"/></svg>`,
    adapter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 8V5"/><path d="M17 8V5"/><path d="M7 19v-3"/><path d="M17 19v-3"/></svg>`,
    runtime: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M3 12h18"/><path d="M5.6 5.6 18.4 18.4"/><path d="M18.4 5.6 5.6 18.4"/></svg>`,
  };

  const SLIDES = [
    {
      id: "title",
      heading: "Q2 Product Update",
      subheading: "ClawJS Team . April 2026",
      layout: "title",
      tag: "Internal review",
    },
    {
      id: "growth",
      heading: "Growth Metrics",
      subheading: "A record quarter across every surface.",
      layout: "chart",
      bars: [20, 35, 28, 45, 52, 68, 82, 95],
      metrics: [
        { value: "50K", label: "Active users" },
        { value: "200+", label: "Companies" },
        { value: "3×", label: "MRR" },
      ],
    },
    {
      id: "features",
      heading: "Key Features Shipped",
      layout: "bullets",
      bullets: [
        { text: "Multi-runtime adapter layer", icon: BI.layers },
        { text: "Real-time channel sync", icon: BI.signal },
        { text: "AI model hot-swap", icon: BI.bolt },
        { text: "Zero-config onboarding", icon: BI.spark },
        { text: "Native iOS & macOS clients", icon: BI.device },
      ],
    },
    {
      id: "architecture",
      heading: "Architecture Overview",
      subheading: "Declarative config, portable across 9 runtimes.",
      layout: "diagram",
      nodes: [
        { icon: BI.sdk,     label: "Claw SDK" },
        { icon: BI.adapter, label: "Adapter Layer" },
        { icon: BI.runtime, label: "9 Runtimes" },
      ],
    },
    {
      id: "roadmap",
      heading: "Q3 Roadmap",
      layout: "bullets",
      bullets: [
        { text: "Workflow builder v2", icon: BI.flow },
        { text: "Enterprise SSO", icon: BI.shield },
        { text: "Plugin marketplace", icon: BI.store },
        { text: "Edge deployment (NanoClaw)", icon: BI.globe },
        { text: "Collaborative editing", icon: BI.users },
      ],
    },
    {
      id: "thanks",
      heading: "Thank You",
      subheading: "Questions? hello@clawjs.ai",
      layout: "title",
      tag: "End of deck",
    },
  ];

  let activeSlideIdx = 0;

  // ── Icons ──
  const ICON_TEXT = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V4h16v3"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg>`;
  const ICON_IMG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;
  const ICON_RECT = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
  const ICON_CHART = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
  const ICON_LAYOUT = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`;
  const ICON_PLUS = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  const ICON_UNDO = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 0118 0 9 9 0 01-9 9 9 9 0 01-7.7-4.4"/></svg>`;
  const ICON_REDO = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 00-18 0 9 9 0 009 9 9 9 0 007.7-4.4"/></svg>`;
  const ICON_PLAY = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>`;

  // ── Build shell ──
  const shell = h("div", { className: "dk-shell" });

  // ── Top bar ──
  const topbar = h("div", { className: "dk-topbar" });
  const topLeft = h("div", { className: "dk-topbar__left" });
  topLeft.innerHTML = `<img src="/logo.png" alt="" class="dk-topbar__logo"><span class="dk-topbar__brand">ClawJS</span><span class="dk-topbar__sep">/</span><span class="dk-topbar__page">Slides</span>`;
  const topRight = h("div", { className: "dk-topbar__right" });
  const deckTitle = h("span", { className: "dk-topbar__title" }, "Q2 Product Update");
  const liveChip = h("span", { className: "dk-topbar__live" });
  liveChip.innerHTML = `<span class="dk-topbar__live-dot"></span>3 agents`;
  topRight.append(deckTitle, liveChip);
  topbar.append(topLeft, topRight);
  shell.append(topbar);

  // ── Body ──
  const body = h("div", { className: "dk-body" });

  // ── Sidebar: slide thumbnails ──
  const sidebar = h("div", { className: "dk-sidebar" });
  sidebar.append(h("div", { className: "dk-sidebar__header" }, "Slides"));
  const thumbEls = [];

  SLIDES.forEach((slide, idx) => {
    const thumb = h("div", { className: `dk-thumb ${idx === 0 ? "dk-thumb--active" : ""}` });
    const numEl = h("span", { className: "dk-thumb__num" }, `Slide ${idx + 1}`);
    const inner = h("div", { className: "dk-thumb__inner" });
    const preview = h("div", { className: "dk-thumb__preview" });

    const prevTitle = h("span", { className: "dk-thumb__preview-title" }, slide.heading);
    preview.append(prevTitle);

    if (slide.layout === "chart") {
      const bar = h("span", { className: "dk-thumb__preview-body" });
      bar.style.height = "6px"; bar.style.background = "var(--pink-400)"; bar.style.opacity = "0.5";
      preview.append(bar);
    } else if (slide.layout === "image") {
      preview.append(h("span", { className: "dk-thumb__preview-img" }));
    } else if (slide.layout === "bullets") {
      for (let i = 0; i < 3; i++) preview.append(h("span", { className: "dk-thumb__preview-body" }));
    } else {
      preview.append(h("span", { className: "dk-thumb__preview-body" }));
    }

    inner.append(preview);
    thumb.append(numEl, inner);
    thumb.addEventListener("click", () => selectSlide(idx));
    sidebar.append(thumb);
    thumbEls.push(thumb);
  });

  body.append(sidebar);

  // ── Canvas area ──
  const canvas = h("div", { className: "dk-canvas" });

  // Toolbar
  const toolbar = h("div", { className: "dk-toolbar" });
  [ICON_UNDO, ICON_REDO].forEach(icon => {
    toolbar.append(h("button", { className: "dk-toolbar__btn", innerHTML: icon }));
  });
  toolbar.append(h("span", { className: "dk-toolbar__sep" }));
  [ICON_TEXT, ICON_IMG, ICON_RECT, ICON_CHART, ICON_LAYOUT].forEach(icon => {
    toolbar.append(h("button", { className: "dk-toolbar__btn", innerHTML: icon }));
  });
  toolbar.append(h("span", { className: "dk-toolbar__sep" }));
  toolbar.append(h("button", { className: "dk-toolbar__btn", innerHTML: ICON_PLUS }));
  toolbar.append(h("span", { className: "dk-toolbar__sep" }));
  const playBtn = h("button", { className: "dk-toolbar__btn", innerHTML: ICON_PLAY });
  toolbar.append(playBtn);
  canvas.append(toolbar);

  // Slide editor
  const editorArea = h("div", { className: "dk-editor" });
  const slideEl = h("div", { className: "dk-slide" });
  const slideContent = h("div", { className: "dk-slide__content" });
  slideEl.append(slideContent);
  editorArea.append(slideEl);
  canvas.append(editorArea);

  // Status bar
  const statusbar = h("div", { className: "dk-statusbar" });
  const statusLeft = h("div", { className: "dk-statusbar__left" });
  const activityAvatar = h("span", { className: "dk-statusbar__avatar" });
  activityAvatar.innerHTML = `<img src="${AGENTS.content.avatar}" alt="">`;
  const activityText = h("span", { className: "dk-statusbar__activity" }, "Agents ready");
  const activityPulse = h("span", { className: "dk-statusbar__pulse" });
  statusLeft.append(activityPulse, activityAvatar, activityText);
  const statusRight = h("div", { className: "dk-statusbar__right" });
  statusRight.textContent = `Slide 1 / ${SLIDES.length}`;
  statusbar.append(statusLeft, statusRight);
  canvas.append(statusbar);

  body.append(canvas);
  shell.append(body);

  function setActivity(agentKey, text) {
    const agent = AGENTS[agentKey];
    activityAvatar.innerHTML = `<img src="${agent.avatar}" alt="">`;
    activityAvatar.style.borderColor = agent.color;
    activityPulse.style.background = agent.color;
    activityText.innerHTML = `<strong style="color:${agent.color}">${agent.name}</strong> · ${text}`;
  }

  container.append(shell);

  // ── Render current slide ──
  // animated=false → fully populated. animated=true → empty skeleton to be filled by typing.
  function renderSlide(idx, animated = false) {
    const slide = SLIDES[idx];
    slideContent.innerHTML = "";
    slideContent.classList.toggle("dk-slide__content--centered", slide.layout === "title");

    // Decorative accent line on every slide
    slideContent.append(h("span", { className: "dk-slide__accent" }));

    if (slide.layout === "title" && slide.tag) {
      slideContent.append(h("span", { className: "dk-slide__tag" }, slide.tag));
    }

    const headingEl = h("div", { className: "dk-slide__heading" });
    if (!animated) headingEl.textContent = slide.heading;
    slideContent.append(headingEl);

    if (slide.subheading) {
      const subEl = h("div", { className: "dk-slide__subheading" });
      if (!animated) subEl.textContent = slide.subheading;
      slideContent.append(subEl);
    }

    if (slide.layout === "chart" && slide.bars) {
      const chart = h("div", { className: "dk-slide__chart" });
      slide.bars.forEach((val) => {
        const bar = h("div", { className: "dk-slide__bar" });
        bar.style.height = "0%";
        chart.append(bar);
        if (!animated) {
          requestAnimationFrame(() => { bar.style.height = val + "%"; });
        }
      });
      slideContent.append(chart);
      if (slide.metrics) {
        const metrics = h("div", { className: "dk-slide__metrics" });
        slide.metrics.forEach((m) => {
          const card = h("div", { className: "dk-slide__metric" });
          card.append(
            h("span", { className: "dk-slide__metric-value" }, m.value),
            h("span", { className: "dk-slide__metric-label" }, m.label),
          );
          metrics.append(card);
        });
        slideContent.append(metrics);
      }
    }

    if (slide.layout === "bullets" && slide.bullets) {
      const list = h("div", { className: "dk-slide__bullets" });
      slide.bullets.forEach((b) => {
        const isObj = typeof b === "object";
        const bullet = h("div", { className: `dk-slide__bullet${animated ? " dk-slide__bullet--hidden" : ""}` });
        const iconWrap = h("span", { className: "dk-slide__bullet-icon" });
        if (isObj && b.icon) iconWrap.innerHTML = b.icon;
        else iconWrap.append(h("span", { className: "dk-slide__bullet-dot" }));
        const textSpan = h("span", { className: "dk-slide__bullet-text" });
        if (!animated) textSpan.textContent = isObj ? b.text : b;
        bullet.append(iconWrap, textSpan);
        list.append(bullet);
      });
      slideContent.append(list);
    }

    if (slide.layout === "diagram" && slide.nodes) {
      const diagram = h("div", { className: "dk-slide__diagram", id: "dk-img-" + slide.id });
      slide.nodes.forEach((node, i) => {
        if (i > 0) diagram.append(h("span", { className: "dk-slide__diagram-arrow", innerHTML: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>` }));
        const card = h("div", { className: "dk-slide__diagram-node" });
        const ic = h("span", { className: "dk-slide__diagram-icon", innerHTML: node.icon });
        const lbl = h("span", { className: "dk-slide__diagram-label" }, node.label);
        card.append(ic, lbl);
        diagram.append(card);
      });
      slideContent.append(diagram);
    }

    const numEl = h("span", { className: "dk-slide__number" }, `${idx + 1} / ${SLIDES.length}`);
    slideContent.append(numEl);

    statusRight.textContent = `Slide ${idx + 1} / ${SLIDES.length}`;
  }

  function selectSlide(idx, animated = false) {
    thumbEls[activeSlideIdx].classList.remove("dk-thumb--active");
    activeSlideIdx = idx;
    thumbEls[activeSlideIdx].classList.add("dk-thumb--active");
    renderSlide(idx, animated);
    sidebar.scrollTop = thumbEls[idx].offsetTop - 40;
  }

  // ── Typing animation (Promise-based) ──
  function typeText(el, text, speed) {
    return new Promise((resolve) => {
      if (!el) { resolve(); return; }
      el.textContent = "";
      const cursor = h("span", { className: "dk-typing-cursor" });
      el.append(cursor);
      let i = 0;
      const iv = setInterval(() => {
        if (i < text.length) {
          cursor.before(document.createTextNode(text[i]));
          i++;
        } else {
          clearInterval(iv);
          cursor.remove();
          resolve();
        }
      }, speed);
      intervals.push(iv);
    });
  }

  // ── Automated actions loop ──
  let timers = [];
  let intervals = [];
  let runSeq = 0;
  function clearTimers() {
    timers.forEach(clearTimeout); timers = [];
    intervals.forEach(clearInterval); intervals = [];
  }
  const delay = (ms) => new Promise((r) => { timers.push(setTimeout(r, ms)); });

  async function revealBullets(bulletData, perCharSpeed = 22, gap = 140) {
    const bullets = slideContent.querySelectorAll(".dk-slide__bullet");
    for (let i = 0; i < bullets.length; i++) {
      bullets[i].classList.remove("dk-slide__bullet--hidden");
      const span = bullets[i].querySelector(".dk-slide__bullet-text");
      const text = typeof bulletData[i] === "object" ? bulletData[i].text : bulletData[i];
      await typeText(span, text, perCharSpeed);
      await delay(gap);
    }
  }

  async function runActions() {
    const seq = ++runSeq;
    const alive = () => seq === runSeq;

    clearTimers();

    // ── Slide 0: Title ──
    selectSlide(0, true);
    await delay(500); if (!alive()) return;
    setActivity("content", "Drafting title slide...");
    await delay(250); if (!alive()) return;
    await typeText(slideContent.querySelector(".dk-slide__heading"), SLIDES[0].heading, 55);
    if (!alive()) return;
    await delay(220);
    await typeText(slideContent.querySelector(".dk-slide__subheading"), SLIDES[0].subheading, 32);
    if (!alive()) return;
    await delay(1400);

    // ── Slide 1: Growth chart ──
    selectSlide(1, true);
    setActivity("data", "Generating growth chart...");
    await delay(350); if (!alive()) return;
    await typeText(slideContent.querySelector(".dk-slide__heading"), SLIDES[1].heading, 45);
    if (!alive()) return;
    await typeText(slideContent.querySelector(".dk-slide__subheading"), SLIDES[1].subheading, 28);
    if (!alive()) return;
    await delay(200);
    const bars = slideContent.querySelectorAll(".dk-slide__bar");
    for (let i = 0; i < bars.length; i++) {
      bars[i].style.height = SLIDES[1].bars[i] + "%";
      await delay(110);
      if (!alive()) return;
    }
    await delay(300);
    const metricCards = slideContent.querySelectorAll(".dk-slide__metric");
    for (let i = 0; i < metricCards.length; i++) {
      metricCards[i].classList.add("dk-slide__metric--visible");
      await delay(180);
      if (!alive()) return;
    }
    await delay(900);

    // ── Slide 2: Feature bullets ──
    selectSlide(2, true);
    setActivity("content", "Adding feature highlights...");
    await delay(350); if (!alive()) return;
    await typeText(slideContent.querySelector(".dk-slide__heading"), SLIDES[2].heading, 45);
    if (!alive()) return;
    await delay(120);
    await revealBullets(SLIDES[2].bullets, 22, 140);
    if (!alive()) return;
    // Highlight a bullet to show selection
    const featBullets = slideContent.querySelectorAll(".dk-slide__bullet");
    if (featBullets[2]) {
      featBullets[2].classList.add("dk-selected");
      await delay(1200);
      if (!alive()) return;
      featBullets[2].classList.remove("dk-selected");
    }
    await delay(600);

    // ── Slide 3: Architecture diagram ──
    selectSlide(3, true);
    setActivity("design", "Inserting architecture diagram...");
    await delay(350); if (!alive()) return;
    await typeText(slideContent.querySelector(".dk-slide__heading"), SLIDES[3].heading, 45);
    if (!alive()) return;
    await typeText(slideContent.querySelector(".dk-slide__subheading"), SLIDES[3].subheading, 26);
    if (!alive()) return;
    await delay(300);
    const diagramNodes = slideContent.querySelectorAll(".dk-slide__diagram-node");
    const diagramArrows = slideContent.querySelectorAll(".dk-slide__diagram-arrow");
    for (let i = 0; i < diagramNodes.length; i++) {
      diagramNodes[i].classList.add("dk-slide__diagram-node--visible");
      if (i < diagramArrows.length) {
        await delay(180);
        diagramArrows[i].classList.add("dk-slide__diagram-arrow--visible");
      }
      await delay(220);
      if (!alive()) return;
    }
    await delay(1300);

    // ── Slide 4: Roadmap bullets ──
    selectSlide(4, true);
    setActivity("content", "Outlining Q3 roadmap...");
    await delay(350); if (!alive()) return;
    await typeText(slideContent.querySelector(".dk-slide__heading"), SLIDES[4].heading, 45);
    if (!alive()) return;
    await delay(120);
    await revealBullets(SLIDES[4].bullets, 22, 140);
    if (!alive()) return;
    await delay(600);
    // Append a new bullet live
    const list = slideContent.querySelector(".dk-slide__bullets");
    if (list) {
      const newBullet = h("div", { className: "dk-slide__bullet dk-slide__bullet--hidden" });
      const iconWrap = h("span", { className: "dk-slide__bullet-icon", innerHTML: BI.spark });
      const textSpan = h("span", { className: "dk-slide__bullet-text" });
      newBullet.append(iconWrap, textSpan);
      list.append(newBullet);
      await delay(60);
      newBullet.classList.remove("dk-slide__bullet--hidden");
      await typeText(textSpan, "Team analytics dashboard", 22);
    }
    if (!alive()) return;
    await delay(1000);

    // ── Slide 5: Thank you ──
    selectSlide(5, true);
    setActivity("design", "Polishing final slide...");
    await delay(350); if (!alive()) return;
    await typeText(slideContent.querySelector(".dk-slide__heading"), SLIDES[5].heading, 55);
    if (!alive()) return;
    await typeText(slideContent.querySelector(".dk-slide__subheading"), SLIDES[5].subheading, 32);
    if (!alive()) return;
    await delay(700);
    playBtn.classList.add("dk-toolbar__btn--active");
    setActivity("design", "Deck ready to present!");
    await delay(2000);
    if (!alive()) return;
    playBtn.classList.remove("dk-toolbar__btn--active");
    await delay(1200);

    if (alive()) runActions();
  }

  renderSlide(0);
  setTimeout(() => runActions(), 900);
}

