import { Link, NavLink } from "react-router-dom";

export default function Layout({ children, center }) {
  return (
    <div className="page">
      <header className="nav">
        <div className="nav-inner">
          <Link className="logo" to="/">Sentinel</Link>
          <nav>
            <NavLink to="/how">How it works</NavLink>
            <NavLink to="/groq">API key</NavLink>
            <Link className="btn" to="/download">Download for Mac</Link>
          </nav>
        </div>
      </header>
      <main className={center ? "main main-center" : "main"}>{children}</main>
      <footer>
        <div className="nav-inner">
          <span>Aaryan Patel</span>
        </div>
      </footer>
    </div>
  );
}
