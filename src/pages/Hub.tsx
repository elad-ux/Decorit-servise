import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import type { Role } from "../lib/api";
import TopBar from "../components/TopBar";

interface ModuleCard {
  title: string;
  description: string;
  minRole?: Role[];
  to?: string;
  /** Modules without `to` aren't built yet. */
  available: boolean;
}

const ROLE_LABEL: Record<Role, string> = {
  admin: "מנהל מערכת",
  manager: "מנהל",
  warehouse: "מחסן",
};

const MODULES: ModuleCard[] = [
  { title: "מכולות", description: "מעקב, פרטי מכולה ועדכון סטטוס", available: false },
  { title: "מוצרים", description: "תיק מוצרים ורגולציה", available: false },
  { title: "משתמשים", description: "ניהול צוות המערכת", minRole: ["admin"], to: "/users", available: true },
  {
    title: "תפוצות",
    description: "אנשי קשר, תבניות ושליחת קמפיינים",
    // Matches the server-side check on the "broadcast-send" action (admin/whatsapp roles only).
    minRole: ["admin"],
    to: "/broadcast",
    available: true,
  },
];

export default function Hub() {
  const { session, logout } = useAuth();
  if (!session) return null; // RequireAuth guarantees this, but keeps TS happy

  const visibleModules = MODULES.filter((m) => !m.minRole || m.minRole.includes(session.role));

  return (
    <>
      <TopBar>
        <span className="whoami-name">
          {session.name} <span className="whoami-role">· {ROLE_LABEL[session.role]}</span>
        </span>
        <button type="button" className="btn-link" onClick={logout}>
          יציאה
        </button>
      </TopBar>
      <div className="hub-page">
        <h1 className="page-title">שלום, {session.name}</h1>
        <p className="page-subtitle">בחרו מודול כדי להתחיל</p>
        <div className="hub-grid">
          {visibleModules.map((m) => {
            const card = (
              <>
                <span className={`tag${m.available ? "" : " soon"}`}>{m.available ? "פעיל" : "בקרוב"}</span>
                <h2>{m.title}</h2>
                <p>{m.description}</p>
              </>
            );
            return m.available && m.to ? (
              <Link key={m.title} to={m.to} className="hub-card">
                {card}
              </Link>
            ) : (
              <div key={m.title} className="hub-card disabled">
                {card}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
