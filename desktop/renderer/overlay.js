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
let phaseTimer = null;

function clearBreak() {
  if (breakTimer) {
    clearTimeout(breakTimer);
    breakTimer = null;
  }
  if (phaseTimer) {
    clearInterval(phaseTimer);
    phaseTimer = null;
  }
}

window.sentinel.onToast((payload) => {
  clearBreak();
  show("toast");
  const where = payload.domain || payload.app;
  document.getElementById("toast-title").textContent = where + " is off track";
  document.getElementById("toast-reason").textContent = payload.reason || "";
});

window.sentinel.onGate((payload) => {
  clearBreak();
  show("gate");
  document.getElementById("gate-q").textContent = payload.question || "";
  document.getElementById("gate-reason").textContent = payload.reason || "";
  document.getElementById("gate-error").textContent = "";
  document.getElementById("answer").value = "";
  document.getElementById("answer").focus();
});

window.sentinel.onBreak((payload) => {
  clearBreak();
  const seconds = payload && payload.seconds ? payload.seconds : 18;
  const goal = payload && payload.goal ? payload.goal : "";
  show("brk");
  document.getElementById("brk-goal").textContent = goal ? "Goal: " + goal : "";
  const phase = document.getElementById("phase");
  let inhale = true;
  phase.textContent = "Inhale";
  phaseTimer = setInterval(() => {
    inhale = !inhale;
    phase.textContent = inhale ? "Inhale" : "Exhale";
  }, 4000);
  let left = seconds;
  const node = document.getElementById("count");
  const tick = () => {
    const m = Math.floor(left / 60);
    const s = left % 60;
    node.textContent = m + ":" + String(s).padStart(2, "0");
    if (left <= 0) {
      clearBreak();
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

async function submitAnswer() {
  const answer = document.getElementById("answer").value.trim();
  const error = document.getElementById("gate-error");
  error.textContent = "";
  if (!answer) {
    return;
  }
  const judged = await window.sentinel.submitAnswer(answer);
  if (judged && judged.ok === false) {
    error.textContent = judged.reason || "Try again.";
  }
}

document.getElementById("submit").onclick = submitAnswer;
document.getElementById("answer").onkeydown = (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitAnswer();
  }
};
