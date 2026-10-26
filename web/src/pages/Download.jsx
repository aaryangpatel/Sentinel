import { Link } from "react-router-dom";
import Layout from "../Layout.jsx";
import { dmgUrl, releasesUrl } from "../firebase.js";

export default function Download() {
  return (
    <Layout>
      <section className="prose">
        <h1>Download</h1>
        <p className="lede">
          Download Sentinel for Mac from GitHub Releases, then open it and drag
          the app into Applications.
        </p>
        <div className="cta">
          <a className="btn lg" href={dmgUrl}>Download Sentinel for Mac</a>
          <a className="btn ghost lg" href={releasesUrl} target="_blank" rel="noreferrer">GitHub Releases</a>
        </div>
        <p className="quiet">macOS 12 or later. First launch: right-click the app, then choose Open.</p>
        <ol className="steps">
          <li>
            <strong>Download the installer</strong>
            Save <span className="code">Sentinel-2.0.0.dmg</span> from the button above.
          </li>
          <li>
            <strong>Install</strong>
            Open the disk image and drag Sentinel into Applications.
          </li>
          <li>
            <strong>Open it once from the Finder</strong>
            Right-click → Open. Allow Accessibility, Screen Recording, and
            Automation when asked.
          </li>
          <li>
            <strong>Add a Groq key</strong>
            Follow the <Link to="/groq">API key steps</Link>, then start a focus
            session in the app.
          </li>
        </ol>
        <p className="copy">
          Prefer running from source?{" "}
          <span className="code">cd desktop && npm install && npm start</span>
        </p>
      </section>
    </Layout>
  );
}
