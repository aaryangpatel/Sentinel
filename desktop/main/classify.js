"use strict";

const CLASSIFY_SYSTEM = `You classify whether a Mac window matches a student's stated goal.
Return JSON only: {"classification":"on-task"|"off-task","reason":"one short sentence"}
Never return ambiguous. Always pick on-task or off-task.
Rules:
- Use whatever you have: app name, site, URL path, and page title. A title is helpful but not required.
- If title/site/path are missing, decide from the app name alone against the goal (e.g. Cursor/VS Code/Notes for schoolwork → on-task; Messages/TikTok/Discord for homework → off-task).
- Judge this specific window against this goal, not the brand. YouTube lectures can be on-task; gameplay, shorts, music videos, and "recommended" fluff are off-task.
- reddit, tiktok, instagram, twitter/x, discord, netflix, twitch, and games are off-task unless the title clearly serves the goal.
- IDEs, docs, notes, Wikipedia, Khan Academy, GitHub, and school tools are on-task when they could reasonably serve the goal.
- If the student already justified this same site, honor that only when THIS title still matches that reason. A new unrelated video or thread is a new decision.`;

const QUESTION_SYSTEM = `Return JSON only: {"question":"..."}.
Ask one specific question about how THIS page or video connects to the goal. Mention the title if you have it. No preamble.`;

const JUDGE_SYSTEM = `Decide if the student's sentence honestly ties THIS window to the goal.
Return JSON only: {"verdict":"justified"|"not_justified","reason":"one short sentence"}
Accept justified when they give a specific, believable how/why that connects what they are doing here to the goal.
The window title is often empty or just the app name (Discord, Messages, Finder, etc.) — that alone is not a reason to reject. Judge the student's sentence, not the brand.
Examples that should pass: asking a classmate about a homework problem on Discord; a study-group voice call for this class; checking a project channel for assignment files.
Reject: "idk", "just chatting", "bored", "I need a break", "it's related", or any answer with no concrete link to the goal.
Do not reject only because the app is Discord or usually distracting.`;

function parseJsonObject(text) {
  if (!text) {
    return null;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    return null;
  }
}

function hasModel(settings) {
  return Boolean(settings && settings.apiKey);
}

async function chatCompletions(settings, messages) {
  const provider = !settings.provider || settings.provider === "stub" || settings.provider === "ollama"
    ? "groq"
    : settings.provider;
  const model = settings.model || "openai/gpt-oss-20b";
  let url = "https://api.groq.com/openai/v1/chat/completions";
  const headers = { "Content-Type": "application/json" };
  const body = { model, temperature: 0, messages };
  if (provider === "groq") {
    headers.Authorization = "Bearer " + settings.apiKey;
    body.response_format = { type: "json_object" };
  } else if (provider === "gemini") {
    url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    headers.Authorization = "Bearer " + settings.apiKey;
    body.response_format = { type: "json_object" };
  } else {
    return { ok: false, status: 0, text: "" };
  }
  try {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    return { ok: response.ok, status: response.status, text: await response.text() };
  } catch (err) {
    return { ok: false, status: 0, text: "" };
  }
}

function assistantContent(raw) {
  const parsed = parseJsonObject(raw);
  if (!parsed || !parsed.choices || !parsed.choices[0] || !parsed.choices[0].message) {
    return raw;
  }
  return parsed.choices[0].message.content || raw;
}

function windowContext(goal, activity, memory) {
  const lines = [
    "goal: " + (goal || "(none)"),
    "app: " + (activity.app || "(none)"),
    "site: " + (activity.domain || "(none)"),
    "url path: " + (activity.path || "(none)"),
    "page title: " + (activity.title || "(none)")
  ];
  if (memory) {
    lines.push("student already justified this site: " + memory.answer);
    lines.push("that justification was for title: " + (memory.title || "(none)"));
  }
  return lines.join("\n");
}

function sameContent(activity, memory) {
  if (!memory) {
    return false;
  }
  if (activity.pageKey && memory.pageKey && activity.pageKey === memory.pageKey) {
    return true;
  }
  const a = String(activity.title || "").trim().toLowerCase();
  const b = String(memory.title || "").trim().toLowerCase();
  return Boolean(a && b && a === b);
}

async function askJson(settings, system, user) {
  if (!hasModel(settings)) {
    return { ok: false, data: null, error: "Add a Groq API key in Settings. The website page /groq shows the exact steps." };
  }
  const result = await chatCompletions(settings, [
    { role: "system", content: system },
    { role: "user", content: user }
  ]);
  if (!result.ok) {
    return { ok: false, data: null, error: "The model did not respond. Check the API key and model name." };
  }
  const data = parseJsonObject(assistantContent(result.text));
  if (!data) {
    return { ok: false, data: null, error: "The model returned unreadable JSON." };
  }
  return { ok: true, data, error: "" };
}

function isCompanionApp(appName, companions) {
  const app = String(appName || "").trim().toLowerCase();
  if (!app) {
    return false;
  }
  const list = Array.isArray(companions) ? companions : [];
  for (let i = 0; i < list.length; i += 1) {
    const item = String(list[i] || "").trim().toLowerCase();
    if (!item) {
      continue;
    }
    if (app === item) {
      return true;
    }
    if (item.length >= 4 && (app.indexOf(item) !== -1 || item.indexOf(app) !== -1)) {
      return true;
    }
  }
  return false;
}

function isAllowedSite(domain, sites) {
  const host = String(domain || "").trim().toLowerCase().replace(/^www\./, "");
  if (!host) {
    return false;
  }
  const list = Array.isArray(sites) ? sites : [];
  for (let i = 0; i < list.length; i += 1) {
    const item = String(list[i] || "").trim().toLowerCase().replace(/^www\./, "");
    if (!item) {
      continue;
    }
    if (host === item || host.slice(-item.length - 1) === "." + item) {
      return true;
    }
  }
  return false;
}

async function classifyActivity(settings, goal, activity, memory) {
  if (isCompanionApp(activity.app, settings && settings.companionApps)) {
    return {
      classification: "on-task",
      reason: (activity.app || "This app") + " is on your work-apps list.",
      status: 200
    };
  }
  if (isAllowedSite(activity.domain, settings && settings.companionSites)) {
    return {
      classification: "on-task",
      reason: (activity.domain || "This site") + " is on your allowed-sites list.",
      status: 200
    };
  }
  if (sameContent(activity, memory)) {
    return {
      classification: "on-task",
      reason: "You already explained why this page belongs in this session.",
      status: 200
    };
  }
  const asked = await askJson(settings, CLASSIFY_SYSTEM, windowContext(goal, activity, memory));
  if (!asked.ok) {
    // No model response — stay neutral so we do not interrupt on API failure.
    return { classification: "ambiguous", reason: asked.error, status: 0 };
  }
  let classification = asked.data.classification;
  if (classification === "ambiguous" || !["on-task", "off-task"].includes(classification)) {
    // Model must commit; fall back using app name vs typical work tools.
    classification = likelyWorkApp(activity.app) ? "on-task" : "off-task";
  }
  return {
    classification,
    reason: asked.data.reason || (classification === "on-task"
      ? "Predicted on-task from the available window info."
      : "Predicted off-task from the available window info."),
    status: 200
  };
}

function likelyWorkApp(appName) {
  const app = String(appName || "").trim().toLowerCase();
  if (!app) {
    return false;
  }
  const work = [
    "cursor", "code", "visual studio", "xcode", "terminal", "iterm",
    "notes", "notion", "obsidian", "bear", "pages", "word", "docs",
    "preview", "finder", "excel", "numbers", "keynote", "powerpoint",
    "figma", "sketch", "photoshop", "illustrator"
  ];
  return work.some((item) => app.indexOf(item) !== -1);
}

async function generateQuestion(settings, goal, activity, reason) {
  const asked = await askJson(
    settings,
    QUESTION_SYSTEM,
    windowContext(goal, activity) + "\nwhy it looks off-task: " + (reason || "")
  );
  if (asked.ok && asked.data.question) {
    return asked.data.question;
  }
  const where = activity.title || activity.domain || activity.app || "this";
  return `You are supposed to be working on ${goal || "your goal"}. How does “${where}” connect to that?`;
}

async function judgeAnswer(settings, goal, activity, answer) {
  const text = String(answer || "").trim();
  if (text.length < 8) {
    return { ok: false, verdict: "not_justified", reason: "Write one real sentence." };
  }
  const asked = await askJson(
    settings,
    JUDGE_SYSTEM,
    windowContext(goal, activity) + "\nstudent answer: " + text
  );
  if (!asked.ok) {
    return { ok: false, verdict: "not_justified", reason: asked.error };
  }
  if (!["justified", "not_justified"].includes(asked.data.verdict)) {
    return { ok: false, verdict: "not_justified", reason: "The model did not return a verdict. Try again." };
  }
  return {
    ok: true,
    verdict: asked.data.verdict,
    reason: asked.data.reason || ""
  };
}

module.exports = {
  classifyActivity,
  generateQuestion,
  judgeAnswer
};
