function show(id) {
  ["toast", "gate", "brk"].forEach((name) => {
    document.getElementById(name).classList.toggle("hidden", name !== id);
  });
}

function hideAll() {
  ["toast", "gate", "brk"].forEach((name) => {
    document.getElementById(name).classList.add("hidden");
  });
}

let breakTimer = null;

function clearBreak() {
  if (breakTimer) {
    clearTimeout(breakTimer);
    breakTimer = null;
  }
}

window.sentinel.onToast((payloa) => {
  clearBreak();
  show("toast");
  const where = payload.domain || payload.app;
  document.getElementById("toast-title").textContent = where + " is off track";
  document.getElementById("toast-reason").textContent = payload.reason || "";
});

window.sentinel.onGate((payload) => {
  clearBreak();
  show("gate");
  document.getElementById("gate-reason").textContent = payload.reason || "";
  document.getElementById("gate-q").textContent = payload.question || "";
  document.getElementById("gate-error").textContent = "";
  document.getElementById("gate-error").classList.add("hidden");
  document.getElementById("answer").value = "";
});

window.sentinel.onBreak((seconds) => {
  clearBreak();
  show("brk");
  let left = seconds;
  const node = document.getElementById("count");
  const tick = () => {
    const m = Math.floor(left / 60);
    const s = left % 60;
    node.textContent = m + ":" + String(s).padStart(2, "0");
    if (left <= 0) {
      window.sentinel.finishBreak();
      return;
    }
    left -= 1;
    breakTimer = setTimeout(tick, 1000);
  };
  tick();
});

window.sentinel.onHideGate(() => {
  clearBreak();
  hideAll();
});

document.getElementById("submit").onclick = async () => {
  const answer = document.getElementById("answer").value.trim();
  const error = document.getElementById("gate-error");
  error.classList.add("hidden");
  if (!answer) {
    return;
  }
  const judged = await window.sentinel.submitAnswer(answer);
  if (judged && judged.ok === false) {
    error.textContent = judged.reason || "Try again.";
    error.classList.remove("hidden");
  }
};
