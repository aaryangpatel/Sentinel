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
  getDocs
} = require("firebase/firestore");

const DEFAULT_SETTINGS = {
  provider: "groq",
  apiKey: "",
  model: "openai/gpt-oss-20b",
  ollamaUrl: "http://localhost:11434/v1/chat/completions",
  graceSeconds: 45
};

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

function publicUser(uid, email, settings) {
  return {
    id: uid,
    email,
    username: email,
    settings: settings || DEFAULT_SETTINGS
  };
}

async function ensureProfile(uid, email) {
  const ref = doc(firestore, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email,
      settings: DEFAULT_SETTINGS,
      createdAt: Date.now()
    });
    return publicUser(uid, email, DEFAULT_SETTINGS);
  }
  const data = snap.data();
  return publicUser(uid, data.email || email, Object.assign({}, DEFAULT_SETTINGS, data.settings || {}));
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

async function register(email, password) {
  const ready = init();
  if (!ready.ok) {
    return ready;
  }
  try {
    const cred = await createUserWithEmailAndPassword(auth, String(email || "").trim(), password);
    return { ok: true, user: await ensureProfile(cred.user.uid, cred.user.email) };
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
  const next = Object.assign({}, DEFAULT_SETTINGS, prev.settings || {}, settings);
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
  return String(email || "friend").split("@")[0];
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
  const body = {
    userId,
    email,
    name: displayName(email),
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

async function createCircle(userId, email, name) {
  init();
  const label = String(name || "").trim() || "Study circle";
  const ref = await addDoc(collection(firestore, "circles"), {
    name: label,
    code: randomCode(),
    createdBy: userId,
    createdAt: Date.now()
  });
  await setDoc(doc(firestore, "circleMembers", ref.id + "_" + userId), {
    circleId: ref.id,
    userId,
    email,
    name: displayName(email),
    joinedAt: Date.now()
  });
  return getCircle(ref.id, userId);
}

async function joinCircle(userId, email, code) {
  init();
  const needle = String(code || "").trim().toUpperCase();
  const snap = await getDocs(query(collection(firestore, "circles"), where("code", "==", needle)));
  if (snap.empty) {
    return { ok: false, error: "No circle uses that code." };
  }
  const circle = snap.docs[0];
  await setDoc(doc(firestore, "circleMembers", circle.id + "_" + userId), {
    circleId: circle.id,
    userId,
    email,
    name: displayName(email),
    joinedAt: Date.now()
  });
  return { ok: true, circle: await getCircle(circle.id, userId) };
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
    members.push({
      userId: member.userId,
      name: member.name || displayName(member.email),
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
        name: member.name || displayName(member.email),
        goal: profile.goal,
        me: member.userId === viewerId
      });
    }
  }
  members.sort((a, b) => b.score - a.score);
  const average = members.length
    ? Math.round(members.reduce((sum, row) => sum + row.score, 0) / members.length)
    : 0;
  return Object.assign({ members, huddle, average, weekKey: week }, circle);
}

async function listCircles(userId) {
  init();
  const snap = await getDocs(query(collection(firestore, "circleMembers"), where("userId", "==", userId)));
  const circles = [];
  for (const row of snap.docs) {
    const circle = await getCircle(row.data().circleId, userId);
    if (circle) {
      circles.push(circle);
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
  appendEvent,
  analytics,
  localDayKey,
  weekKey,
  publishWeekly,
  setPresence,
  createCircle,
  joinCircle,
  listCircles,
  DEFAULT_SETTINGS
};
