import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── RELAY DEMO ──────────────────────────────────────────────────────────────

export function mountRelay(container) {
  const svgNS = "http://www.w3.org/2000/svg";

  // ── Data ──
  const CLIENTS = [
    { id: "ios",   name: "iPhone",        sub: "Madrid",          shape: "iphone"  },
    { id: "mac",   name: "MacBook Pro",   sub: "Lisbon",          shape: "laptop"  },
    { id: "web",   name: "Web Dashboard", sub: "Dublin",          shape: "browser" },
    { id: "slack", name: "Slack Bot",     sub: "us-east-1",       shape: "chip"    },
    { id: "voice", name: "Twilio Voice",  sub: "London",          shape: "phone"   },
  ];

  const CONNECTORS = [
    { id: "studio", name: "Studio Mac Mini", sub: "M2 Pro . office router",  agents: 4, nat: true,  status: "online" },
    { id: "rack",   name: "Datacenter Rack", sub: "M2 Ultra . Frankfurt",    agents: 8, nat: false, status: "online" },
    { id: "garage", name: "Garage Mac Mini", sub: "M1 . home network",       agents: 2, nat: true,  status: "online" },
    { id: "edge",   name: "Edge Workstation",sub: "Linux . Paris",           agents: 3, nat: true,  status: "online" },
  ];

  const ROUTES = [
    { client: "ios",   connector: "studio", op: "chat.stream",      method: "GET",  path: "/sessions/sk_4f2a/stream",  agent: "DevOps",   ms: 142 },
    { client: "web",   connector: "rack",   op: "tasks.list",       method: "GET",  path: "/tasks?limit=20",           agent: "Planner",  ms: 38  },
    { client: "slack", connector: "garage", op: "sessions.create",  method: "POST", path: "/sessions",                 agent: "Tutor",    ms: 91  },
    { client: "voice", connector: "rack",   op: "chat.stream",      method: "GET",  path: "/sessions/sk_9c1b/stream",  agent: "SEO",      ms: 168 },
    { client: "mac",   connector: "studio", op: "notes.update",     method: "PATCH",path: "/notes/nt_8e3a",            agent: "Analyst",  ms: 74  },
    { client: "ios",   connector: "edge",   op: "workspace.status", method: "GET",  path: "/workspaces/main",          agent: "Designer", ms: 56  },
  ];

  // ─────────────────────────────────────────────────────────────────────
  // PART 1 — TOPOLOGY (free-standing, no window frame)
  // ─────────────────────────────────────────────────────────────────────

  const topo = h("div", { className: "relay-topo" });
  const topoStage = h("div", { className: "relay-topo__stage" });

  topoStage.append(h("div", { className: "relay-topo__grid" }));

  const linesSvg = document.createElementNS(svgNS, "svg");
  linesSvg.setAttribute("class", "relay-topo__svg");
  linesSvg.setAttribute("xmlns", svgNS);
  topoStage.append(linesSvg);

  // Clients side
  const clientsCol = h("div", { className: "relay-topo__side relay-topo__side--clients" });
  clientsCol.append(h("div", { className: "relay-topo__side-label" }, "Clients . anywhere"));
  const clientNodes = {};
  CLIENTS.forEach((c) => {
    const node = h("div", { className: `relay-device relay-device--${c.shape}`, "data-id": c.id });
    const illu = h("div", { className: "relay-device__illu" });
    if (c.shape === "iphone") {
      illu.innerHTML = `<div class="rd-iphone"><div class="rd-iphone__notch"></div><div class="rd-iphone__screen"></div></div>`;
    } else if (c.shape === "laptop") {
      illu.innerHTML = `<div class="rd-laptop"><div class="rd-laptop__lid"><div class="rd-laptop__screen"></div></div><div class="rd-laptop__base"></div></div>`;
    } else if (c.shape === "browser") {
      illu.innerHTML = `<div class="rd-browser"><div class="rd-browser__bar"><span></span><span></span><span></span></div><div class="rd-browser__body"></div></div>`;
    } else if (c.shape === "chip") {
      illu.innerHTML = `<div class="rd-chip">#</div>`;
    } else if (c.shape === "phone") {
      illu.innerHTML = `<div class="rd-phone"><div class="rd-phone__waves"></div></div>`;
    }
    const meta = h("div", { className: "relay-device__meta" },
      h("div", { className: "relay-device__name" }, c.name),
      h("div", { className: "relay-device__sub" }, c.sub),
    );
    node.append(illu, meta);
    clientNodes[c.id] = node;
    clientsCol.append(node);
  });
  topoStage.append(clientsCol);

  // Center: Relay orb
  const centerWrap = h("div", { className: "relay-topo__center" });
  centerWrap.append(h("div", { className: "relay-topo__center-label" }, "Relay"));
  const orb = h("div", { className: "relay-orb" });
  orb.innerHTML = `
    <div class="relay-orb__halo relay-orb__halo--3"></div>
    <div class="relay-orb__halo relay-orb__halo--2"></div>
    <div class="relay-orb__halo relay-orb__halo--1"></div>
    <div class="relay-orb__core">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
    </div>
  `;
  centerWrap.append(orb);
  centerWrap.append(h("div", { className: "relay-topo__center-host" }, "relay.clawjs.ai"));
  topoStage.append(centerWrap);

  // Connectors side
  const connsCol = h("div", { className: "relay-topo__side relay-topo__side--connectors" });
  connsCol.append(h("div", { className: "relay-topo__side-label" }, "OpenClaw . behind NAT"));
  const connectorNodes = {};
  CONNECTORS.forEach((c) => {
    const node = h("div", { className: "relay-device relay-device--mini", "data-id": c.id });
    const illu = h("div", { className: "relay-device__illu" });
    illu.innerHTML = `<div class="rd-mini"><div class="rd-mini__top"></div><div class="rd-mini__led"></div></div>`;
    const nameEl = h("div", { className: "relay-device__name" });
    nameEl.innerHTML = `${c.name}${c.nat ? ' <span class="relay-device__nat">NAT</span>' : ""}`;
    const meta = h("div", { className: "relay-device__meta" },
      nameEl,
      h("div", { className: "relay-device__sub" }, c.sub),
    );
    node.append(illu, meta);
    connectorNodes[c.id] = node;
    connsCol.append(node);
  });
  topoStage.append(connsCol);

  // Toast
  const toast = h("div", { className: "relay-topo__toast" },
    h("div", { className: "relay-topo__toast-title" }, "Routed via relay"),
    h("div", { className: "relay-topo__toast-sub" }, ""),
  );
  topoStage.append(toast);

  topo.append(topoStage);
  container.append(topo);

  // ─────────────────────────────────────────────────────────────────────
  // PART 2 — MONITOR (windowed dashboard)
  // ─────────────────────────────────────────────────────────────────────

  const win = h("div", { className: "relay-monitor" });

  const topbar = h("div", { className: "relay-monitor__topbar" },
    h("img", { className: "relay-monitor__logo", src: "/logo.png", alt: "" }),
    h("span", { className: "relay-monitor__brand" }, "ClawJS"),
    h("span", { className: "relay-monitor__sep" }, "/"),
    h("span", { className: "relay-monitor__page" }, "Relay Monitor"),
    h("span", { className: "relay-monitor__env" }, "production . eu-west"),
    h("div", { className: "relay-monitor__actions" },
      h("span", { className: "relay-monitor__pill" },
        h("span", { className: "relay-monitor__live-dot" }),
        "Live"
      ),
      h("span", { className: "relay-monitor__pill relay-monitor__pill--muted" }, "tenant: acme"),
    ),
  );
  win.append(topbar);

  // Stats row
  const stats = h("div", { className: "relay-monitor__stats" });
  const STAT_DEFS = [
    { label: "Active tunnels",   value: "6",      accent: "green" },
    { label: "Requests / sec",   value: "47",     accent: "pink"  },
    { label: "p50 latency",      value: "112ms",  accent: "blue"  },
    { label: "Uptime 24h",       value: "99.98%", accent: "amber" },
  ];
  STAT_DEFS.forEach((s, idx) => {
    const sparkSvg = document.createElementNS(svgNS, "svg");
    sparkSvg.setAttribute("viewBox", "0 0 100 22");
    sparkSvg.setAttribute("preserveAspectRatio", "none");
    const pts = [];
    for (let i = 0; i < 18; i++) {
      const x = (i / 17) * 100;
      const y = 11 + Math.sin(i * 0.7 + idx * 1.3) * 5 + Math.cos(i * 1.1 + idx) * 2;
      pts.push(`${x},${y.toFixed(1)}`);
    }
    const poly = document.createElementNS(svgNS, "polyline");
    poly.setAttribute("points", pts.join(" "));
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", "currentColor");
    poly.setAttribute("stroke-width", "1.4");
    poly.setAttribute("stroke-linecap", "round");
    poly.setAttribute("stroke-linejoin", "round");
    sparkSvg.append(poly);

    stats.append(
      h("div", { className: `relay-monitor__stat relay-monitor__stat--${s.accent}` },
        h("div", { className: "relay-monitor__stat-label" }, s.label),
        h("div", { className: "relay-monitor__stat-value" }, s.value),
        h("div", { className: "relay-monitor__stat-spark" }, sparkSvg)
      )
    );
  });
  win.append(stats);

  // Tabs
  const tabs = h("div", { className: "relay-monitor__tabs" },
    h("div", { className: "relay-monitor__tab relay-monitor__tab--active" }, "Activity"),
    h("div", { className: "relay-monitor__tab" }, "Connectors"),
    h("div", { className: "relay-monitor__tab" }, "Tenants"),
    h("div", { className: "relay-monitor__tab" }, "Auth"),
    h("div", { className: "relay-monitor__tab" }, "Telemetry"),
  );
  win.append(tabs);

  // Body
  const body = h("div", { className: "relay-monitor__body" });

  // Activity log
  const logWrap = h("div", { className: "relay-monitor__log" });
  logWrap.append(
    h("div", { className: "relay-monitor__log-head" },
      h("span", { style: { width: "70px" } }, "Time"),
      h("span", { style: { width: "62px" } }, "Method"),
      h("span", { style: { flex: "1" } }, "Path"),
      h("span", { style: { width: "118px" } }, "Client"),
      h("span", { style: { width: "78px" } }, "Agent"),
      h("span", { style: { width: "56px", textAlign: "right" } }, "ms"),
    )
  );
  const logBody = h("div", { className: "relay-monitor__log-body" });
  logWrap.append(logBody);
  body.append(logWrap);

  // Connectors side panel
  const sidePanel = h("div", { className: "relay-monitor__side" });
  sidePanel.append(h("div", { className: "relay-monitor__side-head" }, "Connectors"));
  const sideRows = {};
  CONNECTORS.forEach((c) => {
    const iconSvg = document.createElementNS(svgNS, "svg");
    iconSvg.setAttribute("viewBox", "0 0 24 24");
    iconSvg.setAttribute("width", "14");
    iconSvg.setAttribute("height", "14");
    iconSvg.setAttribute("fill", "none");
    iconSvg.setAttribute("stroke", "currentColor");
    iconSvg.setAttribute("stroke-width", "2");
    iconSvg.setAttribute("stroke-linecap", "round");
    iconSvg.setAttribute("stroke-linejoin", "round");
    iconSvg.innerHTML = c.id === "rack"
      ? '<rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/>'
      : '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><line x1="7" y1="7" x2="7.01" y2="7"/><line x1="7" y1="17" x2="7.01" y2="17"/>';

    const nameEl = h("div", { className: "relay-monitor__conn-name" });
    nameEl.innerHTML = `${c.name}${c.nat ? ' <span class="relay-monitor__conn-nat">NAT</span>' : ""}`;

    const row = h("div", { className: "relay-monitor__conn", "data-id": c.id },
      h("div", { className: "relay-monitor__conn-icon" }, iconSvg),
      h("div", { className: "relay-monitor__conn-body" },
        nameEl,
        h("div", { className: "relay-monitor__conn-sub" }, `${c.agents} agents . ${c.sub}`),
      ),
      h("div", { className: "relay-monitor__conn-status" },
        h("div", { className: "relay-monitor__conn-dot" }),
      ),
    );
    sideRows[c.id] = row;
    sidePanel.append(row);
  });
  body.append(sidePanel);

  win.append(body);
  container.append(win);

  // ─────────────────────────────────────────────────────────────────────
  // ANIMATION
  // ─────────────────────────────────────────────────────────────────────

  function centerOf(el, root) {
    const r = el.getBoundingClientRect();
    const rootR = root.getBoundingClientRect();
    return {
      x: r.left - rootR.left + r.width / 2,
      y: r.top - rootR.top + r.height / 2,
    };
  }

  function drawBaseLines() {
    while (linesSvg.firstChild) linesSvg.removeChild(linesSvg.firstChild);
    const sr = topoStage.getBoundingClientRect();
    if (sr.width === 0) return [];
    linesSvg.setAttribute("viewBox", `0 0 ${sr.width} ${sr.height}`);
    linesSvg.setAttribute("width", String(sr.width));
    linesSvg.setAttribute("height", String(sr.height));
    const orbCenter = centerOf(orb, topoStage);

    const edges = [];
    Object.entries(clientNodes).forEach(([id, node]) => {
      const p = centerOf(node, topoStage);
      const dx = orbCenter.x - p.x;
      const cp1 = { x: p.x + dx * 0.55, y: p.y };
      const cp2 = { x: orbCenter.x - dx * 0.45, y: orbCenter.y };
      const d = `M ${p.x} ${p.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${orbCenter.x} ${orbCenter.y}`;
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "relay-topo__line");
      path.setAttribute("data-id", "c-" + id);
      linesSvg.append(path);
      edges.push({ side: "client", id, d });
    });
    Object.entries(connectorNodes).forEach(([id, node]) => {
      const p = centerOf(node, topoStage);
      const dx = p.x - orbCenter.x;
      const cp1 = { x: orbCenter.x + dx * 0.45, y: orbCenter.y };
      const cp2 = { x: p.x - dx * 0.55, y: p.y };
      const d = `M ${orbCenter.x} ${orbCenter.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p.x} ${p.y}`;
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "relay-topo__line");
      path.setAttribute("data-id", "k-" + id);
      linesSvg.append(path);
      edges.push({ side: "connector", id, d });
    });
    return edges;
  }

  let baseEdges = [];
  function rebuildLines() { baseEdges = drawBaseLines(); }

  function pulseLine(side, id, color) {
    const sel = (side === "client" ? "c-" : "k-") + id;
    const path = linesSvg.querySelector(`path[data-id="${sel}"]`);
    if (!path) return;
    path.classList.add("relay-topo__line--active");
    setTimeout(() => path.classList.remove("relay-topo__line--active"), 1100);

    const dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("r", "4");
    dot.setAttribute("class", `relay-topo__packet relay-topo__packet--${color}`);
    const motion = document.createElementNS(svgNS, "animateMotion");
    motion.setAttribute("dur", "0.7s");
    motion.setAttribute("fill", "freeze");
    motion.setAttribute("path", path.getAttribute("d"));
    if (color === "reply") {
      motion.setAttribute("keyPoints", "1;0");
      motion.setAttribute("keyTimes", "0;1");
      motion.setAttribute("calcMode", "linear");
    }
    dot.append(motion);
    linesSvg.append(dot);
    setTimeout(() => dot.remove(), 800);
  }

  function nowStamp() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  }

  function addLogRow(route, time) {
    const cliName = (CLIENTS.find((c) => c.id === route.client) || {}).name || route.client;
    const row = h("div", { className: "relay-monitor__log-row" },
      h("span", { className: "relay-monitor__log-time", style: { width: "70px" } }, time),
      h("span", { style: { width: "62px" } },
        h("span", { className: `relay-monitor__log-method relay-monitor__log-method--${route.method.toLowerCase()}` }, route.method)
      ),
      h("span", { className: "relay-monitor__log-path", style: { flex: "1" } }, route.path),
      h("span", { className: "relay-monitor__log-client", style: { width: "118px" } }, cliName),
      h("span", { className: "relay-monitor__log-agent", style: { width: "78px" } }, route.agent),
      h("span", { className: "relay-monitor__log-ms", style: { width: "56px", textAlign: "right" } }, `${route.ms}ms`),
    );
    logBody.prepend(row);
    requestAnimationFrame(() => row.classList.add("relay-monitor__log-row--in"));
    while (logBody.children.length > 9) logBody.removeChild(logBody.lastChild);
  }

  function highlightConnector(id) {
    const row = sideRows[id];
    if (!row) return;
    row.classList.add("relay-monitor__conn--active");
    setTimeout(() => row.classList.remove("relay-monitor__conn--active"), 1500);
  }

  let routeIndex = 0;
  let timers = [];
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function runRoute() {
    if (!baseEdges.length) rebuildLines();
    const route = ROUTES[routeIndex % ROUTES.length];
    routeIndex++;

    const cliNode = clientNodes[route.client];
    const conNode = connectorNodes[route.connector];
    if (!cliNode || !conNode) {
      timers.push(setTimeout(runRoute, 800));
      return;
    }

    cliNode.classList.add("relay-device--active");
    pulseLine("client", route.client, "in");
    orb.classList.add("relay-orb--active");

    timers.push(setTimeout(() => {
      cliNode.classList.remove("relay-device--active");
      pulseLine("connector", route.connector, "in");
      conNode.classList.add("relay-device--active");
    }, 750));

    timers.push(setTimeout(() => {
      addLogRow(route, nowStamp());
      highlightConnector(route.connector);
    }, 1500));

    timers.push(setTimeout(() => {
      pulseLine("connector", route.connector, "reply");
    }, 1900));

    timers.push(setTimeout(() => {
      conNode.classList.remove("relay-device--active");
      pulseLine("client", route.client, "reply");
      cliNode.classList.add("relay-device--active");
      const c = CLIENTS.find((x) => x.id === route.client);
      const k = CONNECTORS.find((x) => x.id === route.connector);
      toast.querySelector(".relay-topo__toast-sub").textContent =
        `${c.name} → ${k.name} . ${route.op} . ${route.ms}ms`;
      toast.classList.add("relay-topo__toast--show");
    }, 2650));

    timers.push(setTimeout(() => {
      cliNode.classList.remove("relay-device--active");
      orb.classList.remove("relay-orb--active");
      toast.classList.remove("relay-topo__toast--show");
    }, 3500));

    timers.push(setTimeout(runRoute, 3950));
  }

  // Seed log
  const seed = nowStamp();
  addLogRow(ROUTES[2], seed);
  addLogRow(ROUTES[4], seed);
  addLogRow(ROUTES[1], seed);
  addLogRow(ROUTES[5], seed);

  setTimeout(() => {
    rebuildLines();
    clearTimers();
    runRoute();
  }, 700);

  let resizeRaf = null;
  window.addEventListener("resize", () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(rebuildLines);
  });
}

