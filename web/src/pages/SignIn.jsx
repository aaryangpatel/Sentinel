import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, firebaseReady } from "../firebase.js";
import Layout from "../Layout.jsx";

const DEFAULT_COMPANIONS = ["Spotify", "Music", "Notes"];

export default function SignIn() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get("mode") === "register" ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    if (params.get("mode") === "register") {
      setMode("register");
    }
  }, [params]);

  useEffect(() => {
    if (!firebaseReady) {
      setUser(null);
      return undefined;
    }
    return onAuthStateChanged(auth, (next) => setUser(next));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!firebaseReady) {
      setError("Accounts need Firebase keys in the site environment.");
      return;
    }
    const work = mode === "register"
      ? createUserWithEmailAndPassword(auth, email.trim(), password).then((cred) => setDoc(doc(db, "users", cred.user.uid), {
        email: email.trim(),
        settings: {
          provider: "groq",
          model: "openai/gpt-oss-20b",
          graceSeconds: 45,
          companionApps: DEFAULT_COMPANIONS,
          companionSites: []
        },
        createdAt: Date.now()
      }))
      : signInWithEmailAndPassword(auth, email.trim(), password);
    work.catch((err) => setError(err.message || "Could not continue."));
  }

  if (user) {
    return <Navigate to="/account" replace />;
  }
  if (user === undefined) {
    return (
      <Layout center>
        <p className="quiet">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout center>
      <form className="auth-box" onSubmit={submit}>
        <p className="eyebrow">Account</p>
        <h1>{mode === "register" ? "Create your account" : "Sign in"}</h1>
        <p className="lede">The same email and password as the Mac app.</p>
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={mode === "login" ? "tab on" : "tab"}
            aria-selected={mode === "login"}
            onClick={() => setMode("login")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            className={mode === "register" ? "tab on" : "tab"}
            aria-selected={mode === "register"}
            onClick={() => setMode("register")}
          >
            Create account
          </button>
        </div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          required
          minLength={6}
        />
        <p className="error">
          {error || (!firebaseReady ? "Set VITE_FIREBASE_* on the host before accounts will work." : "")}
        </p>
        <button type="submit" className="btn lg wide">
          {mode === "register" ? "Create account" : "Sign in"}
        </button>
        <p className="quiet" style={{ marginTop: 16 }}>
          Need a Groq key after you install? See the <Link to="/groq">API key guide</Link>.
        </p>
      </form>
    </Layout>
  );
}
