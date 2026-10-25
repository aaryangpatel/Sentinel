import { Link } from "react-router-dom";
import Layout from "../Layout.jsx";

export default function Home() {
  return (
    <Layout>
      <section className="hero">
        <div>
          <p className="eyebrow">macOS focus</p>
          <h1>Classify the window in front of you, not a list of banned sites.</h1>
          <p className="lede">
            Sentinel reads the frontmost app and the live browser tab, then checks that
            page against the task you named. A lecture on YouTube can stay open.
            A distraction on the same site cannot.
          </p>
          <div className="cta">
            <Link className="btn lg" to="/download">Download for Mac</Link>
            <Link className="btn ghost lg" to="/signin?mode=register">Create account</Link>
          </div>
          <p className="quiet">macOS 12 or later · Apple silicon and Intel</p>
        </div>
        <div className="hero-window" aria-hidden="true">
          <div className="dots"><i /><i /><i /></div>
          <p className="win-kicker">Live session</p>
          <p className="win-app">Google Chrome</p>
          <p className="win-meta">youtube.com · Essence of linear algebra</p>
          <p className="win-class">On-task</p>
        </div>
      </section>

      <section className="band">
        <div className="cards">
          <Link className="card-link" to="/how">
            <p className="eyebrow">Product</p>
            <h3>How it works</h3>
            <p>Detection, reflection, reset, allowlists, and Circles.</p>
          </Link>
          <Link className="card-link" to="/download">
            <p className="eyebrow">Install</p>
            <h3>Download</h3>
            <p>Get the Mac app and add it to Applications.</p>
          </Link>
          <Link className="card-link" to="/groq">
            <p className="eyebrow">Setup</p>
            <h3>API key</h3>
            <p>Create a free Groq key and paste it in Settings.</p>
          </Link>
        </div>
      </section>
    </Layout>
  );
}
