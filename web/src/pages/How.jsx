import { Link } from "react-router-dom";
import Layout from "../Layout.jsx";

export default function How() {
  return (
    <Layout>
      <section className="prose">
        <p className="eyebrow">Product</p>
        <h1>How Sentinel works</h1>
        <p className="lede">
          You name a goal. Sentinel watches the frontmost Mac window and decides
          whether that window serves the goal. It does not maintain a blocklist.
        </p>

        <div className="cards">
          <article>
            <p className="eyebrow">Detect</p>
            <h3>App, URL, and title</h3>
            <p>Every few seconds the app reads the frontmost process. In Chrome, Safari, Arc, Brave, and Edge it also reads the live tab URL and title, including the YouTube video id.</p>
          </article>
          <article>
            <p className="eyebrow">Classify</p>
            <h3>This page, this goal</h3>
            <p>A language model labels the window on-task, off-task, or ambiguous. A lecture and a short on the same site are different decisions.</p>
          </article>
          <article>
            <p className="eyebrow">Nudge</p>
            <h3>A question, then a reset</h3>
            <p>After a grace period you answer one specific question. A vague reply fails. Sentinel then pauses the video or hides the app and runs a short breathing reset.</p>
          </article>
          <article>
            <p className="eyebrow">Allow</p>
            <h3>Work apps and sites</h3>
            <p>After you sign in, mark tools such as Spotify or khanacademy.org as always allowed. They are not treated as off-task.</p>
          </article>
          <article>
            <p className="eyebrow">Circles</p>
            <h3>Compete on intent</h3>
            <p>Invite friends with a code. Weekly Intent Score uses on-task minutes times focus share, plus points for honest rescues. Time wasted does not win.</p>
          </article>
          <article>
            <p className="eyebrow">Website</p>
            <h3>The same account</h3>
            <p>Sign in here to see analytics, edit the allowlist, and manage Circles. Focus watching runs only in the Mac app.</p>
          </article>
        </div>

        <div className="cta">
          <Link className="btn lg" to="/download">Download for Mac</Link>
          <Link className="btn ghost lg" to="/signin">Sign in</Link>
        </div>
      </section>
    </Layout>
  );
}
