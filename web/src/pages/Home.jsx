import { Link } from "react-router-dom";
import Layout from "../Layout.jsx";

export default function Home() {
  return (
    <Layout>
      <section className="hero">
        <h1>Sentinel</h1>
        <p className="lede">
          A simple Mac app to make sure you are on task. You enter what you are
          supposed to be doing and Sentinel keeps you accountable.
        </p>
        <div className="cta">
          <Link className="btn lg" to="/download">Download for Mac</Link>
          <Link className="btn ghost lg" to="/how">How it works</Link>
        </div>
        <p className="quiet hero-note">macOS 12 or later · Apple silicon and Intel</p>
        <ol className="start">
          <li>
            <Link to="/download">Download the Mac app</Link>
            <span>Get the disk image from GitHub Releases, then drag Sentinel into Applications.</span>
          </li>
          <li>
            <Link to="/groq">Add a Groq API key</Link>
            <span>Free. Paste it in Settings.</span>
          </li>
          <li>
            <Link to="/how">How it works</Link>
            <span>Name the goal. Sentinel watches the frontmost app and tab.</span>
          </li>
        </ol>
      </section>
    </Layout>
  );
}
