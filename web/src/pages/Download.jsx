import { Link } from "react-router-dom";
import Layout from "../Layout.jsx";
import { dmgUrl, releasesUrl } from "../firebase.js";

export default function Download() {
  return (
    <Layout>
      <section className="prose">
        <h1>Download</h1>
        <p className="lede">
          Get the Mac installer from GitHub Releases
          (<span className="code">Sentinel-2.0.0.dmg</span>). The site links
          there because the disk image is too large to host on Vercel.
        </p>
        <div className="cta">
          <a className="btn lg" href={dmgUrl}>Download Sentinel for Mac</a>
          <a className="btn ghost lg" href={releasesUrl} target="_blank" rel="noreferrer">GitHub Releases</a>
        </div>
        <p className="quiet">macOS 12 or later. First launch: right-click the app, then choose Open.</p>
        <ol className="steps">
          <li>
            <strong>Save the disk image</strong>
            The file is Sentinel-2.0.0.dmg.
          </li>
          <li>
            <strong>Open it and drag Sentinel into Applications</strong>
          </li>
          <li>
            <strong>Right-click → Open</strong>
            Allow Accessibility, Screen Recording, and Automation when asked.
          </li>
          <li>
            <strong>Add a Groq key in Settings</strong>
            Follow the <Link to="/groq">API key steps</Link>. Without a key the
            app will not classify windows.
          </li>
        </ol>
        <p className="copy">
          If the download link 404s, the release asset is not up yet. Use{" "}
          <a href={releasesUrl} target="_blank" rel="noreferrer">GitHub Releases</a>
          {" "}or run from source:
        </p>
        <p className="copy"><span className="code">cd desktop && npm install && npm start</span></p>
      </section>
    </Layout>
  );
}
