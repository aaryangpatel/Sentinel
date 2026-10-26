const $ = (id) => document.getElementById(id);

let mode = "login";
let chart;
let companionApps = ["Spotify", "Music", "Notes"];
let companionSites = [];
let displayName = "";

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
  paintChipList("focus-chips", companionApps, () => true, toggleCompanion);
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
  show("auth-name-wrap", next === "register");
  $("auth-title").textContent = next === "register" ? "Create account" : "Sign in";
  $("auth-submit").textContent = next === "register" ? "Create account" : "Sign in";
  $("auth-pass").autocomplete = next === "register" ? "new-password" : "current-password";
}

$("tab-login").onclick = () => setAuthMode("login");
$("tab-register").onclick = () => setAuthMode("register");

$("auth-submit").onclick = async () => {
  $("auth-error").textContent = "";
  const username = $("auth-user").value.trim();
  const password = $("auth-pass").value;
  const name = $("auth-name").value.trim();
  if (mode === "register" && !name) {
    $("auth-error").textContent = "Enter a name so Sentinel can address you.";
    $("auth-name").focus();
    return;
  }
  const result = mode === "register"
    ? await window.sentinel.register(username, password, { name })
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
  // Use the signup name only — never fall back to the email address.
  const rawName = String(user.name || "").trim();
  displayName = rawName && rawName.indexOf("@") === -1 ? rawName : "there";
  $("who").textContent = displayName;
  $("focus-greeting").textContent = `Hi, ${displayName}`;
  if (user.settings) {
    $("provider").value = !user.settings.provider || user.settings.provider === "stub" || user.settings.provider === "ollama"
      ? "groq"
      : user.settings.provider;
    $("api-key").value = user.settings.apiKey || "";
    $("model").value = user.settings.model || "openai/gpt-oss-20b";
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
  await loadCircles();
};

$("circle-join").onclick = async () => {
  $("circle-error").textContent = "";
  const result = await window.sentinel.joinCircle($("circle-code").value.trim());
  if (!result.ok) {
    $("circle-error").textContent = result.error || "Could not join.";
    return;
  }
  $("circle-code").value = "";
  await loadCircles();
};

$("grace").oninput = () => {
  $("grace-val").textContent = $("grace").value + "s";
};

function classifierReady() {
  return Boolean($("api-key").value.trim());
}

function paintKeyBanner() {
  show("key-banner", !classifierReady());
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
    root.innerHTML = "<p class=\"copy\">Create a circle or join with a code to get started.</p>";
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
      return `<tr class="${member.me ? "me" : ""}"><td>${index + 1}</td><td>${escapeHtml(member.name)}${member.me ? " (you)" : ""}</td><td>${member.score}</td><td>${fmtMin(member.onMs)}</td><td>${share}</td><td>${member.streak}d</td></tr>`;
    }).join("");
    const deleteBtn = circle.isOwner
      ? `<button type="button" class="ghost circle-delete" data-id="${escapeHtml(circle.id)}">Delete circle</button>`
      : "";
    card.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <p class="eyebrow" style="margin:0">${escapeHtml(circle.name)}</p>
        ${deleteBtn}
      </div>
      <p>Invite code <span class="code">${escapeHtml(circle.code)}</span></p>
      <table class="board">
        <thead><tr><th>#</th><th>Friend</th><th>Intent</th><th>On</th><th>Share</th><th>Streak</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    root.appendChild(card);
  });
  root.querySelectorAll(".circle-delete").forEach((button) => {
    button.onclick = async () => {
      $("circle-error").textContent = "";
      const circleId = button.dataset.id;
      const card = button.closest(".card");
      button.disabled = true;
      const result = await window.sentinel.deleteCircle(circleId);
      if (!result.ok) {
        button.disabled = false;
        $("circle-error").textContent = result.error || "Could not delete that circle.";
        return;
      }
      if (card) {
        card.remove();
      }
      if (!$("circle-list").querySelector(".card")) {
        paintCircles([]);
        return;
      }
      paintHuddle([]);
      loadCircles();
    };
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

function formatTaskDay(ts) {
  if (!ts) {
    return "";
  }
  const d = new Date(ts);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Wire Delete on each by-task row. Removes the task and reloads analytics.
 * @param {HTMLElement} body tbody#task-rows
 */
function bindTaskDeletes(body) {
  const error = $("task-error");
  if (error) {
    error.textContent = "";
  }
  body.querySelectorAll(".task-delete").forEach((button) => {
    button.onclick = async () => {
      if (error) {
        error.textContent = "";
      }
      const taskId = button.dataset.id;
      const row = button.closest("tr");
      button.disabled = true;
      button.textContent = "Deleting…";
      let result;
      try {
        result = await window.sentinel.deleteTask(taskId);
      } catch (err) {
        result = { ok: false, error: (err && err.message) || "Could not delete that task." };
      }
      if (!result || !result.ok) {
        button.disabled = false;
        button.textContent = "Delete";
        if (error) {
          error.textContent = (result && result.error) || "Could not delete that task. Publish the latest Firestore rules if this keeps failing.";
        }
        return;
      }
      if (row) {
        row.remove();
      }
      if ($("task-filter").value === taskId) {
        $("task-filter").value = "";
      }
      const option = Array.from($("task-filter").options).find((item) => item.value === taskId);
      if (option) {
        option.remove();
      }
      await loadAnalytics();
    };
  });
}

async function loadAnalytics() {
  const tasks = await window.sentinel.tasks();
  const select = $("task-filter");
  const current = select.value;
  select.innerHTML = '<option value="">All tasks</option>';
  (tasks || []).forEach((task) => {
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
  if (!data.tasks.length) {
    body.innerHTML = "<tr><td colspan=\"5\" class=\"quiet\">No saved tasks yet.</td></tr>";
  } else {
    data.tasks.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(row.goal)}</td>
        <td class="when">${escapeHtml(formatTaskDay(row.createdAt))}</td>
        <td>${fmtMin(row.onMs)}</td>
        <td>${fmtMin(row.offMs)}</td>
        <td><button type="button" class="ghost task-delete" data-id="${escapeHtml(row.id)}">Delete</button></td>`;
      body.appendChild(tr);
    });
    bindTaskDeletes(body);
  }

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
        backgroundColor: ["#3d6b45", "#c4b89a", "#b54a3c"],
        borderWidth: 0
      }]
    },
    options: {
      plugins: { legend: { labels: { color: "#5a554c" } } }
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
  if (activity && activity.ignored) {
    $("now-app").textContent = "Sentinel";
    $("now-meta").textContent = "Not watching other apps while you are here";
    $("now-class").textContent = "—";
    $("now-reason").textContent = "";
  } else if (activity) {
    $("now-app").textContent = activity.app || "Unknown app";
    const bits = [activity.domain, activity.title || activity.path].filter(Boolean);
    $("now-meta").textContent = bits.join(" · ");
    $("now-class").textContent = status.lastClass || "—";
    $("now-reason").textContent = status.lastReason || "";
  } else {
    $("now-app").textContent = "Waiting for an app…";
    $("now-meta").textContent = "";
    $("now-class").textContent = status.lastClass || "—";
    $("now-reason").textContent = status.lastReason || "";
  }
  const pill = $("focus-pill");
  pill.className = "pill";
  if (!status.focus) {
    pill.textContent = "Idle";
    $("toggle").textContent = "Start focus";
  } else if (activity && activity.ignored) {
    pill.textContent = "Paused";
    pill.classList.add("live");
    $("toggle").textContent = "Stop focus";
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
    && !(activity && activity.ignored)
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

setAuthMode("login");
paintCompanions();
boot();
