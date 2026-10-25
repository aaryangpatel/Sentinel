const $ = (id) => document.getElementById(id);

let mode = "login";
let chart;

function show(id, on) {
  $(id).classList.toggle("hidden", !on);
}

$("tab-login").onclick = () => {
  mode = "login";
  $("tab-login").classList.add("on");
  $("tab-register").classList.remove("on");
};
$("tab-register").onclick = () => {
  mode = "register";
  $("tab-register").classList.add("on");
  $("tab-login").classList.remove("on");
};

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
  }
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  $("day").value = `${today.getFullYear()}-${month}-${day}`;
  loadAnalytics();
}

$("logout").onclick = async () => {
  await window.sentinel.logout();
  show("shell", false);
  show("auth", true);
};

document.querySelectorAll(".nav").forEach((button) => {
  button.onclick = () => {
    document.querySelectorAll(".nav").forEach((item) => item.classList.remove("on"));
    button.classList.add("on");
    ["focus", "analytics", "settings"].forEach((name) => {
      show("view-" + name, button.dataset.view === name);
    });
    if (button.dataset.view === "analytics") {
      loadAnalytics();
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
};

$("grace").oninput = () => {
  $("grace-val").textContent = $("grace").value + "s";
};

$("save-settings").onclick = async () => {
  await window.sentinel.saveSettings({
    provider: $("provider").value,
    apiKey: $("api-key").value.trim(),
    model: $("model").value.trim(),
    ollamaUrl: $("ollama-url").value.trim(),
    graceSeconds: Number($("grace").value)
  });
  $("settings-saved").textContent = "Saved on this account.";
};

$("day").onchange = loadAnalytics;
$("task-filter").onchange = loadAnalytics;

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

boot();
