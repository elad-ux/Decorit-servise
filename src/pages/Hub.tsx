import { useAuth } from "../lib/auth";
import type { Role } from "../lib/api";

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
    <div className="hub-page">
      <div className="hub-header">
        <h1>שלום, {session.name}</h1>
        <div className="whoami">
          <span>{ROLE_LABEL[session.role]}</span>
          <button type="button" className="btn-link" style={{ marginInlineStart: "1rem" }} onClick={logout}>
            יציאה
          </button>
        </div>
      </div>
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
  );
}
