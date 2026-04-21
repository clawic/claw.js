import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── CALENDAR / SCHEDULING DEMO ──────────────────────────────────────────────

export function mountCalendar(container) {
  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const DATES = [7,8,9,10,11,12,13];
  const HOURS_START = 8;
  const HOURS_END = 18;
  const SLOT_H = 38;

  const EVENTS = [
    { day: 0, start: 9,  dur: 1,   title: "Team Standup",        color: "blue",   time: "9:00 - 10:00" },
    { day: 0, start: 14, dur: 1,   title: "Design Review",       color: "purple", time: "14:00 - 15:00", id: "design-review" },
    { day: 1, start: 10, dur: 1.5, title: "Client Call - Acme",  color: "green",  time: "10:00 - 11:30" },
    { day: 2, start: 9,  dur: 1,   title: "Team Standup",        color: "blue",   time: "9:00 - 10:00" },
    { day: 2, start: 13, dur: 1,   title: "1:1 with Sarah",      color: "orange", time: "13:00 - 14:00", id: "sarah-1on1" },
    { day: 3, start: 11, dur: 1,   title: "Product Demo",        color: "pink",   time: "11:00 - 12:00" },
    { day: 4, start: 9,  dur: 1,   title: "Team Standup",        color: "blue",   time: "9:00 - 10:00" },
    { day: 4, start: 15, dur: 1.5, title: "Sprint Retrospective",color: "teal",   time: "15:00 - 16:30" },
  ];

  const AI_EVENT = { day: 3, start: 10, dur: 1, title: "Prep for Demo", color: "purple", time: "10:00 - 11:00", ai: true };

  const shell = h("div", { className: "cal-shell", style: { position: "relative" } });

  // ── Top bar ──
  const topbar = h("div", { className: "cal-topbar" });
  const logo = h("img", { className: "cal-topbar__logo", src: "/logo.png", alt: "" });
  topbar.append(
    logo,
    h("span", { className: "cal-topbar__brand" }, "ClawJS"),
    h("span", { className: "cal-topbar__sep" }, "/"),
    h("span", { className: "cal-topbar__page" }, "Calendar"),
    h("span", { className: "cal-topbar__week" }, "Apr 7 \u2013 13, 2026"),
    h("div", { className: "cal-topbar__agent" },
      h("span", { className: "cal-topbar__agent-dot" }),
      "Scheduler Agent active"
    )
  );
  shell.append(topbar);

  // ── Body ──
  const body = h("div", { className: "cal-body" });

  // Calendar area
  const calArea = h("div", { className: "cal-area" });

  // Day headers
  const dayHeaders = h("div", { className: "cal-day-headers" });
  dayHeaders.append(h("div", { className: "cal-corner" }));
  DAYS.forEach((d, i) => {
    const hdr = h("div", { className: `cal-day-hdr${i === 2 ? " cal-day-hdr--today" : ""}` });
    hdr.append(document.createTextNode(d), h("span", { className: "cal-date-num" }, String(DATES[i])));
    dayHeaders.append(hdr);
  });
  calArea.append(dayHeaders);

  // Time grid
  const timeGrid = h("div", { className: "cal-time-grid" });
  const labels = h("div", { className: "cal-time-labels" });
  for (let hr = HOURS_START; hr < HOURS_END; hr++) {
    const lbl = (hr <= 12 ? hr : hr - 12) + (hr < 12 ? "AM" : "PM");
    labels.append(h("div", { className: "cal-time-label" }, lbl));
  }
  timeGrid.append(labels);

  const dayCols = [];
  for (let d = 0; d < 7; d++) {
    const col = h("div", { className: "cal-day-col" });
    for (let hr = HOURS_START; hr < HOURS_END; hr++) {
      col.append(h("div", { className: "cal-hour-line" }));
    }
    dayCols.push(col);
    timeGrid.append(col);
  }

  // Place events
  const eventEls = {};
  EVENTS.forEach((ev) => {
    const top = (ev.start - HOURS_START) * SLOT_H;
    const height = ev.dur * SLOT_H - 2;
    const block = h("div", {
      className: `cal-event cal-ev--${ev.color}`,
      style: { top: top + "px", height: height + "px" },
    }, ev.title, h("span", { className: "cal-ev-time" }, ev.time));
    if (ev.id) eventEls[ev.id] = block;
    dayCols[ev.day].append(block);
  });

  // AI event (initially hidden)
  const aiTop = (AI_EVENT.start - HOURS_START) * SLOT_H;
  const aiHeight = AI_EVENT.dur * SLOT_H - 2;
  const aiBlock = h("div", {
    className: "cal-event cal-ev--purple cal-ev--ai-new",
    style: { top: aiTop + "px", height: aiHeight + "px" },
  },
    h("span", { className: "cal-ev-robot" }, "\uD83E\uDD16"),
    AI_EVENT.title,
    h("span", { className: "cal-ev-time" }, AI_EVENT.time)
  );
  dayCols[AI_EVENT.day].append(aiBlock);

  const gridScroll = h("div", { className: "cal-grid-scroll" }, timeGrid);
  calArea.append(gridScroll);
  body.append(calArea);

  // ── Sidebar ──
  const sidebar = h("div", { className: "cal-sidebar" });
  sidebar.append(h("div", { className: "cal-sidebar__title" },
    h("span", { className: "cal-sidebar__sparkle" }, "\u2728"),
    "AI Suggestions"
  ));

  const suggestions = [
    { icon: "\u2728", label: "optimal", warn: false, text: "Optimal meeting time found: Thu 14:00-15:00" },
    { icon: "\u26A0\uFE0F", label: "conflict", warn: true, text: "Conflict detected: Wed 13:00 overlaps with blocked focus time" },
    { icon: "\uD83D\uDCA1", label: "optimal", warn: false, text: "Suggest rescheduling Design Review to Tue 14:00" },
  ];

  const suggestionCards = [];
  suggestions.forEach((s) => {
    const card = h("div", { className: "cal-suggestion" },
      h("div", { className: `cal-suggestion__label${s.warn ? " cal-suggestion__label--warn" : ""}` }, s.icon + " " + s.label),
      s.text
    );
    suggestionCards.push(card);
    sidebar.append(card);
  });

  // Mini agenda
  const agendaItems = [
    { color: "#3b82f6", time: "9:00",  title: "Team Standup" },
    { color: "#22c55e", time: "10:00", title: "Client Call" },
    { color: "#f97316", time: "13:00", title: "1:1 with Sarah" },
  ];
  const agenda = h("div", { className: "cal-mini-agenda" },
    h("div", { className: "cal-mini-agenda__title" }, "Today's Agenda")
  );
  agendaItems.forEach((a) => {
    agenda.append(h("div", { className: "cal-mini-agenda__item" },
      h("div", { className: "cal-mini-agenda__dot", style: { background: a.color } }),
      h("span", { className: "cal-mini-agenda__time" }, a.time),
      a.title
    ));
  });
  sidebar.append(agenda);
  body.append(sidebar);
  shell.append(body);

  // Toast
  const toastContainer = h("div", { className: "cal-toast-container" });
  const toast = h("div", { className: "cal-toast" },
    h("div", { className: "cal-toast__dot" }),
    "Scheduler Agent found 3 optimal slots for your meeting with Alex"
  );
  toastContainer.append(toast);
  shell.append(toastContainer);
  container.append(shell);

  // Scroll to show 9AM area
  gridScroll.scrollTop = 20;

  // ── Autoplay ──
  let timers = [];
  function runAnim() {
    timers.forEach(clearTimeout);
    timers = [];

    aiBlock.classList.remove("cal-ev--appear");
    aiBlock.classList.add("cal-ev--ai-new");
    suggestionCards.forEach((c) => c.classList.remove("cal-suggestion--highlight"));
    toast.classList.remove("cal-toast--show", "cal-toast--hide");
    toast.style.opacity = "0";
    if (eventEls["sarah-1on1"]) eventEls["sarah-1on1"].classList.remove("cal-conflict-pulse");

    timers.push(setTimeout(() => { suggestionCards[0].classList.add("cal-suggestion--highlight"); }, 800));
    timers.push(setTimeout(() => { suggestionCards[0].classList.remove("cal-suggestion--highlight"); suggestionCards[1].classList.add("cal-suggestion--highlight"); }, 2400));
    timers.push(setTimeout(() => { suggestionCards[1].classList.remove("cal-suggestion--highlight"); suggestionCards[2].classList.add("cal-suggestion--highlight"); }, 4000));
    timers.push(setTimeout(() => { suggestionCards[2].classList.remove("cal-suggestion--highlight"); }, 5500));

    timers.push(setTimeout(() => { aiBlock.classList.add("cal-ev--appear"); }, 1500));

    timers.push(setTimeout(() => { if (eventEls["sarah-1on1"]) eventEls["sarah-1on1"].classList.add("cal-conflict-pulse"); }, 2600));
    timers.push(setTimeout(() => { if (eventEls["sarah-1on1"]) eventEls["sarah-1on1"].classList.remove("cal-conflict-pulse"); }, 4200));

    timers.push(setTimeout(() => { toast.classList.add("cal-toast--show"); }, 3500));
    timers.push(setTimeout(() => { toast.classList.remove("cal-toast--show"); toast.classList.add("cal-toast--hide"); }, 6500));

    timers.push(setTimeout(() => runAnim(), 9000));
  }

  runAnim();
}

