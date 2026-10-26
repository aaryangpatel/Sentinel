import { Link } from "react-router-dom";
import Layout from "../Layout.jsx";

export default function Groq() {
  return (
    <Layout>
      <section className="prose">
        <h1>Groq API key</h1>
        <p className="lede">
          The classifier needs a free Groq key. Paste it only in the Mac app
          under Settings.
        </p>
        <ol className="steps">
          <li>
            <strong>Create an account</strong>
            Open <a href="https://console.groq.com" target="_blank" rel="noreferrer">console.groq.com</a>.
            Sign up with email or Google and confirm the email they send.
          </li>
          <li>
            <strong>Select a project</strong>
            Top-left of the console: Organization / Project. If nothing is there,
            create a project named Sentinel. New keys attach to whatever project
            is selected.
          </li>
          <li>
            <strong>Open API Keys</strong>
            Sidebar → API Keys, or{" "}
            <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys</a>.
          </li>
          <li>
            <strong>Create API Key</strong>
            Name it Sentinel and submit.
          </li>
          <li>
            <strong>Copy the secret once</strong>
            It starts with <span className="code">gsk_</span>. If you close the
            dialog without copying, delete the key and make another.
          </li>
          <li>
            <strong>Paste it in the Mac app</strong>
            Settings → Classifier: Groq → API key. Leave the model as{" "}
            <span className="code">openai/gpt-oss-20b</span> unless you picked
            another Groq chat model. Save.
          </li>
          <li>
            <strong>Start a focus session</strong>
            Switch to Chrome. The Frontmost line should say on-task or off-task,
            not that a key is missing.
          </li>
        </ol>
        <p className="copy">401 means the key was copied with a space or revoked. Ambiguous windows mean the model did not answer.</p>
        <div className="cta">
          <a className="btn lg" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Open Groq API Keys</a>
          <Link className="btn ghost lg" to="/download">Download</Link>
        </div>
      </section>
    </Layout>
  );
}
