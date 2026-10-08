"use strict";

const CLASSIFY_SYSTEM = `You classify whether a Mac window matches a student's stated goal.
Return JSON only: {"classification":"on-task"|"ambiguous"|"off-task","reason":"one short sentence"}
Rules:
- Judge this window against this goal, not the app or site's reputation.
- A YouTube lecture can be on-task; a gameplay clip is off-task.
- IDEs, docs, and notes are on-task when they could reasonably serve the goal.
- Chat, games, and social feeds are off-task unless the title clearly serves the goal.
- If you cannot tell, use ambiguous. Never treat unknown as off-task.`;

const QUESTION_SYSTEM = `Return JSON only: {"question":"..."}.
Ask one specific question about how this window connects to the goal. No preamble.`;

const JUDGE_SYSTEM = `Decide if the student's sentence honestly ties this window to the goal.
Return JSON only: {"verdict":"justified"|"not_justified","reason":"one short sentence"}
justified only if the link is specific and checkable.
"idk", "just watching", "bored", "I need a break", or a vague "it's related" are not_justified.`;

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
  if (!settings) {
    return false;
  }
  if (settings.provider === "ollama") {
    return true;
  }
  return Boolean(settings.apiKey);
}

async function chatCompletions(settings, messages) {
  const provider = !settings.provider || settings.provider === "stub" ? "groq" : settings.provider;
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
  } else if (provider === "ollama") {
    url = settings.ollamaUrl || "http://localhost:11434/v1/chat/completions";
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

function windowContext(goal, activity) {
  return [
    "goal: " + (goal || "(none)"),
    "app: " + (activity.app || "(none)"),
    "site: " + (activity.domain || "(none)"),
    "window title: " + (activity.title || "(none)")
  ].join("\n");
}

async function askJson(settings, system, user) {
  if (!hasModel(settings)) {
    return { ok: false, data: null, error: "Add a Groq API key in Settings (console.groq.com)." };
  }
  const result = await chatCompletions(settings, [
    { role: "system", content: system },
    { role: "user", content: user }
  ]);
  if (!result.ok) {
    return { ok: false, data: null, error: "The model did not respond. Check the key, model name, or Ollama." };
  }
  const data = parseJsonObject(assistantContent(result.text));
  if (!data) {
    return { ok: false, data: null, error: "The model returned unreadable JSON." };
  }
  return { ok: true, data, error: "" };
}

async function classifyActivity(settings, goal, activity) {
  const asked = await askJson(settings, CLASSIFY_SYSTEM, windowContext(goal, activity));
  if (!asked.ok) {
    return { classification: "ambiguous", reason: asked.error, status: 0 };
  }
  const classification = asked.data.classification;
  if (!["on-task", "ambiguous", "off-task"].includes(classification)) {
    return { classification: "ambiguous", reason: "The model was unsure, so this was not interrupted.", status: 200 };
  }
  return {
    classification,
    reason: asked.data.reason || "",
    status: 200
  };
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
  const where = activity.domain || activity.app || "this";
  return `You are supposed to be working on ${goal || "your goal"}. How does “${activity.title || "this window"}” in ${where} connect to that?`;
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
