// ─── Interactive demo previews for the landing page ──────────────────────────
// Pure vanilla JS. Smooth transitions — no hard re-renders.

// ─── Shared helpers ──────────────────────────────────────────────────────────

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "innerHTML") el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === "string") el.appendChild(document.createTextNode(c));
    else if (c) el.appendChild(c);
  }
  return el;
}

export function spinner(size = 16) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.classList.add("dp-spinner");
  svg.innerHTML = `<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" opacity="0.2"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`;
  return svg;
}

/* Animated toggle — mutates in place on click, never rebuilt */
export function createToggle(on, onChange, disabled = false) {
  const thumb = h("span", { className: `dp-toggle__thumb ${on ? "dp-toggle__thumb--on" : ""}` });
  const btn = h("button", { className: `dp-toggle ${on ? "dp-toggle--on" : ""}` }, thumb);
  if (disabled) btn.disabled = true;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (btn.disabled) return;
    const next = !btn.classList.contains("dp-toggle--on");
    btn.classList.toggle("dp-toggle--on", next);
    thumb.classList.toggle("dp-toggle__thumb--on", next);
    onChange(next);
  });
  btn._setOn = (v) => {
    btn.classList.toggle("dp-toggle--on", v);
    thumb.classList.toggle("dp-toggle__thumb--on", v);
  };
  btn._setDisabled = (v) => { btn.disabled = v; };
  return btn;
}

export function statusDot(status) {
  const colors = { active: "#34d399", installed: "#71717a", busy: "#38bdf8", on: "#34d399", off: "#3f3f46" };
  const dot = h("span", { className: "dp-dot" });
  dot.style.background = colors[status] || colors.off;
  dot._setStatus = (s) => { dot.style.background = colors[s] || colors.off; };
  return dot;
}

/* Slide-expand / slide-collapse an element */
export function slideDown(el) {
  el.style.display = "";
  el.style.overflow = "hidden";
  el.style.height = "0";
  el.style.opacity = "0";
  requestAnimationFrame(() => {
    const h = el.scrollHeight;
    el.style.transition = "height 280ms cubic-bezier(.25,.1,.25,1), opacity 220ms ease";
    el.style.height = h + "px";
    el.style.opacity = "1";
    const done = () => { el.style.height = ""; el.style.overflow = ""; el.style.transition = ""; el.removeEventListener("transitionend", done); };
    el.addEventListener("transitionend", done);
  });
}

export function slideUp(el) {
  el.style.overflow = "hidden";
  el.style.height = el.scrollHeight + "px";
  el.style.transition = "height 240ms cubic-bezier(.25,.1,.25,1), opacity 180ms ease";
  requestAnimationFrame(() => {
    el.style.height = "0";
    el.style.opacity = "0";
    const done = () => { el.style.display = "none"; el.style.transition = ""; el.removeEventListener("transitionend", done); };
    el.addEventListener("transitionend", done);
  });
}

/* Fade element in */
export function fadeIn(el) {
  el.style.opacity = "0";
  el.style.transition = "opacity 200ms ease";
  requestAnimationFrame(() => { el.style.opacity = "1"; });
}

/* Show a toast notification */
export function showToast(container, msg, duration = 2000) {
  const toast = h("div", { className: "dp-toast" }, msg);
  container.style.position = "relative";
  container.append(toast);
  requestAnimationFrame(() => toast.classList.add("dp-toast--show"));
  setTimeout(() => {
    toast.classList.remove("dp-toast--show");
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

/* Show a modal overlay */
export function showModal(container, { icon, title, statusText, body, actions }) {
  const overlay = h("div", { className: "dp-modal-overlay" });
  const modal = h("div", { className: "dp-modal" });

  const header = h("div", { className: "dp-modal__header" });
  if (icon) header.append(icon);
  header.append(h("div", { className: "dp-modal__title" }, title));
  const closeBtn = h("button", { className: "dp-modal__close", onClick: () => closeModal() });
  closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  header.append(closeBtn);
  modal.append(header);

  if (statusText) {
    const st = h("div", { className: "dp-modal__status" });
    st.innerHTML = `<span class="dp-modal__status-dot"></span> ${statusText}`;
    modal.append(st);
  }

  if (body) { const b = h("div", { className: "dp-modal__body" }); b.append(body); modal.append(b); }

  if (actions) { const a = h("div", { className: "dp-modal__actions" }); actions.forEach((act) => a.append(act)); modal.append(a); }

  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  overlay.append(modal);
  container.style.position = "relative";
  container.append(overlay);
  requestAnimationFrame(() => overlay.classList.add("dp-modal-overlay--show"));

  function closeModal() {
    overlay.classList.remove("dp-modal-overlay--show");
    setTimeout(() => overlay.remove(), 220);
  }
  return closeModal;
}

