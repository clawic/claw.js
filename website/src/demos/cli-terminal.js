import { h, spinner, createToggle, statusDot, slideDown, slideUp, fadeIn, showToast, showModal } from "./shared.js";
// ─── CLI Terminal Animation ──────────────────────────────────────────────────

export function mountCliTerminal(container) {
  // Each scene: a command typed char-by-char, then output lines appear
  const scenes = [
    {
      cmd: "claw new app my-agent",
      output: [
        '<span class="cli-dim">◌</span> Scaffolding project...',
        '<span class="cli-ok">✓</span> Created <span class="cli-cmd">claw.config.ts</span>',
        '<span class="cli-ok">✓</span> Created <span class="cli-cmd">skills/</span>, <span class="cli-cmd">channels/</span>, <span class="cli-cmd">plugins/</span>',
        '<span class="cli-ok">✓</span> Installed dependencies',
        '<span class="cli-ok">✓</span> Project ready at <span class="cli-cmd">./my-agent</span>',
      ],
    },
    {
      cmd: "claw add telegram",
      output: [
        '<span class="cli-dim">◌</span> Configuring channel...',
        '<span class="cli-ok">✓</span> Telegram integration added',
        '<span class="cli-ok">✓</span> Webhook endpoint registered',
        '<span class="cli-ok">✓</span> Bot commands synced',
      ],
    },
    {
      cmd: "claw doctor",
      output: [
        '<span class="cli-ok">✓</span> Runtime: <span class="cli-cmd">openclaw</span> v2.4.1',
        '<span class="cli-ok">✓</span> Workspace: valid',
        '<span class="cli-ok">✓</span> Providers: openai <span class="cli-ok">(connected)</span>, anthropic <span class="cli-ok">(connected)</span>',
        '<span class="cli-ok">✓</span> Channels: telegram <span class="cli-ok">(active)</span>, whatsapp <span class="cli-ok">(active)</span>',
        '<span class="cli-ok">✓</span> Skills: 4 loaded, 0 errors',
        '<span class="cli-ok">✓</span> Memory: operational',
        '',
        '  <span class="cli-cmd">All systems healthy.</span> No issues found.',
      ],
    },
    {
      cmd: "claw tasks create --title \"Review PR #42\"",
      output: [
        '<span class="cli-ok">✓</span> Task created: <span class="cli-cmd">Review PR #42</span>',
        '  ID: <span class="cli-dim">task-a8f3c</span>',
        '  Status: <span class="cli-warn">pending</span>',
      ],
    },
    {
      cmd: "claw sessions stream --session-id demo",
      output: [
        '<span class="cli-dim">◌</span> Connecting to agent...',
        '<span class="cli-ok">✓</span> Session <span class="cli-cmd">demo</span> active',
        '<span class="cli-dim">▸</span> Model: <span class="cli-cmd">anthropic/claude-sonnet-4-6</span>',
        '',
        '<span class="cli-cmd">Agent:</span> I\'ve reviewed PR #42. The auth middleware',
        '  changes look good. Two suggestions: extract the',
        '  token validation into a shared util, and add a',
        '  test for the refresh flow. Want me to draft the',
        '  changes?',
      ],
    },
  ];

  let timeout;
  let paused = false;
  let sceneIndex = 0;

  const terminal = container.closest(".cli-terminal");

  function addLine(html) {
    const div = document.createElement("div");
    div.className = "cli-line";
    div.innerHTML = html;
    container.appendChild(div);
    // Trigger reflow then animate
    requestAnimationFrame(() => div.classList.add("cli-line--visible"));
    // Auto-scroll
    container.scrollTop = container.scrollHeight;
    return div;
  }

  function typeCommand(text, callback) {
    const line = document.createElement("div");
    line.className = "cli-line cli-line--visible";
    const promptSpan = document.createElement("span");
    promptSpan.innerHTML = '<span class="cli-prompt">$</span> ';
    line.appendChild(promptSpan);
    const cmdSpan = document.createElement("span");
    cmdSpan.className = "cli-cmd";
    line.appendChild(cmdSpan);
    const cursor = document.createElement("span");
    cursor.className = "cli-cursor";
    line.appendChild(cursor);
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;

    let i = 0;
    function nextChar() {
      if (paused) { timeout = setTimeout(nextChar, 100); return; }
      if (i < text.length) {
        cmdSpan.textContent += text[i];
        i++;
        container.scrollTop = container.scrollHeight;
        // Variable speed: faster for middle chars, slower at start
        const speed = i < 3 ? 80 : 35 + Math.random() * 25;
        timeout = setTimeout(nextChar, speed);
      } else {
        cursor.remove();
        timeout = setTimeout(callback, 400);
      }
    }
    timeout = setTimeout(nextChar, 200);
  }

  function showOutput(lines, callback) {
    let i = 0;
    function nextLine() {
      if (paused) { timeout = setTimeout(nextLine, 100); return; }
      if (i < lines.length) {
        addLine(lines[i]);
        i++;
        timeout = setTimeout(nextLine, lines[i - 1] === "" ? 100 : 120);
      } else {
        timeout = setTimeout(callback, 600);
      }
    }
    nextLine();
  }

  function playScene(index) {
    if (index >= scenes.length) {
      // Pause, clear, restart from scene 0
      timeout = setTimeout(() => {
        container.innerHTML = "";
        sceneIndex = 0;
        playScene(0);
      }, 5000);
      return;
    }
    sceneIndex = index;
    const scene = scenes[index];

    // Add blank line between scenes (except first)
    if (index > 0) {
      addLine("");
    }

    typeCommand(scene.cmd, () => {
      showOutput(scene.output, () => {
        playScene(index + 1);
      });
    });
  }

  playScene(0);

  // Pause/resume on hover
  if (terminal) {
    terminal.addEventListener("mouseenter", () => { paused = true; });
    terminal.addEventListener("mouseleave", () => { paused = false; });
  }
}

