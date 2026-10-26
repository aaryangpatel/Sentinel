import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import How from "./pages/How.jsx";
import Download from "./pages/Download.jsx";
import Groq from "./pages/Groq.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/how" element={<How />} />
      <Route path="/download" element={<Download />} />
      <Route path="/groq" element={<Groq />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
