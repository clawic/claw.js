import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── Spreadsheet demo ────────────────────────────────────────────────────────

export function mountSheet(container) {
  const robo = (seed) => `https://robohash.org/${encodeURIComponent(seed)}?set=set1&size=80x80&bgset=bg2`;

  const AGENTS = {
    data:    { name: "Data Agent",    color: "#60a5fa", avatar: robo("data-agent-claw-sheet-1") },
    formula: { name: "Formula Agent", color: "#34d399", avatar: robo("formula-agent-claw-sheet-2") },
    design:  { name: "Design Agent",  color: "#a78bfa", avatar: robo("design-agent-claw-sheet-3") },
    chart:   { name: "Chart Agent",   color: "#f59e0b", avatar: robo("chart-agent-claw-sheet-4") },
  };

  const COLS = ["A", "B", "C", "D", "E", "F"];
  const NUM_ROWS = 9;

  const HEADERS = ["Product", "Region", "Units", "Price", "Revenue", "Trend"];
  const PRODUCTS = [
    { name: "iPhone 17 Pro",   region: "NAM",   units: 1240, price: 1199, trend: "+18%", dir: "up" },
    { name: "MacBook Air M5",  region: "EMEA",  units: 890,  price: 1499, trend: "+12%", dir: "up" },
    { name: "iPad Pro",        region: "APAC",  units: 650,  price: 899,  trend: "-4%",  dir: "down" },
    { name: "Apple Watch X",   region: "NAM",   units: 1820, price: 449,  trend: "+24%", dir: "up" },
    { name: "AirPods Pro 3",   region: "LATAM", units: 2340, price: 249,  trend: "+31%", dir: "up" },
    { name: "Vision Pro 2",    region: "EMEA",  units: 140,  price: 3499, trend: "+8%",  dir: "up" },
  ];

  const fmtNum = (n) => n.toLocaleString("en-US");
  const fmtMoney = (n) => "$" + n.toLocaleString("en-US");

  const ICON_UNDO = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 0118 0 9 9 0 01-9 9 9 9 0 01-7.7-4.4"/></svg>`;
  const ICON_REDO = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 00-18 0 9 9 0 009 9 9 9 0 007.7-4.4"/></svg>`;
  const ICON_BOLD = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h7a4 4 0 014 4 4 4 0 01-4 4H7zM7 12h8a4 4 0 014 4 4 4 0 01-4 4H7z"/></svg>`;
  const ICON_ITALIC = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>`;
  const ICON_DOLLAR = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`;
  const ICON_PERCENT = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`;
  const ICON_CHART = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
  const ICON_FILTER = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`;
  const ICON_PALETTE = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="13.5" cy="6.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".6" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".6" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".6" fill="currentColor"/><path d="M12 2a10 10 0 1 0 0 20 5 5 0 0 0 5-5 5 5 0 0 0-5-5H9.5a2.5 2.5 0 0 1 0-5"/></svg>`;
  const ICON_SIGMA = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 4 6 4 12 12 6 20 18 20"/></svg>`;

  const shell = h("div", { className: "ss-shell" });

  const topbar = h("div", { className: "ss-topbar" });
  const topLeft = h("div", { className: "ss-topbar__left" });
  topLeft.innerHTML = `<img src="/logo.png" alt="" class="ss-topbar__logo"><span class="ss-topbar__brand">ClawJS</span><span class="ss-topbar__sep">/</span><span class="ss-topbar__page">Sheets</span>`;
  const topRight = h("div", { className: "ss-topbar__right" });
  topRight.append(
    h("span", { className: "ss-topbar__title" }, "Q2 Sales Report"),
  );
  const liveChip = h("span", { className: "ss-topbar__live" });
  liveChip.innerHTML = `<span class="ss-topbar__live-dot"></span>4 agents`;
  topRight.append(liveChip);
  topbar.append(topLeft, topRight);
  shell.append(topbar);

  const fbar = h("div", { className: "ss-formulabar" });
  const fbCellRef = h("span", { className: "ss-formulabar__cellref" }, "A1");
  const fbFx = h("span", { className: "ss-formulabar__fx" }, "fx");
  const fbInput = h("div", { className: "ss-formulabar__input" });
  fbar.append(fbCellRef, fbFx, fbInput);
  shell.append(fbar);

  const toolbar = h("div", { className: "ss-toolbar" });
  [ICON_UNDO, ICON_REDO].forEach(icon => toolbar.append(h("button", { className: "ss-toolbar__btn", innerHTML: icon })));
  toolbar.append(h("span", { className: "ss-toolbar__sep" }));
  [ICON_BOLD, ICON_ITALIC, ICON_DOLLAR, ICON_PERCENT].forEach(icon => toolbar.append(h("button", { className: "ss-toolbar__btn", innerHTML: icon })));
  toolbar.append(h("span", { className: "ss-toolbar__sep" }));
  const sigmaBtn = h("button", { className: "ss-toolbar__btn", innerHTML: ICON_SIGMA });
  const paletteBtn = h("button", { className: "ss-toolbar__btn", innerHTML: ICON_PALETTE });
  const filterBtn = h("button", { className: "ss-toolbar__btn", innerHTML: ICON_FILTER });
  const chartBtn = h("button", { className: "ss-toolbar__btn", innerHTML: ICON_CHART });
  toolbar.append(sigmaBtn, paletteBtn, filterBtn, chartBtn);
  shell.append(toolbar);

  const gridWrap = h("div", { className: "ss-grid-wrap" });
  const grid = h("div", { className: "ss-grid" });

  grid.append(h("div", { className: "ss-hcorner" }));
  const hcolEls = [];
  COLS.forEach(c => {
    const hc = h("div", { className: "ss-hcol" }, c);
    hcolEls.push(hc);
    grid.append(hc);
  });

  const hrowEls = [];
  const cells = [];
  for (let r = 0; r < NUM_ROWS; r++) {
    const hr = h("div", { className: "ss-hrow" }, String(r + 1));
    hrowEls.push(hr);
    grid.append(hr);
    cells[r] = [];
    for (let c = 0; c < 6; c++) {
      const cell = h("div", { className: "ss-cell" });
      cells[r][c] = cell;
      grid.append(cell);
    }
  }
  gridWrap.append(grid);

  const chart = h("div", { className: "ss-chart" });
  const chartHeader = h("div", { className: "ss-chart__header" });
  chartHeader.append(
    h("span", { className: "ss-chart__title" }, "Revenue by Product"),
    h("span", { className: "ss-chart__tag" }, "Q2 2026"),
  );
  const chartBars = h("div", { className: "ss-chart__bars" });
  const chartBarEls = PRODUCTS.map(() => {
    const bar = h("div", { className: "ss-chart__bar" });
    chartBars.append(bar);
    return bar;
  });
  const chartXaxis = h("div", { className: "ss-chart__xaxis" });
  PRODUCTS.forEach(p => {
    chartXaxis.append(h("span", { className: "ss-chart__xlabel" }, p.name.split(" ")[0]));
  });
  chart.append(chartHeader, chartBars, chartXaxis);
  gridWrap.append(chart);
  shell.append(gridWrap);

  const tabs = h("div", { className: "ss-tabs" });
  tabs.append(
    h("span", { className: "ss-tab ss-tab--active" }, "Q2 Sales"),
    h("span", { className: "ss-tab" }, "Q1 Sales"),
    h("span", { className: "ss-tab" }, "Forecast"),
    h("span", { className: "ss-tab__plus" }, "+"),
  );
  shell.append(tabs);

  const statusbar = h("div", { className: "ss-statusbar" });
  const statusLeft = h("div", { className: "ss-statusbar__left" });
  statusLeft.innerHTML = `<span class="ss-statusbar__dot"></span> Auto-saved`;
  const agentBar = h("div", { className: "ss-agentbar" });
  const agentAvatar = h("span", { className: "ss-agentbar__avatar" });
  const agentText = h("span", { className: "ss-agentbar__text" });
  agentBar.append(agentAvatar, agentText);
  statusLeft.append(agentBar);
  const statusRight = h("div", { className: "ss-statusbar__right" });
  const sumStat = h("span", { className: "ss-statusbar__stat", innerHTML: "Sum<b>.</b>" });
  const avgStat = h("span", { className: "ss-statusbar__stat", innerHTML: "Avg<b>.</b>" });
  const countStat = h("span", { className: "ss-statusbar__stat", innerHTML: "Count<b>0</b>" });
  statusRight.append(sumStat, avgStat, countStat);
  statusbar.append(statusLeft, statusRight);
  shell.append(statusbar);

  container.append(shell);

  let activeRow = null, activeCol = null;
  let timers = [];
  let runSeq = 0;

  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const delay = (ms) => new Promise(r => { timers.push(setTimeout(r, ms)); });

  function setActiveCell(r, c) {
    if (activeRow !== null) cells[activeRow][activeCol].classList.remove("ss-cell--active");
    hcolEls.forEach(el => el.classList.remove("ss-hcol--active"));
    hrowEls.forEach(el => el.classList.remove("ss-hrow--active"));
    activeRow = r;
    activeCol = c;
    cells[r][c].classList.add("ss-cell--active");
    hcolEls[c].classList.add("ss-hcol--active");
    hrowEls[r].classList.add("ss-hrow--active");
    fbCellRef.textContent = COLS[c] + (r + 1);
    fbInput.classList.remove("ss-formulabar__input--formula");
    fbInput.textContent = "";
  }

  async function typeChars(text, cellEl, fbEl, speed, opts = {}) {
    cellEl.innerHTML = "";
    fbEl.innerHTML = "";
    if (opts.formula) fbEl.classList.add("ss-formulabar__input--formula");
    const cellCur = h("span", { className: "ss-typing-cursor" });
    const fbCur = h("span", { className: "ss-typing-cursor" });
    cellEl.append(cellCur);
    fbEl.append(fbCur);
    for (let i = 0; i < text.length; i++) {
      cellCur.before(document.createTextNode(text[i]));
      fbCur.before(document.createTextNode(text[i]));
      await delay(speed);
    }
    cellCur.remove();
    fbCur.remove();
  }

  function ssToast(agentKey, text) {
    const agent = AGENTS[agentKey];
    agentBar.style.borderLeftColor = agent.color;
    const wasVisible = agentBar.classList.contains("ss-agentbar--show");
    const swap = () => {
      agentAvatar.innerHTML = `<img src="${agent.avatar}" alt="">`;
      agentText.textContent = text;
      agentAvatar.style.opacity = "1";
      agentText.style.opacity = "1";
    };
    if (wasVisible) {
      agentAvatar.style.opacity = "0";
      agentText.style.opacity = "0";
      timers.push(setTimeout(swap, 180));
    } else {
      swap();
      requestAnimationFrame(() => agentBar.classList.add("ss-agentbar--show"));
    }
  }

  function resetSheet() {
    for (let r = 0; r < NUM_ROWS; r++) {
      for (let c = 0; c < 6; c++) {
        const cell = cells[r][c];
        cell.className = "ss-cell";
        cell.textContent = "";
      }
    }
    hcolEls.forEach(el => el.classList.remove("ss-hcol--active"));
    hrowEls.forEach(el => el.classList.remove("ss-hrow--active"));
    activeRow = null;
    activeCol = null;
    fbCellRef.textContent = "A1";
    fbInput.classList.remove("ss-formulabar__input--formula");
    fbInput.textContent = "";
    sumStat.innerHTML = "Sum<b>.</b>";
    avgStat.innerHTML = "Avg<b>.</b>";
    countStat.innerHTML = "Count<b>0</b>";
    chart.classList.remove("ss-chart--show");
    chartBarEls.forEach(b => { b.style.height = "0%"; });
    chartBtn.classList.remove("ss-toolbar__btn--active");
    sigmaBtn.classList.remove("ss-toolbar__btn--active");
    paletteBtn.classList.remove("ss-toolbar__btn--active");
    agentBar.classList.remove("ss-agentbar--show");
    agentText.textContent = "";
    agentAvatar.innerHTML = "";
  }

  async function runActions() {
    const seq = ++runSeq;
    const alive = () => seq === runSeq;

    clearTimers();
    resetSheet();
    await delay(500); if (!alive()) return;

    // Phase 1: Data agent fills headers
    ssToast("data", "Drafting headers...");
    await delay(220);
    for (let c = 0; c < HEADERS.length; c++) {
      if (!alive()) return;
      setActiveCell(0, c);
      cells[0][c].classList.add("ss-cell--header");
      await typeChars(HEADERS[c], cells[0][c], fbInput, 16);
      await delay(80);
    }

    // First product name typed for visual flavor
    ssToast("data", "Filling product names...");
    await delay(180); if (!alive()) return;
    setActiveCell(1, 0);
    await typeChars(PRODUCTS[0].name, cells[1][0], fbInput, 26);
    await delay(120);

    // Remaining product names cascade
    for (let i = 1; i < PRODUCTS.length; i++) {
      if (!alive()) return;
      setActiveCell(i + 1, 0);
      fbInput.textContent = PRODUCTS[i].name;
      cells[i + 1][0].textContent = PRODUCTS[i].name;
      await delay(125);
    }

    // Regions
    await delay(240); if (!alive()) return;
    ssToast("data", "Tagging regions...");
    await delay(150);
    for (let i = 0; i < PRODUCTS.length; i++) {
      if (!alive()) return;
      setActiveCell(i + 1, 1);
      fbInput.textContent = PRODUCTS[i].region;
      cells[i + 1][1].textContent = PRODUCTS[i].region;
      await delay(80);
    }

    // Units and prices together
    await delay(240); if (!alive()) return;
    ssToast("data", "Loading units & prices...");
    await delay(150);
    for (let i = 0; i < PRODUCTS.length; i++) {
      if (!alive()) return;
      setActiveCell(i + 1, 2);
      const unitsText = fmtNum(PRODUCTS[i].units);
      fbInput.textContent = unitsText;
      cells[i + 1][2].textContent = unitsText;
      cells[i + 1][2].classList.add("ss-cell--number");
      await delay(70);
      if (!alive()) return;
      setActiveCell(i + 1, 3);
      const priceText = fmtMoney(PRODUCTS[i].price);
      fbInput.textContent = priceText;
      cells[i + 1][3].textContent = priceText;
      cells[i + 1][3].classList.add("ss-cell--currency");
      await delay(70);
    }

    await delay(420); if (!alive()) return;

    // Phase 2: Formula agent
    ssToast("formula", "Writing =C2*D2 ...");
    sigmaBtn.classList.add("ss-toolbar__btn--active");
    await delay(220);
    setActiveCell(1, 4);
    const firstFormula = "=C2*D2";
    await typeChars(firstFormula, cells[1][4], fbInput, 50, { formula: true });
    await delay(320); if (!alive()) return;
    const firstRev = PRODUCTS[0].units * PRODUCTS[0].price;
    cells[1][4].textContent = fmtMoney(firstRev);
    cells[1][4].classList.add("ss-cell--revenue");
    await delay(460);

    // Autofill cascade for remaining revenue cells
    for (let i = 1; i < PRODUCTS.length; i++) {
      if (!alive()) return;
      setActiveCell(i + 1, 4);
      const rev = PRODUCTS[i].units * PRODUCTS[i].price;
      fbInput.classList.add("ss-formulabar__input--formula");
      fbInput.textContent = `=C${i + 2}*D${i + 2}`;
      cells[i + 1][4].textContent = fmtMoney(rev);
      cells[i + 1][4].classList.add("ss-cell--revenue");
      await delay(135);
    }
    await delay(420); if (!alive()) return;

    // TOTAL row
    ssToast("formula", "Summing totals...");
    await delay(200);
    setActiveCell(8, 0);
    cells[8][0].classList.add("ss-cell--total-label");
    await typeChars("TOTAL", cells[8][0], fbInput, 28);
    await delay(120);

    setActiveCell(8, 2);
    const sumUnitsFormula = "=SUM(C2:C7)";
    await typeChars(sumUnitsFormula, cells[8][2], fbInput, 28, { formula: true });
    await delay(240); if (!alive()) return;
    const totalUnits = PRODUCTS.reduce((a, p) => a + p.units, 0);
    cells[8][2].textContent = fmtNum(totalUnits);
    cells[8][2].classList.add("ss-cell--total", "ss-cell--number");
    await delay(360);

    setActiveCell(8, 4);
    const sumRevFormula = "=SUM(E2:E7)";
    await typeChars(sumRevFormula, cells[8][4], fbInput, 26, { formula: true });
    await delay(280); if (!alive()) return;
    const totalRev = PRODUCTS.reduce((a, p) => a + (p.units * p.price), 0);
    cells[8][4].textContent = fmtMoney(totalRev);
    cells[8][4].classList.add("ss-cell--total", "ss-cell--revenue");
    await delay(460);
    sigmaBtn.classList.remove("ss-toolbar__btn--active");

    sumStat.innerHTML = `Sum<b>${fmtMoney(totalRev)}</b>`;
    avgStat.innerHTML = `Avg<b>${fmtMoney(Math.round(totalRev / PRODUCTS.length))}</b>`;
    countStat.innerHTML = `Count<b>${PRODUCTS.length}</b>`;

    // Phase 3: Design agent applies conditional formatting to trend column
    await delay(360); if (!alive()) return;
    ssToast("design", "Conditional formatting...");
    paletteBtn.classList.add("ss-toolbar__btn--active");
    await delay(200);
    for (let i = 0; i < PRODUCTS.length; i++) {
      if (!alive()) return;
      setActiveCell(i + 1, 5);
      const cell = cells[i + 1][5];
      const p = PRODUCTS[i];
      fbInput.textContent = p.trend;
      cell.textContent = p.trend;
      cell.classList.add(p.dir === "up" ? "ss-cell--trend-up-fmt" : "ss-cell--trend-down-fmt");
      await delay(125);
    }
    paletteBtn.classList.remove("ss-toolbar__btn--active");
    await delay(480); if (!alive()) return;

    // Phase 4: Chart agent
    ssToast("chart", "Inserting chart...");
    chartBtn.classList.add("ss-toolbar__btn--active");
    await delay(240); if (!alive()) return;
    chart.classList.add("ss-chart--show");
    await delay(220);
    const maxRev = Math.max(...PRODUCTS.map(p => p.units * p.price));
    for (let i = 0; i < chartBarEls.length; i++) {
      if (!alive()) return;
      const rev = PRODUCTS[i].units * PRODUCTS[i].price;
      chartBarEls[i].style.height = Math.round((rev / maxRev) * 100) + "%";
      await delay(90);
    }
    await delay(1300); if (!alive()) return;
    ssToast("chart", "Report ready to share!");
    await delay(2200); if (!alive()) return;
    chart.classList.remove("ss-chart--show");
    chartBtn.classList.remove("ss-toolbar__btn--active");
    await delay(900);

    if (alive()) runActions();
  }

  setTimeout(() => runActions(), 700);
}

