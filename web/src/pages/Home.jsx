import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { dmgUrl } from "../firebase.js";

export default function Home() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const target = document.querySelector(location.hash);
      if (target) {
        target.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [location]);

  return (
    <>
      <header className="nav">
        <Link className="logo" to="/"><span className="mark" />Sentinel</Link>
        <nav>
          <a href="#how">How it works</a>
          <a href="#download">Install</a>
          <Link to="/account">Your account</Link>
          <a className="btn" href="#download">Download for Mac</a>
        </nav>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">For macOS</p>
          <h1>An AI that reads intent, not a list of banned websites.</h1>
          <p className="lede">
            Sentinel watches the app in front of you — browser, editor, messages, games —
            and checks it against the task you named. YouTube stays open for a lecture.
            Discord during homework does not.
          </p>
          <div className="cta">
            <a className="btn lg" href="#download">Download for Mac</a>
            <Link className="btn ghost lg" to="/account">View your account</Link>
          </div>
          <p className="quiet">macOS 12 or later · Apple silicon &amp; Intel · Free to start</p>
        </div>
        <div className="hero-window" aria-hidden="true">
          <div className="dots"><i /><i /><i /></div>
          <p className="win-kicker">Live session</p>
          <p className="win-app">Google Chrome</p>
          <p className="win-meta">youtube.com · Essence of linear algebra</p>
          <p className="win-class">On-task</p>
        </div>
      </section>

      <section id="how" className="band">
        <h2>What you get</h2>
        <div className="cards">
          <article>
            <p className="eyebrow">Detect</p>
            <h3>Any app, real URLs</h3>
            <p>Frontmost Mac app plus the active tab in Chrome, Safari, Arc, Brave, and Edge — not a static blocklist.</p>
          </article>
          <article>
            <p className="eyebrow">Nudge</p>
            <h3>Off-track, immediately</h3>
            <p>A corner alert when you drift. A short question after a grace period. Friction, not a wall.</p>
          </article>
          <article>
            <p className="eyebrow">Circles</p>
            <h3>Compete on intent</h3>
            <p>Invite friends with a code. Weekly Intent Score rewards real on-task time and honest rescues, not more screen time.</p>
          </article>
        </div>
      </section>

      <section id="download" className="download">
        <div>
          <p className="eyebrow">macOS</p>
          <h2>Add Sentinel to Applications</h2>
          <p className="lede">
            Download the disk image, drag Sentinel into Applications, then launch it from Launchpad or Spotlight.
          </p>
          <a className="btn lg" href={dmgUrl}>Download Sentinel for Mac</a>
          <p className="quiet">
            Requires macOS 12+. First launch: right-click the app → Open. The installer is published on GitHub Releases (Vercel cannot host the 125MB disk image).
          </p>
        </div>
        <ol className="steps">
          <li><strong>Download the .dmg</strong> Save it from this page.</li>
          <li><strong>Open the disk image</strong> Double-click Sentinel-2.0.0.dmg.</li>
          <li><strong>Drag to Applications</strong> Drop Sentinel onto the Applications folder.</li>
          <li><strong>First launch</strong> Right-click → Open. Allow Accessibility, Screen Recording, and Automation when asked.</li>
        </ol>
      </section>

      <footer>
        <span>Sentinel</span>
        <Link to="/account">Account</Link>
        <a href="https://github.com/aaryangpatel/Procrastination">Source</a>
      </footer>
    </>
  );
}
