import { Link } from "react-router-dom";
import Layout from "../Layout.jsx";
import { dmgUrl, releasesUrl } from "../firebase.js";

export default function Download() {
  return (
    <Layout>
      <section className="prose">
        <p className="eyebrow">macOS</p>
        <h1>Download Sentinel</h1>
        <p className="lede">
          The installer is a disk image hosted on GitHub Releases. Vercel cannot
          serve a file that large, so this button downloads the <span className="code">.dmg</span> from
          the latest release.
        </p>

        <div className="cta">
          <a className="btn lg" href={dmgUrl}>Download Sentinel for Mac</a>
          <a className="btn ghost lg" href={releasesUrl} target="_blank" rel="noreferrer">Open GitHub Releases</a>
        </div>
        <p className="quiet">macOS 12 or later · Apple silicon and Intel · First launch: right-click the app, then Open.</p>

        <ol className="steps">
          <li>
            <strong>Download the disk image</strong>
            Use the gold button above. The file is named Sentinel-2.0.0.dmg and comes from
            the GitHub Release, not from this website’s server.
          </li>
          <li>
            <strong>Open the disk image</strong>
            Double-click the downloaded file in Finder.
          </li>
          <li>
            <strong>Install</strong>
            Drag Sentinel into the Applications folder.
          </li>
          <li>
            <strong>First launch</strong>
            Right-click Sentinel → Open. Allow Accessibility, Screen Recording, and
            Automation when macOS asks.
          </li>
          <li>
            <strong>Add a Groq key</strong>
            Open Settings in the app, then follow the{" "}
            <Link to="/groq">API key guide</Link>. Without a key, windows stay unclassified.
          </li>
        </ol>

        <div className="card" style={{ marginTop: 32 }}>
          <p className="eyebrow">If the download button fails</p>
          <p className="copy">
            The file is missing until a GitHub Release named v2.0.0 includes
            Sentinel-2.0.0.dmg. Open{" "}
            <a href={releasesUrl} target="_blank" rel="noreferrer">GitHub Releases</a>
            {" "}and download the asset there, or run from source:
          </p>
          <p className="copy"><span className="code">git clone https://github.com/aaryangpatel/Sentinel.git</span></p>
          <p className="copy"><span className="code">cd Sentinel/desktop && npm install && npm start</span></p>
        </div>
      </section>
    </Layout>
  );
}
