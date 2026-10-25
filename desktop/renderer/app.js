const $ = (id) => document.getElementById(id);

const COMPANION_PRESETS = ["Spotify", "Music", "Notes", "Calendar", "Notion", "Obsidian"];

let mode = "login";
let chart;
let companionApps = ["Spotify", "Music", "Notes"];
let companionSites = [];
let lastAppName = "";
let lastSite = "";

function show(id, on) {
  $(id).classList.toggle("hidden", !on);
}

function hasCompanion(name) {
  const key = String(name || "").trim().toLowerCase();
  return companionApps.some((item) => item.toLowerCase() === key);
}

/**
 * Strip a typed URL down to a hostname such as khanacademy.org.
 */
function normalizeSite(value) {
  let host = String(value || "").trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "");
  host = host.replace(/^www\./, "");
  return host.split("/")[0].split("?")[0].split(":")[0];
}

function looksLikeSite(value) {
  const host = normalizeSite(value);
  return Boolean(host) && host.indexOf(".") !== -1 && host.indexOf(" ") === -1;
}

function hasSite(name) {
  const host = normalizeSite(name);
  return companionSites.some((item) => item === host);
}

function paintChipList(rootId, names, selected, onClick) {
  const root = $(rootId);
  if (!root) {
    return;
  }
  root.innerHTML = "";
  names.forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (selected(name) ? " on" : "");
    button.textContent = name;
    button.onclick = () => onClick(name);
    root.appendChild(button);
  });
}

function paintCompanions() {
  const appNames = COMPANION_PRESETS.concat(
    companionApps.filter((name) => !COMPANION_PRESETS.some((preset) => preset.toLowerCase() === name.toLowerCase()))
  );
  paintChipList("focus-chips", appNames, hasCompanion, toggleCompanion);
  paintChipList("focus-site-chips", companionSites, () => true, toggleSite);
}

async function persistCompanions() {
  await window.sentinel.saveSettings({
    companionApps: companionApps.slice(),
    companionSites: companionSites.slice()
  });
  paintCompanions();
}

async function toggleCompanion(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    return;
  }
  if (hasCompanion(trimmed)) {
    companionApps = companionApps.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
  } else {
    companionApps = companionApps.concat([trimmed]);
  }
  paintCompanions();
  if ($("shell") && !$("shell").classList.contains("hidden")) {
    await persistCompanions();
  }
}

async function toggleSite(name) {
  const host = normalizeSite(name);
  if (!host) {
    return;
  }
  if (hasSite(host)) {
    companionSites = companionSites.filter((item) => item !== host);
  } else {
    companionSites = companionSites.concat([host]);
  }
  paintCompanions();
  if ($("shell") && !$("shell").classList.contains("hidden")) {
    await persistCompanions();
  }
}

function applyCompanionSettings(settings) {
  companionApps = settings && Array.isArray(settings.companionApps)
    ? settings.companionApps.slice()
    : ["Spotify", "Music", "Notes"];
  companionSites = settings && Array.isArray(settings.companionSites)
    ? settings.companionSites.slice()
    : [];
  paintCompanions();
}

function setAuthMode(next) {
  mode = next;
  $("tab-login").classList.toggle("on", next === "login");
  $("tab-register").classList.toggle("on", next === "register");
}

$("tab-login").onclick = () => setAuthMode("login");
$("tab-register").onclick = () => setAuthMode("register");

$("auth-submit").onclick = async () => {
  $("auth-error").textContent = "";
  const username = $("auth-user").value.trim();
  const password = $("auth-pass").value;
  const result = mode === "register"
    ? await window.sentinel.register(username, password)
    : await window.sentinel.login(username, password);
  if (!result.ok) {
    $("auth-error").textContent = result.error || "Could not continue.";
    return;
  }
  enter(result.user);
};

async function boot() {
  const user = await window.sentinel.me();
  if (user) {
    enter(user);
  }
}

function enter(user) {
  show("auth", false);
  show("shell", true);
  $("who").textContent = user.email || user.username;
  if (user.settings) {
    $("provider").value = !user.settings.provider || user.settings.provider === "stub"
      ? "groq"
      : user.settings.provider;
    $("api-key").value = user.settings.apiKey || "";
    $("model").value = user.settings.model || "openai/gpt-oss-20b";
    $("ollama-url").value = user.settings.ollamaUrl || "http://localhost:11434/v1/chat/completions";
    $("grace").value = String(user.settings.graceSeconds || 45);
    $("grace-val").textContent = (user.settings.graceSeconds || 45) + "s";
    applyCompanionSettings(user.settings);
  }
  paintKeyBanner();
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  $("day").value = `${today.getFullYear()}-${month}-${day}`;
  loadAnalytics();
  loadCircles();
}

$("logout").onclick = async () => {
  await window.sentinel.logout();
  companionApps = ["Spotify", "Music", "Notes"];
  companionSites = [];
  paintCompanions();
  setAuthMode("login");
  show("shell", false);
  show("auth", true);
};

document.querySelectorAll(".nav").forEach((button) => {
  button.onclick = () => {
    document.querySelectorAll(".nav").forEach((item) => item.classList.remove("on"));
    button.classList.add("on");
    ["focus", "analytics", "circles", "settings"].forEach((name) => {
      show("view-" + name, button.dataset.view === name);
    });
    if (button.dataset.view === "analytics") {
      loadAnalytics();
    }
    if (button.dataset.view === "circles") {
      loadCircles();
    }
  };
});

$("toggle").onclick = async () => {
  const status = await window.sentinel.status();
  if (status.focus) {
    await window.sentinel.stopFocus();
    return;
  }
  const goal = $("goal").value.trim();
  if (!goal) {
    $("goal").focus();
    return;
  }
  await window.sentinel.startFocus(goal);
  loadCircles();
};

$("circle-create").onclick = async () => {
  $("circle-error").textContent = "";
  const result = await window.sentinel.createCircle($("circle-name").value.trim());
  if (!result.ok) {
    $("circle-error").textContent = result.error || "Could not create that circle.";
    return;
  }
  $("circle-name").value = "";
  loadCircles();
};

$("circle-join").onclick = async () => {
  $("circle-error").textContent = "";
  const result = await window.sentinel.joinCircle($("circle-code").value.trim());
  if (!result.ok) {
    $("circle-error").textContent = result.error || "Could not join.";
    return;
  }
  $("circle-code").value = "";
  loadCircles();
};

$("grace").oninput = () => {
  $("grace-val").textContent = $("grace").value + "s";
};

function classifierReady() {
  const provider = $("provider").value;
  if (provider === "ollama") {
    return true;
  }
  return Boolean($("api-key").value.trim());
}

function paintKeyBanner() {
  const needsKey = $("provider").value !== "ollama" && !classifierReady();
  show("key-banner", needsKey);
  show("groq-help", $("provider").value === "groq");
}

function goToSettings() {
  document.querySelectorAll(".nav").forEach((item) => {
    item.classList.toggle("on", item.dataset.view === "settings");
  });
  ["focus", "analytics", "circles", "settings"].forEach((name) => {
    show("view-" + name, name === "settings");
  });
}

async function openGroqGuide() {
  const url = await window.sentinel.guideUrl();
  await window.sentinel.openUrl(url);
}

$("goto-settings").onclick = goToSettings;
$("open-groq-guide").onclick = openGroqGuide;
$("settings-groq-guide").onclick = openGroqGuide;
$("provider").onchange = paintKeyBanner;
$("api-key").oninput = paintKeyBanner;

$("save-settings").onclick = async () => {
  await window.sentinel.saveSettings({
    provider: $("provider").value,
    apiKey: $("api-key").value.trim(),
    model: $("model").value.trim(),
    ollamaUrl: $("ollama-url").value.trim(),
    graceSeconds: Number($("grace").value),
    companionApps: companionApps.slice(),
    companionSites: companionSites.slice()
  });
  $("settings-saved").textContent = "Saved on this account.";
  paintKeyBanner();
};

$("companion-add-btn").onclick = async () => {
  const name = $("companion-add").value.trim();
  if (!name) {
    return;
  }
  $("companion-add").value = "";
  if (looksLikeSite(name)) {
    if (!hasSite(name)) {
      companionSites = companionSites.concat([normalizeSite(name)]);
      await persistCompanions();
    }
    return;
  }
  if (!hasCompanion(name)) {
    companionApps = companionApps.concat([name]);
    await persistCompanions();
  }
};

$("companion-add").onkeydown = (event) => {
  if (event.key === "Enter") {
    $("companion-add-btn").click();
  }
};

$("companion-now").onclick = async () => {
  if (!lastAppName) {
    return;
  }
  if (!hasCompanion(lastAppName)) {
    companionApps = companionApps.concat([lastAppName]);
    await persistCompanions();
  }
};

$("companion-site").onclick = async () => {
  if (!lastSite || !looksLikeSite(lastSite)) {
    return;
  }
  if (!hasSite(lastSite)) {
    companionSites = companionSites.concat([normalizeSite(lastSite)]);
    await persistCompanions();
  }
};

$("day").onchange = loadAnalytics;
$("task-filter").onchange = loadAnalytics;

function paintHuddle(circles) {
  const live = [];
  (circles || []).forEach((circle) => {
    (circle.huddle || []).forEach((row) => {
      live.push(`${row.name} is on “${row.goal}”`);
    });
  });
  $("huddle").textContent = live.length
    ? live.join(" · ")
    : "No one else is in a session right now. Start one and your circle will see it.";
}

function paintCircles(circles) {
  const root = $("circle-list");
  root.innerHTML = "";
  if (!circles.length) {
    root.innerHTML = "<p class=\"copy\">Create a circle and send the code to friends. You compete on this week’s Intent Score, not raw screen time.</p>";
    paintHuddle([]);
    return;
  }
  circles.forEach((circle) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.marginTop = "16px";
    const rows = (circle.members || []).map((member, index) => {
      const share = member.onMs + member.offMs
        ? Math.round((member.onMs / (member.onMs + member.offMs)) * 100) + "%"
        : "—";
      return `<tr class="${member.me ? "me" : ""}"><td>${index + 1}</td><td>${escapeHtml(member.name)}${member.me ? " (you)" : ""}</td><td>${member.score}</td><td>${fmtMin(member.onMs)}</td><td>${share}</td><td>${member.streak}d</td><td>${member.rescues}</td></tr>`;
    }).join("");
    const mine = (circle.members || []).find((member) => member.me);
    const badges = ((mine && mine.badges) || []).map((badge) => `<span class="badge">${escapeHtml(badge)}</span>`).join("") || "<span class=\"quiet\">Win badges by rescuing a session or staying on a real lecture.</span>";
    card.innerHTML = `
      <p class="eyebrow">${escapeHtml(circle.name)}</p>
      <p>Invite code <span class="code">${escapeHtml(circle.code)}</span> · Beat this week’s circle average of <b>${circle.average}</b></p>
      <table class="board">
        <thead><tr><th>#</th><th>Friend</th><th>Intent</th><th>On</th><th>Share</th><th>Streak</th><th>Rescues</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="eyebrow" style="margin-top:16px">Your badges</p>
      <div>${badges}</div>`;
    root.appendChild(card);
  });
  paintHuddle(circles);
}

async function loadCircles() {
  if (!window.sentinel.circles) {
    return;
  }
  const circles = await window.sentinel.circles();
  paintCircles(circles || []);
}

function fmtMin(ms) {
  const minutes = Math.round((ms || 0) / 60000);
  if (minutes < 1) {
    return Math.round((ms || 0) / 1000) + "s";
  }
  return minutes + "m";
}

async function loadAnalytics() {
  const tasks = await window.sentinel.tasks();
  const select = $("task-filter");
  const current = select.value;
  select.innerHTML = '<option value="">All tasks</option>';
  tasks.forEach((task) => {
    const option = document.createElement("option");
    option.value = String(task.id);
    option.textContent = task.goal;
    select.appendChild(option);
  });
  select.value = current;
  const data = await window.sentinel.analytics($("day").value, select.value || null);
  if (!data) {
    return;
  }
  $("stat-on").textContent = fmtMin(data.onMs);
  $("stat-off").textContent = fmtMin(data.offMs);
  const total = data.onMs + data.offMs;
  $("stat-pct").textContent = total ? Math.round((data.onMs / total) * 100) + "%" : "—";

  const offList = $("off-list");
  offList.innerHTML = "";
  const rows = (data.apps || []).concat(data.domains || []);
  if (!rows.length) {
    offList.innerHTML = "<li>Nothing off-task yet today.</li>";
  } else {
    rows.forEach((row) => {
      const item = document.createElement("li");
      item.textContent = `${row.name} · ${fmtMin(row.ms)}`;
      offList.appendChild(item);
    });
  }

  const body = $("task-rows");
  body.innerHTML = "";
  data.tasks.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(row.goal)}</td><td>${fmtMin(row.onMs)}</td><td>${fmtMin(row.offMs)}</td><td>${fmtMin(row.ambMs)}</td>`;
    body.appendChild(tr);
  });

  const ctx = $("chart");
  if (chart) {
    chart.destroy();
  }
  chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["On-task", "Ambiguous", "Off-task"],
      datasets: [{
        data: [data.onMs, data.ambMs, data.offMs],
        backgroundColor: ["#c4a35a", "#7d8896", "#c56b56"],
        borderWidth: 0
      }]
    },
    options: {
      plugins: { legend: { labels: { color: "#ece8dd" } } }
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function paintStatus(status) {
  const activity = status.activity;
  if (activity) {
    lastAppName = activity.app || "";
    lastSite = activity.domain || "";
    $("now-app").textContent = activity.app || "Unknown app";
    const bits = [activity.domain, activity.title || activity.path].filter(Boolean);
    $("now-meta").textContent = bits.join(" · ") || "Waiting for the tab title… allow Automation for Chrome."
  }
  $("now-class").textContent = status.lastClass || "—";
  $("now-reason").textContent = status.lastReason || "";
  const pill = $("focus-pill");
  pill.className = "pill";
  if (!status.focus) {
    pill.textContent = "Idle";
    $("toggle").textContent = "Start focus";
  } else if (status.lastClass === "off-task") {
    pill.textContent = "Off track";
    pill.classList.add("off");
    $("toggle").textContent = "Stop focus";
  } else {
    pill.textContent = "Listening";
    pill.classList.add(status.lastClass === "on-task" ? "on" : "live");
    $("toggle").textContent = "Stop focus";
  }
  $("grace-line").textContent = status.graceRemaining !== null && status.lastClass === "off-task"
    ? `Question in ${status.graceRemaining}s`
    : "";
}

window.sentinel.onStatus(paintStatus);
window.sentinel.onToast((payload) => {
  const toast = $("toast");
  toast.textContent = `Off track · ${payload.app}${payload.domain ? " · " + payload.domain : ""} — ${payload.reason}`;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 5000);
});

paintCompanions();
boot();
