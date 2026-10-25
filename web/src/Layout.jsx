import { Link, NavLink } from "react-router-dom";

export default function Layout({ children, center }) {
  return (
    <div className="page">
      <header className="nav">
        <div className="nav-inner">
          <Link className="logo" to="/"><span className="mark" />Sentinel</Link>
          <nav>
            <NavLink to="/how">How it works</NavLink>
            <NavLink to="/download">Download</NavLink>
            <NavLink to="/groq">API key</NavLink>
            <NavLink to="/account">Account</NavLink>
            <Link className="btn" to="/download">Download for Mac</Link>
          </nav>
        </div>
      </header>
      <main className={center ? "main main-center" : "main"}>{children}</main>
      <footer>
        <div className="nav-inner">
          <span>Sentinel</span>
          <Link to="/how">How it works</Link>
          <Link to="/download">Download</Link>
          <Link to="/groq">API key</Link>
          <Link to="/signin">Sign in</Link>
          <a href="https://github.com/aaryangpatel/Sentinel">Source</a>
        </div>
      </footer>
    </div>
  );
}
