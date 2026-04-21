import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── INTEGRATIONS DEMO ───────────────────────────────────────────────────────

export function mountIntegrations(container) {
  const items = [
    { id: "whatsapp", title: "WhatsApp", desc: "Send and receive messages via WhatsApp", detail: "3 chats excluded", iconPath: `<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>` },
    { id: "email", title: "Email", desc: "Read and send emails from linked accounts", detail: "All accounts", iconPath: `<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>` },
    { id: "telegram", title: "Telegram", desc: "Connect a Telegram bot for messaging", detail: "@clawjs_bot", iconPath: `<path d="m21.7 3.3-19.4 7.5c-.8.3-.8 1.5 0 1.8l4.9 1.6 2 6.3c.2.5.8.7 1.2.4l2.9-2.1 4.7 3.5c.5.4 1.3.1 1.4-.5L22.9 4.5c.2-.8-.5-1.4-1.2-1.2z"/><line x1="10.2" y1="13.8" x2="21.7" y2="3.3"/>` },
    { id: "slack", title: "Slack", desc: "Post and read messages in Slack workspaces", iconPath: `<path d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z"/><path d="M20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/><path d="M9.5 14c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5S8 21.33 8 20.5v-5c0-.83.67-1.5 1.5-1.5z"/><path d="M3.5 14H5v1.5c0 .83-.67 1.5-1.5 1.5S2 16.33 2 15.5 2.67 14 3.5 14z"/><path d="M14 14.5c0-.83.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-5c-.83 0-1.5-.67-1.5-1.5z"/><path d="M14 20.5c0 .83-.67 1.5-1.5 1.5H11v-1.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5z"/><path d="M10 9.5C10 10.33 9.33 11 8.5 11h-5C2.67 11 2 10.33 2 9.5S2.67 8 3.5 8h5c.83 0 1.5.67 1.5 1.5z"/><path d="M10 3.5C10 2.67 10.67 2 11.5 2H13v1.5c0 .83-.67 1.5-1.5 1.5S10 4.33 10 3.5z"/>` },
    { id: "calendar", title: "Calendar", desc: "Access calendar events and schedule", detail: "All calendars", iconPath: `<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>` },
    { id: "contacts", title: "Contacts", desc: "Access contacts from macOS Contacts.app", detail: "247 contacts", iconPath: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>` },
  ];

  const enabled = { whatsapp: true, email: true, telegram: true, slack: false, calendar: true, contacts: false };
  const toggleEls = {};
  const dotEls = {};
  const spinnerEls = {};
  const detailEls = {};
  const iconEls = {};

  function build() {
    const card = h("div", { className: "dp-card" });

    items.forEach((item, i) => {
      const isOn = !!enabled[item.id];
      const row = h("div", { className: `dp-row ${i < items.length - 1 ? "dp-row-border" : ""} ${isOn ? "dp-row--click" : ""}` });
      row.addEventListener("click", () => { if (enabled[item.id]) openIntegrationModal(item); });

      const iconWrap = h("div", { className: "dp-icon-wrap" });
      const icon = h("div", { className: `dp-icon ${!isOn ? "dp-icon--dim" : ""}` });
      icon.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${item.iconPath}</svg>`;
      iconEls[item.id] = icon;
      const dot = statusDot(isOn ? "on" : "off");
      dotEls[item.id] = dot;
      iconWrap.append(icon, dot);

      const info = h("div", { className: "dp-info" });
      info.append(h("div", { className: "dp-name dp-name--on" }, item.title), h("div", { className: "dp-hint" }, item.desc));

      const sp = spinner(16);
      sp.style.display = "none";
      spinnerEls[item.id] = sp;

      const detail = h("span", { className: "dp-detail" });
      detail.textContent = (isOn && item.detail) ? item.detail : "";
      detail.style.display = (isOn && item.detail) ? "" : "none";
      detailEls[item.id] = detail;

      const tgl = createToggle(isOn, (v) => toggleIntegration(item.id, v, row));
      toggleEls[item.id] = tgl;

      row.append(iconWrap, info, sp, detail, tgl);
      card.append(row);
    });

    container.append(card);
  }

  function toggleIntegration(id, v, row) {
    const item = items.find((i) => i.id === id);
    if (!v) {
      enabled[id] = false;
      dotEls[id]._setStatus("off");
      iconEls[id].classList.add("dp-icon--dim");
      detailEls[id].style.display = "none";
      row.classList.remove("dp-row--click");
      showToast(container, `${item.title} disabled`);
      return;
    }
    // Connecting phase
    toggleEls[id]._setDisabled(true);
    dotEls[id]._setStatus("busy");
    spinnerEls[id].style.display = "";
    detailEls[id].style.display = "none";
    setTimeout(() => {
      // Syncing phase
      spinnerEls[id].style.display = "none";
      const syncSp = spinner(16);
      spinnerEls[id].parentElement.insertBefore(syncSp, spinnerEls[id]);
      spinnerEls[id] = syncSp;
      setTimeout(() => {
        // Connected
        enabled[id] = true;
        syncSp.style.display = "none";
        dotEls[id]._setStatus("on");
        iconEls[id].classList.remove("dp-icon--dim");
        toggleEls[id]._setOn(true);
        toggleEls[id]._setDisabled(false);
        row.classList.add("dp-row--click");
        if (item.detail) { detailEls[id].textContent = item.detail; detailEls[id].style.display = ""; fadeIn(detailEls[id]); }
        showToast(container, `${item.title} connected`);
      }, 1000);
    }, 900);
  }

  function openIntegrationModal(item) {
    const icon = h("div", { className: "dp-icon", style: { width: "36px", height: "36px" } });
    icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${item.iconPath}</svg>`;
    const body = h("div", {}, h("p", { className: "dp-hint", style: { fontSize: "12px", lineHeight: "1.6" } }, `Manage ${item.title} settings, exclusions, and sync preferences.`));
    const doneBtn = h("button", { className: "dp-btn dp-btn--filled" }, "Done");
    showModal(container, { icon, title: item.title, statusText: "Connected", body, actions: [doneBtn] });
  }

  build();
}

