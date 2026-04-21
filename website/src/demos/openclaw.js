import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── OPENCLAW DEMO ───────────────────────────────────────────────────────────

export function mountOpenClaw(container) {
  const adapters = [
    { id: "openclaw", name: "OpenClaw", hint: "Default ClawJS runtime with full agent capabilities", installed: true, isOpenClaw: true },
    { id: "zeroclaw", name: "ZeroClaw", hint: "Lightweight zero-config runtime adapter", installed: true },
    { id: "picoclaw", name: "PicoClaw", hint: "Minimal footprint runtime for edge deployments", installed: false },
    { id: "nanoclaw", name: "NanoClaw", hint: "Compact runtime with selective capability loading", installed: false },
  ];

  let active = "openclaw";
  let installing = null;
  const rowEls = {};
  const toggleEls = {};
  const dotEls = {};
  const expandEls = {};

  function build() {
    const card = h("div", { className: "dp-card" });

    adapters.forEach((ad, i) => {
      const isActive = active === ad.id;
      const wrapper = h("div", { className: i < adapters.length - 1 ? "dp-row-border" : "" });

      // Main row
      const row = h("div", { className: `dp-row dp-row--click ${isActive ? "dp-row--active" : ""}` });
      row.addEventListener("click", () => selectAdapter(ad.id));

      // Icon
      const iconWrap = h("div", { className: "dp-icon-wrap" });
      const icon = h("div", { className: `dp-icon ${isActive ? "" : "dp-icon--dim"}` });
      if (ad.isOpenClaw) {
        icon.innerHTML = `<svg width="17" height="17" viewBox="0 0 120 120" fill="currentColor"><path d="M60 10C30 10 15 35 15 55C15 75 30 95 45 100L45 110L55 110L55 100C55 100 60 102 65 100L65 110L75 110L75 100C90 95 105 75 105 55C105 35 90 10 60 10Z"/><path d="M20 45C5 40 0 50 5 60C10 70 20 65 25 55C28 48 25 45 20 45Z"/><path d="M100 45C115 40 120 50 115 60C110 70 100 65 95 55C92 48 95 45 100 45Z"/><circle cx="45" cy="35" r="6" fill="currentColor" opacity="0.3"/><circle cx="75" cy="35" r="6" fill="currentColor" opacity="0.3"/></svg>`;
      } else {
        icon.innerHTML = `<img src="/runtimes/${ad.id}.png" alt="${ad.name}" style="width:17px;height:17px;border-radius:2px;filter:grayscale(100%) brightness(0.8);opacity:0.7">`;
      }
      const dot = statusDot(isActive ? "active" : ad.installed ? "installed" : "off");
      dotEls[ad.id] = dot;
      iconWrap.append(icon, dot);

      // Info
      const info = h("div", { className: "dp-info" });
      const nameLine = h("div", { className: "dp-name-line" });
      nameLine.append(h("span", { className: `dp-name ${isActive ? "dp-name--on" : ""}` }, ad.name));
      if (isActive) nameLine.append(h("span", { className: "dp-badge dp-badge--active" }, "Active"));
      else if (ad.installed) nameLine.append(h("span", { className: "dp-badge dp-badge--installed" }, "Installed"));
      info.append(nameLine, h("div", { className: "dp-hint" }, ad.hint));

      const tgl = createToggle(isActive, (v) => { if (v) selectAdapter(ad.id); });
      toggleEls[ad.id] = tgl;

      row.append(iconWrap, info, tgl);
      rowEls[ad.id] = row;
      wrapper.append(row);

      // Expandable area (details, progress)
      const expand = h("div", { className: "dp-expand" });
      expand.style.display = "none";
      expandEls[ad.id] = expand;
      wrapper.append(expand);

      card.append(wrapper);
    });

    container.append(card);
    showDetails("openclaw");
  }

  function showDetails(id) {
    const ad = adapters.find((a) => a.id === id);
    if (!ad || !ad.isOpenClaw) return;
    const expand = expandEls[id];
    expand.innerHTML = "";

    // Status chips
    const chips = h("div", { className: "dp-chips" });
    ["CLI", "Agent", "Model", "Auth"].forEach((label) => {
      const chip = h("div", { className: "dp-chip dp-chip--ok" });
      chip.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      chip.append(document.createTextNode(" " + label));
      chips.append(chip);
    });
    expand.append(chips);

    // Metadata
    const meta = h("div", { className: "dp-meta" });
    meta.append(h("div", { className: "dp-meta__hdr" }, "Details"));
    [
      { l: "Version", v: "0.14.2" },
      { l: "Model", v: "claude-sonnet-4-6", mono: true },
      { l: "Agent ID", v: "default (agt_claw_01)", mono: true },
      { l: "Workspace", v: "~/.clawjs/workspaces/default", mono: true, copy: true },
    ].forEach(({ l, v, mono, copy }) => {
      const r = h("div", { className: `dp-meta__row ${copy ? "dp-meta__row--copy" : ""}` });
      r.append(h("span", { className: "dp-meta__label" }, l), h("span", { className: `dp-meta__val ${mono ? "dp-mono" : ""}` }, v));
      if (copy) r.addEventListener("click", () => showToast(container, "Copied to clipboard!"));
      meta.append(r);
    });
    expand.append(meta);

    // Action buttons
    const actions = h("div", { className: "dp-actions" });
    const refreshBtn = h("button", { className: "dp-btn", onClick: (e) => {
      e.stopPropagation();
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Refreshing...";
      setTimeout(() => { refreshBtn.disabled = false; refreshBtn.textContent = "Refresh"; showToast(container, "Status refreshed"); }, 1200);
    } }, "Refresh");
    const restartBtn = h("button", { className: "dp-btn", onClick: (e) => {
      e.stopPropagation();
      restartBtn.disabled = true;
      restartBtn.textContent = "Restarting...";
      setTimeout(() => { restartBtn.disabled = false; restartBtn.textContent = "Restart"; showToast(container, "Runtime restarted"); }, 1500);
    } }, "Restart");
    actions.append(refreshBtn, restartBtn);
    expand.append(actions);

    expand.style.display = "";
    slideDown(expand);
  }

  function showProgress(id) {
    const expand = expandEls[id];
    expand.innerHTML = "";
    const prog = h("div", { className: "dp-progress" });
    const info = h("div", { className: "dp-progress__info" }, "Checking dependencies...");
    const bar = h("div", { className: "dp-progress__bar" });
    const fill = h("div", { className: "dp-progress__fill" });
    bar.append(fill);
    prog.append(info, bar);
    expand.append(prog);
    expand.style.display = "";
    slideDown(expand);
    return { info, fill };
  }

  function selectAdapter(id) {
    if (installing || active === id) return;
    const prev = active;
    active = id;
    const ad = adapters.find((a) => a.id === id);

    // Update toggles visually
    Object.keys(toggleEls).forEach((k) => {
      toggleEls[k]._setOn(k === id);
    });

    // Update row backgrounds
    Object.keys(rowEls).forEach((k) => {
      rowEls[k].classList.toggle("dp-row--active", k === id);
    });

    // Update dots
    adapters.forEach((a) => {
      dotEls[a.id]._setStatus(a.id === id ? "active" : a.installed ? "installed" : "off");
    });

    // Collapse previous expanded
    if (expandEls[prev] && expandEls[prev].style.display !== "none") {
      slideUp(expandEls[prev]);
    }

    if (ad && !ad.installed) {
      installing = id;
      dotEls[id]._setStatus("busy");
      Object.values(toggleEls).forEach((t) => t._setDisabled(true));
      const { info, fill } = showProgress(id);
      runInstall(ad, info, fill);
    } else if (ad && ad.isOpenClaw) {
      showDetails(id);
    }
  }

  function runInstall(ad, infoEl, fillEl) {
    const steps = [
      { msg: "Checking dependencies...", pct: 10 },
      { msg: "Downloading runtime...", pct: 35 },
      { msg: "Extracting files...", pct: 60 },
      { msg: "Configuring workspace...", pct: 80 },
      { msg: "Verifying installation...", pct: 95 },
      { msg: "Done!", pct: 100 },
    ];
    let i = 0;
    const iv = setInterval(() => {
      if (i < steps.length) {
        infoEl.textContent = steps[i].msg;
        fillEl.style.width = steps[i].pct + "%";
        i++;
      } else {
        clearInterval(iv);
        ad.installed = true;
        installing = null;
        dotEls[ad.id]._setStatus("active");
        Object.values(toggleEls).forEach((t) => t._setDisabled(false));
        slideUp(expandEls[ad.id]);
        showToast(container, `${ad.name} installed successfully`);
      }
    }, 550);
  }

  build();
}

