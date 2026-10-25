import { Link } from "react-router-dom";
import Layout from "../Layout.jsx";

export default function Groq() {
  return (
    <Layout>
      <section className="prose">
        <p className="eyebrow">Settings</p>
        <h1>Get a free Groq API key</h1>
        <p className="lede">
          Sentinel uses Groq to classify the window in front of you. The key is free,
          does not require a credit card, and is pasted only into the Mac app Settings.
          Do not commit it to a repository or send it in a message.
        </p>

        <ol className="steps">
          <li>
            <strong>1. Open the Groq console</strong>
            Go to <a href="https://console.groq.com" target="_blank" rel="noreferrer">console.groq.com</a>.
            Sign up with email or Google. Confirm the verification email before you continue.
          </li>
          <li>
            <strong>2. Select a project</strong>
            The top-left of the console shows Organization / Project. A default project is
            created for you. If the dropdown is empty, open it, choose Create Project, and
            name it Sentinel. Keys belong to the selected project.
          </li>
          <li>
            <strong>3. Open API Keys</strong>
            In the left sidebar click API Keys, or open{" "}
            <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys</a>.
            Only an owner or developer on that project can create a key.
          </li>
          <li>
            <strong>4. Create the key</strong>
            Click Create API Key. Name it Sentinel. Submit.
          </li>
          <li>
            <strong>5. Copy it immediately</strong>
            Groq shows the secret once. It starts with <span className="code">gsk_</span>.
            Copy it now. If you close the dialog without copying, delete that key and create another.
          </li>
          <li>
            <strong>6. Paste it in Sentinel</strong>
            Open the Mac app → Settings. Set Classifier to Groq. Paste the key.
            Leave Model as <span className="code">openai/gpt-oss-20b</span> unless you chose another
            Groq chat model. Click Save settings.
          </li>
          <li>
            <strong>7. Confirm it works</strong>
            Open Focus, start a session with a real goal, and switch to Chrome.
            The Frontmost card should show on-task or off-task, not a missing-key warning.
          </li>
        </ol>

        <div className="card" style={{ marginTop: 28 }}>
          <p className="eyebrow">If something fails</p>
          <p className="copy">401 or “key invalid”: a space was copied, or the key was revoked. Create a new one.</p>
          <p className="copy">Windows stay ambiguous: the key is missing or Groq is unavailable. Sentinel will not interrupt until the model answers.</p>
          <p className="copy">“Unauthorized domain” is a Firebase sign-in issue, not Groq. This key is only for classification.</p>
        </div>

        <div className="cta">
          <a className="btn lg" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Open Groq API Keys</a>
          <Link className="btn ghost lg" to="/download">Download the app</Link>
        </div>
      </section>
    </Layout>
  );
}
