import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Account from "./pages/Account.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/account" element={<Account />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
