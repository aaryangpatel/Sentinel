"use strict";

const fs = require("fs");
const path = require("path");
const { initializeApp } = require("firebase/app");
const {
  initializeAuth,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} = require("firebase/auth");
const {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc
} = require("firebase/firestore");

const DEFAULT_SETTINGS = {
  provider: "groq",
  apiKey: "",
  model: "openai/gpt-oss-20b",
  ollamaUrl: "http://localhost:11434/v1/chat/completions",
  graceSeconds: 45,
  companionApps: ["Spotify", "Music", "Notes"],
  companionSites: []
};

function normalizeCompanionApps(list) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    out.push(trimmed);
  });
  return out;
}

function normalizeSite(value) {
  let host = String(value || "").trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "");
  host = host.replace(/^www\./, "");
  return host.split("/")[0].split("?")[0].split(":")[0];
}

function normalizeCompanionSites(list) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((name) => {
    const host = normalizeSite(name);
    if (!host || host.indexOf(".") === -1) {
      return;
    }
    if (seen.has(host)) {
      return;
    }
    seen.add(host);
    out.push(host);
  });
  return out;
}

function mergeSettings(base, extra) {
  const next = Object.assign({}, DEFAULT_SETTINGS, base || {}, extra || {});
  next.companionApps = normalizeCompanionApps(next.companionApps);
  next.companionSites = normalizeCompanionSites(next.companionSites);
  return next;
}

let app = null;
let auth = null;
let firestore = null;

function installLocalStorage() {
  if (typeof global.localStorage !== "undefined") {
    return;
  }
  const { app: electronApp } = require("electron");
  const file = path.join(electronApp.getPath("userData"), "firebase-local.json");
  let data = {};
  if (fs.existsSync(file)) {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  }
  global.localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
      fs.writeFileSync(file, JSON.stringify(data));
    },
    removeItem(key) {
      delete data[key];
      fs.writeFileSync(file, JSON.stringify(data));
    },
    clear() {
      data = {};
      fs.writeFileSync(file, JSON.stringify(data));
    },
    key(index) {
      return Object.keys(data)[index] || null;
    },
    get length() {
      return Object.keys(data).length;
    }
  };
}

function configPath() {
  const { app: electronApp } = require("electron");
  const packed = path.join(process.resourcesPath, "firebase-config.json");
  const local = path.join(__dirname, "..", "firebase-config.json");
  if (electronApp.isPackaged && fs.existsSync(packed)) {
    return packed;
  }
  if (fs.existsSync(local)) {
    return local;
  }
  return path.join(__dirname, "..", "firebase-config.example.json");
}

function readConfig() {
  const file = configPath();
  if (!fs.existsSync(file)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function init() {
  if (app) {
    return { ok: true };
  }
  const config = readConfig();
  if (!config || !config.apiKey || config.apiKey === "YOUR_API_KEY") {
    return {
      ok: false,
      error: "Copy desktop/firebase-config.example.json to firebase-config.json and fill in your Firebase web keys."
    };
  }
  installLocalStorage();
  app = initializeApp(config);
  try {
    auth = initializeAuth(app, { persistence: browserLocalPersistence });
  } catch (err) {
    const { getAuth } = require("firebase/auth");
    auth = getAuth(app);
  }
  firestore = getFirestore(app);
  return { ok: true };
}

function authError(err) {
  const code = err && err.code;
  const messages = {
    "auth/email-already-in-use": "That email already has an account.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-credential": "Wrong email or password.",
    "auth/wrong-password": "Wrong email or password.",
    "auth/user-not-found": "Wrong email or password.",
    "auth/network-request-failed": "Network error reaching Firebase.",
    "permission-denied": "Firestore blocked this write. Publish desktop/firestore.rules in Firebase Console → Firestore → Rules."
  };
  return messages[code] || (err && err.message) || "Firebase request failed.";
}

function publicUser(uid, email, settings, name) {
  return {
    id: uid,
    email,
    username: email,
    name: name || displayName(email),
    settings: settings || DEFAULT_SETTINGS
  };
}

/**
 * Prefer the name saved on the user document; fall back to the email local-part.
 */
async function resolveUserName(uid, email) {
  if (!uid) {
    return displayName(email);
  }
  const snap = await getDoc(doc(firestore, "users", uid));
  if (snap.exists() && snap.data().name) {
    return String(snap.data().name).trim() || displayName(email);
  }
  return displayName(email);
}

async function ensureProfile(uid, email, extras) {
  const payload = extras && typeof extras === "object" ? extras : {};
  const givenName = String(payload.name || "").trim();
  const settingsExtras = Object.assign({}, payload);
  delete settingsExtras.name;

  const ref = doc(firestore, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const settings = mergeSettings(DEFAULT_SETTINGS, settingsExtras);
    const name = givenName || displayName(email);
    await setDoc(ref, {
      email,
      name,
      settings,
      createdAt: Date.now()
    });
    return publicUser(uid, email, settings, name);
  }
  const data = snap.data();
  const name = givenName || data.name || displayName(data.email || email);
  if (givenName && givenName !== data.name) {
    await setDoc(ref, Object.assign({}, data, { name: givenName }), { merge: true });
  }
  return publicUser(uid, data.email || email, mergeSettings(data.settings), name);
}

async function restoreUser() {
  const ready = init();
  if (!ready.ok) {
    return null;
  }
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (!user) {
        resolve(null);
        return;
      }
      resolve(await ensureProfile(user.uid, user.email));
    });
  });
}

async function register(email, password, extras) {
  const ready = init();
  if (!ready.ok) {
    return ready;
  }
  try {
    const cred = await createUserWithEmailAndPassword(auth, String(email || "").trim(), password);
    return { ok: true, user: await ensureProfile(cred.user.uid, cred.user.email, extras) };
  } catch (err) {
    return { ok: false, error: authError(err) };
  }
}

async function login(email, password) {
  const ready = init();
  if (!ready.ok) {
    return ready;
  }
  try {
    const cred = await signInWithEmailAndPassword(auth, String(email || "").trim(), password);
    return { ok: true, user: await ensureProfile(cred.user.uid, cred.user.email) };
  } catch (err) {
    return { ok: false, error: authError(err) };
  }
}

async function logout() {
  if (auth) {
    await signOut(auth);
  }
}

async function saveSettings(uid, settings) {
  init();
  const ref = doc(firestore, "users", uid);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data() : {};
  const next = mergeSettings(prev.settings, settings);
  await setDoc(ref, {
    email: prev.email || (auth.currentUser && auth.currentUser.email) || "",
    settings: next,
    createdAt: prev.createdAt || Date.now()
  });
  return publicUser(uid, prev.email, next);
}

async function createTask(userId, goal) {
  init();
  const ref = await addDoc(collection(firestore, "tasks"), {
    userId,
    goal: String(goal || "").trim(),
    createdAt: Date.now()
  });
  return { id: ref.id, userId, goal: String(goal || "").trim(), createdAt: Date.now() };
}

async function listTasks(userId) {
  init();
  const snap = await getDocs(query(collection(firestore, "tasks"), where("userId", "==", userId)));
  const tasks = [];
  snap.forEach((row) => {
    const data = row.data();
    tasks.push({
      id: row.id,
      userId: data.userId,
      goal: data.goal,
      createdAt: data.createdAt
    });
  });
  tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return tasks;
}

/**
 * Delete a task and every analytics event tied to it.
 * Events are loaded by userId (already indexed) then filtered by taskId.
 */
async function deleteTask(userId, taskId) {
  init();
  const id = String(taskId || "").trim();
  if (!id) {
    return { ok: false, error: "No task selected." };
  }
  const ref = doc(firestore, "tasks", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { ok: false, error: "That task is already gone." };
  }
  if (snap.data().userId !== userId) {
    return { ok: false, error: "You can only delete your own tasks." };
  }
  const events = await getDocs(query(collection(firestore, "events"), where("userId", "==", userId)));
  for (const row of events.docs) {
    if (row.data().taskId === id) {
      await deleteDoc(row.ref);
    }
  }
  await deleteDoc(ref);
  return { ok: true };
}

async function appendEvent(event) {
  init();
  await addDoc(collection(firestore, "events"), event);
}

function dayBounds(dayKey) {
  const parts = String(dayKey).split("-").map(Number);
  const start = new Date(parts[0], parts[1] - 1, parts[2]);
  const from = start.getTime();
  return { from, to: from + 24 * 60 * 60 * 1000 };
}

function rank(obj) {
  return Object.keys(obj)
    .map((key) => ({ name: key, ms: obj[key] }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 8);
}

async function analytics(userId, dayKey, taskId) {
  init();
  const { from, to } = dayBounds(dayKey);
  const snap = await getDocs(query(collection(firestore, "events"), where("userId", "==", userId)));
  const tasks = await listTasks(userId);
  const taskNames = {};
  tasks.forEach((task) => {
    taskNames[task.id] = task.goal;
  });
  let onMs = 0;
  let offMs = 0;
  let ambMs = 0;
  let eventCount = 0;
  const byApp = {};
  const byDomain = {};
  const byTask = {};
  snap.forEach((row) => {
    const event = row.data();
    if (event.ts < from || event.ts >= to) {
      return;
    }
    if (taskId && event.taskId !== taskId) {
      return;
    }
    eventCount += 1;
    const ms = event.durationMs || 2500;
    if (event.classification === "on-task") {
      onMs += ms;
    } else if (event.classification === "off-task") {
      offMs += ms;
      const appName = event.app || "Unknown";
      byApp[appName] = (byApp[appName] || 0) + ms;
      if (event.domain) {
        byDomain[event.domain] = (byDomain[event.domain] || 0) + ms;
      }
    } else if (event.classification === "ambiguous") {
      ambMs += ms;
    }
    const label = taskNames[event.taskId] || "Untitled";
    if (!byTask[label]) {
      byTask[label] = { onMs: 0, offMs: 0, ambMs: 0 };
    }
    if (event.classification === "on-task") {
      byTask[label].onMs += ms;
    } else if (event.classification === "off-task") {
      byTask[label].offMs += ms;
    } else if (event.classification === "ambiguous") {
      byTask[label].ambMs += ms;
    }
  });
  return {
    onMs,
    offMs,
    ambMs,
    totalMs: onMs + offMs + ambMs,
    apps: rank(byApp),
    domains: rank(byDomain),
    tasks: Object.keys(byTask).map((goal) => Object.assign({ goal }, byTask[goal])),
    eventCount
  };
}

function localDayKey(now) {
  const d = new Date(now || Date.now());
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function weekKey(now) {
  const d = new Date(now || Date.now());
  const weekday = d.getDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  d.setDate(d.getDate() + offset);
  return localDayKey(d);
}

function intentScore(onMs, offMs, rescues) {
  const share = onMs / Math.max(onMs + offMs, 1);
  return Math.round((onMs / 60000) * share * 10 + (rescues || 0) * 8);
}

function displayName(email) {
  const local = String(email || "friend").split("@")[0];
  return local || "friend";
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function streakFromDays(daysWithFocus) {
  const set = new Set(daysWithFocus);
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 60; i += 1) {
    const key = localDayKey(cursor);
    if (!set.has(key)) {
      break;
    }
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function badgesFromRollup(rollup) {
  const badges = [];
  if (rollup.onMs >= 60000) {
    badges.push("First session");
  }
  if (rollup.rescues >= 1) {
    badges.push("Honest rescue");
  }
  if (rollup.rescues >= 3) {
    badges.push("Comeback kid");
  }
  if (rollup.youtubeOn) {
    badges.push("Lecture, not gameplay");
  }
  if (rollup.longestOnMs >= 25 * 60 * 1000) {
    badges.push("Deep work");
  }
  if (rollup.streak >= 3) {
    badges.push("3-day streak");
  }
  if (rollup.share >= 0.8 && rollup.onMs >= 20 * 60 * 1000) {
    badges.push("Lock-in");
  }
  return badges;
}

async function rollupUser(userId) {
  const snap = await getDocs(query(collection(firestore, "events"), where("userId", "==", userId)));
  const week = weekKey();
  const { from, to } = dayBounds(week);
  const weekEnd = from + 7 * 24 * 60 * 60 * 1000;
  let onMs = 0;
  let offMs = 0;
  let ambMs = 0;
  let rescues = 0;
  let youtubeOn = false;
  let longestOnMs = 0;
  const focusDays = [];
  const byDay = {};
  snap.forEach((row) => {
    const event = row.data();
    const day = localDayKey(event.ts);
    if (!byDay[day]) {
      byDay[day] = 0;
    }
    if (event.classification === "on-task") {
      byDay[day] += event.durationMs || 0;
    }
    if (event.ts < from || event.ts >= weekEnd) {
      return;
    }
    const ms = event.durationMs || 0;
    if (event.classification === "on-task") {
      onMs += ms || 2500;
      longestOnMs = Math.max(longestOnMs, ms);
      const hay = `${event.app || ""} ${event.domain || ""} ${event.title || ""}`.toLowerCase();
      if (hay.indexOf("youtube") !== -1) {
        youtubeOn = true;
      }
    } else if (event.classification === "off-task") {
      offMs += ms || 2500;
    } else if (event.classification === "ambiguous") {
      ambMs += ms || 2500;
    } else if (event.classification === "justified") {
      rescues += 1;
    }
  });
  Object.keys(byDay).forEach((day) => {
    if (byDay[day] >= 60000) {
      focusDays.push(day);
    }
  });
  const streak = streakFromDays(focusDays);
  const share = onMs / Math.max(onMs + offMs, 1);
  return {
    onMs,
    offMs,
    ambMs,
    rescues,
    youtubeOn,
    longestOnMs,
    streak,
    share,
    score: intentScore(onMs, offMs, rescues),
    badges: badgesFromRollup({
      onMs, rescues, youtubeOn, longestOnMs, streak, share
    })
  };
}

async function setPresence(userId, email, payload) {
  init();
  await setDoc(doc(firestore, "profiles", userId), Object.assign({
    email,
    updatedAt: Date.now()
  }, payload));
}

async function publishWeekly(userId, email) {
  init();
  const week = weekKey();
  const rollup = await rollupUser(userId);
  const name = await resolveUserName(userId, email);
  const body = {
    userId,
    email,
    name,
    weekKey: week,
    onMs: rollup.onMs,
    offMs: rollup.offMs,
    ambMs: rollup.ambMs,
    rescues: rollup.rescues,
    streak: rollup.streak,
    score: rollup.score,
    badges: rollup.badges,
    updatedAt: Date.now()
  };
  await setDoc(doc(firestore, "weeklyStats", userId + "_" + week), body);
  await setPresence(userId, email, {
    streak: rollup.streak,
    score: rollup.score,
    badges: rollup.badges
  });
  return body;
}

function normalizeCircleName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * True if this user is already in a circle whose name matches (case-insensitive).
 */
async function userInCircleNamed(userId, label, exceptCircleId) {
  const key = normalizeCircleName(label);
  if (!key) {
    return false;
  }
  const mine = await getDocs(query(collection(firestore, "circleMembers"), where("userId", "==", userId)));
  for (const row of mine.docs) {
    const circleId = row.data().circleId;
    if (exceptCircleId && circleId === exceptCircleId) {
      continue;
    }
    const circleSnap = await getDoc(doc(firestore, "circles", circleId));
    if (circleSnap.exists() && normalizeCircleName(circleSnap.data().name) === key) {
      return true;
    }
  }
  return false;
}

async function createCircle(userId, email, name) {
  init();
  const label = String(name || "").trim().replace(/\s+/g, " ");
  if (!label) {
    return { ok: false, error: "Enter a circle name." };
  }
  if (await userInCircleNamed(userId, label)) {
    return { ok: false, error: "You are already in a circle named “" + label + "”." };
  }
  const ref = await addDoc(collection(firestore, "circles"), {
    name: label,
    code: randomCode(),
    createdBy: userId,
    createdAt: Date.now()
  });
  const memberName = await resolveUserName(userId, email);
  await setDoc(doc(firestore, "circleMembers", ref.id + "_" + userId), {
    circleId: ref.id,
    userId,
    email,
    name: memberName,
    joinedAt: Date.now()
  });
  return { ok: true, circle: await getCircle(ref.id, userId) };
}

async function joinCircle(userId, email, code) {
  init();
  const needle = String(code || "").trim().toUpperCase();
  const snap = await getDocs(query(collection(firestore, "circles"), where("code", "==", needle)));
  if (snap.empty) {
    return { ok: false, error: "No circle uses that code." };
  }
  const circle = snap.docs[0];
  const data = circle.data();
  const memberRef = doc(firestore, "circleMembers", circle.id + "_" + userId);
  const existing = await getDoc(memberRef);
  if (existing.exists()) {
    return { ok: true, circle: await getCircle(circle.id, userId) };
  }
  if (await userInCircleNamed(userId, data.name, circle.id)) {
    return { ok: false, error: "You are already in a circle named “" + data.name + "”." };
  }
  const memberName = await resolveUserName(userId, email);
  await setDoc(memberRef, {
    circleId: circle.id,
    userId,
    email,
    name: memberName,
    joinedAt: Date.now()
  });
  const loaded = await getCircle(circle.id, userId);
  return {
    ok: true,
    circle: loaded || {
      id: circle.id,
      name: data.name,
      code: data.code,
      createdBy: data.createdBy,
      members: [{ userId, name: memberName, me: true, score: 0, onMs: 0, offMs: 0, streak: 0, rescues: 0, badges: [] }],
      huddle: [],
      average: 0,
      isOwner: data.createdBy === userId
    }
  };
}

/**
 * Delete a circle and every membership. Only the creator may do this.
 */
async function deleteCircle(userId, circleId) {
  init();
  const ref = doc(firestore, "circles", circleId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { ok: false, error: "That circle is already gone." };
  }
  if (snap.data().createdBy !== userId) {
    return { ok: false, error: "Only the person who created the circle can delete it." };
  }
  const members = await getDocs(query(collection(firestore, "circleMembers"), where("circleId", "==", circleId)));
  for (const row of members.docs) {
    await deleteDoc(row.ref);
  }
  await deleteDoc(ref);
  return { ok: true };
}

async function getCircle(circleId, viewerId) {
  const circleSnap = await getDoc(doc(firestore, "circles", circleId));
  if (!circleSnap.exists()) {
    return null;
  }
  const circle = Object.assign({ id: circleId }, circleSnap.data());
  const membersSnap = await getDocs(query(collection(firestore, "circleMembers"), where("circleId", "==", circleId)));
  const week = weekKey();
  const members = [];
  const huddle = [];
  for (const row of membersSnap.docs) {
    const member = row.data();
    const statsSnap = await getDoc(doc(firestore, "weeklyStats", member.userId + "_" + week));
    const stats = statsSnap.exists() ? statsSnap.data() : {
      score: 0, onMs: 0, offMs: 0, streak: 0, rescues: 0, badges: []
    };
    const profileSnap = await getDoc(doc(firestore, "profiles", member.userId));
    const profile = profileSnap.exists() ? profileSnap.data() : {};
    // Use the name saved on the membership — do not read other users' private docs.
    const label = String(member.name || "").trim() || displayName(member.email);
    members.push({
      userId: member.userId,
      name: label,
      email: member.email,
      score: stats.score || 0,
      onMs: stats.onMs || 0,
      offMs: stats.offMs || 0,
      streak: stats.streak || 0,
      rescues: stats.rescues || 0,
      badges: stats.badges || [],
      me: member.userId === viewerId
    });
    if (profile.focus && profile.goal) {
      huddle.push({
        name: label,
        goal: profile.goal,
        me: member.userId === viewerId
      });
    }
  }
  members.sort((a, b) => b.score - a.score);
  const average = members.length
    ? Math.round(members.reduce((sum, row) => sum + row.score, 0) / members.length)
    : 0;
  return Object.assign({
    members,
    huddle,
    average,
    weekKey: week,
    isOwner: circle.createdBy === viewerId
  }, circle);
}

async function listCircles(userId) {
  init();
  const snap = await getDocs(query(collection(firestore, "circleMembers"), where("userId", "==", userId)));
  const circles = [];
  for (const row of snap.docs) {
    const circle = await getCircle(row.data().circleId, userId);
    if (circle) {
      circles.push(circle);
    } else {
      // Circle was deleted — drop the leftover membership so the UI stays clean.
      await deleteDoc(row.ref);
    }
  }
  return circles;
}

module.exports = {
  init,
  restoreUser,
  register,
  login,
  logout,
  saveSettings,
  createTask,
  listTasks,
  deleteTask,
  appendEvent,
  analytics,
  localDayKey,
  weekKey,
  publishWeekly,
  setPresence,
  createCircle,
  joinCircle,
  deleteCircle,
  listCircles,
  DEFAULT_SETTINGS
};
