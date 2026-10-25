import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where
} from "firebase/firestore";
import { db } from "./firebase.js";

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

async function getCircle(circleId, viewerId) {
  const circleSnap = await getDoc(doc(db, "circles", circleId));
  if (!circleSnap.exists()) {
    return null;
  }
  const circle = Object.assign({ id: circleId }, circleSnap.data());
  const membersSnap = await getDocs(query(collection(db, "circleMembers"), where("circleId", "==", circleId)));
  const week = weekKey();
  const members = [];
  const huddle = [];
  for (const row of membersSnap.docs) {
    const member = row.data();
    const statsSnap = await getDoc(doc(db, "weeklyStats", member.userId + "_" + week));
    const stats = statsSnap.exists() ? statsSnap.data() : {
      score: 0, onMs: 0, offMs: 0, streak: 0, rescues: 0, badges: []
    };
    const profileSnap = await getDoc(doc(db, "profiles", member.userId));
    const profile = profileSnap.exists() ? profileSnap.data() : {};
    members.push({
      userId: member.userId,
      name: member.name || displayName(member.email),
      score: stats.score || 0,
      onMs: stats.onMs || 0,
      offMs: stats.offMs || 0,
      streak: stats.streak || 0,
      rescues: stats.rescues || 0,
      badges: stats.badges || [],
      me: member.userId === viewerId
    });
    if (profile.focus && profile.goal) {
      huddle.push({ name: member.name || displayName(member.email), goal: profile.goal });
    }
  }
  members.sort((a, b) => b.score - a.score);
  const average = members.length
    ? Math.round(members.reduce((sum, row) => sum + row.score, 0) / members.length)
    : 0;
  return Object.assign({ members, huddle, average, weekKey: week }, circle);
}

export async function createCircle(user, name) {
  const ref = await addDoc(collection(db, "circles"), {
    name: String(name || "").trim() || "Study circle",
    code: randomCode(),
    createdBy: user.uid,
    createdAt: Date.now()
  });
  await setDoc(doc(db, "circleMembers", ref.id + "_" + user.uid), {
    circleId: ref.id,
    userId: user.uid,
    email: user.email,
    name: displayName(user.email),
    joinedAt: Date.now()
  });
  return getCircle(ref.id, user.uid);
}

export async function joinCircle(user, code) {
  const snap = await getDocs(query(collection(db, "circles"), where("code", "==", String(code || "").trim().toUpperCase())));
  if (snap.empty) {
    throw new Error("No circle uses that code.");
  }
  const circle = snap.docs[0];
  await setDoc(doc(db, "circleMembers", circle.id + "_" + user.uid), {
    circleId: circle.id,
    userId: user.uid,
    email: user.email,
    name: displayName(user.email),
    joinedAt: Date.now()
  });
  return getCircle(circle.id, user.uid);
}

export async function listCircles(userId) {
  const snap = await getDocs(query(collection(db, "circleMembers"), where("userId", "==", userId)));
  const circles = [];
  for (const row of snap.docs) {
    const circle = await getCircle(row.data().circleId, userId);
    if (circle) {
      circles.push(circle);
    }
  }
  return circles;
}

export function fmtMin(ms) {
  const minutes = Math.round((ms || 0) / 60000);
  if (minutes < 1) {
    return Math.round((ms || 0) / 1000) + "s";
  }
  return minutes + "m";
}
