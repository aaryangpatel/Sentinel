import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc
} from "firebase/firestore";
import Chart from "chart.js/auto";
import { auth, db, firebaseReady, dmgUrl } from "../firebase.js";
import { createCircle, joinCircle, listCircles, fmtMin as formatMinutes } from "../circles.js";

const COMPANION_PRESETS = ["Spotify", "Music", "Notes", "Calendar", "Notion", "Obsidian", "Messages", "Slack"];
const DEFAULT_COMPANIONS = ["Spotify", "Music", "Notes"];

function hasCompanion(list, name) {
  const key = String(name || "").trim().toLowerCase();
  return list.some((item) => item.toLowerCase() === key);
}

function todayKey() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function fmtMin(ms) {
  const minutes = Math.round((ms || 0) / 60000);
  if (minutes < 1) {
    return Math.round((ms || 0) / 1000) + "s";
  }
  return minutes + "m";
}

function dayBounds(dayKey) {
  const parts = String(dayKey).split("-").map(Number);
  const start = new Date(parts[0], parts[1] - 1, parts[2]);
  const from = start.getTime();
  return { from, to: from + 24 * 60 * 60 * 1000 };
}

export default function Account() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [day, setDay] = useState(todayKey());
  const [taskId, setTaskId] = useState("");
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({
    onMs: 0,
    offMs: 0,
    ambMs: 0,
    apps: [],
    domains: [],
    byTask: []
  });
  const [circles, setCircles] = useState([]);
  const [circleName, setCircleName] = useState("");
  const [circleCode, setCircleCode] = useState("");
  const [circleError, setCircleError] = useState("");
  const [companions, setCompanions] = useState(DEFAULT_COMPANIONS);
  const [companionSites, setCompanionSites] = useState([]);
  const [companionDraft, setCompanionDraft] = useState("");
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!firebaseReady) {
      return undefined;
    }
    return onAuthStateChanged(auth, (next) => setUser(next));
  }, []);

  useEffect(() => {
    if (!user) {
      setCompanions(DEFAULT_COMPANIONS);
      setCompanionSites([]);
      return;
    }
    loadAnalytics();
    loadCircles();
    loadCompanions();
  }, [user, day, taskId]);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    if (chartRef.current) {
      chartRef.current.destroy();
    }
    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: ["On-task", "Ambiguous", "Off-task"],
        datasets: [{
          data: [stats.onMs, stats.ambMs, stats.offMs],
          backgroundColor: ["#c4a35a", "#7d8896", "#c56b56"],
          borderWidth: 0
        }]
      },
      options: { plugins: { legend: { labels: { color: "#ece8dd" } } } }
    });
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [stats]);

  async function loadCompanions() {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) {
      setCompanions(DEFAULT_COMPANIONS);
      return;
    }
    const settings = snap.data().settings || {};
    setCompanions(Array.isArray(settings.companionApps) ? settings.companionApps : DEFAULT_COMPANIONS);
    setCompanionSites(Array.isArray(settings.companionSites) ? settings.companionSites : []);
  }

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

  async function saveAllowList(nextApps, nextSites) {
    setCompanions(nextApps);
    setCompanionSites(nextSites);
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const prev = snap.exists() ? snap.data() : {};
    const settings = Object.assign({}, prev.settings || {}, {
      companionApps: nextApps,
      companionSites: nextSites
    });
    if (snap.exists()) {
      await updateDoc(ref, { settings });
    } else {
      await setDoc(ref, {
        email: user.email,
        settings,
        createdAt: Date.now()
      });
    }
  }

  function toggleCompanion(name) {
    const next = hasCompanion(companions, name)
      ? companions.filter((item) => item.toLowerCase() !== name.toLowerCase())
      : companions.concat([name]);
    saveAllowList(next, companionSites);
  }

  function toggleSite(name) {
    const host = normalizeSite(name);
    const next = companionSites.indexOf(host) === -1
      ? companionSites.concat([host])
      : companionSites.filter((item) => item !== host);
    saveAllowList(companions, next);
  }

  function addDraft() {
    const name = companionDraft.trim();
    if (!name) {
      return;
    }
    setCompanionDraft("");
    if (looksLikeSite(name)) {
      const host = normalizeSite(name);
      if (companionSites.indexOf(host) === -1) {
        saveAllowList(companions, companionSites.concat([host]));
      }
      return;
    }
    if (!hasCompanion(companions, name)) {
      saveAllowList(companions.concat([name]), companionSites);
    }
  }

  function companionNames() {
    return COMPANION_PRESETS.concat(
      companions.filter((name) => !COMPANION_PRESETS.some((preset) => preset.toLowerCase() === name.toLowerCase()))
    );
  }

  async function loadAnalytics() {
    const tasksSnap = await getDocs(query(collection(db, "tasks"), where("userId", "==", user.uid)));
    const nextTasks = [];
    const taskNames = {};
    tasksSnap.forEach((row) => {
      const data = row.data();
      nextTasks.push({ id: row.id, goal: data.goal, createdAt: data.createdAt });
      taskNames[row.id] = data.goal;
    });
    nextTasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    setTasks(nextTasks);

    const { from, to } = dayBounds(day);
    const eventsSnap = await getDocs(query(collection(db, "events"), where("userId", "==", user.uid)));
    let onMs = 0;
    let offMs = 0;
    let ambMs = 0;
    const byApp = {};
    const byDomain = {};
    const byTask = {};
    eventsSnap.forEach((row) => {
      const event = row.data();
      if (event.ts < from || event.ts >= to) {
        return;
      }
      if (taskId && event.taskId !== taskId) {
        return;
      }
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
    const apps = Object.keys(byApp)
      .sort((a, b) => byApp[b] - byApp[a])
      .slice(0, 8)
      .map((name) => ({ name, ms: byApp[name] }));
    const domains = Object.keys(byDomain)
      .sort((a, b) => byDomain[b] - byDomain[a])
      .slice(0, 8)
      .map((name) => ({ name, ms: byDomain[name] }));
    setStats({
      onMs,
      offMs,
      ambMs,
      apps,
      domains,
      byTask: Object.keys(byTask).map((goal) => Object.assign({ goal }, byTask[goal]))
    });
  }

  async function loadCircles() {
    const next = await listCircles(user.uid);
    setCircles(next);
  }

  async function onCreateCircle(event) {
    event.preventDefault();
    setCircleError("");
    const circle = await createCircle(user, circleName);
    setCircleName("");
    setCircles(await listCircles(user.uid));
    return circle;
  }

  async function onJoinCircle(event) {
    event.preventDefault();
    setCircleError("");
    try {
      await joinCircle(user, circleCode);
      setCircleCode("");
      setCircles(await listCircles(user.uid));
    } catch (err) {
      setCircleError(err.message || "Could not join.");
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!firebaseReady) {
      setError("Add VITE_FIREBASE_* keys in Vercel (or web/.env) to enable accounts.");
      return;
    }
    try {
      if (mode === "register") {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await setDoc(doc(db, "users", cred.user.uid), {
          email: email.trim(),
          settings: {
            provider: "groq",
            model: "openai/gpt-oss-20b",
            graceSeconds: 45,
            companionApps: DEFAULT_COMPANIONS,
            companionSites: []
          },
          createdAt: Date.now()
        });
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      setError(err.message || "Could not sign in.");
    }
  }

  const total = stats.onMs + stats.offMs;
  const offRows = stats.apps.concat(stats.domains);

  return (
    <>
      <header className="nav">
        <Link className="logo" to="/"><span className="mark" />Sentinel</Link>
        <nav>
          <a href={dmgUrl}>Download for Mac</a>
          <Link className="btn" to="/#download">Get the app</Link>
        </nav>
      </header>

      <div className="account-shell">
        {!user && (
          <form className="auth-box" onSubmit={submit}>
            <p className="eyebrow">Account</p>
            <h1>See your focus from any browser.</h1>
            <p className="lede">Same Firebase login as the Mac app. Analytics are per day and per task.</p>
            <div className="cta" style={{ marginTop: 0 }}>
              <button type="button" className="btn" onClick={() => setMode("login")}>Sign in</button>
              <button type="button" className="btn ghost" onClick={() => setMode("register")}>Create account</button>
            </div>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <p className="error">{error || (!firebaseReady ? "Set VITE_FIREBASE_* environment variables before accounts will work." : "")}</p>
            <button type="submit" className="btn lg">Continue</button>
          </form>
        )}

        {user && (
          <div>
            <div className="toolbar">
              <div>
                <p className="eyebrow">Your work</p>
                <h1>Per task, per day</h1>
                <p className="who">{user.email}</p>
              </div>
              <button type="button" className="btn ghost" onClick={() => signOut(auth)}>Sign out</button>
            </div>
            <div className="filters">
              <label>Day <input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
              <label>Task
                <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                  <option value="">All tasks</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>{task.goal}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="stats">
              <div className="stat"><b>{fmtMin(stats.onMs)}</b><span>On task</span></div>
              <div className="stat"><b>{fmtMin(stats.offMs)}</b><span>Off task</span></div>
              <div className="stat"><b>{total ? Math.round((stats.onMs / total) * 100) + "%" : "—"}</b><span>Focus share</span></div>
            </div>
            <div className="grid-2">
              <div className="card">
                <p className="eyebrow">Mix</p>
                <canvas ref={canvasRef} width="360" height="220" />
              </div>
              <div className="card">
                <p className="eyebrow">Off-task apps & sites</p>
                <ol className="rank">
                  {offRows.length === 0 && <li>Nothing off-task yet today.</li>}
                  {offRows.map((row, index) => (
                    <li key={row.name + index}>{row.name} · {fmtMin(row.ms)}</li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="card" style={{ marginTop: 16 }}>
              <p className="eyebrow">By task</p>
              <table>
                <thead><tr><th>Task</th><th>On</th><th>Off</th><th>Ambiguous</th></tr></thead>
                <tbody>
                  {stats.byTask.map((row) => (
                    <tr key={row.goal}>
                      <td>{row.goal}</td>
                      <td>{fmtMin(row.onMs)}</td>
                      <td>{fmtMin(row.offMs)}</td>
                      <td>{fmtMin(row.ambMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card" style={{ marginTop: 16 }}>
              <p className="eyebrow">Always allowed</p>
              <h2>Apps and sites that stay on-task</h2>
              <p className="lede">Add extras after you sign in — Spotify, Notion, or khanacademy.org. Click a chip to remove it.</p>
              <div className="chips">
                {companionNames().map((name) => (
                  <button
                    type="button"
                    key={name}
                    className={"chip" + (hasCompanion(companions, name) ? " on" : "")}
                    onClick={() => toggleCompanion(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="chips">
                {companionSites.map((name) => (
                  <button
                    type="button"
                    key={name}
                    className="chip on"
                    onClick={() => toggleSite(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="filters">
                <input
                  value={companionDraft}
                  onChange={(e) => setCompanionDraft(e.target.value)}
                  placeholder="Add an app or site"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addDraft();
                    }
                  }}
                />
                <button type="button" className="btn ghost" onClick={addDraft}>Add</button>
              </div>
            </div>
            <div className="card" style={{ marginTop: 16 }}>
              <p className="eyebrow">Circles</p>
              <h2>Compete on intent, not screen time</h2>
              <p className="lede">Weekly Intent Score = on-task minutes × focus share, plus rescue points when you honestly explain a detour.</p>
              <div className="grid-2">
                <form onSubmit={onCreateCircle}>
                  <label>New circle</label>
                  <input value={circleName} onChange={(e) => setCircleName(e.target.value)} placeholder="Calc study group" />
                  <button type="submit" className="btn" style={{ marginTop: 12 }}>Create</button>
                </form>
                <form onSubmit={onJoinCircle}>
                  <label>Join code</label>
                  <input value={circleCode} onChange={(e) => setCircleCode(e.target.value.toUpperCase())} placeholder="7K3M2P" />
                  <button type="submit" className="btn" style={{ marginTop: 12 }}>Join</button>
                </form>
              </div>
              <p className="error">{circleError}</p>
              {circles.map((circle) => (
                <div key={circle.id} style={{ marginTop: 20 }}>
                  <p>{circle.name} · Invite <span className="code">{circle.code}</span> · Beat {circle.average}</p>
                  {(circle.huddle || []).map((row) => (
                    <p key={row.name} className="who">{row.name} is on “{row.goal}”</p>
                  ))}
                  <table>
                    <thead><tr><th>#</th><th>Friend</th><th>Intent</th><th>On</th><th>Streak</th><th>Rescues</th></tr></thead>
                    <tbody>
                      {circle.members.map((member, index) => (
                        <tr key={member.userId}>
                          <td>{index + 1}</td>
                          <td>{member.name}{member.me ? " (you)" : ""}</td>
                          <td>{member.score}</td>
                          <td>{formatMinutes(member.onMs)}</td>
                          <td>{member.streak}d</td>
                          <td>{member.rescues}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 10 }}>
                    {(circle.members.find((member) => member.me)?.badges || []).map((badge) => (
                      <span className="badge" key={badge}>{badge}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
