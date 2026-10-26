import { Link } from "react-router-dom";
import Layout from "../Layout.jsx";

export default function How() {
  return (
    <Layout>
      <section className="prose">
        <h1>How it works</h1>
        <p className="lede">
          Sentinel does not keep a list of banned websites. It asks whether
          this window is part of the goal you named.
        </p>
        <ol className="steps">
          <li>
            <strong>It reads the frontmost window</strong>
            About every two seconds it checks which Mac app is in front. In
            Chrome, Safari, Arc, Brave, and Edge it also reads the tab URL and
            title, including the YouTube video id.
          </li>
          <li>
            <strong>It classifies that page against your goal</strong>
            A language model returns on-task, off-task, or ambiguous. Two
            YouTube tabs can get different answers.
          </li>
          <li>
            <strong>It asks, then resets</strong>
            After a short grace period you get one specific question. If the
            answer is vague, Sentinel pauses the video or hides the app and
            shows an 18-second breathing reset.
          </li>
          <li>
            <strong>You can allow tools you actually work with</strong>
            In the Mac app, type apps or sites such as Spotify or khanacademy.org.
            Those stay on-task.
          </li>
          <li>
            <strong>Circles are optional</strong>
            Create a circle in the Mac app and share the invite code. The weekly
            score is on-task time times focus share, plus points for honest
            explanations. Wasted time does not help.
          </li>
        </ol>
        <p className="copy">
          Accounts, analytics, and Circles live in the Mac app. This site is for
          download and setup help.
        </p>
        <div className="cta">
          <Link className="btn lg" to="/download">Download for Mac</Link>
          <Link className="btn ghost lg" to="/groq">API key guide</Link>
        </div>
      </section>
    </Layout>
  );
}
