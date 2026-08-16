import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { myPermissions } from "../lib/permissions";
import TopBar from "../components/TopBar";

interface ModuleCard {
  title: string;
  description: string;
  /** Any one of these feature keys grants visibility. Admin always sees everything. Omit for always-visible. */
  requiredFeatureKeys?: string[];
  to?: string;
  /** Modules without `to` aren't built yet. */
  available: boolean;
}

const ROLE_LABEL_OVERRIDES: Record<string, string> = {
  admin: "מנהל מערכת",
  manager: "מנהל",
  warehouse: "מחסן",
  whatsapp: "צוות תפוצות",
};

function roleLabel(role: string): string {
  return ROLE_LABEL_OVERRIDES[role] ?? role;
}

const MODULES: ModuleCard[] = [
  { title: "מכולות", description: "מעקב, פרטי מכולה ועדכון סטטוס", requiredFeatureKeys: ["containers"], available: false },
  { title: "מוצרים", description: "תיק מוצרים ורגולציה", requiredFeatureKeys: ["products"], available: false },
  { title: "משתמשים", description: "ניהול צוות המערכת", requiredFeatureKeys: ["users"], to: "/users", available: true },
  {
    title: "תפוצות",
    description: "אנשי קשר, תבניות ושליחת קמפיינים",
    requiredFeatureKeys: ["broadcast.contacts", "broadcast.templates", "broadcast.send", "broadcast.status"],
    to: "/broadcast",
    available: true,
  },
];

const ADMIN_MODULES: ModuleCard[] = [
  { title: "הרשאות", description: "קביעת מי רואה מה, לכל תפקיד", to: "/permissions", available: true },
  { title: "לוג פעילות", description: "מי עשה מה ומתי בדשבורד", to: "/activity-log", available: true },
];

export default function Hub() {
  const { session, logout } = useAuth();
  const [featureKeys, setFeatureKeys] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!session) return;
    if (session.role === "admin") return; // bypass, no need to fetch
    let cancelled = false;
    myPermissions(session.sessionToken)
      .then((keys) => {
        if (!cancelled) setFeatureKeys(new Set(keys));
      })
      .catch(() => {
        if (!cancelled) setFeatureKeys(new Set());
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionToken]);

  if (!session) return null; // RequireAuth guarantees this, but keeps TS happy

  const isAdmin = session.role === "admin";
  const modules = isAdmin ? MODULES.concat(ADMIN_MODULES) : MODULES;
  const visibleModules =
    isAdmin || featureKeys
      ? modules.filter(
          (m) => isAdmin || !m.requiredFeatureKeys || m.requiredFeatureKeys.some((k) => featureKeys!.has(k)),
        )
      : [];

  return (
    <>
      <TopBar>
        <span className="whoami-name">
          {session.name} <span className="whoami-role">· {roleLabel(session.role)}</span>
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
