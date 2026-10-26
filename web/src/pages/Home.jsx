import { Link } from "react-router-dom";
import Layout from "../Layout.jsx";

export default function Home() {
  return (
    <Layout>
      <section className="hero">
        <h1>Sentinel</h1>
        <p className="lede">
          A Mac app for homework. You type what you are supposed to be doing.
          Sentinel looks at the app and tab in front of you and decides if that
          still matches. A linear algebra lecture on YouTube is fine. A random
          recommended video is not.
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
            <span>Free. Paste it in Settings. Without a key, windows stay unclassified.</span>
          </li>
          <li>
            <Link to="/how">Start a homework session</Link>
            <span>Create an account in the Mac app, name the goal, and Sentinel watches the frontmost window.</span>
          </li>
        </ol>
      </section>
    </Layout>
  );
}
