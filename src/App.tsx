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
import ActivityLog from "./pages/ActivityLog";
import Containers from "./pages/Containers";
import ContainerDetail from "./pages/ContainerDetail";
import StationOnlyGate from "./components/StationOnlyGate";
import CuttingLayout from "./components/CuttingLayout";
import CuttingBoard from "./pages/cutting/Board";
import CuttingStation from "./pages/cutting/Station";
import CuttingSettings from "./pages/cutting/Settings";

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Everything outside the cutting module. A station-only user (cutter)
            is redirected to /cutting/station by the gate. */}
        <Route
          element={
            <RequireAuth>
              <StationOnlyGate />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Hub />} />
          <Route path="/containers" element={<Containers />} />
          <Route path="/containers/:id" element={<ContainerDetail />} />
          <Route path="/users" element={<Users />} />
          <Route path="/permissions" element={<Permissions />} />
          <Route path="/activity-log" element={<ActivityLog />} />
          <Route path="/broadcast" element={<BroadcastLayout />}>
            <Route index element={<Navigate to="contacts" replace />} />
            <Route path="contacts" element={<BroadcastContacts />} />
            <Route path="templates" element={<BroadcastTemplates />} />
            <Route path="send" element={<BroadcastSend />} />
            <Route path="status" element={<BroadcastStatus />} />
          </Route>
        </Route>
        <Route
          path="/cutting"
          element={
            <RequireAuth>
              <CuttingLayout />
            </RequireAuth>
          }
        >
          <Route index element={<CuttingBoard />} />
          <Route path="station" element={<CuttingStation />} />
          <Route path="settings" element={<CuttingSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
