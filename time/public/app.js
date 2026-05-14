const CLAW_PUBLIC_API_PREFIX = "/v" + "1";
function clawApiPath(path = "") {
  const suffix = String(path).replace(/^\/+/, "");
  return suffix ? CLAW_PUBLIC_API_PREFIX + "/" + suffix : CLAW_PUBLIC_API_PREFIX;
}
const state = {
  items: [],
  executions: [],
  selectedId: null,
  tab: "calendar",
};

async function request(path, init = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return await response.json();
}

function fmtDate(value) {
  if (!value) return "n/a";
  return new Date(value).toLocaleString();
}

function detailHtml(item) {
  if (!item) {
    return `<p class="placeholder">Select an item to inspect participants, schedule, actions, and projections.</p>`;
  }
  return `
    <h3>${item.title}</h3>
    <div class="detail-row"><strong>Status</strong><span class="status-${item.status}">${item.status}</span></div>
    <div class="detail-row"><strong>Kind</strong><span>${item.kind}</span></div>
    <div class="detail-row"><strong>Schedule</strong><span>${item.schedule.mode}</span><span>${item.schedule.cron || item.schedule.rrule || item.schedule.startsAt || item.nextRunAt || ""}</span></div>
    <div class="detail-row"><strong>Participants</strong><span>${item.participants.map((entry) => entry.label).join(", ") || "none"}</span></div>
    <div class="detail-row"><strong>Actions</strong><span>${item.actions.map((entry) => entry.kind).join(", ") || "none"}</span></div>
    <div class="detail-row"><strong>Projections</strong><span>${item.projections.map((entry) => `${entry.target}:${entry.status}`).join(", ") || "none"}</span></div>
  `;
}

function renderItems() {
  const list = document.getElementById("item-list");
  const detail = document.getElementById("detail-panel");
  const panelTitle = document.getElementById("panel-title");
  const summary = document.getElementById("summary-count");
  const runsPanel = document.getElementById("runs-panel");
  const runsList = document.getElementById("runs-list");

  summary.textContent = `${state.items.length} items`;
  panelTitle.textContent = state.tab[0].toUpperCase() + state.tab.slice(1);

  const visibleItems = state.items.filter((item) => {
    if (state.tab === "automations") return item.kind === "routine" || item.kind === "follow_up";
    if (state.tab === "calendar") return item.kind === "event" || item.kind === "deadline";
    if (state.tab === "timeline") return true;
    return false;
  });

  list.innerHTML = visibleItems.map((item) => `
    <button class="item-card" data-testid="item-card" data-id="${item.id}">
      <div class="badge">${item.kind}</div>
      <strong>${item.title}</strong>
      <div class="item-meta">
        <span class="status-${item.status}">${item.status}</span>
        <span>${fmtDate(item.startsAt || item.nextRunAt)}</span>
        <span>${item.schedule.mode}</span>
      </div>
    </button>
  `).join("");

  detail.innerHTML = detailHtml(state.items.find((item) => item.id === state.selectedId));
  runsPanel.classList.toggle("hidden", state.tab !== "runs");
  runsList.innerHTML = state.executions.map((execution) => `
    <div class="execution-row" data-testid="execution-row">
      <strong>${execution.itemId}</strong>
      <div class="item-meta">
        <span>${execution.status}</span>
        <span>${fmtDate(execution.scheduledFor)}</span>
        <span>${execution.output || execution.error || execution.triggeredBy}</span>
      </div>
    </div>
  `).join("");

  for (const element of list.querySelectorAll("[data-id]")) {
    element.addEventListener("click", () => {
      state.selectedId = element.getAttribute("data-id");
      detail.innerHTML = detailHtml(state.items.find((item) => item.id === state.selectedId));
    });
  }
}

async function refresh() {
  const [itemsPayload, executionsPayload] = await Promise.all([
    request(clawApiPath("items")),
    request(clawApiPath("executions")),
  ]);
  state.items = itemsPayload.items;
  state.executions = executionsPayload.executions;
  if (!state.selectedId && state.items[0]) state.selectedId = state.items[0].id;
  renderItems();
}

async function createEvent() {
  await request(clawApiPath("items"), {
    method: "POST",
    body: JSON.stringify({
      kind: "event",
      title: "Release sync",
      description: "Review open release blockers with agents and humans.",
      startsAt: "2026-04-10T09:00:00.000Z",
      schedule: { mode: "one_off", timezone: "UTC", startsAt: "2026-04-10T09:00:00.000Z" },
      participants: [{ kind: "human", label: "Alice", personId: "alice" }, { kind: "agent", label: "Ops agent", agentId: "ops" }],
    }),
  });
  state.tab = "calendar";
  setActiveTab("calendar");
  await refresh();
}

async function createRoutine() {
  await request(clawApiPath("items"), {
    method: "POST",
    body: JSON.stringify({
      kind: "routine",
      title: "Deployment health",
      description: "Check deployment health every 3 hours.",
      natural: { command: "every", expression: "3h" },
      actions: [{ kind: "workflow", target: "runtime_scheduler" }],
    }),
  });
  state.tab = "automations";
  setActiveTab("automations");
  await refresh();
}

async function createFollowUp() {
  await request(clawApiPath("items"), {
    method: "POST",
    body: JSON.stringify({
      kind: "follow_up",
      title: "Waiting on reply",
      description: "If there is no reply in 24h, remind the owner.",
      natural: {
        command: "after",
        expression: "24h if no reply",
        anchorType: "thread",
        anchorId: "thread-ui",
        anchorAt: "2026-04-09T08:00:00.000Z",
      },
      actions: [{ kind: "notify", target: "notify" }],
    }),
  });
  state.tab = "automations";
  setActiveTab("automations");
  await refresh();
}

async function simulateReply() {
  await request(clawApiPath("signals"), {
    method: "POST",
    body: JSON.stringify({ anchorId: "thread-ui", signal: "reply_received" }),
  });
  await refresh();
}

async function runRoutineNow() {
  const routine = state.items.find((item) => item.kind === "routine");
  if (!routine) return;
  await request(clawApiPath(`items/${routine.id}/run`), { method: "POST" });
  state.tab = "runs";
  setActiveTab("runs");
  await refresh();
}

function setActiveTab(tab) {
  state.tab = tab;
  for (const button of document.querySelectorAll("[data-tab]")) {
    button.classList.toggle("active", button.dataset.tab === tab);
  }
  renderItems();
}

document.querySelector("[data-testid='create-event-button']").addEventListener("click", createEvent);
document.querySelector("[data-testid='create-routine-button']").addEventListener("click", createRoutine);
document.querySelector("[data-testid='create-followup-button']").addEventListener("click", createFollowUp);
document.querySelector("[data-testid='simulate-reply-button']").addEventListener("click", simulateReply);
document.querySelector("[data-testid='run-routine-button']").addEventListener("click", runRoutineNow);

for (const button of document.querySelectorAll("[data-tab]")) {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
}

refresh().catch((error) => {
  document.getElementById("item-list").innerHTML = `<div class="item-card"><strong>Failed to load</strong><span>${error.message}</span></div>`;
});
