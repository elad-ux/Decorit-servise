import { useAuth } from "../lib/auth";
import type { Role } from "../lib/api";
import TopBar from "../components/TopBar";

interface ModuleCard {
  title: string;
  description: string;
  minRole?: Role[];
  /** All modules besides Hub itself are not built yet (Phase 1 = Login + Hub only). */
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
  { title: "משתמשים", description: "ניהול צוות המערכת", minRole: ["admin"], available: false },
  {
    title: "תפוצות",
    description: "אנשי קשר, תבניות ושליחת קמפיינים",
    minRole: ["admin", "manager"],
    available: false,
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
          {visibleModules.map((m) => (
            <div key={m.title} className={`hub-card${m.available ? "" : " disabled"}`}>
              <span className={`tag${m.available ? "" : " soon"}`}>{m.available ? "פעיל" : "בקרוב"}</span>
              <h2>{m.title}</h2>
              <p>{m.description}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
