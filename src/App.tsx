import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./lib/auth";
import Login from "./pages/Login";
import Hub from "./pages/Hub";

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Hub />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
