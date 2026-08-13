import { NavLink, Outlet } from "react-router-dom";
import TopBar from "./TopBar";
import { useAuth } from "../lib/auth";

const TABS = [
  { to: "/broadcast/contacts", label: "אנשי קשר" },
  { to: "/broadcast/templates", label: "תבניות" },
  { to: "/broadcast/send", label: "שליחה" },
  { to: "/broadcast/status", label: "סטטוס הודעות" },
];

export default function BroadcastLayout() {
  const { session, logout } = useAuth();
  if (!session) return null;

  return (
    <>
      <TopBar>
        <span className="whoami-name">{session.name}</span>
        <button type="button" className="btn-link" onClick={logout}>
          יציאה
        </button>
      </TopBar>
      <div className="broadcast-page">
        <div className="broadcast-header">
          <h1 className="page-title">תפוצות</h1>
          <NavLink to="/" className="btn-link">
            ↩ חזרה לתפריט
          </NavLink>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) => `tab${isActive ? " active" : ""}`}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="tab-content">
          <Outlet />
        </div>
      </div>
    </>
  );
}
