import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── Workflow Builder Demo ───────────────────────────────────────────────────

export function mountWorkflowBuilder(container) {
  const robo = (seed) => `https://robohash.org/${encodeURIComponent(seed)}?set=set1&size=80x80&bgset=bg2`;
  const AGENTS = {
    architect: { name: "Architect Agent", color: "#6366f1", avatar: robo("wf-architect-claw-2") },
    optimizer: { name: "Optimizer Agent", color: "#3b82f6", avatar: robo("wf-optimizer-claw-4") },
    monitor:   { name: "Monitor Agent",   color: "#34d399", avatar: robo("wf-monitor-claw-6") },
    debugger:  { name: "Debug Agent",     color: "#f59e0b", avatar: robo("wf-debug-claw-8") },
  };

  const NODE_TYPES = {
    trigger:   { label: "Trigger",   color: "#a855f7", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>` },
    condition: { label: "Condition", color: "#f59e0b", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>` },
    action:    { label: "Action",    color: "#3b82f6", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/></svg>` },
    api:       { label: "API Call",  color: "#34d399", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 019-9"/></svg>` },
    transform: { label: "Transform", color: "#f472b6", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>` },
    delay:     { label: "Delay",     color: "#71717a", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>` },
    output:    { label: "Output",    color: "#ef4444", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>` },
    agent:     { label: "AI Agent",  color: "#6366f1", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M12 2a4 4 0 0 0-4 4v5h8V6a4 4 0 0 0-4-4z"/><circle cx="9" cy="16" r="1" fill="currentColor"/><circle cx="15" cy="16" r="1" fill="currentColor"/></svg>` },
  };

  const WF_ICONS = {
    play: `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    plus: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  };

  const workflows = [
    { id: "wf-1", name: "Lead Nurture Pipeline", status: "running", executions: 1247 },
    { id: "wf-2", name: "Slack Alert on Deploy", status: "running", executions: 892 },
    { id: "wf-3", name: "Customer Onboarding", status: "paused", executions: 456 },
    { id: "wf-4", name: "Invoice Processing", status: "running", executions: 2341 },
    { id: "wf-5", name: "Bug Triage & Assign", status: "error", executions: 178 },
  ];

  const flowNodes = {
    "wf-1": [
      { id: "n1", type: "trigger",   label: "Webhook",      x: 20,  y: 160, desc: "POST /api/leads" },
      { id: "n2", type: "agent",     label: "Enrich Lead",  x: 170, y: 160, desc: "AI enrichment" },
      { id: "n3", type: "condition", label: "Score > 80?",  x: 320, y: 160, desc: "Lead scoring" },
      { id: "n4", type: "action",    label: "Add to CRM",   x: 470, y: 80,  desc: "HubSpot deal" },
      { id: "n5", type: "api",       label: "Send Email",   x: 470, y: 240, desc: "Welcome drip" },
      { id: "n6", type: "output",    label: "Notify Slack", x: 470, y: 360, desc: "#sales-pipeline" },
    ],
    "wf-2": [
      { id: "n1", type: "trigger",   label: "GitHub Push",  x: 20,  y: 160, desc: "main branch" },
      { id: "n2", type: "condition", label: "CI Passed?",   x: 180, y: 160, desc: "Check status" },
      { id: "n3", type: "action",    label: "Build Image",  x: 350, y: 80,  desc: "Docker build" },
      { id: "n4", type: "api",       label: "Deploy K8s",   x: 500, y: 80,  desc: "Rolling update" },
      { id: "n5", type: "output",    label: "Slack Notify", x: 500, y: 240, desc: "#deploys" },
      { id: "n6", type: "action",    label: "Rollback",     x: 350, y: 240, desc: "Revert deploy" },
    ],
    "wf-3": [
      { id: "n1", type: "trigger",   label: "New Signup",     x: 20,  y: 160, desc: "User created" },
      { id: "n2", type: "action",    label: "Welcome Email",  x: 170, y: 160, desc: "Drip #1" },
      { id: "n3", type: "delay",     label: "Wait 1 day",     x: 320, y: 160, desc: "Engagement delay" },
      { id: "n4", type: "condition", label: "Activated?",     x: 470, y: 160, desc: "First action" },
      { id: "n5", type: "action",    label: "Setup Guide",    x: 470, y: 60,  desc: "Send tutorial" },
      { id: "n6", type: "api",       label: "Schedule Call",  x: 470, y: 260, desc: "Calendly invite" },
    ],
    "wf-4": [
      { id: "n1", type: "trigger",   label: "Email Inbox",    x: 20,  y: 160, desc: "invoices@co" },
      { id: "n2", type: "agent",     label: "Extract Data",   x: 180, y: 160, desc: "AI parsing" },
      { id: "n3", type: "condition", label: "Amount > $5k?",  x: 350, y: 160, desc: "Threshold" },
      { id: "n4", type: "action",    label: "Auto-Approve",   x: 500, y: 80,  desc: "Mark approved" },
      { id: "n5", type: "action",    label: "Request Review", x: 500, y: 240, desc: "Manager approval" },
    ],
    "wf-5": [
      { id: "n1", type: "trigger",   label: "New Issue",      x: 20,  y: 160, desc: "GitHub issue" },
      { id: "n2", type: "agent",     label: "Triage Agent",   x: 180, y: 160, desc: "AI triage" },
      { id: "n3", type: "condition", label: "P0 / P1?",       x: 350, y: 160, desc: "Priority check" },
      { id: "n4", type: "action",    label: "Page Oncall",    x: 500, y: 80,  desc: "PagerDuty" },
      { id: "n5", type: "action",    label: "Add to Board",   x: 500, y: 240, desc: "Linear backlog" },
    ],
  };

  const flowEdges = {
    "wf-1": [["n1","n2"],["n2","n3"],["n3","n4","Yes"],["n3","n5","No"],["n4","n6"],["n5","n6"]],
    "wf-2": [["n1","n2"],["n2","n3","Yes"],["n2","n6","No"],["n3","n4"],["n4","n5"],["n6","n5"]],
    "wf-3": [["n1","n2"],["n2","n3"],["n3","n4"],["n4","n5","Yes"],["n4","n6","No"]],
    "wf-4": [["n1","n2"],["n2","n3"],["n3","n4","Yes"],["n3","n5","No"]],
    "wf-5": [["n1","n2"],["n2","n3"],["n3","n4","Yes"],["n3","n5","No"]],
  };

  let selectedWf = "wf-1";
  let executionTimer = null;

  const shell = h("div", { className: "wf-shell" });

  // Top bar
  const topbar = h("div", { className: "wf-topbar" });
  const topLeft = h("div", { className: "wf-topbar__left" });
  topLeft.innerHTML = `<img src="/logo.png" alt="" class="wf-topbar__logo"><span class="wf-topbar__brand">ClawJS</span><span class="wf-topbar__sep">/</span><span class="wf-topbar__page">Workflows</span>`;
  const topRight = h("div", { className: "wf-topbar__meta" });
  const metricsBar = h("div", { className: "wf-topbar__metrics" });
  metricsBar.innerHTML = `<span class="wf-metric"><span class="wf-metric__dot wf-metric__dot--flows"></span><span class="wf-metric__val">5</span><span class="wf-metric__label">Flows</span></span><span class="wf-metric"><span class="wf-metric__dot wf-metric__dot--exec"></span><span class="wf-metric__val">5.1k</span><span class="wf-metric__label">Runs</span></span><span class="wf-metric"><span class="wf-metric__dot wf-metric__dot--up"></span><span class="wf-metric__val">97.4%</span><span class="wf-metric__label">Success</span></span>`;
  topRight.append(metricsBar);
  topbar.append(topLeft, topRight);
  shell.append(topbar);

  // Body
  const body = h("div", { className: "wf-body" });

  // LEFT: sidebar
  const sidebar = h("div", { className: "wf-sidebar" });
  const sidebarHeader = h("div", { className: "wf-sidebar__header" });
  sidebarHeader.innerHTML = `<span class="wf-sidebar__title">Workflows</span><button class="wf-sidebar__add">${WF_ICONS.plus}</button>`;
  sidebar.append(sidebarHeader);
  const wfList = h("div", { className: "wf-sidebar__list" });
  sidebar.append(wfList);
  body.append(sidebar);

  // CENTER: canvas
  const canvasWrap = h("div", { className: "wf-canvas-wrap" });
  const canvasHeader = h("div", { className: "wf-canvas__header" });
  const canvasTitle = h("span", { className: "wf-canvas__name" });
  const canvasActions = h("div", { className: "wf-canvas__actions" });
  canvasHeader.append(canvasTitle, canvasActions);
  canvasWrap.append(canvasHeader);
  const canvas = h("div", { className: "wf-canvas" });
  const svgNS = "http://www.w3.org/2000/svg";
  const svgLayer = document.createElementNS(svgNS, "svg");
  svgLayer.classList.add("wf-canvas__svg");
  svgLayer.setAttribute("width", "100%");
  svgLayer.setAttribute("height", "100%");
  canvas.append(svgLayer);
  const nodesLayer = h("div", { className: "wf-canvas__nodes" });
  canvas.append(nodesLayer);
  canvasWrap.append(canvas);
  body.append(canvasWrap);

  // Toast container (overlays on canvas)
  const toastContainer = h("div", { className: "wf-toasts" });
  canvasWrap.append(toastContainer);

  shell.append(body);
  container.append(shell);

  // Show toast notification
  function showToast(agentKey, text) {
    const agent = AGENTS[agentKey];
    const toast = h("div", { className: "wf-toast" });
    toast.style.setProperty("--toast-color", agent.color);
    const avatar = h("img", { className: "wf-toast__avatar", src: agent.avatar, alt: "" });
    const content = h("div", { className: "wf-toast__content" });
    content.append(h("span", { className: "wf-toast__name" }, agent.name), h("span", { className: "wf-toast__text" }, text));
    toast.append(avatar, content);
    toastContainer.append(toast);
    requestAnimationFrame(() => toast.classList.add("wf-toast--visible"));
    setTimeout(() => {
      toast.classList.remove("wf-toast--visible");
      toast.classList.add("wf-toast--exit");
      setTimeout(() => toast.remove(), 400);
    }, 3000);
    while (toastContainer.children.length > 3) toastContainer.firstChild.remove();
  }

  // Render workflow list
  function renderWorkflowList() {
    wfList.innerHTML = "";
    workflows.forEach((wf) => {
      const item = h("div", { className: `wf-item ${wf.id === selectedWf ? "wf-item--active" : ""}` });
      const statusDot = h("span", { className: `wf-item__dot wf-item__dot--${wf.status}` });
      const info = h("div", { className: "wf-item__info" });
      info.append(h("span", { className: "wf-item__name" }, wf.name), h("span", { className: "wf-item__meta" }, `${wf.executions.toLocaleString()} runs`));
      item.append(statusDot, info);
      item.addEventListener("click", () => { selectedWf = wf.id; renderWorkflowList(); renderCanvas(); });
      wfList.append(item);
    });
  }

  // Render canvas
  function renderCanvas() {
    if (executionTimer) { clearTimeout(executionTimer); executionTimer = null; }
    const wf = workflows.find((w) => w.id === selectedWf);
    canvasTitle.textContent = wf.name;
    canvasActions.innerHTML = "";
    const statusBadge = h("span", { className: `wf-canvas__status wf-canvas__status--${wf.status}` }, wf.status);
    const runBtn = h("button", { className: "wf-canvas__run-btn" });
    runBtn.innerHTML = `${WF_ICONS.play}<span>Run</span>`;
    runBtn.addEventListener("click", () => startExecution());
    canvasActions.append(statusBadge, runBtn);

    nodesLayer.innerHTML = "";
    while (svgLayer.firstChild) svgLayer.removeChild(svgLayer.firstChild);

    // Arrow markers (single gray style for all edges)
    const defs = document.createElementNS(svgNS, "defs");
    const marker = document.createElementNS(svgNS, "marker");
    marker.setAttribute("id", "wf-arrow-" + selectedWf);
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9"); marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "6"); marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto-start-reverse");
    const ap = document.createElementNS(svgNS, "path");
    ap.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    ap.setAttribute("fill", "var(--gray-700)");
    marker.append(ap);
    defs.append(marker);
    svgLayer.append(defs);

    const nodes = flowNodes[selectedWf] || [];
    const edges = flowEdges[selectedWf] || [];
    const NW = 120, NH = 50;

    // Edges
    edges.forEach((edge) => {
      const from = nodes.find((n) => n.id === edge[0]);
      const to = nodes.find((n) => n.id === edge[1]);
      if (!from || !to) return;
      const x1 = from.x + NW, y1 = from.y + NH / 2;
      const x2 = to.x, y2 = to.y + NH / 2;
      const dx = x2 - x1;

      const path = document.createElementNS(svgNS, "path");
      if (Math.abs(y1 - y2) < 4) {
        path.setAttribute("d", `M${x1},${y1} L${x2},${y2}`);
      } else {
        // Smooth bezier curve
        const cpx = dx * 0.4;
        path.setAttribute("d", `M${x1},${y1} C${x1 + cpx},${y1} ${x2 - cpx},${y2} ${x2},${y2}`);
      }
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "var(--gray-800)");
      path.setAttribute("stroke-width", "1");
      path.setAttribute("marker-end", `url(#wf-arrow-${selectedWf})`);
      path.classList.add("wf-edge");
      path.dataset.from = edge[0]; path.dataset.to = edge[1];
      svgLayer.append(path);
      if (edge[2]) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2 - 8;
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", mx); text.setAttribute("y", my);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "var(--gray-700)");
        text.setAttribute("font-size", "7");
        text.setAttribute("font-family", "var(--font-mono)");
        text.textContent = edge[2];
        svgLayer.append(text);
      }
    });

    // Nodes
    nodes.forEach((node) => {
      const type = NODE_TYPES[node.type];
      const el = h("div", { className: "wf-node" });
      el.style.left = node.x + "px"; el.style.top = node.y + "px";
      el.style.setProperty("--node-color", type.color);
      el.dataset.id = node.id;
      const iconWrap = h("div", { className: "wf-node__icon" });
      iconWrap.innerHTML = type.icon; iconWrap.style.color = type.color;
      const info = h("div", { className: "wf-node__info" });
      info.append(h("span", { className: "wf-node__label" }, node.label), h("span", { className: "wf-node__desc" }, node.desc));
      el.append(iconWrap, info);
      nodesLayer.append(el);
    });

    setTimeout(() => startExecution(), 1500);
  }

  // Execution animation
  function startExecution() {
    const nodes = flowNodes[selectedWf] || [];
    const edges = flowEdges[selectedWf] || [];
    if (!nodes.length) return;

    nodesLayer.querySelectorAll(".wf-node").forEach((el) => {
      el.classList.remove("wf-node--done", "wf-node--executing");
    });
    svgLayer.querySelectorAll(".wf-edge").forEach((el) => {
      el.classList.remove("wf-edge--active");
    });

    // BFS order
    const order = [], visited = new Set(), queue = [nodes[0].id];
    while (queue.length) {
      const c = queue.shift();
      if (visited.has(c)) continue;
      visited.add(c); order.push(c);
      edges.forEach((e) => { if (e[0] === c && !visited.has(e[1])) queue.push(e[1]); });
    }

    let step = 0;
    function executeStep() {
      if (step >= order.length) { executionTimer = setTimeout(() => startExecution(), 4000); return; }
      const nodeId = order[step];
      const nodeEl = nodesLayer.querySelector(`[data-id="${nodeId}"]`);
      if (nodeEl) { nodeEl.classList.add("wf-node--executing"); }
      edges.forEach((e) => {
        if (e[1] === nodeId) {
          const ee = svgLayer.querySelector(`.wf-edge[data-from="${e[0]}"][data-to="${e[1]}"]`);
          if (ee) { ee.classList.add("wf-edge--active"); }
        }
      });
      const nd = nodes.find((n) => n.id === nodeId);
      executionTimer = setTimeout(() => {
        if (nodeEl) {
          nodeEl.classList.remove("wf-node--executing");
          nodeEl.classList.add("wf-node--done");
        }
        // Show toast on key steps
        if (step === 0 || step === Math.floor(order.length / 2) || step === order.length - 1) {
          const ak = Object.keys(AGENTS);
          showToast(ak[step % ak.length], `${nd.label} completed: ${nd.desc}`);
        }
        step++; executionTimer = setTimeout(executeStep, 600);
      }, 800);
    }
    showToast("monitor", `Running: ${workflows.find((w) => w.id === selectedWf).name}`);
    executionTimer = setTimeout(executeStep, 400);
  }

  renderWorkflowList();
  renderCanvas();

  // Scheduled agent toasts
  function scheduleAgentActions() {
    const actions = [
      { delay: 8000,  agent: "optimizer", text: "Analyzing bottleneck in Invoice Processing..." },
      { delay: 14000, agent: "architect", text: "Suggesting: add retry logic to API nodes" },
      { delay: 22000, agent: "debugger",  text: "Latency spike fixed. Caching deployed" },
      { delay: 28000, agent: "monitor",   text: "Executions +12% vs yesterday" },
      { delay: 35000, agent: "architect", text: "Auto-created error handler for Deploy flow" },
    ];
    actions.forEach((a) => setTimeout(() => showToast(a.agent, a.text), a.delay));
    setTimeout(scheduleAgentActions, 40000);
  }
  scheduleAgentActions();
}


// ─── Mount all demos ─────────────────────────────────────────────────────────

