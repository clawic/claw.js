/* =====================================================
   Claw Database admin UI
   SPA with rail + sidebar + panes + drawer
   ===================================================== */

const CLAW_DB_API_PREFIX = "/v" + "1";
const CLAW_DB_THEME_STORAGE_KEY = "claw-db-theme";
const RECORDS_PAGE_SIZE_OPTIONS = [25, 50, 100];
const MAX_EVENT_LOG_ITEMS = 200;
function apiPath(path = "") {
  const suffix = String(path).replace(/^\/+/, "");
  return suffix ? `${CLAW_DB_API_PREFIX}/${suffix}` : CLAW_DB_API_PREFIX;
}

const state = {
  token: "",
  view: "collections",
  namespaces: [],
  collections: [],
  currentNamespace: null,
  currentCollection: null,
  records: [],
  recordsPaging: {
    limit: 50,
    offset: 0,
    total: 0,
    requestSeq: 0,
    refreshTimer: null,
  },
  tokens: [],
  files: [],
  websocket: null,
};

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const els = {
  loginView: $("login-view"),
  appView: $("app-view"),
  shell: document.getElementById("app-view"),
  loginForm: $("login-form"),
  loginEmail: $("login-email"),
  loginPassword: $("login-password"),
  loginError: $("login-error"),
  logoutBtn: $("logout-btn"),

  namespaceList: $("namespace-list"),
  namespaceForm: $("namespace-form"),
  namespaceId: $("namespace-id"),
  namespaceDisplayName: $("namespace-display-name"),

  collectionList: $("collection-list"),
  collectionSearch: $("collection-search"),
  newCollectionBtn: $("new-collection-btn"),
  collectionModal: $("collection-modal"),
  collectionForm: $("collection-form"),
  collectionName: $("collection-name"),
  collectionDisplayName: $("collection-display-name"),
  collectionFields: $("collection-fields"),

  activeNamespaceName: $("active-namespace-name"),
  activeCollectionName: $("active-collection-name"),
  schemaTitle: $("schema-title"),
  schemaEditBtn: $("schema-edit-btn"),
  newRecordBtn: $("new-record-btn"),
  recordsFilter: $("records-filter"),
  recordsSort: $("records-sort"),
  recordsRefresh: $("records-refresh"),
  recordsTable: $("records-table"),
  recordsRange: $("records-range"),
  recordsPageSize: $("records-page-size"),
  recordsPrev: $("records-prev"),
  recordsNext: $("records-next"),

  recordDrawer: $("record-drawer"),
  drawerTitle: $("drawer-title"),
  drawerClose: $("drawer-close"),
  recordForm: $("record-form"),
  recordId: $("record-id"),
  recordData: $("record-data"),
  recordSave: $("record-save"),
  recordReset: $("record-reset"),

  schemaDrawer: $("schema-drawer"),
  schemaDrawerClose: $("schema-drawer-close"),
  schemaEditor: $("schema-editor"),
  schemaSave: $("schema-save"),

  liveStatus: $("live-status"),
  eventList: $("event-list"),

  fileForm: $("file-form"),
  fileInput: $("file-input"),
  fileRecordId: $("file-record-id"),
  fileList: $("file-list"),

  tokenForm: $("token-form"),
  tokenLabel: $("token-label"),
  tokenCollection: $("token-collection"),
  tokenOperations: $("token-operations"),
  tokenOutput: $("token-output"),
  tokenList: $("token-list"),

  settingsRefresh: $("settings-refresh"),
  settingsOutput: $("settings-output"),
};

/* ---------- Helpers ---------- */

const pretty = (value) => JSON.stringify(value, null, 2);

const escapeHtml = (value) => {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const formatCell = (value) => {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const exampleFields = () => pretty([
  { name: "title", type: "text", required: true },
  { name: "status", type: "select", options: ["draft", "active", "done"] },
  { name: "website", type: "url" },
]);

const exampleRecord = () => pretty({ title: "Hello world", status: "draft" });

async function request(path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (state.token) headers.set("authorization", `Bearer ${state.token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, { ...init, headers });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(typeof payload === "string" ? payload : payload.error || JSON.stringify(payload));
  }
  return payload;
}

/* ---------- View routing ---------- */

function setView(view) {
  state.view = view;
  els.shell.setAttribute("data-view", view);
  $$(".menu-item[data-view]").forEach((btn) => {
    btn.classList.toggle("current-route", btn.dataset.view === view);
  });
  $$(".page-content[data-pane]").forEach((pane) => {
    pane.classList.toggle("hidden", pane.dataset.pane !== view);
  });
  if (view === "settings") refreshSettings().catch(() => {});
  if (view === "tokens") refreshTokens().catch(() => {});
  if (view === "files") refreshFiles().catch(() => {});
}

$$(".menu-item[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

/* ---------- Drawer / modal ---------- */

function buildFieldInput(field, value) {
  const wrapper = document.createElement("div");
  wrapper.className = `form-field ${field.required ? "required" : ""}`;

  const label = document.createElement("label");
  label.textContent = field.name;
  wrapper.appendChild(label);

  let input;
  if (field.type === "select") {
    input = document.createElement("select");
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "—";
    input.appendChild(blank);
    for (const opt of field.options || []) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      input.appendChild(o);
    }
  } else if (field.type === "json") {
    input = document.createElement("textarea");
    input.rows = 4;
  } else if (field.type === "boolean") {
    input = document.createElement("select");
    for (const pair of [["", "—"], ["true", "true"], ["false", "false"]]) {
      const o = document.createElement("option");
      o.value = pair[0];
      o.textContent = pair[1];
      input.appendChild(o);
    }
  } else {
    input = document.createElement("input");
    input.type = field.type === "email" ? "email"
               : field.type === "url" ? "url"
               : field.type === "number" ? "number"
               : field.type === "date" ? "datetime-local"
               : "text";
    input.placeholder = field.type;
  }
  input.dataset.fieldName = field.name;
  input.dataset.fieldType = field.type;
  if (value != null) {
    if (typeof value === "object") input.value = JSON.stringify(value);
    else input.value = String(value);
  }
  wrapper.appendChild(input);
  return wrapper;
}

function collectDynamicFields() {
  const container = $("record-fields");
  if (!container) return null;
  const data = {};
  container.querySelectorAll("[data-field-name]").forEach((el) => {
    const name = el.dataset.fieldName;
    const type = el.dataset.fieldType;
    const raw = el.value;
    if (raw === "" || raw == null) return;
    if (type === "number") data[name] = Number(raw);
    else if (type === "boolean") data[name] = raw === "true";
    else if (type === "json") {
      try { data[name] = JSON.parse(raw); } catch { data[name] = raw; }
    } else data[name] = raw;
  });
  return data;
}

function syncDynamicToJson() {
  const data = collectDynamicFields();
  if (data) els.recordData.value = pretty(data);
}

function openRecordDrawer(record = null) {
  const collection = state.currentCollection;
  const collName = collection?.name || "record";
  els.drawerTitle.textContent = record ? `Edit ${collName} record` : `New ${collName} record`;

  // Build dynamic fields from collection schema
  const container = $("record-fields");
  container.innerHTML = "";
  const data = {};
  if (record) {
    for (const [k, v] of Object.entries(record)) {
      if (k !== "id" && k !== "createdAt" && k !== "updatedAt") data[k] = v;
    }
  }
  if (collection?.fields) {
    for (const field of collection.fields) {
      container.appendChild(buildFieldInput(field, data[field.name]));
    }
    container.querySelectorAll("[data-field-name]").forEach((el) => {
      el.addEventListener("input", syncDynamicToJson);
      el.addEventListener("change", syncDynamicToJson);
    });
  }

  els.recordId.value = record ? record.id : "";
  els.recordData.value = record ? pretty(data) : (collection?.fields ? pretty(data) : exampleRecord());

  els.recordDrawer.classList.remove("hidden");
}
function closeRecordDrawer() {
  els.recordDrawer.classList.add("hidden");
}
els.drawerClose.addEventListener("click", closeRecordDrawer);

const FIELD_TYPE_OPTIONS = ["text", "email", "url", "number", "date", "boolean", "select", "json", "relation", "file"];

function renderSchemaBuilder(fields) {
  const root = $("schema-fields-builder");
  if (!root) return;
  root.innerHTML = "";
  fields.forEach((field, idx) => {
    const row = document.createElement("div");
    row.className = "schema-field";
    row.dataset.index = String(idx);
    const typeOptions = FIELD_TYPE_OPTIONS.map(t => `<option value="${t}" ${t === (field.type || "text") ? "selected" : ""}>${t}</option>`).join("");
    row.innerHTML = `
      <div class="schema-field-header">
        <i class="field-type-icon ${iconClassForField(field.name, field.type)}"></i>
        <input type="text" class="schema-field-name-input" data-field-prop="name" placeholder="Field name" value="${escapeHtml(field.name || "")}" />
        <div class="field-labels">
          ${field.required ? `<span class="label label-success">Nonempty</span>` : ""}
          ${field.hidden ? `<span class="label label-danger">Hidden</span>` : ""}
        </div>
        <button type="button" class="btn btn-sm btn-circle btn-transparent options-trigger" aria-label="Toggle options">
          <i class="ri-settings-3-line"></i>
        </button>
      </div>
      <div class="schema-field-options">
        <div class="form-field form-field-sm">
          <label>Type</label>
          <select data-field-prop="type">${typeOptions}</select>
        </div>
        <div class="schema-field-options-footer">
          <label class="form-field-toggle">
            <input type="checkbox" data-field-prop="required" ${field.required ? "checked" : ""} />
            <span class="txt">Nonempty</span>
          </label>
          <label class="form-field-toggle">
            <input type="checkbox" data-field-prop="hidden" ${field.hidden ? "checked" : ""} />
            <span class="txt">Hidden</span>
          </label>
          <label class="form-field-toggle">
            <input type="checkbox" data-field-prop="presentable" ${field.presentable ? "checked" : ""} />
            <span class="txt">Presentable</span>
          </label>
          <button type="button" class="schema-field-remove" aria-label="Remove field">
            <i class="ri-delete-bin-line"></i>
            <span>Remove</span>
          </button>
        </div>
      </div>
    `;
    row.querySelectorAll("[data-field-prop]").forEach(el => {
      el.addEventListener("input", () => { syncSchemaBuilderToJson(); refreshFieldIcon(row); });
      el.addEventListener("change", () => { syncSchemaBuilderToJson(); refreshFieldIcon(row); });
    });
    row.querySelector(".options-trigger").addEventListener("click", (e) => {
      e.stopPropagation();
      row.classList.toggle("expanded");
    });
    row.querySelector(".schema-field-remove").addEventListener("click", () => {
      const all = collectSchemaBuilderFields();
      all.splice(idx, 1);
      renderSchemaBuilder(all);
      els.schemaEditor.value = pretty(all);
    });
    root.appendChild(row);
  });
}

function refreshFieldIcon(row) {
  const icon = row.querySelector(".field-type-icon");
  const name = row.querySelector('[data-field-prop="name"]')?.value || "";
  const type = row.querySelector('[data-field-prop="type"]')?.value || "text";
  if (icon) icon.className = `field-type-icon ${iconClassForField(name, type)}`;
}

function collectSchemaBuilderFields() {
  const root = $("schema-fields-builder");
  if (!root) return [];
  const rows = Array.from(root.querySelectorAll(".schema-field"));
  return rows.map(row => {
    const field = {};
    row.querySelectorAll("[data-field-prop]").forEach(el => {
      const key = el.dataset.fieldProp;
      if (el.type === "checkbox") {
        if (el.checked) field[key] = true;
      } else if (el.value) {
        field[key] = el.value;
      }
    });
    return field;
  });
}

function syncSchemaBuilderToJson() {
  els.schemaEditor.value = pretty(collectSchemaBuilderFields());
}

function renderSchemaIndexes(indexes) {
  const list = $("schema-indexes-list");
  const count = $("schema-index-count");
  if (!list) return;
  list.innerHTML = "";
  (indexes || []).forEach((idx) => {
    const chip = document.createElement("span");
    chip.className = "schema-index-chip";
    const label = idx.unique ? "Unique" : "Index";
    const cols = Array.isArray(idx.columns) ? idx.columns.join(", ") : (idx.name || "");
    chip.textContent = `${label}: ${cols}`;
    list.appendChild(chip);
  });
  if (count) count.textContent = `(${(indexes || []).length})`;
}

function openSchemaDrawer(createMode = false) {
  state.schemaCreateMode = createMode;
  const title = $("schema-drawer")?.querySelector(".upsert-panel-title");
  const saveBtn = $("schema-save");
  const nameInput = $("schema-coll-name");

  if (createMode) {
    if (title) title.textContent = "New collection";
    if (saveBtn) saveBtn.querySelector(".txt").textContent = "Create";
    if (nameInput) nameInput.value = "";
    renderSchemaBuilder(exampleFields().length ? JSON.parse(exampleFields()) : []);
    els.schemaEditor.value = exampleFields();
    renderSchemaIndexes([]);
  } else {
    if (!state.currentCollection) return;
    if (title) title.textContent = "Edit collection";
    if (saveBtn) saveBtn.querySelector(".txt").textContent = "Save changes";
    const fields = state.currentCollection.fields || [];
    const indexes = state.currentCollection.indexes || [];
    els.schemaEditor.value = pretty(fields);
    if (nameInput) nameInput.value = state.currentCollection.name;
    renderSchemaBuilder(fields);
    renderSchemaIndexes(indexes);
  }

  // Reset to Fields tab
  $$("[data-schema-tab]").forEach(b => b.classList.toggle("active", b.dataset.schemaTab === "fields"));
  $$("[data-schema-tab-content]").forEach(c => {
    const match = c.dataset.schemaTabContent === "fields";
    c.classList.toggle("active", match);
    c.hidden = !match;
  });
  els.schemaDrawer.classList.remove("hidden");
}
function closeSchemaDrawer() {
  els.schemaDrawer.classList.add("hidden");
}
els.schemaDrawerClose.addEventListener("click", closeSchemaDrawer);
els.schemaEditBtn.addEventListener("click", openSchemaDrawer);

const schemaAddFieldBtn = $("schema-add-field");
if (schemaAddFieldBtn) schemaAddFieldBtn.addEventListener("click", () => {
  const current = collectSchemaBuilderFields();
  current.push({ name: "", type: "text" });
  renderSchemaBuilder(current);
  els.schemaEditor.value = pretty(current);
});

// Schema drawer tab switching
$$("[data-schema-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.schemaTab;
    $$("[data-schema-tab]").forEach(b => b.classList.toggle("active", b === btn));
    $$("[data-schema-tab-content]").forEach(c => {
      const match = c.dataset.schemaTabContent === tab;
      c.classList.toggle("active", match);
      c.hidden = !match;
    });
  });
});

function openCollectionModal() {
  els.collectionFields.value = exampleFields();
  els.collectionModal.style.display = "";
  els.collectionModal.classList.remove("hidden");
  els.collectionName.focus();
}
function closeCollectionModal() {
  els.collectionModal.classList.add("hidden");
  els.collectionModal.style.display = "none";
}
els.newCollectionBtn.addEventListener("click", () => {
  if (!state.currentNamespace) return;
  openSchemaDrawer(true);
});
$$("[data-close-modal]").forEach((el) => el.addEventListener("click", closeCollectionModal));

els.newRecordBtn.addEventListener("click", () => {
  if (!state.currentCollection) return;
  openRecordDrawer(null);
});

/* ---------- DB switcher ---------- */

const dbSwitcher = $("db-switcher");
const dbMenu = $("db-menu");
function openDbMenu() {
  if (!dbSwitcher || !dbMenu) return;
  dbSwitcher.setAttribute("aria-expanded", "true");
  dbMenu.classList.remove("hidden");
}
function closeDbMenu() {
  if (!dbSwitcher || !dbMenu) return;
  dbSwitcher.setAttribute("aria-expanded", "false");
  dbMenu.classList.add("hidden");
}
function toggleDbMenu() {
  if (!dbMenu) return;
  if (dbMenu.classList.contains("hidden")) openDbMenu();
  else closeDbMenu();
}
if (dbSwitcher) dbSwitcher.addEventListener("click", toggleDbMenu);

/* Cancel button inside schema drawer */
const schemaCancelBtn = $("schema-drawer-cancel");
if (schemaCancelBtn) schemaCancelBtn.addEventListener("click", closeSchemaDrawer);

/* ---------- Sidebar: namespaces & collections ---------- */

const FOLDER_ICON = `<i class="ri-folder-line"></i>`;
const DB_ICON = `<i class="ri-database-2-line"></i>`;
const LOCK_ICON = `<i class="ri-lock-line lock"></i>`;
const KEY_ICON = `<i class="ri-key-2-line"></i>`;
const FIELD_ICON_CLASSES = {
  id: "ri-key-2-line",
  text: "ri-text",
  email: "ri-mail-line",
  url: "ri-link",
  number: "ri-hashtag",
  date: "ri-calendar-line",
  boolean: "ri-toggle-line",
  select: "ri-list-check-2",
  json: "ri-code-s-slash-line",
  relation: "ri-links-line",
  file: "ri-attachment-line",
  createdAt: "ri-calendar-event-line",
};
function iconClassForField(fieldName, fieldType) {
  if (fieldName === "id") return FIELD_ICON_CLASSES.id;
  if (fieldName === "createdAt" || fieldName === "updatedAt") return FIELD_ICON_CLASSES.createdAt;
  return FIELD_ICON_CLASSES[fieldType] || FIELD_ICON_CLASSES.text;
}
const UNUSED_FOLDER_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>`;
const DB_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="2.6"/><path d="M4 5v6c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6V5"/><path d="M4 11v6c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6v-6"/></svg>`;
const LOCK_SVG = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;

const FIELD_ICONS = {
  id: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="12" r="4"/><path d="M12 12h9l-2 2m2-2l-2-2"/></svg>`,
  text: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/></svg>`,
  email: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/></svg>`,
  url: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>`,
  number: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="9" x2="19" y2="9"/><line x1="5" y1="15" x2="19" y2="15"/><line x1="9" y1="5" x2="8" y2="19"/><line x1="16" y1="5" x2="15" y2="19"/></svg>`,
  date: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>`,
  boolean: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>`,
  select: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>`,
  json: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/></svg>`,
  relation: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><line x1="8" y1="8" x2="16" y2="16"/></svg>`,
  file: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/></svg>`,
  createdAt: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>`,
};

function iconForField(fieldName, fieldType) {
  if (fieldName === "id") return FIELD_ICONS.id;
  if (fieldName === "createdAt" || fieldName === "updatedAt") return FIELD_ICONS.createdAt;
  return FIELD_ICONS[fieldType] || FIELD_ICONS.text;
}

function renderNamespaces() {
  els.namespaceList.innerHTML = "";
  for (const ns of state.namespaces) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `db-item ${state.currentNamespace?.id === ns.id ? "active" : ""}`;
    btn.dataset.testid = `namespace-${ns.id}`;
    btn.innerHTML = `${DB_ICON}<strong>${escapeHtml(ns.displayName)}</strong><span class="mono">${escapeHtml(ns.id)}</span>`;
    btn.addEventListener("click", async () => {
      state.currentNamespace = ns;
      state.currentCollection = null;
      els.activeNamespaceName.textContent = ns.displayName;
      closeDbMenu();
      await refreshNamespace();
    });
    els.namespaceList.appendChild(btn);
  }
}

function renderCollections() {
  const query = (els.collectionSearch.value || "").trim().toLowerCase();
  els.collectionList.innerHTML = "";
  for (const coll of state.collections) {
    if (query && !coll.name.toLowerCase().includes(query) && !coll.displayName.toLowerCase().includes(query)) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `sidebar-list-item ${state.currentCollection?.name === coll.name ? "active" : ""}`;
    btn.dataset.testid = `collection-${coll.name}`;
    btn.innerHTML = `${FOLDER_ICON}<span class="txt">${escapeHtml(coll.name)}</span>`;
    btn.addEventListener("click", async () => {
      state.currentCollection = coll;
      await refreshCollection();
    });
    els.collectionList.appendChild(btn);
  }
}

els.collectionSearch.addEventListener("input", renderCollections);

/* ---------- Records table ---------- */

function renderCell(field, value) {
  if (value == null || value === "") return '<span class="cell-muted">N/A</span>';
  if (typeof value === "boolean" || field?.type === "boolean") {
    return `<span class="label ${value ? "label-success" : "label-danger"}">${value ? "True" : "False"}</span>`;
  }
  if (typeof value === "object") {
    return `<span class="cell-mono">${escapeHtml(JSON.stringify(value))}</span>`;
  }
  return escapeHtml(String(value));
}

function getRecordColumns(collection = state.currentCollection) {
  if (!collection) return [];
  return [
    { name: "id", type: "id" },
    ...collection.fields.map((f) => ({ name: f.name, type: f.type, def: f })),
    { name: "createdAt", type: "createdAt" },
  ];
}

function renderRecordRow(item, columns) {
  return `
    <tr tabindex="0" class="row-handle" data-id="${escapeHtml(item.id)}">
      ${columns.map((c, i) => {
        if (i === 0) {
          return `<td><span class="row-id"><i class="ri-key-2-line"></i>${escapeHtml(item.id)}</span></td>`;
        }
        return `<td>${renderCell(c.def, item[c.name])}</td>`;
      }).join("")}
      <td class="col-type-action min-width"><i class="ri-arrow-right-line"></i></td>
    </tr>
  `;
}

function renderRecordsPagination() {
  const total = state.recordsPaging.total;
  const limit = state.recordsPaging.limit;
  const offset = state.recordsPaging.offset;
  const count = state.records.length;
  const start = total > 0 && count > 0 ? offset + 1 : 0;
  const end = total > 0 && count > 0 ? Math.min(offset + count, total) : 0;
  if (els.recordsRange) {
    els.recordsRange.textContent = state.currentCollection
      ? `${start}-${end} of ${total}`
      : "0-0 of 0";
  }
  if (els.recordsPageSize) {
    els.recordsPageSize.value = String(limit);
    els.recordsPageSize.disabled = !state.currentCollection;
  }
  if (els.recordsPrev) {
    els.recordsPrev.disabled = !state.currentCollection || offset <= 0;
  }
  if (els.recordsNext) {
    els.recordsNext.disabled = !state.currentCollection || offset + limit >= total;
  }
}

function resetRecordsPage() {
  state.recordsPaging.offset = 0;
}

function hasActiveRecordQuery() {
  return Boolean(els.recordsFilter.value.trim() || els.recordsSort.value.trim());
}

function scheduleRecordsRefresh() {
  if (state.recordsPaging.refreshTimer) clearTimeout(state.recordsPaging.refreshTimer);
  state.recordsPaging.refreshTimer = setTimeout(() => {
    state.recordsPaging.refreshTimer = null;
    refreshRecords().catch(() => {});
  }, 200);
}

function setRecordsPageSize(value) {
  const next = Number(value);
  state.recordsPaging.limit = RECORDS_PAGE_SIZE_OPTIONS.includes(next) ? next : 50;
  resetRecordsPage();
  refreshRecords().catch(() => {});
}

function renderRecords(items = [], total = state.recordsPaging.total) {
  state.records = items;
  state.recordsPaging.total = Number.isFinite(Number(total)) ? Number(total) : items.length;
  const collection = state.currentCollection;
  if (!collection) {
    state.recordsPaging.total = 0;
    els.recordsTable.innerHTML = `<div class="empty-state">Select a collection to browse records.</div>`;
    renderRecordsPagination();
    return;
  }
  const columns = getRecordColumns(collection);
  const thead = `<thead><tr>${columns.map((c) => `<th class="col-sort col-type-${escapeHtml(c.type)} col-field-${escapeHtml(c.name)}"><span class="col-header-content"><i class="${iconClassForField(c.name, c.type)}"></i><span class="txt">${escapeHtml(c.name)}</span></span></th>`).join("")}<th class="col-type-action min-width"></th></tr></thead>`;
  const rows = items.map((item) => renderRecordRow(item, columns)).join("");
  const body = rows || `<tr><td colspan="${columns.length + 1}" class="txt-center txt-hint"><h6>No records found.</h6><button type="button" class="btn btn-secondary btn-expanded m-t-sm" onclick="document.getElementById('new-record-btn').click()">New record</button></td></tr>`;
  els.recordsTable.innerHTML = `<table>${thead}<tbody>${body}</tbody></table>`;
  renderRecordsPagination();
}

function openRecordFromTableEvent(event) {
  if (event.target.closest(".row-delete")) return;
  const tr = event.target.closest("tbody tr[data-id]");
  if (!tr || !els.recordsTable.contains(tr)) return;
  const record = state.records.find((r) => r.id === tr.dataset.id);
  if (record) openRecordDrawer(record);
}

function patchVisibleRecordRow(record) {
  if (!record?.id || !state.currentCollection) return false;
  const index = state.records.findIndex((item) => item.id === record.id);
  if (index === -1) return false;
  state.records[index] = record;
  const tr = els.recordsTable.querySelector(`tbody tr[data-id="${CSS.escape(record.id)}"]`);
  if (tr) tr.outerHTML = renderRecordRow(record, getRecordColumns());
  return true;
}

function removeVisibleRecordRow(recordId) {
  const index = state.records.findIndex((item) => item.id === recordId);
  if (index === -1) return false;
  state.records.splice(index, 1);
  const tr = els.recordsTable.querySelector(`tbody tr[data-id="${CSS.escape(recordId)}"]`);
  if (tr) tr.remove();
  state.recordsPaging.total = Math.max(0, state.recordsPaging.total - 1);
  if (state.records.length === 0) {
    renderRecords(state.records, state.recordsPaging.total);
  } else {
    renderRecordsPagination();
  }
  return true;
}

function upsertCreatedRecord(record) {
  if (!record?.id) return false;
  const existingIndex = state.records.findIndex((item) => item.id === record.id);
  if (existingIndex !== -1) state.records.splice(existingIndex, 1);
  state.records.unshift(record);
  state.records = state.records.slice(0, state.recordsPaging.limit);
  if (existingIndex === -1) state.recordsPaging.total += 1;
  renderRecords(state.records, state.recordsPaging.total);
  return true;
}

function applyRealtimeRecordEvent(event) {
  if (!event || event.namespaceId !== state.currentNamespace?.id || event.collectionName !== state.currentCollection?.name) return;
  const type = event.type || "";
  const hasQuery = hasActiveRecordQuery();
  if (hasQuery) {
    scheduleRecordsRefresh();
    return;
  }
  if (type.includes("created")) {
    if (state.recordsPaging.offset === 0 && event.record) {
      upsertCreatedRecord(event.record);
    } else {
      state.recordsPaging.total += 1;
      renderRecordsPagination();
      scheduleRecordsRefresh();
    }
    return;
  }
  if (type.includes("updated")) {
    const isVisible = state.records.some((record) => record.id === event.recordId);
    if (isVisible && (!event.record || !patchVisibleRecordRow(event.record))) {
      scheduleRecordsRefresh();
    }
    return;
  }
  if (type.includes("deleted")) {
    const removed = removeVisibleRecordRow(event.recordId);
    if (!removed) {
      state.recordsPaging.total = Math.max(0, state.recordsPaging.total - 1);
      renderRecordsPagination();
      if (state.recordsPaging.offset > 0) scheduleRecordsRefresh();
    } else if (removed && state.recordsPaging.offset + state.records.length < state.recordsPaging.total) {
      scheduleRecordsRefresh();
    }
  }
}

/* ---------- Tokens ---------- */

function renderTokens(items = []) {
  state.tokens = items;
  els.tokenList.innerHTML = "";
  for (const tok of items) {
    const item = document.createElement("div");
    item.className = `token-item ${tok.revokedAt ? "revoked" : ""}`;
    item.innerHTML = `
      <div>
        <div class="label-row">${escapeHtml(tok.label)}</div>
        <div class="scope">${escapeHtml(tok.collectionName || "namespace-wide")} · ${escapeHtml(tok.operations.join(", "))}</div>
        <span class="status">${tok.revokedAt ? `revoked ${escapeHtml(tok.revokedAt)}` : "active"}</span>
      </div>
      <button type="button" class="btn btn-sm btn-secondary" data-id="${escapeHtml(tok.id)}" ${tok.revokedAt ? "disabled" : ""}>Revoke</button>
    `;
    item.querySelector("button").addEventListener("click", async () => {
      await request(apiPath(`namespaces/${state.currentNamespace.id}/tokens/${tok.id}/revoke`), { method: "POST" });
      await refreshTokens();
    });
    els.tokenList.appendChild(item);
  }
}

/* ---------- Files ---------- */

function renderFiles(items = []) {
  state.files = items;
  els.fileList.innerHTML = "";
  for (const file of items) {
    const card = document.createElement("div");
    card.className = "file-card";
    card.innerHTML = `
      <div class="name">${escapeHtml(file.filename)}</div>
      <div class="meta">${escapeHtml(file.collectionName || "unbound")} · ${escapeHtml(String(file.sizeBytes))} bytes</div>
      <div class="actions">
        <a class="btn btn-xs btn-outline" href="${escapeHtml(file.downloadPath)}" target="_blank" rel="noreferrer">Open</a>
        <button type="button" class="btn btn-xs btn-secondary" data-id="${escapeHtml(file.id)}">Delete</button>
      </div>
    `;
    card.querySelector("button").addEventListener("click", async () => {
      await request(apiPath(`files/${file.id}`), { method: "DELETE" });
      await refreshFiles();
    });
    els.fileList.appendChild(card);
  }
}

/* ---------- Logs ---------- */

function pushEvent(event) {
  const summary = event.record?.name || event.record?.title || event.recordId || "";
  const labelVariant = event.type?.includes("created") ? "label-success" : event.type?.includes("updated") ? "label-info" : "label-danger";
  // clear empty-state placeholder on first event
  const placeholder = els.eventList.querySelector(".empty-state");
  if (placeholder) placeholder.remove();
  const node = document.createElement("div");
  node.className = "log-item";
  node.innerHTML = `
    <span class="label ${labelVariant}">${escapeHtml(event.type || "event")}</span>
    <span class="log-coll">${escapeHtml(event.collectionName || "")}</span>
    <span class="log-record">${escapeHtml(summary)}</span>
    <span class="log-time">${escapeHtml(event.at || "")}</span>
  `;
  els.eventList.prepend(node);
  const items = els.eventList.querySelectorAll(".log-item");
  items.forEach((item, index) => {
    if (index >= MAX_EVENT_LOG_ITEMS) item.remove();
  });
}

const logsClearBtn = $("logs-clear");
if (logsClearBtn) logsClearBtn.addEventListener("click", () => {
  els.eventList.innerHTML = `<div class="empty-state"><i class="ri-pulse-line"></i><p>Listening for realtime events. Create, update, or delete a record to see events stream in here.</p></div>`;
});
const filesRefreshBtn = $("files-refresh");
if (filesRefreshBtn) filesRefreshBtn.addEventListener("click", () => refreshFiles().catch(() => {}));
const tokensRefreshBtn = $("tokens-refresh");
if (tokensRefreshBtn) tokensRefreshBtn.addEventListener("click", () => refreshTokens().catch(() => {}));

/* ---------- Realtime ---------- */

function connectRealtime() {
  if (state.websocket) state.websocket.close();
  if (!state.token) return;
  const url = new URL(apiPath("realtime"), window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", state.token);
  state.websocket = new WebSocket(url);
  state.websocket.addEventListener("open", () => {
    els.liveStatus.textContent = "connected";
    subscribeRealtime();
  });
  state.websocket.addEventListener("close", () => {
    els.liveStatus.textContent = "closed";
  });
  state.websocket.addEventListener("message", (message) => {
    const payload = JSON.parse(message.data);
    if (payload.type === "event") {
      pushEvent(payload.event);
      applyRealtimeRecordEvent(payload.event);
    }
    if (payload.type === "subscribed") {
      els.liveStatus.textContent = `watching ${payload.collectionName}`;
    }
  });
}

function subscribeRealtime() {
  if (!state.websocket || state.websocket.readyState !== WebSocket.OPEN || !state.currentNamespace || !state.currentCollection) return;
  state.websocket.send(JSON.stringify({
    type: "subscribe",
    namespaceId: state.currentNamespace.id,
    collectionName: state.currentCollection.name,
  }));
}

/* ---------- Data refresh ---------- */

async function refreshNamespaces() {
  const payload = await request(apiPath("namespaces"));
  state.namespaces = payload.items;
  if (!state.currentNamespace) state.currentNamespace = state.namespaces[0] || null;
  renderNamespaces();
}

async function refreshNamespace() {
  resetRecordsPage();
  renderNamespaces();
  els.activeNamespaceName.textContent = state.currentNamespace?.displayName || "No database";
  if (!state.currentNamespace) return;
  const payload = await request(apiPath(`namespaces/${state.currentNamespace.id}/collections`));
  state.collections = payload.items;
  if (!state.currentCollection) {
    state.currentCollection = state.collections[0] || null;
  } else {
    state.currentCollection = state.collections.find((item) => item.name === state.currentCollection.name) || state.collections[0] || null;
  }
  renderCollections();
  await Promise.all([refreshCollection(), refreshTokens(), refreshFiles()]);
}

async function refreshCollection() {
  resetRecordsPage();
  renderCollections();
  const collection = state.currentCollection;
  els.activeCollectionName.textContent = collection?.displayName || "Select one";
  if (!collection) {
    els.schemaTitle.textContent = "Collection schema";
    renderRecords([]);
    return;
  }
  const payload = await request(apiPath(`namespaces/${state.currentNamespace.id}/collections/${collection.name}`));
  state.currentCollection = payload;
  els.schemaTitle.textContent = payload.displayName;
  renderCollections();
  await refreshRecords();
  subscribeRealtime();
}

async function refreshRecords() {
  if (!state.currentNamespace || !state.currentCollection) return;
  const seq = ++state.recordsPaging.requestSeq;
  const params = new URLSearchParams();
  if (els.recordsFilter.value.trim()) params.set("filter", els.recordsFilter.value.trim());
  if (els.recordsSort.value.trim()) params.set("sort", els.recordsSort.value.trim());
  params.set("limit", String(state.recordsPaging.limit));
  params.set("offset", String(state.recordsPaging.offset));
  const qs = params.toString();
  const payload = await request(
    apiPath(`namespaces/${state.currentNamespace.id}/collections/${state.currentCollection.name}/records${qs ? `?${qs}` : ""}`)
  );
  if (seq !== state.recordsPaging.requestSeq) return;
  const total = Number(payload.total ?? payload.items?.length ?? 0);
  if (total > 0 && state.recordsPaging.offset >= total) {
    state.recordsPaging.offset = Math.max(0, Math.floor((total - 1) / state.recordsPaging.limit) * state.recordsPaging.limit);
    await refreshRecords();
    return;
  }
  renderRecords(payload.items, total);
}

async function refreshTokens() {
  if (!state.currentNamespace) return;
  const payload = await request(apiPath(`namespaces/${state.currentNamespace.id}/tokens`));
  renderTokens(payload.items);
}

async function refreshFiles() {
  if (!state.currentNamespace) return;
  const payload = await request(apiPath(`namespaces/${state.currentNamespace.id}/files`));
  renderFiles(payload.items);
}

async function refreshSettings() {
  const [health, settings] = await Promise.all([
    request(apiPath("health")),
    request(apiPath("settings")),
  ]);
  els.settingsOutput.textContent = pretty({ health, settings });
  const rowsEl = $("settings-rows");
  if (rowsEl) {
    const merged = { ...health, ...settings };
    rowsEl.innerHTML = "";
    for (const [key, value] of Object.entries(merged)) {
      const row = document.createElement("div");
      row.className = "settings-row";
      row.innerHTML = `<span class="settings-key">${escapeHtml(key)}</span><span class="settings-value">${escapeHtml(typeof value === "object" ? JSON.stringify(value) : String(value))}</span>`;
      rowsEl.appendChild(row);
    }
  }
  const urlEl = $("settings-url");
  if (urlEl && settings?.host && settings?.port) {
    urlEl.value = `http://${settings.host}:${settings.port}`;
  }
}

/* ---------- Event handlers ---------- */

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    els.loginError.textContent = "";
    const payload = await request(apiPath("auth/admin/login"), {
      method: "POST",
      body: JSON.stringify({
        email: els.loginEmail.value,
        password: els.loginPassword.value,
      }),
    });
    state.token = payload.accessToken;
    els.loginView.classList.add("hidden");
    els.appView.classList.remove("hidden");
    setView("collections");
    connectRealtime();
    await refreshNamespaces();
    await refreshNamespace();
  } catch (error) {
    els.loginError.textContent = error.message;
  }
});

els.logoutBtn.addEventListener("click", () => {
  if (state.websocket) state.websocket.close();
  state.token = "";
  els.appView.classList.add("hidden");
  els.loginView.classList.remove("hidden");
});

/* ---------- Theme toggle ---------- */

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(CLAW_DB_THEME_STORAGE_KEY, theme);
}

(function initTheme() {
  const stored = localStorage.getItem(CLAW_DB_THEME_STORAGE_KEY);
  if (stored) {
    applyTheme(stored);
  } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
    applyTheme("light");
  }
})();

$("theme-toggle").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "light" ? "dark" : "light");
});

els.namespaceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await request(apiPath("namespaces"), {
      method: "POST",
      body: JSON.stringify({
        id: els.namespaceId.value,
        displayName: els.namespaceDisplayName.value,
      }),
    });
    els.namespaceId.value = "";
    els.namespaceDisplayName.value = "";
    await refreshNamespaces();
    await refreshNamespace();
  } catch (error) {
    alert(error.message);
  }
});

els.collectionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentNamespace) return;
  try {
    await request(apiPath(`namespaces/${state.currentNamespace.id}/collections`), {
      method: "POST",
      body: JSON.stringify({
        name: els.collectionName.value,
        displayName: els.collectionDisplayName.value,
        fields: JSON.parse(els.collectionFields.value || "[]"),
        indexes: [],
      }),
    });
    els.collectionName.value = "";
    els.collectionDisplayName.value = "";
    els.collectionFields.value = exampleFields();
    closeCollectionModal();
    await refreshNamespace();
  } catch (error) {
    alert(error.message);
  }
});

els.schemaSave.addEventListener("click", async () => {
  if (!state.currentNamespace) return;
  try {
    const fields = JSON.parse(els.schemaEditor.value || "[]");
    const nameInput = $("schema-coll-name");
    const collName = nameInput?.value?.trim() || "";

    if (state.schemaCreateMode) {
      // Create mode
      if (!collName) { alert("Collection name is required"); return; }
      await request(apiPath(`namespaces/${state.currentNamespace.id}/collections`), {
        method: "POST",
        body: JSON.stringify({
          name: collName,
          displayName: collName.charAt(0).toUpperCase() + collName.slice(1),
          fields,
          indexes: [],
        }),
      });
      closeSchemaDrawer();
      await refreshNamespace();
    } else {
      // Edit mode
      if (!state.currentCollection) return;
      await request(apiPath(`namespaces/${state.currentNamespace.id}/collections/${state.currentCollection.name}`), {
        method: "PATCH",
        body: JSON.stringify({ fields }),
      });
      closeSchemaDrawer();
      await refreshCollection();
    }
  } catch (error) {
    alert(error.message);
  }
});

els.recordsRefresh.addEventListener("click", () => refreshRecords().catch(() => {}));
els.recordsFilter.addEventListener("change", () => {
  resetRecordsPage();
  refreshRecords().catch(() => {});
});
els.recordsSort.addEventListener("change", () => {
  resetRecordsPage();
  refreshRecords().catch(() => {});
});
els.recordsTable.addEventListener("click", openRecordFromTableEvent);
els.recordsTable.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    openRecordFromTableEvent(event);
  }
});
if (els.recordsPageSize) {
  els.recordsPageSize.addEventListener("change", () => setRecordsPageSize(els.recordsPageSize.value));
}
if (els.recordsPrev) {
  els.recordsPrev.addEventListener("click", () => {
    state.recordsPaging.offset = Math.max(0, state.recordsPaging.offset - state.recordsPaging.limit);
    refreshRecords().catch(() => {});
  });
}
if (els.recordsNext) {
  els.recordsNext.addEventListener("click", () => {
    if (state.recordsPaging.offset + state.recordsPaging.limit >= state.recordsPaging.total) return;
    state.recordsPaging.offset += state.recordsPaging.limit;
    refreshRecords().catch(() => {});
  });
}

els.recordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentNamespace || !state.currentCollection) return;
  try {
    // Merge dynamic fields with raw JSON. Raw JSON takes precedence (fallback for tests).
    const dynamicData = collectDynamicFields() || {};
    const jsonData = JSON.parse(els.recordData.value || "{}");
    const payload = { ...dynamicData, ...jsonData };
    const editingRecord = Boolean(els.recordId.value);
    if (editingRecord) {
      await request(apiPath(`namespaces/${state.currentNamespace.id}/collections/${state.currentCollection.name}/records/${els.recordId.value}`), {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await request(apiPath(`namespaces/${state.currentNamespace.id}/collections/${state.currentCollection.name}/records`), {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    els.recordId.value = "";
    els.recordData.value = exampleRecord();
    closeRecordDrawer();
    if (!editingRecord) resetRecordsPage();
    await refreshRecords();
  } catch (error) {
    alert(error.message);
  }
});

els.recordReset.addEventListener("click", () => {
  els.recordId.value = "";
  els.recordData.value = exampleRecord();
});

els.tokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentNamespace) return;
  try {
    const payload = await request(apiPath(`namespaces/${state.currentNamespace.id}/tokens`), {
      method: "POST",
      body: JSON.stringify({
        label: els.tokenLabel.value,
        collectionName: els.tokenCollection.value || undefined,
        operations: els.tokenOperations.value.split(",").map((entry) => entry.trim()).filter(Boolean),
      }),
    });
    els.tokenOutput.textContent = pretty(payload);
    els.tokenLabel.value = "";
    els.tokenCollection.value = "";
    await refreshTokens();
  } catch (error) {
    alert(error.message);
  }
});

els.fileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentNamespace || !els.fileInput.files[0]) return;
  try {
    const form = new FormData();
    form.set("namespaceId", state.currentNamespace.id);
    if (state.currentCollection) form.set("collectionName", state.currentCollection.name);
    if (els.fileRecordId.value) form.set("recordId", els.fileRecordId.value);
    form.set("file", els.fileInput.files[0]);
    await request(apiPath("files"), { method: "POST", body: form });
    els.fileInput.value = "";
    els.fileRecordId.value = "";
    await refreshFiles();
  } catch (error) {
    alert(error.message);
  }
});

els.settingsRefresh.addEventListener("click", () => refreshSettings().catch(() => {}));

/* ---------- Init ---------- */

els.collectionFields.value = exampleFields();
els.recordData.value = exampleRecord();
setView("collections");
