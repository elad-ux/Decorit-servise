import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./lib/auth";
import Login from "./pages/Login";
import Hub from "./pages/Hub";
import BroadcastLayout from "./components/BroadcastLayout";
import BroadcastContacts from "./pages/broadcast/Contacts";
import BroadcastTemplates from "./pages/broadcast/Templates";
import BroadcastSend from "./pages/broadcast/Send";
import BroadcastStatus from "./pages/broadcast/Status";
import Users from "./pages/Users";
import Permissions from "./pages/Permissions";

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
        <Route
          path="/users"
          element={
            <RequireAuth>
              <Users />
            </RequireAuth>
          }
        />
        <Route
          path="/permissions"
          element={
            <RequireAuth>
              <Permissions />
            </RequireAuth>
          }
        />
        <Route
          path="/broadcast"
          element={
            <RequireAuth>
              <BroadcastLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="contacts" replace />} />
          <Route path="contacts" element={<BroadcastContacts />} />
          <Route path="templates" element={<BroadcastTemplates />} />
          <Route path="send" element={<BroadcastSend />} />
          <Route path="status" element={<BroadcastStatus />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
