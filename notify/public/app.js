/* Notify Admin Console */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  token: null,
  tenantId: "default",
  view: "notifications",
  notifications: [],
  deliveries: [],
  sourceApps: [],
  clientApps: [],
};

/* ---- API helpers ---- */

function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  return fetch(path, { ...options, headers }).then(async (res) => {
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
    return body;
  });
}

/* ---- Login ---- */

const loginView = $("#login-view");
const appView = $("#app-view");
const loginForm = $("#login-form");
const loginError = $("#login-error");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  try {
    const data = await api("/v1/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    state.token = data.accessToken;
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    switchView("notifications");
  } catch (err) {
    loginError.textContent = err.message;
  }
});

/* ---- Logout ---- */

$("#logout-btn").addEventListener("click", () => {
  state.token = null;
  appView.classList.add("hidden");
  loginView.classList.remove("hidden");
});

/* ---- Navigation ---- */

function switchView(view) {
  state.view = view;

  $$(".menu-item[data-view]").forEach((btn) => {
    btn.classList.toggle("current-route", btn.dataset.view === view);
  });

  $$(".sidebar-content[data-view-only]").forEach((el) => {
    el.style.display = el.dataset.viewOnly === view ? "" : "none";
  });

  $$(".page-content[data-pane]").forEach((el) => {
    el.classList.toggle("hidden", el.dataset.pane !== view);
  });

  if (view === "notifications") loadNotifications();
  if (view === "deliveries") loadDeliveries();
  if (view === "source-apps") loadSourceApps();
  if (view === "client-apps") loadClientApps();
  if (view === "settings") loadSettings();
}

$$(".menu-item[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

/* ---- Notifications ---- */

async function loadNotifications() {
  try {
    const data = await api(`/v1/admin/notifications?tenantId=${state.tenantId}&limit=200`);
    state.notifications = data.items || [];
    renderNotifications(state.notifications);
  } catch {
    renderNotifications([]);
  }
}

function renderNotifications(items) {
  const wrapper = $("#notifications-table");
  if (!items.length) {
    wrapper.innerHTML = `<div class="empty-state"><i class="ri-notification-off-line"></i><p>No notifications yet. Send one via the API to see it here.</p></div>`;
    return;
  }
  const rows = items.map((n) => `
    <tr data-id="${n.id}">
      <td class="mono id-cell" title="${n.id}">${n.id.slice(0, 8)}</td>
      <td>${esc(n.title || "(untitled)")}</td>
      <td>${esc(n.priority || "normal")}</td>
      <td>${esc(n.deliveryMode || "alert")}</td>
      <td class="mono id-cell" title="${n.sourceAppId}">${(n.sourceAppId || "").slice(0, 8)}</td>
      <td>${fmtDate(n.createdAt)}</td>
    </tr>`).join("");

  wrapper.innerHTML = `
    <table>
      <thead><tr>
        <th>ID</th><th>Title</th><th>Priority</th><th>Mode</th><th>Source</th><th>Created</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  wrapper.querySelectorAll("tbody tr").forEach((tr) => {
    tr.addEventListener("click", () => openNotificationDrawer(tr.dataset.id));
  });
}

function openNotificationDrawer(id) {
  const n = state.notifications.find((x) => x.id === id);
  if (!n) return;

  const drawer = $("#notification-drawer");
  $("#drawer-title").textContent = n.title || "Notification";

  const detail = $("#notification-detail");
  const fields = [
    ["ID", n.id],
    ["Title", n.title || "(none)"],
    ["Body", n.body || "(none)"],
    ["Priority", n.priority],
    ["Mode", n.deliveryMode],
    ["Source App", n.sourceAppId],
    ["Tenant", n.tenantId],
    ["Created", n.createdAt],
  ];
  if (n.data) fields.push(["Data", JSON.stringify(n.data, null, 2)]);
  if (n.context) fields.push(["Context", JSON.stringify(n.context, null, 2)]);

  detail.innerHTML = fields.map(([label, value]) =>
    `<div class="detail-row"><div class="detail-label">${label}</div><div class="detail-value">${esc(String(value))}</div></div>`
  ).join("");

  drawer.classList.remove("hidden");
}

$("#notification-drawer-backdrop").addEventListener("click", () => {
  $("#notification-drawer").classList.add("hidden");
});
$("#drawer-close").addEventListener("click", () => {
  $("#notification-drawer").classList.add("hidden");
});
$("#drawer-close-btn").addEventListener("click", () => {
  $("#notification-drawer").classList.add("hidden");
});

$("#notifications-refresh").addEventListener("click", loadNotifications);

$("#notifications-filter").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = state.notifications.filter((n) =>
    (n.title || "").toLowerCase().includes(q) ||
    (n.id || "").toLowerCase().includes(q) ||
    (n.sourceAppId || "").toLowerCase().includes(q)
  );
  renderNotifications(filtered);
});

/* ---- Deliveries ---- */

async function loadDeliveries(stateFilter) {
  try {
    let url = `/v1/admin/deliveries?tenantId=${state.tenantId}&limit=200`;
    if (stateFilter) url += `&state=${stateFilter}`;
    const data = await api(url);
    state.deliveries = data.items || [];
    renderDeliveries(state.deliveries);
  } catch {
    renderDeliveries([]);
  }
}

function renderDeliveries(items) {
  const wrapper = $("#deliveries-table");
  if (!items.length) {
    wrapper.innerHTML = `<div class="empty-state"><i class="ri-send-plane-line"></i><p>No deliveries found.</p></div>`;
    return;
  }
  const rows = items.map((d) => {
    const badgeClass = d.state === "delivered" ? "label-success"
      : d.state === "failed" ? "label-danger"
      : d.state === "read" || d.state === "acked" ? "label-info"
      : "label-base";
    return `
    <tr>
      <td class="mono id-cell" title="${d.id}">${d.id.slice(0, 8)}</td>
      <td class="mono id-cell" title="${d.notificationId}">${(d.notificationId || "").slice(0, 8)}</td>
      <td>${esc(d.userId || "")}</td>
      <td><span class="label ${badgeClass}">${esc(d.state || "queued")}</span></td>
      <td>${esc(d.provider || "")}</td>
      <td>${fmtDate(d.createdAt)}</td>
    </tr>`;
  }).join("");

  wrapper.innerHTML = `
    <table>
      <thead><tr>
        <th>ID</th><th>Notification</th><th>User</th><th>State</th><th>Provider</th><th>Created</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

$$(".sidebar-list-item[data-delivery-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$("[data-view-only='deliveries'] .sidebar-list-item").forEach((el) => el.classList.remove("active"));
    btn.classList.add("active");
    loadDeliveries(btn.dataset.deliveryFilter);
  });
});

$("[data-view-only='deliveries'] .sidebar-list-item:first-child").addEventListener("click", () => {
  $$("[data-view-only='deliveries'] .sidebar-list-item").forEach((el) => el.classList.remove("active"));
  $("[data-view-only='deliveries'] .sidebar-list-item:first-child").classList.add("active");
  loadDeliveries();
});

$("#deliveries-refresh").addEventListener("click", () => loadDeliveries());

/* ---- Source Apps ---- */

async function loadSourceApps() {
  try {
    const data = await api(`/v1/admin/source-apps?tenantId=${state.tenantId}`);
    state.sourceApps = data.items || [];
    renderSourceApps(state.sourceApps);
  } catch {
    renderSourceApps([]);
  }
}

function renderSourceApps(items) {
  const list = $("#source-apps-list");
  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><i class="ri-apps-line"></i><p>No source apps registered yet.</p></div>`;
    return;
  }
  list.innerHTML = items.map((app) => `
    <div class="data-list-item">
      <div class="item-icon"><i class="ri-apps-line"></i></div>
      <div class="item-info">
        <div class="item-name">${esc(app.displayName)}</div>
        <div class="item-meta">${esc(app.id)} ${app.description ? " \u2014 " + esc(app.description) : ""}</div>
      </div>
      <div class="item-actions">
        <button class="btn btn-sm btn-outline rotate-token-btn" data-id="${app.id}" title="Rotate token">
          <i class="ri-refresh-line"></i>
        </button>
      </div>
    </div>`).join("");

  list.querySelectorAll(".rotate-token-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const result = await api(`/v1/source-apps/${btn.dataset.id}/rotate-token`, { method: "POST" });
        alert("New token: " + result.token);
      } catch (err) {
        alert("Error: " + err.message);
      }
    });
  });
}

$("#source-app-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const displayName = $("#source-app-name").value.trim();
  const description = $("#source-app-desc").value.trim() || undefined;
  if (!displayName) return;
  try {
    await api("/v1/source-apps", {
      method: "POST",
      body: JSON.stringify({ tenantId: state.tenantId, displayName, description }),
    });
    $("#source-app-name").value = "";
    $("#source-app-desc").value = "";
    loadSourceApps();
  } catch (err) {
    alert("Error: " + err.message);
  }
});

$("#source-apps-refresh").addEventListener("click", loadSourceApps);

/* ---- Client Apps ---- */

async function loadClientApps() {
  try {
    const data = await api(`/v1/admin/client-apps?tenantId=${state.tenantId}`);
    state.clientApps = data.items || [];
    renderClientApps(state.clientApps);
  } catch {
    renderClientApps([]);
  }
}

function renderClientApps(items) {
  const list = $("#client-apps-list");
  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><i class="ri-smartphone-line"></i><p>No client apps registered yet.</p></div>`;
    return;
  }
  list.innerHTML = items.map((app) => {
    const icon = app.platform === "ios" ? "ri-apple-line" : "ri-android-line";
    return `
    <div class="data-list-item">
      <div class="item-icon"><i class="${icon}"></i></div>
      <div class="item-info">
        <div class="item-name">${esc(app.displayName)}</div>
        <div class="item-meta">${esc(app.platform)} \u2014 ${esc(app.bundleId)}</div>
      </div>
    </div>`;
  }).join("");
}

$("#client-app-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const displayName = $("#client-app-name").value.trim();
  const platform = $("#client-app-platform").value;
  const bundleId = $("#client-app-bundle").value.trim();
  if (!displayName || !bundleId) return;
  try {
    await api("/v1/client-apps", {
      method: "POST",
      body: JSON.stringify({ tenantId: state.tenantId, displayName, platform, bundleId }),
    });
    $("#client-app-name").value = "";
    $("#client-app-bundle").value = "";
    loadClientApps();
  } catch (err) {
    alert("Error: " + err.message);
  }
});

$("#client-apps-refresh").addEventListener("click", loadClientApps);

/* ---- Settings ---- */

async function loadSettings() {
  try {
    const health = await api("/v1/health");
    const rows = $("#settings-rows");
    rows.innerHTML = [
      ["Service", health.service],
      ["Status", health.ok ? "Running" : "Down"],
      ["Host", health.host],
      ["Port", health.port],
    ].map(([k, v]) => `
      <div class="settings-row">
        <span class="key">${k}</span>
        <span class="value">${esc(String(v))}</span>
      </div>`).join("");

    $("#settings-url").value = `http://${health.host}:${health.port}`;
    $("#settings-output").textContent = JSON.stringify(health, null, 2);

    try {
      const metrics = await api(`/v1/admin/metrics/summary?tenantId=${state.tenantId}`);
      renderMetrics(metrics.metrics || metrics);
    } catch {
      $("#metrics-summary").innerHTML = `<div class="empty-state"><p>No metrics available.</p></div>`;
    }
  } catch (err) {
    $("#settings-output").textContent = "Error: " + err.message;
  }
}

function renderMetrics(m) {
  const grid = $("#metrics-summary");
  const cards = Object.entries(m).map(([key, value]) => `
    <div class="metric-card">
      <div class="metric-value">${typeof value === "number" ? value.toLocaleString() : esc(String(value))}</div>
      <div class="metric-label">${esc(key.replace(/([A-Z])/g, " $1").replace(/_/g, " "))}</div>
    </div>`).join("");
  grid.innerHTML = cards || `<div class="empty-state"><p>No metrics available.</p></div>`;
}

$("#settings-refresh").addEventListener("click", loadSettings);

/* ---- Helpers ---- */

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return esc(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
