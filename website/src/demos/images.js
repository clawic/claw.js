import { h } from "./shared.js";
// ─── IMAGES DEMO ──────────────────────────────────────────────────────────────
//
// A dashboard-style panel on the left:
//   sidebar with collections, a gallery grid that fills in as the agent
//   generates / edits images, and a prompt bar pinned to the bottom.
//
// Scripted timeline: prompt types itself, a new tile enters the grid in a
// "generating" state, pixels paint in, then the tile snaps to a finished
// thumbnail. Occasionally an edit action rewrites an existing tile.
//
// The matching terminal (images-terminal-body) is driven from here so the
// CLI commands stay in sync with what the UI is doing.

const SVG_NS = "http://www.w3.org/2000/svg";

function icon(d, size = 14) {
  const el = document.createElementNS(SVG_NS, "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("width", String(size));
  el.setAttribute("height", String(size));
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", "currentColor");
  el.setAttribute("stroke-width", "2");
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
  el.innerHTML = d;
  return el;
}

const I = {
  sparkle: '<path d="M12 3v3M12 18v3M5 12H2M22 12h-3M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7L5.6 5.6"/><circle cx="12" cy="12" r="3"/>',
  edit:    '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  grid:    '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  folder:  '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  star:    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  image:   '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  send:    '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  logo:    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  dots:    '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
};

// Logo glyphs (SVG, inherit color) for brand-style tiles.
const LOGO_GLYPHS = {
  orbit:   '<svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="20" stroke="currentColor" stroke-width="3.5" opacity="0.55"/><circle cx="32" cy="32" r="9" fill="currentColor"/><circle cx="52" cy="20" r="3.5" fill="currentColor"/></svg>',
  spark:   '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M32 6 L38 24 L56 30 L38 36 L32 54 L26 36 L8 30 L26 24 Z"/></svg>',
  diamond: '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M32 4 L60 32 L32 60 L4 32 Z" opacity="0.95"/><path d="M32 14 L50 32 L32 50 L14 32 Z" fill="rgba(0,0,0,0.2)"/></svg>',
  chevron: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10 L42 32 L18 54"/><path d="M32 10 L56 32 L32 54"/></svg>',
};

// Icon glyphs (SVG, dark color on a light chip).
const ICON_GLYPHS = {
  terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 7 10 12 5 17"/><line x1="13" y1="18" x2="19" y2="18"/></svg>',
  shapes:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="8" r="4"/><rect x="13" y="4" width="8" height="8" rx="1.5"/><path d="M7 14 L13 22 L1 22 Z"/></svg>',
  cube:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z"/><path d="M3 7 L12 12 L21 7"/><line x1="12" y1="12" x2="12" y2="22"/></svg>',
};

// Photo sources. Unsplash for curated hits, picsum fallback otherwise.
// Unsplash IDs verified to resolve; others fall back to picsum seeds which
// always respond, giving us deterministic, good-looking imagery offline.
const UNSPLASH = {
  neon:      "1550745165-9bc0b252726f",
  workspace: "1498050108023-c5249f4df085",
  graph:     "1451187580459-43490279c0fa",
};

function photoUrl(key) {
  const id = UNSPLASH[key];
  if (id) return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=520&q=70`;
  return `https://picsum.photos/seed/claw-${encodeURIComponent(key)}/400/520`;
}

// Preset tiles (the gallery starts with a few) and scripted steps.
// Each step either creates a new tile (appended) or edits an existing one.
const SEED_TILES = [
  { id: "im_01", kind: "logo",         title: "Claw · pink orbit",   hue: 340, glyph: "orbit" },
  { id: "im_02", kind: "illustration", title: "hero · neon grid",    hue: 260, photo: "neon" },
  { id: "im_03", kind: "icon",         title: "cli · terminal mark", hue: 210, glyph: "terminal" },
  { id: "im_04", kind: "photo",        title: "workspace · dusk",    hue: 20,  photo: "workspace" },
];

const SCRIPT = [
  {
    cmd: 'claw images create --prompt "product shot, soft studio light" --type photo',
    cliOutput: [
      '<span class="cli-dim">◌</span> Generating with <span class="cli-cmd">openai/gpt-image-1</span>...',
      '<span class="cli-ok">✓</span> Image <span class="cli-cmd">im_05</span> saved to <span class="cli-cmd">images/</span>',
    ],
    ui: {
      action: "create",
      prompt: "product shot, soft studio light",
      tile: { id: "im_05", kind: "photo", title: "product · studio", hue: 30, photo: "studio" },
    },
  },
  {
    cmd: 'claw images edit im_02 --prompt "push saturation, add warm rim"',
    cliOutput: [
      '<span class="cli-dim">◌</span> Editing <span class="cli-cmd">im_02</span>...',
      '<span class="cli-ok">✓</span> Revision saved · depth <span class="cli-cmd">2</span>',
    ],
    ui: {
      action: "edit",
      prompt: "push saturation, add warm rim",
      targetId: "im_02",
      tile: { id: "im_02", kind: "illustration", title: "hero · warm rim", hue: 15, photo: "rim" },
    },
  },
  {
    cmd: 'claw images create --prompt "icon set, flat monoline" --type icon',
    cliOutput: [
      '<span class="cli-dim">◌</span> Generating with <span class="cli-cmd">openai/gpt-image-1</span>...',
      '<span class="cli-ok">✓</span> Image <span class="cli-cmd">im_06</span> saved to <span class="cli-cmd">images/</span>',
    ],
    ui: {
      action: "create",
      prompt: "icon set, flat monoline",
      tile: { id: "im_06", kind: "icon", title: "icons · monoline", hue: 160, glyph: "shapes" },
    },
  },
  {
    cmd: 'claw images create --prompt "diagram, agent graph, dark" --type illustration',
    cliOutput: [
      '<span class="cli-dim">◌</span> Generating with <span class="cli-cmd">openai/gpt-image-1</span>...',
      '<span class="cli-ok">✓</span> Image <span class="cli-cmd">im_07</span> saved to <span class="cli-cmd">images/</span>',
    ],
    ui: {
      action: "create",
      prompt: "diagram, agent graph, dark",
      tile: { id: "im_07", kind: "illustration", title: "graph · agent mesh", hue: 195, photo: "graph" },
    },
  },
  {
    cmd: 'claw images edit im_01 --prompt "tighter rim, deeper shadow"',
    cliOutput: [
      '<span class="cli-dim">◌</span> Editing <span class="cli-cmd">im_01</span>...',
      '<span class="cli-ok">✓</span> Revision saved · depth <span class="cli-cmd">2</span>',
    ],
    ui: {
      action: "edit",
      prompt: "tighter rim, deeper shadow",
      targetId: "im_01",
      tile: { id: "im_01", kind: "logo", title: "Claw · deep orbit", hue: 345, glyph: "diamond" },
    },
  },
];

// ─── Tile painter ───────────────────────────────────────────────────────────
// Renders each tile appropriately for its kind:
//   photo / illustration → real Unsplash image
//   logo                 → brand gradient + centered geometric glyph
//   icon                 → dark backdrop + light chip with a line icon
function paintTileArt(target, tile) {
  target.style.background = "";
  target.innerHTML = "";

  if (tile.kind === "photo" || tile.kind === "illustration") {
    const img = document.createElement("img");
    img.src = photoUrl(tile.photo || tile.id);
    img.alt = tile.title;
    img.loading = "lazy";
    img.className = "dp-img__photo";
    img.addEventListener("error", () => {
      img.src = `https://picsum.photos/seed/claw-${encodeURIComponent(tile.id)}/400/520`;
    }, { once: true });
    target.appendChild(img);
    const shade = h("div", { className: "dp-img__shade" });
    target.appendChild(shade);
  } else if (tile.kind === "logo") {
    const h1 = tile.hue;
    const h2 = (tile.hue + 40) % 360;
    target.style.background =
      `radial-gradient(120% 90% at 25% 20%, hsl(${h1} 90% 68%) 0%, hsl(${h1} 80% 45%) 40%, hsl(${h2} 70% 14%) 100%)`;
    const mark = h("div", { className: "dp-img__logo-mark" });
    mark.innerHTML = LOGO_GLYPHS[tile.glyph] || LOGO_GLYPHS.orbit;
    target.appendChild(mark);
  } else if (tile.kind === "icon") {
    target.style.background =
      `radial-gradient(120% 90% at 30% 20%, hsl(${tile.hue} 25% 22%) 0%, hsl(${tile.hue} 30% 10%) 70%)`;
    const chip = h("div", { className: "dp-img__icon-chip" });
    chip.innerHTML = ICON_GLYPHS[tile.glyph] || ICON_GLYPHS.terminal;
    target.appendChild(chip);
  }

  target.appendChild(h("div", { className: "dp-img__label" }, tile.title));
}

// ─── Mount ──────────────────────────────────────────────────────────────────

export function mountImages(container) {
  const state = {
    tiles: SEED_TILES.map((t) => ({ ...t })),
    step: 0,
    paused: false,
    promptText: "",
    typingTimer: null,
    mainTimer: null,
  };

  // Build the shell once. Everything animates in place afterwards.
  const sidebar = h("aside", { className: "dp-img__sidebar" },
    h("div", { className: "dp-img__brand" },
      (() => { const s = icon(I.sparkle, 14); s.classList.add("dp-img__brand-mark"); return s; })(),
      h("span", {}, "Images"),
    ),
    h("nav", { className: "dp-img__nav" },
      navItem("All",            I.grid,   "36",  true),
      navItem("Logos",          I.star,   "8"),
      navItem("Illustrations",  I.image,  "14"),
      navItem("Icons",          I.image,  "9"),
      navItem("Photos",         I.folder, "5"),
    ),
    h("div", { className: "dp-img__tag" },
      (() => { const s = icon(I.sparkle, 12); s.classList.add("dp-img__tag-mark"); return s; })(),
      h("span", {}, "openai · gpt-image-1"),
    ),
  );

  const toolbar = h("div", { className: "dp-img__toolbar" },
    h("div", { className: "dp-img__crumbs" },
      h("span", {}, "Images"),
      h("span", { className: "dp-img__crumb-sep" }, "/"),
      h("span", { className: "dp-img__crumb-active" }, "All"),
    ),
    h("div", { className: "dp-img__count", id: "dp-img-count" }, `${state.tiles.length} items`),
  );

  const grid = h("div", { className: "dp-img__grid", id: "dp-img-grid" });
  for (const t of state.tiles) grid.appendChild(makeTile(t));

  const promptBar = h("form", { className: "dp-img__prompt", onSubmit: (e) => e.preventDefault() },
    (() => { const s = icon(I.sparkle, 14); s.classList.add("dp-img__prompt-mark"); return s; })(),
    h("input", {
      className: "dp-img__prompt-input",
      id: "dp-img-prompt",
      type: "text",
      placeholder: "Describe an image. Agents do the rest.",
      autocomplete: "off",
      readonly: "true",
    }),
    (() => {
      const btn = h("button", { className: "dp-img__prompt-btn", type: "button" },
        (() => { const s = icon(I.send, 14); return s; })(),
      );
      return btn;
    })(),
  );

  const main = h("div", { className: "dp-img__main" }, toolbar, grid, promptBar);

  const shell = h("div", { className: "dp-img" }, sidebar, main);
  container.innerHTML = "";
  container.appendChild(shell);

  // Start scripted timeline
  runScript(state, { grid, promptBar });

  // Pause on hover so viewers can inspect
  container.addEventListener("mouseenter", () => { state.paused = true; });
  container.addEventListener("mouseleave", () => { state.paused = false; });
}

function navItem(label, d, count, active = false) {
  const el = h("button",
    { className: `dp-img__nav-item ${active ? "dp-img__nav-item--active" : ""}`, type: "button" },
    icon(d, 14),
    h("span", { className: "dp-img__nav-label" }, label),
    h("span", { className: "dp-img__nav-count" }, count),
  );
  return el;
}

function makeTile(tile, { generating = false } = {}) {
  const art = h("div", { className: "dp-img__tile-art" });
  const meta = h("div", { className: "dp-img__tile-meta" },
    h("span", { className: "dp-img__tile-kind" }, tile.kind),
    h("span", { className: "dp-img__tile-id" }, tile.id),
  );
  const el = h("div", {
    className: `dp-img__tile ${generating ? "dp-img__tile--generating" : ""}`,
    "data-id": tile.id,
  }, art, meta);

  if (!generating) {
    paintTileArt(art, tile);
  } else {
    // Placeholder visuals while "generating"
    art.innerHTML = `
      <div class="dp-img__shimmer"></div>
      <div class="dp-img__scan"></div>
      <div class="dp-img__badge"><span class="dp-img__badge-dot"></span>generating</div>
    `;
  }
  return el;
}

// ─── Scripted timeline ──────────────────────────────────────────────────────

function runScript(state, refs) {
  const termBody = document.getElementById("images-terminal-body");
  const promptInput = document.getElementById("dp-img-prompt");
  const countEl = document.getElementById("dp-img-count");

  function wait(ms) {
    return new Promise((resolve) => {
      const tick = () => {
        if (state.paused) { state.mainTimer = setTimeout(tick, 120); return; }
        resolve();
      };
      state.mainTimer = setTimeout(tick, ms);
    });
  }

  function typeInto(el, text, speed = 28) {
    return new Promise((resolve) => {
      let i = 0;
      el.value = "";
      const step = () => {
        if (state.paused) { state.typingTimer = setTimeout(step, 120); return; }
        if (i >= text.length) { resolve(); return; }
        el.value += text[i++];
        state.typingTimer = setTimeout(step, speed + Math.random() * 40);
      };
      step();
    });
  }

  function termLine(html) {
    if (!termBody) return;
    const div = document.createElement("div");
    div.className = "cli-line";
    div.innerHTML = html;
    termBody.appendChild(div);
    requestAnimationFrame(() => div.classList.add("cli-line--visible"));
    termBody.scrollTop = termBody.scrollHeight;
    // Cap lines so terminal stays readable
    while (termBody.children.length > 18) termBody.removeChild(termBody.firstChild);
  }

  function typeTermCmd(text, { newScene = false } = {}) {
    return new Promise((resolve) => {
      if (!termBody) { resolve(); return; }
      const line = document.createElement("div");
      line.className = "cli-line cli-line--visible";
      if (newScene && termBody.children.length > 0) line.classList.add("cli-line--new-scene");
      line.innerHTML = '<span class="cli-prompt">$</span> <span class="cli-cmd"></span><span class="cli-cursor"></span>';
      termBody.appendChild(line);
      const cmdSpan = line.querySelector(".cli-cmd");
      const cursor = line.querySelector(".cli-cursor");
      termBody.scrollTop = termBody.scrollHeight;
      while (termBody.children.length > 18) termBody.removeChild(termBody.firstChild);
      let i = 0;
      const step = () => {
        if (state.paused) { state.typingTimer = setTimeout(step, 120); return; }
        if (i < text.length) {
          cmdSpan.textContent += text[i++];
          termBody.scrollTop = termBody.scrollHeight;
          state.typingTimer = setTimeout(step, 30 + Math.random() * 30);
        } else {
          cursor.remove();
          resolve();
        }
      };
      state.typingTimer = setTimeout(step, 200);
    });
  }

  async function runStep(stepDef) {
    const { cmd, cliOutput, ui } = stepDef;

    // 1. User types the prompt into the prompt bar (UI), terminal types in parallel.
    await Promise.all([
      promptInput ? typeInto(promptInput, ui.prompt, 30) : Promise.resolve(),
      typeTermCmd(cmd, { newScene: true }),
    ]);
    await wait(350);

    // 2. Terminal: generating spinner line
    if (cliOutput[0]) termLine(cliOutput[0]);

    // 3. UI: add or mark tile as generating
    if (ui.action === "create") {
      const tile = makeTile(ui.tile, { generating: true });
      refs.grid.insertBefore(tile, refs.grid.firstChild);
      state.tiles.unshift(ui.tile);
      if (countEl) countEl.textContent = `${state.tiles.length} items`;
      await wait(1400);
      // Reveal finished art
      const art = tile.querySelector(".dp-img__tile-art");
      paintTileArt(art, ui.tile);
      tile.classList.remove("dp-img__tile--generating");
      tile.classList.add("dp-img__tile--fresh");
      setTimeout(() => tile.classList.remove("dp-img__tile--fresh"), 1400);
    } else if (ui.action === "edit") {
      const tile = refs.grid.querySelector(`[data-id="${ui.targetId}"]`);
      if (tile) {
        tile.classList.add("dp-img__tile--generating");
        const art = tile.querySelector(".dp-img__tile-art");
        art.innerHTML = `
          <div class="dp-img__shimmer"></div>
          <div class="dp-img__scan"></div>
          <div class="dp-img__badge"><span class="dp-img__badge-dot"></span>editing</div>
        `;
        await wait(1300);
        paintTileArt(art, ui.tile);
        tile.classList.remove("dp-img__tile--generating");
        tile.classList.add("dp-img__tile--fresh");
        // Move edited tile to the front so viewers see the change
        refs.grid.insertBefore(tile, refs.grid.firstChild);
        setTimeout(() => tile.classList.remove("dp-img__tile--fresh"), 1400);
      } else {
        await wait(900);
      }
    }

    // 4. Terminal: success line
    if (cliOutput[1]) termLine(cliOutput[1]);

    // 5. Clear prompt input after a beat
    await wait(900);
    if (promptInput) promptInput.value = "";
  }

  async function loop() {
    while (true) {
      const step = SCRIPT[state.step % SCRIPT.length];
      await runStep(step);
      state.step++;
      await wait(1200);
      if (state.step % SCRIPT.length === 0) {
        await wait(800);
      }
    }
  }

  loop();
}
