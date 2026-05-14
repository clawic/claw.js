const CLAW_DB_THEME_STORAGE_KEY = "claw-db-theme";
const CLAW_PUBLIC_API_PREFIX = "/v" + "1";
function clawApiPath(path = "") {
  const suffix = String(path).replace(/^\/+/, "");
  return suffix ? CLAW_PUBLIC_API_PREFIX + "/" + suffix : CLAW_PUBLIC_API_PREFIX;
}
/* =====================================================
   ClawJS Database admin UI
   SPA with rail + sidebar + panes + drawers
   ===================================================== */

const state = {
  token: "",
  view: "collections",
  namespaces: [],
  collections: [],
  currentNamespace: null,
  currentCollection: null,
  records: [],
  tokens: [],
  files: [],
  websocket: null,
  schemaCreateMode: false,
  schemaRules: null,
};

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const els = {
  loginView: $("login-view"),
  appView: $("app-view"),
  shell: $("app-view"),
  loginForm: $("login-form"),
  loginEmail: $("login-email"),
  loginPassword: $("login-password"),
  loginError: $("login-error"),
  loginDevHint: $("login-dev-hint"),
  logoutBtn: $("logout-btn"),

  mobileMenuBtn: $("mobile-menu-btn"),
  mobileListBtn: $("mobile-list-btn"),
  sidebarCloseBtn: $("page-sidebar-close"),

  namespaceList: $("namespace-list"),
  namespaceForm: $("namespace-form"),
  namespaceId: $("namespace-id"),
  namespaceDisplayName: $("namespace-display-name"),
  dbNewToggle: $("db-new-toggle"),
  dbMenuClose: $("db-menu-close"),

  collectionList: $("collection-list"),
  collectionListEmpty: $("collection-list-empty"),
  collectionSearch: $("collection-search"),
  newCollectionBtn: $("new-collection-btn"),

  activeNamespaceName: $("active-namespace-name"),
  activeCollectionName: $("active-collection-name"),
  schemaTitle: $("schema-title"),
  schemaEditBtn: $("schema-edit-btn"),
  newRecordBtn: $("new-record-btn"),
  recordsFilter: $("records-filter"),
  recordsSort: $("records-sort"),
  recordsRefresh: $("records-refresh"),
  recordsTable: $("records-table"),
  recordsFooter: $("records-footer"),
  recordsCount: $("records-count"),

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
  schemaDrawerCancel: $("schema-drawer-cancel"),
  schemaEditor: $("schema-editor"),
  schemaSave: $("schema-save"),
  schemaFieldsEmpty: $("schema-fields-empty"),

  liveStatus: $("live-status"),
  eventList: $("event-list"),

  fileForm: $("file-form"),
  fileInput: $("file-input"),
  fileDropzone: $("file-dropzone"),
  fileDropzoneTitle: $("dropzone-title"),
  fileDropzoneSub: $("dropzone-sub"),
  fileSubmit: $("file-submit"),
  fileRecordId: $("file-record-id"),
  fileList: $("file-list"),

  tokenForm: $("token-form"),
  tokenLabel: $("token-label"),
  tokenCollection: $("token-collection"),
  tokenScopes: $("token-scopes"),
  tokenExpiry: $("token-expiry"),
  issuedTokenCard: $("issued-token-card"),
  tokenList: $("token-list"),

  settingsRefresh: $("settings-refresh"),
  settingsOutput: $("settings-output"),
  settingsName: $("settings-name"),
  settingsUrl: $("settings-url"),
  settingsHealthRows: $("settings-health-rows"),
  settingsPathsRows: $("settings-paths-rows"),
  settingsHealthPill: $("settings-health-pill"),

  toastRoot: $("toast-root"),

  confirmDialog: $("confirm-dialog"),
  confirmTitle: $("confirm-title"),
  confirmBody: $("confirm-body"),
  confirmOk: $("confirm-ok"),
  confirmTypedWrap: $("confirm-typed-wrap"),
  confirmTyped: $("confirm-typed"),
  confirmTypedSample: $("confirm-typed-sample"),
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

const redactPath = (value) => {
  if (typeof value !== "string") return value;
  return value.replace(/\/Users\/[^/]+/g, "~").replace(/\/home\/[^/]+/g, "~");
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
    const err = new Error(typeof payload === "string" ? payload : (payload.error || JSON.stringify(payload)));
    err.status = response.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

/* ---------- Toasts ---------- */

function toast(message, { variant = "info", timeout = 4200 } = {}) {
  if (!els.toastRoot) return;
  const node = document.createElement("div");
  node.className = `toast toast-${variant}`;
  node.setAttribute("role", variant === "error" ? "alert" : "status");
  const icon =
    variant === "success" ? "ri-check-line" :
    variant === "error"   ? "ri-error-warning-line" :
    variant === "warn"    ? "ri-alert-line" :
                            "ri-information-line";
  node.innerHTML = `
    <i class="${icon}"></i>
    <div class="toast-body">${escapeHtml(message)}</div>
    <button type="button" class="toast-close" aria-label="Dismiss">
      <i class="ri-close-line"></i>
    </button>
  `;
  const close = () => {
    node.classList.add("leaving");
    node.addEventListener("transitionend", () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 500);
  };
  node.querySelector(".toast-close").addEventListener("click", close);
  if (timeout) setTimeout(close, timeout);
  els.toastRoot.appendChild(node);
}

const toastSuccess = (msg) => toast(msg, { variant: "success" });
const toastError   = (msg) => toast(msg, { variant: "error", timeout: 6000 });
const toastWarn    = (msg) => toast(msg, { variant: "warn" });

/* ---------- Confirm dialog ---------- */

function confirmDialog({ title = "Are you sure?", body = "", confirmText = "Confirm", typedConfirm = null, danger = true } = {}) {
  return new Promise((resolve) => {
    els.confirmTitle.textContent = title;
    els.confirmBody.textContent = body;
    els.confirmOk.querySelector(".txt").textContent = confirmText;
    els.confirmOk.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;
    if (typedConfirm) {
      els.confirmTypedWrap.hidden = false;
      els.confirmTypedSample.textContent = typedConfirm;
      els.confirmTyped.value = "";
      els.confirmOk.disabled = true;
      const onInput = () => { els.confirmOk.disabled = els.confirmTyped.value.trim() !== typedConfirm; };
      els.confirmTyped.addEventListener("input", onInput);
      els.confirmDialog._onInput = onInput;
    } else {
      els.confirmTypedWrap.hidden = true;
      els.confirmOk.disabled = false;
    }
    els.confirmDialog.classList.remove("hidden");
    setTimeout(() => {
      (typedConfirm ? els.confirmTyped : els.confirmOk).focus();
    }, 30);

    const cleanup = () => {
      els.confirmDialog.classList.add("hidden");
      els.confirmOk.removeEventListener("click", onOk);
      if (els.confirmDialog._onInput) {
        els.confirmTyped.removeEventListener("input", els.confirmDialog._onInput);
        els.confirmDialog._onInput = null;
      }
      $$("[data-close-confirm]", els.confirmDialog).forEach(el => el.removeEventListener("click", onCancel));
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    els.confirmOk.addEventListener("click", onOk);
    $$("[data-close-confirm]", els.confirmDialog).forEach(el => el.addEventListener("click", onCancel));
  });
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
  closeMobileSidebar();
  if (view === "settings") refreshSettings().catch(() => {});
  if (view === "tokens") refreshTokens().catch(() => {});
  if (view === "files") refreshFiles().catch(() => {});
}

$$(".menu-item[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

/* ---------- Mobile sidebar sheet ---------- */

function openMobileSidebar() {
  els.shell.classList.add("sidebar-open");
}
function closeMobileSidebar() {
  els.shell.classList.remove("sidebar-open");
}
els.mobileMenuBtn?.addEventListener("click", openMobileSidebar);
els.mobileListBtn?.addEventListener("click", openMobileSidebar);
els.sidebarCloseBtn?.addEventListener("click", closeMobileSidebar);

/* ---------- Drawer / modal ---------- */

function buildFieldInput(field, value) {
  const wrapper = document.createElement("div");
  wrapper.className = `form-field ${field.required ? "required" : ""}`;

  const labelWrap = document.createElement("label");
  labelWrap.className = "field-label-group";
  labelWrap.innerHTML = `
    <span class="field-label">${escapeHtml(field.name)}</span>
    <span class="field-type-pill">${escapeHtml(field.type || "text")}</span>
    ${field.required ? `<span class="field-required-mark">required</span>` : ""}
  `;
  wrapper.appendChild(labelWrap);

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
    input.placeholder = field.placeholder || "";
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
  const collName = collection?.displayName || collection?.name || "record";
  els.drawerTitle.textContent = record ? `Edit ${collName} record` : `New ${collName} record`;

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
  // focus the first input for keyboarders
  setTimeout(() => container.querySelector("input,textarea,select")?.focus(), 40);
}
function closeRecordDrawer() {
  els.recordDrawer.classList.add("hidden");
}
els.drawerClose.addEventListener("click", closeRecordDrawer);
$("record-drawer-backdrop")?.addEventListener("click", closeRecordDrawer);

const FIELD_TYPE_OPTIONS = ["text", "email", "url", "number", "date", "boolean", "select", "json", "relation", "file"];
const TYPE_LABELS = {
  text: "Text", email: "Email", url: "URL", number: "Number",
  date: "Date", boolean: "Boolean", select: "Select", json: "JSON",
  relation: "Relation", file: "File",
};

function renderSchemaBuilder(fields) {
  const root = $("schema-fields-builder");
  if (!root) return;
  root.innerHTML = "";
  if (els.schemaFieldsEmpty) els.schemaFieldsEmpty.hidden = fields.length > 0;
  fields.forEach((field, idx) => {
    const row = document.createElement("div");
    row.className = "schema-field";
    row.dataset.index = String(idx);
    const typeOptions = FIELD_TYPE_OPTIONS.map(t => `<option value="${t}" ${t === (field.type || "text") ? "selected" : ""}>${TYPE_LABELS[t] || t}</option>`).join("");
    row.innerHTML = `
      <div class="schema-field-header">
        <i class="field-type-icon ${iconClassForField(field.name, field.type)}"></i>
        <input type="text" class="schema-field-name-input" data-field-prop="name" placeholder="Field name" value="${escapeHtml(field.name || "")}" />
        <span class="schema-field-type-label">${escapeHtml(TYPE_LABELS[field.type || "text"] || field.type || "text")}</span>
        <div class="field-labels">
          ${field.required ? `<span class="label label-success">Required</span>` : ""}
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
            <span class="txt">Required</span>
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
      el.addEventListener("input", () => { syncSchemaBuilderToJson(); refreshFieldRow(row); });
      el.addEventListener("change", () => { syncSchemaBuilderToJson(); refreshFieldRow(row); });
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

function refreshFieldRow(row) {
  const icon = row.querySelector(".field-type-icon");
  const name = row.querySelector('[data-field-prop="name"]')?.value || "";
  const type = row.querySelector('[data-field-prop="type"]')?.value || "text";
  if (icon) icon.className = `field-type-icon ${iconClassForField(name, type)}`;
  const label = row.querySelector(".schema-field-type-label");
  if (label) label.textContent = TYPE_LABELS[type] || type;
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

/* ---------- Rules ---------- */

const RULE_TEMPLATES = [
  { id: "public", label: "Public", expr: "" },
  { id: "authenticated", label: "Authenticated users", expr: '@request.auth.id != ""' },
  { id: "owner", label: "Owner only", expr: "record.owner = @request.auth.id" },
  { id: "admin", label: "Admin only", expr: "@request.auth.isAdmin = true" },
];

function renderRules(rules) {
  const keys = ["list", "view", "create", "update", "delete"];
  for (const key of keys) {
    const input = document.querySelector(`[data-rule-input="${key}"]`);
    if (!input) continue;
    input.value = rules && rules[key] != null ? rules[key] : "";
  }
}

function collectRules() {
  const keys = ["list", "view", "create", "update", "delete"];
  const out = {};
  for (const key of keys) {
    const input = document.querySelector(`[data-rule-input="${key}"]`);
    out[key] = input ? input.value.trim() : "";
  }
  return out;
}

$$(".rule-template-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const target = btn.dataset.templateTarget;
    const existing = btn.parentElement.parentElement.querySelector(".rule-template-menu");
    if (existing) { existing.remove(); return; }
    const menu = document.createElement("div");
    menu.className = "rule-template-menu";
    menu.innerHTML = RULE_TEMPLATES.map(t =>
      `<button type="button" class="rule-template-option" data-expr="${escapeHtml(t.expr)}" data-id="${t.id}">
         <strong>${escapeHtml(t.label)}</strong>
         <code>${t.expr ? escapeHtml(t.expr) : "empty = public"}</code>
       </button>`
    ).join("");
    btn.parentElement.parentElement.appendChild(menu);
    menu.querySelectorAll(".rule-template-option").forEach((opt) => {
      opt.addEventListener("click", () => {
        const expr = opt.dataset.expr || "";
        const input = document.querySelector(`[data-rule-input="${target}"]`);
        if (input) input.value = expr;
        menu.remove();
      });
    });
    document.addEventListener("click", function clickAway(e2) {
      if (!menu.contains(e2.target) && e2.target !== btn) {
        menu.remove();
        document.removeEventListener("click", clickAway);
      }
    }, { capture: true });
  });
});

/* ---------- Schema drawer ---------- */

function openSchemaDrawer(createMode = false) {
  state.schemaCreateMode = createMode;
  const title = $("schema-drawer")?.querySelector(".upsert-panel-title");
  const saveBtn = $("schema-save");
  const nameInput = $("schema-coll-name");

  if (createMode) {
    if (title) title.textContent = "New collection";
    if (saveBtn) saveBtn.querySelector(".txt").textContent = "Create collection";
    if (nameInput) nameInput.value = "";
    renderSchemaBuilder(JSON.parse(exampleFields()));
    els.schemaEditor.value = exampleFields();
    renderSchemaIndexes([]);
    renderRules({});
    setOptionsTab(null);
  } else {
    if (!state.currentCollection) return;
    if (title) title.textContent = "Edit collection";
    if (saveBtn) saveBtn.querySelector(".txt").textContent = "Save changes";
    const fields = state.currentCollection.fields || [];
    const indexes = state.currentCollection.indexes || [];
    const rules = state.currentCollection.rules || {};
    els.schemaEditor.value = pretty(fields);
    if (nameInput) nameInput.value = state.currentCollection.name;
    renderSchemaBuilder(fields);
    renderSchemaIndexes(indexes);
    renderRules(rules);
    setOptionsTab(state.currentCollection);
  }

  $$("[data-schema-tab]").forEach(b => b.classList.toggle("active", b.dataset.schemaTab === "fields"));
  $$("[data-schema-tab-content]").forEach(c => {
    const match = c.dataset.schemaTabContent === "fields";
    c.classList.toggle("active", match);
    c.hidden = !match;
  });
  els.schemaDrawer.classList.remove("hidden");
  setTimeout(() => nameInput?.focus(), 40);
}
function closeSchemaDrawer() {
  els.schemaDrawer.classList.add("hidden");
}
function setOptionsTab(collection) {
  const idInput = $("option-collection-id");
  const systemEl = $("option-system");
  const deleteBtn = $("option-delete");
  if (idInput) idInput.value = collection?.id || "";
  if (systemEl) systemEl.textContent = collection?.system ? "Yes" : "No";
  if (deleteBtn) deleteBtn.disabled = !collection || collection.system;
}
$("option-copy-id")?.addEventListener("click", () => {
  const idInput = $("option-collection-id");
  if (!idInput?.value) return;
  navigator.clipboard?.writeText(idInput.value).then(() => toastSuccess("Collection ID copied"));
});
$("option-delete")?.addEventListener("click", async () => {
  if (!state.currentCollection || !state.currentNamespace) return;
  const name = state.currentCollection.name;
  const ok = await confirmDialog({
    title: `Delete "${name}"?`,
    body: "This removes the collection schema and every record inside it. The action cannot be undone.",
    confirmText: "Delete collection",
    typedConfirm: name,
  });
  if (!ok) return;
  try {
    await request(clawApiPath(`namespaces/${state.currentNamespace.id}/collections/${name}`), { method: "DELETE" });
    closeSchemaDrawer();
    toastSuccess(`Collection "${name}" deleted`);
    state.currentCollection = null;
    await refreshNamespace();
  } catch (error) {
    toastError(`Could not delete collection: ${error.message}`);
  }
});
els.schemaDrawerClose.addEventListener("click", closeSchemaDrawer);
els.schemaDrawerCancel?.addEventListener("click", closeSchemaDrawer);
$("schema-drawer-backdrop")?.addEventListener("click", closeSchemaDrawer);
els.schemaEditBtn.addEventListener("click", () => openSchemaDrawer(false));

const schemaAddFieldBtn = $("schema-add-field");
if (schemaAddFieldBtn) schemaAddFieldBtn.addEventListener("click", () => {
  const current = collectSchemaBuilderFields();
  current.push({ name: "", type: "text" });
  renderSchemaBuilder(current);
  els.schemaEditor.value = pretty(current);
  setTimeout(() => {
    const lastRow = document.querySelector(".schema-field:last-of-type .schema-field-name-input");
    lastRow?.focus();
  }, 40);
});

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

els.newCollectionBtn.addEventListener("click", () => {
  if (!state.currentNamespace) {
    toastWarn("Create or pick a database first.");
    return;
  }
  openSchemaDrawer(true);
});

els.newRecordBtn.addEventListener("click", () => {
  if (!state.currentCollection) {
    toastWarn("Pick a collection to add records to.");
    return;
  }
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
  els.namespaceForm?.classList.add("hidden");
  els.dbNewToggle?.classList.remove("active");
}
function toggleDbMenu() {
  if (!dbMenu) return;
  if (dbMenu.classList.contains("hidden")) openDbMenu();
  else closeDbMenu();
}
dbSwitcher?.addEventListener("click", toggleDbMenu);
els.dbMenuClose?.addEventListener("click", closeDbMenu);
document.addEventListener("click", (e) => {
  if (!dbMenu || dbMenu.classList.contains("hidden")) return;
  if (!dbMenu.contains(e.target) && !dbSwitcher.contains(e.target)) closeDbMenu();
});
els.dbNewToggle?.addEventListener("click", () => {
  els.namespaceForm?.classList.toggle("hidden");
  els.dbNewToggle?.classList.toggle("active");
  if (!els.namespaceForm?.classList.contains("hidden")) {
    setTimeout(() => els.namespaceId?.focus(), 40);
  }
});

/* ---------- Global ESC ---------- */

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!els.recordDrawer.classList.contains("hidden")) { closeRecordDrawer(); return; }
  if (!els.schemaDrawer.classList.contains("hidden")) { closeSchemaDrawer(); return; }
  if (!els.confirmDialog.classList.contains("hidden")) { els.confirmDialog.classList.add("hidden"); return; }
  if (dbMenu && !dbMenu.classList.contains("hidden")) { closeDbMenu(); return; }
  if (els.shell.classList.contains("sidebar-open")) { closeMobileSidebar(); return; }
});

/* ---------- Sidebar: namespaces & collections ---------- */

const FOLDER_ICON = `<i class="ri-folder-line"></i>`;
const DB_ICON = `<i class="ri-database-2-line"></i>`;
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

function renderNamespaces() {
  els.namespaceList.innerHTML = "";
  for (const ns of state.namespaces) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `db-item ${state.currentNamespace?.id === ns.id ? "active" : ""}`;
    btn.dataset.testid = `namespace-${ns.id}`;
    const isActive = state.currentNamespace?.id === ns.id;
    const showId = ns.id !== ns.displayName;
    btn.innerHTML = `
      <span class="db-item-name">${DB_ICON}<strong>${escapeHtml(ns.displayName)}</strong>${showId ? `<span class="mono">${escapeHtml(ns.id)}</span>` : ""}</span>
      ${isActive ? `<i class="ri-check-line db-item-check"></i>` : ""}
    `;
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
  let shown = 0;
  for (const coll of state.collections) {
    if (query && !coll.name.toLowerCase().includes(query) && !coll.displayName.toLowerCase().includes(query)) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `sidebar-list-item ${state.currentCollection?.name === coll.name ? "active" : ""}`;
    btn.dataset.testid = `collection-${coll.name}`;
    btn.innerHTML = `${FOLDER_ICON}<span class="txt">${escapeHtml(coll.name)}</span>`;
    btn.addEventListener("click", async () => {
      state.currentCollection = coll;
      closeMobileSidebar();
      await refreshCollection();
    });
    els.collectionList.appendChild(btn);
    shown += 1;
  }
  if (els.collectionListEmpty) els.collectionListEmpty.hidden = shown > 0;
}

els.collectionSearch.addEventListener("input", renderCollections);

/* ---------- Records table ---------- */

function renderCell(field, value) {
  if (value == null || value === "") return '<span class="cell-muted">—</span>';
  if (typeof value === "boolean" || field?.type === "boolean") {
    return `<span class="label ${value ? "label-success" : "label-danger"}">${value ? "True" : "False"}</span>`;
  }
  if (typeof value === "object") {
    return `<span class="cell-mono">${escapeHtml(JSON.stringify(value))}</span>`;
  }
  const str = String(value);
  return `<span class="cell-value" title="${escapeHtml(str)}">${escapeHtml(str)}</span>`;
}

function renderRecords(items = []) {
  state.records = items;
  const collection = state.currentCollection;
  if (!collection) {
    els.recordsTable.innerHTML = `
      <div class="empty-state large">
        <i class="ri-database-2-line"></i>
        <p class="empty-title">Pick a collection</p>
        <p class="empty-sub">Select one on the left to browse its records, or create a new collection to get started.</p>
      </div>`;
    els.recordsFooter.classList.add("hidden");
    return;
  }
  const columns = [
    { name: "id", type: "id" },
    ...collection.fields.map((f) => ({ name: f.name, type: f.type, def: f })),
    { name: "createdAt", type: "createdAt" },
  ];
  const thead = `<thead><tr>${columns.map((c) => `<th class="col-sort col-type-${escapeHtml(c.type)} col-field-${escapeHtml(c.name)}"><span class="col-header-content"><i class="${iconClassForField(c.name, c.type)}"></i><span class="txt">${escapeHtml(c.name)}</span></span></th>`).join("")}<th class="col-type-action min-width"></th></tr></thead>`;
  const rows = items.map((item) => `
    <tr tabindex="0" class="row-handle" data-id="${escapeHtml(item.id)}">
      ${columns.map((c, i) => {
        if (i === 0) {
          return `<td><span class="row-id" title="${escapeHtml(item.id)}"><i class="ri-key-2-line"></i>${escapeHtml(item.id)}</span></td>`;
        }
        return `<td>${renderCell(c.def, item[c.name])}</td>`;
      }).join("")}
      <td class="col-type-action min-width"><i class="ri-arrow-right-line"></i></td>
    </tr>
  `).join("");
  const body = rows || `
    <tr><td colspan="${columns.length + 1}">
      <div class="empty-state">
        <i class="ri-inbox-line"></i>
        <p class="empty-title">No records yet</p>
        <p class="empty-sub">Click "New record" above to add your first entry to <code>${escapeHtml(collection.name)}</code>.</p>
      </div>
    </td></tr>
  `;
  els.recordsTable.innerHTML = `<div class="table-scroll"><table>${thead}<tbody>${body}</tbody></table></div>`;
  els.recordsTable.querySelectorAll("tbody tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", (event) => {
      if (event.target.closest(".row-delete")) return;
      const record = state.records.find((r) => r.id === tr.dataset.id);
      if (record) openRecordDrawer(record);
    });
  });
  if (items.length) {
    els.recordsFooter.classList.remove("hidden");
    els.recordsCount.textContent = `${items.length} record${items.length === 1 ? "" : "s"}`;
  } else {
    els.recordsFooter.classList.add("hidden");
  }
}

/* ---------- Tokens ---------- */

function maskToken(token) {
  if (!token || typeof token !== "string") return "";
  if (token.length <= 12) return "•".repeat(token.length);
  return `${token.slice(0, 8)}${"•".repeat(Math.max(10, token.length - 16))}${token.slice(-4)}`;
}

function renderIssuedToken(payload) {
  if (!payload || !els.issuedTokenCard) return;
  const tokenStr = payload.token || payload.accessToken || "";
  const label = payload.label || "New token";
  const scopes = payload.operations || [];
  const expiresAt = payload.expiresAt || null;
  els.issuedTokenCard.classList.remove("hidden");
  els.issuedTokenCard.innerHTML = `
    <div class="issued-token-head">
      <i class="ri-key-fill"></i>
      <div>
        <strong>Token issued</strong>
        <p class="txt-hint m-0">Store this value now. For security we never show it again after you leave this page.</p>
      </div>
      <button type="button" class="icon-btn icon-btn-sm" id="issued-token-dismiss" aria-label="Dismiss">
        <i class="ri-close-line"></i>
      </button>
    </div>
    <div class="issued-token-row">
      <span class="issued-token-label">${escapeHtml(label)}</span>
      ${expiresAt ? `<span class="issued-token-expiry">Expires ${escapeHtml(expiresAt)}</span>` : `<span class="issued-token-expiry">No expiry</span>`}
    </div>
    <div class="issued-token-value">
      <code class="mono" id="issued-token-text" data-masked="true" data-full="${escapeHtml(tokenStr)}">${escapeHtml(maskToken(tokenStr))}</code>
      <button type="button" class="btn btn-sm btn-transparent" id="issued-token-reveal">
        <i class="ri-eye-line"></i>
        <span>Reveal</span>
      </button>
      <button type="button" class="btn btn-sm btn-primary" id="issued-token-copy">
        <i class="ri-file-copy-line"></i>
        <span>Copy</span>
      </button>
    </div>
    ${scopes.length ? `<div class="issued-token-scopes">${scopes.map(s => `<span class="chip">${escapeHtml(s)}</span>`).join("")}</div>` : ""}
  `;
  $("issued-token-dismiss").addEventListener("click", () => {
    els.issuedTokenCard.classList.add("hidden");
    els.issuedTokenCard.innerHTML = "";
  });
  const textEl = $("issued-token-text");
  $("issued-token-reveal").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    const masked = textEl.dataset.masked === "true";
    textEl.textContent = masked ? textEl.dataset.full : maskToken(textEl.dataset.full);
    textEl.dataset.masked = masked ? "false" : "true";
    btn.querySelector("span").textContent = masked ? "Hide" : "Reveal";
    btn.querySelector("i").className = masked ? "ri-eye-off-line" : "ri-eye-line";
  });
  $("issued-token-copy").addEventListener("click", () => {
    navigator.clipboard?.writeText(tokenStr).then(() => toastSuccess("Token copied to clipboard"));
  });
  els.issuedTokenCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderTokens(items = []) {
  state.tokens = items;
  els.tokenList.innerHTML = "";
  if (!items.length) {
    els.tokenList.innerHTML = `
      <div class="empty-state">
        <i class="ri-key-2-line"></i>
        <p class="empty-title">No active tokens</p>
        <p class="empty-sub">Issue a token above to let scripts, CI, or external services talk to this database.</p>
      </div>`;
    return;
  }
  for (const tok of items) {
    const item = document.createElement("div");
    item.className = `token-item ${tok.revokedAt ? "revoked" : ""}`;
    const opsChips = (tok.operations || []).slice(0, 6).map(op => `<span class="chip chip-sm">${escapeHtml(op)}</span>`).join("");
    const moreChip = (tok.operations || []).length > 6 ? `<span class="chip chip-sm">+${tok.operations.length - 6}</span>` : "";
    item.innerHTML = `
      <div class="token-item-body">
        <div class="label-row">${escapeHtml(tok.label)}</div>
        <div class="scope">${escapeHtml(tok.collectionName || "namespace-wide")}</div>
        <div class="token-ops">${opsChips}${moreChip}</div>
        <span class="status">${tok.revokedAt ? `revoked ${escapeHtml(tok.revokedAt)}` : "active"}</span>
      </div>
      <button type="button" class="btn btn-sm btn-transparent token-revoke" data-id="${escapeHtml(tok.id)}" ${tok.revokedAt ? "disabled" : ""}>
        <i class="ri-forbid-line"></i>
        <span>Revoke</span>
      </button>
    `;
    item.querySelector(".token-revoke").addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: `Revoke "${tok.label}"?`,
        body: "Scripts using this token will stop working immediately. The action cannot be undone.",
        confirmText: "Revoke token",
      });
      if (!ok) return;
      try {
        await request(clawApiPath(`namespaces/${state.currentNamespace.id}/tokens/${tok.id}/revoke`), { method: "POST" });
        toastSuccess(`Token "${tok.label}" revoked`);
        await refreshTokens();
      } catch (error) {
        toastError(`Revoke failed: ${error.message}`);
      }
    });
    els.tokenList.appendChild(item);
  }
}

function collectTokenScopes() {
  return $$('#token-scopes input[type="checkbox"]:checked').map((el) => el.value);
}

/* ---------- Files ---------- */

function renderFiles(items = []) {
  state.files = items;
  els.fileList.innerHTML = "";
  if (!items.length) {
    els.fileList.innerHTML = `
      <div class="empty-state">
        <i class="ri-folder-open-line"></i>
        <p class="empty-title">No files stored yet</p>
        <p class="empty-sub">Use the dropzone above to upload the first file for this database.</p>
      </div>`;
    return;
  }
  for (const file of items) {
    const card = document.createElement("div");
    card.className = "file-card";
    const sizeKb = (Number(file.sizeBytes) || 0) / 1024;
    const sizeLabel = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb.toFixed(1)} KB`;
    card.innerHTML = `
      <div class="name" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</div>
      <div class="meta">${escapeHtml(file.collectionName || "unbound")} · ${escapeHtml(sizeLabel)}</div>
      <div class="actions">
        <a class="btn btn-xs btn-outline" href="${escapeHtml(file.downloadPath)}" target="_blank" rel="noreferrer">
          <i class="ri-external-link-line"></i><span>Open</span>
        </a>
        <button type="button" class="btn btn-xs btn-transparent file-delete" data-id="${escapeHtml(file.id)}">
          <i class="ri-delete-bin-line"></i><span>Delete</span>
        </button>
      </div>
    `;
    card.querySelector(".file-delete").addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: `Delete ${file.filename}?`,
        body: "This removes the file from storage. References from records will no longer resolve.",
        confirmText: "Delete file",
      });
      if (!ok) return;
      try {
        await request(clawApiPath(`files/${file.id}`), { method: "DELETE" });
        toastSuccess("File deleted");
        await refreshFiles();
      } catch (error) {
        toastError(`Delete failed: ${error.message}`);
      }
    });
    els.fileList.appendChild(card);
  }
}

/* ---------- File dropzone ---------- */

function setDropzoneFile(file) {
  if (!file) {
    els.fileDropzoneTitle.textContent = "Drag a file here or click to browse";
    els.fileDropzoneSub.textContent = "Max 25 MB per file. Text, images, and binary blobs welcome.";
    els.fileDropzone.classList.remove("has-file");
    els.fileSubmit.disabled = true;
    return;
  }
  els.fileDropzoneTitle.textContent = file.name;
  const sizeKb = (file.size || 0) / 1024;
  const sizeLabel = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb.toFixed(1)} KB`;
  els.fileDropzoneSub.textContent = `${sizeLabel} · ready to upload`;
  els.fileDropzone.classList.add("has-file");
  els.fileSubmit.disabled = false;
}
els.fileInput?.addEventListener("change", () => setDropzoneFile(els.fileInput.files[0]));
if (els.fileDropzone) {
  ["dragenter", "dragover"].forEach(ev =>
    els.fileDropzone.addEventListener(ev, (e) => { e.preventDefault(); els.fileDropzone.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach(ev =>
    els.fileDropzone.addEventListener(ev, (e) => { e.preventDefault(); els.fileDropzone.classList.remove("dragover"); })
  );
  els.fileDropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    els.fileInput.files = dt.files;
    setDropzoneFile(file);
  });
}

/* ---------- Logs ---------- */

function pushEvent(event) {
  const summary = event.record?.name || event.record?.title || event.recordId || "";
  const labelVariant = event.type?.includes("created") ? "label-success" : event.type?.includes("updated") ? "label-info" : "label-danger";
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
}

const logsClearBtn = $("logs-clear");
if (logsClearBtn) logsClearBtn.addEventListener("click", () => {
  els.eventList.innerHTML = `
    <div class="empty-state">
      <i class="ri-pulse-line"></i>
      <p class="empty-title">Waiting for activity</p>
      <p class="empty-sub">Realtime events from records, files, and admin actions will appear here.</p>
    </div>`;
});
$("files-refresh")?.addEventListener("click", () => refreshFiles().catch(() => {}));
$("tokens-refresh")?.addEventListener("click", () => refreshTokens().catch(() => {}));

/* ---------- Live status pill ---------- */

function setLiveStatus(state, label) {
  if (!els.liveStatus) return;
  els.liveStatus.dataset.state = state;
  els.liveStatus.querySelector(".live-label").textContent = label;
}

/* ---------- Realtime ---------- */

function connectRealtime() {
  if (state.websocket) state.websocket.close();
  if (!state.token) return;
  const url = new URL(clawApiPath("realtime"), window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", state.token);
  state.websocket = new WebSocket(url);
  state.websocket.addEventListener("open", () => {
    setLiveStatus("connected", "connected");
    subscribeRealtime();
  });
  state.websocket.addEventListener("close", () => {
    setLiveStatus("offline", "offline");
  });
  state.websocket.addEventListener("message", (message) => {
    const payload = JSON.parse(message.data);
    if (payload.type === "event") {
      pushEvent(payload.event);
      refreshRecords().catch(() => {});
    }
    if (payload.type === "subscribed") {
      setLiveStatus("watching", `watching ${payload.collectionName}`);
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
  const payload = await request(clawApiPath("namespaces"));
  state.namespaces = payload.items;
  if (!state.currentNamespace) state.currentNamespace = state.namespaces[0] || null;
  renderNamespaces();
}

async function refreshNamespace() {
  renderNamespaces();
  els.activeNamespaceName.textContent = state.currentNamespace?.displayName || "No database";
  if (!state.currentNamespace) return;
  const payload = await request(clawApiPath(`namespaces/${state.currentNamespace.id}/collections`));
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
  renderCollections();
  const collection = state.currentCollection;
  els.activeCollectionName.textContent = collection?.displayName || "Select one";
  if (!collection) {
    els.schemaTitle.textContent = "Select a collection";
    renderRecords([]);
    return;
  }
  const payload = await request(clawApiPath(`namespaces/${state.currentNamespace.id}/collections/${collection.name}`));
  state.currentCollection = payload;
  els.schemaTitle.textContent = payload.name;
  renderCollections();
  await refreshRecords();
  subscribeRealtime();
}

async function refreshRecords() {
  if (!state.currentNamespace || !state.currentCollection) return;
  const params = new URLSearchParams();
  if (els.recordsFilter.value.trim()) params.set("filter", els.recordsFilter.value.trim());
  if (els.recordsSort.value.trim()) params.set("sort", els.recordsSort.value.trim());
  const qs = params.toString();
  const payload = await request(
    clawApiPath(`namespaces/${state.currentNamespace.id}/collections/${state.currentCollection.name}/records${qs ? `?${qs}` : ""}`)
  );
  renderRecords(payload.items);
}

async function refreshTokens() {
  if (!state.currentNamespace) return;
  const payload = await request(clawApiPath(`namespaces/${state.currentNamespace.id}/tokens`));
  renderTokens(payload.items);
}

async function refreshFiles() {
  if (!state.currentNamespace) return;
  const payload = await request(clawApiPath(`namespaces/${state.currentNamespace.id}/files`));
  renderFiles(payload.items);
}

async function refreshSettings() {
  const [health, settings] = await Promise.all([
    request(clawApiPath("health")),
    request(clawApiPath("settings")),
  ]);

  if (els.settingsOutput) els.settingsOutput.textContent = pretty({ health, settings });

  if (els.settingsUrl && settings?.host && settings?.port) {
    els.settingsUrl.textContent = `http://${settings.host}:${settings.port}`;
  }
  if (els.settingsName) {
    els.settingsName.textContent = settings?.service || "ClawJS Database";
  }

  const healthy = Boolean(health?.ok);
  if (els.settingsHealthPill) {
    els.settingsHealthPill.dataset.state = healthy ? "ok" : "down";
    els.settingsHealthPill.querySelector("span:last-child").textContent = healthy ? "healthy" : "unhealthy";
  }

  if (els.settingsHealthRows) {
    const healthKeys = ["service", "host", "port", "ok", "uptime", "version"];
    els.settingsHealthRows.innerHTML = "";
    for (const key of healthKeys) {
      const raw = settings?.[key] ?? health?.[key];
      if (raw === undefined) continue;
      const row = document.createElement("div");
      row.className = "settings-row";
      row.innerHTML = `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(String(raw))}</dd>`;
      els.settingsHealthRows.appendChild(row);
    }
  }

  if (els.settingsPathsRows) {
    const pathKeys = Object.keys({ ...settings, ...health }).filter(k => /dir|path/i.test(k));
    els.settingsPathsRows.innerHTML = "";
    for (const key of pathKeys) {
      const raw = settings?.[key] ?? health?.[key];
      if (raw == null) continue;
      const redacted = redactPath(String(raw));
      const row = document.createElement("div");
      row.className = "settings-row clickable";
      row.innerHTML = `
        <dt>${escapeHtml(key)}</dt>
        <dd>
          <span class="mono" title="${escapeHtml(String(raw))}">${escapeHtml(redacted)}</span>
          <button type="button" class="icon-btn icon-btn-xs" title="Copy full path" aria-label="Copy full path">
            <i class="ri-file-copy-line"></i>
          </button>
        </dd>
      `;
      row.querySelector("button").addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(String(raw)).then(() => toastSuccess("Path copied"));
      });
      els.settingsPathsRows.appendChild(row);
    }
  }
}

/* ---------- Event handlers ---------- */

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    els.loginError.textContent = "";
    const payload = await request(clawApiPath("auth/admin/login"), {
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
  } else {
    applyTheme("dark");
  }
})();

$("theme-toggle").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "light" ? "dark" : "light");
});

/* ---------- Dev credentials prefill (local only) ---------- */

(function maybePrefillDevCreds() {
  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  if (!isLocal) return;
  els.loginEmail.value = "admin@database.local";
  els.loginPassword.value = "database-admin";
  els.loginDevHint?.classList.remove("hidden");
})();

/* ---------- Namespace form ---------- */

els.namespaceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await request(clawApiPath("namespaces"), {
      method: "POST",
      body: JSON.stringify({
        id: els.namespaceId.value,
        displayName: els.namespaceDisplayName.value,
      }),
    });
    toastSuccess(`Database "${els.namespaceDisplayName.value}" created`);
    els.namespaceId.value = "";
    els.namespaceDisplayName.value = "";
    els.namespaceForm.classList.add("hidden");
    await refreshNamespaces();
    await refreshNamespace();
  } catch (error) {
    toastError(`Could not create database: ${error.message}`);
  }
});

/* ---------- Schema save ---------- */

els.schemaSave.addEventListener("click", async () => {
  if (!state.currentNamespace) return;
  let fields;
  try {
    fields = JSON.parse(els.schemaEditor.value || "[]");
  } catch (e) {
    toastError(`Invalid fields JSON: ${e.message}`);
    return;
  }
  const rules = collectRules();
  const nameInput = $("schema-coll-name");
  const collName = nameInput?.value?.trim() || "";

  if (state.schemaCreateMode) {
    if (!collName) {
      toastError("Collection name is required");
      nameInput?.focus();
      return;
    }
    try {
      await request(clawApiPath(`namespaces/${state.currentNamespace.id}/collections`), {
        method: "POST",
        body: JSON.stringify({
          name: collName,
          displayName: collName.charAt(0).toUpperCase() + collName.slice(1),
          fields,
          rules,
          indexes: [],
        }),
      });
      toastSuccess(`Collection "${collName}" created`);
      closeSchemaDrawer();
      const payload = await request(clawApiPath(`namespaces/${state.currentNamespace.id}/collections`));
      state.collections = payload.items;
      state.currentCollection = state.collections.find((c) => c.name === collName) || state.collections[0];
      await refreshCollection();
    } catch (error) {
      toastError(`Save failed: ${error.message}`);
    }
  } else {
    if (!state.currentCollection) return;
    try {
      await request(clawApiPath(`namespaces/${state.currentNamespace.id}/collections/${state.currentCollection.name}`), {
        method: "PATCH",
        body: JSON.stringify({ fields, rules }),
      });
      toastSuccess("Collection saved");
      closeSchemaDrawer();
      await refreshCollection();
    } catch (error) {
      toastError(`Save failed: ${error.message}`);
    }
  }
});

els.recordsRefresh.addEventListener("click", () => refreshRecords().catch(() => {}));
els.recordsFilter.addEventListener("change", () => refreshRecords().catch(() => {}));
els.recordsSort.addEventListener("change", () => refreshRecords().catch(() => {}));

/* ---------- Record save ---------- */

els.recordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentNamespace || !state.currentCollection) return;
  let payload;
  try {
    const dynamicData = collectDynamicFields() || {};
    let jsonData = {};
    if (els.recordData.value.trim()) {
      try {
        jsonData = JSON.parse(els.recordData.value);
      } catch (e) {
        toastError(`Invalid JSON payload: ${e.message}`);
        return;
      }
    }
    payload = { ...dynamicData, ...jsonData };
  } catch (e) {
    toastError(e.message);
    return;
  }
  try {
    if (els.recordId.value) {
      await request(clawApiPath(`namespaces/${state.currentNamespace.id}/collections/${state.currentCollection.name}/records/${els.recordId.value}`), {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      toastSuccess("Record updated");
    } else {
      await request(clawApiPath(`namespaces/${state.currentNamespace.id}/collections/${state.currentCollection.name}/records`), {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toastSuccess("Record created");
    }
    els.recordId.value = "";
    els.recordData.value = "";
    closeRecordDrawer();
    await refreshRecords();
  } catch (error) {
    toastError(`Save failed: ${error.message}`);
  }
});

els.recordReset.addEventListener("click", () => {
  els.recordId.value = "";
  els.recordData.value = exampleRecord();
  const container = $("record-fields");
  container.querySelectorAll("input, textarea, select").forEach((el) => { el.value = ""; });
});

/* ---------- Token form ---------- */

els.tokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentNamespace) return;
  const label = els.tokenLabel.value.trim();
  if (!label) {
    toastError("A label is required so you can remember what this token is for.");
    els.tokenLabel.focus();
    return;
  }
  const operations = collectTokenScopes();
  if (!operations.length) {
    toastError("Pick at least one permission for this token.");
    return;
  }
  const expirySeconds = els.tokenExpiry?.value ? Number(els.tokenExpiry.value) : null;
  try {
    const body = {
      label,
      collectionName: els.tokenCollection.value.trim() || undefined,
      operations,
    };
    if (expirySeconds) body.expiresInSeconds = expirySeconds;
    const payload = await request(clawApiPath(`namespaces/${state.currentNamespace.id}/tokens`), {
      method: "POST",
      body: JSON.stringify(body),
    });
    toastSuccess("Token issued");
    renderIssuedToken({ ...payload, label, operations });
    els.tokenLabel.value = "";
    els.tokenCollection.value = "";
    await refreshTokens();
  } catch (error) {
    toastError(`Could not issue token: ${error.message}`);
  }
});

/* ---------- File upload ---------- */

els.fileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentNamespace) {
    toastError("Pick a database first.");
    return;
  }
  const file = els.fileInput.files[0];
  if (!file) {
    toastError("Pick a file to upload.");
    return;
  }
  try {
    const form = new FormData();
    form.set("namespaceId", state.currentNamespace.id);
    if (state.currentCollection) form.set("collectionName", state.currentCollection.name);
    if (els.fileRecordId.value) form.set("recordId", els.fileRecordId.value);
    form.set("file", file);
    await request(clawApiPath("files"), { method: "POST", body: form });
    toastSuccess(`Uploaded ${file.name}`);
    els.fileInput.value = "";
    els.fileRecordId.value = "";
    setDropzoneFile(null);
    await refreshFiles();
  } catch (error) {
    toastError(`Upload failed: ${error.message}`);
  }
});

els.settingsRefresh.addEventListener("click", () => refreshSettings().catch(() => {}));

/* ---------- Init ---------- */

els.recordData.value = exampleRecord();
setView("collections");
