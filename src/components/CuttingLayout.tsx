import { useEffect, useState } from "react";
import { NavLink, Outlet, useOutletContext } from "react-router-dom";
import TopBar from "./TopBar";
import { useAuth } from "../lib/auth";
import { myPermissions } from "../lib/permissions";

export interface CuttingPermissions {
  isAdmin: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canReport: boolean;
  canManageCatalog: boolean;
  canManageStock: boolean;
  canManageSettings: boolean;
}

const EMPTY_PERMISSIONS: CuttingPermissions = {
  isAdmin: false,
  canCreate: false,
  canEdit: false,
  canReport: false,
  canManageCatalog: false,
  canManageStock: false,
  canManageSettings: false,
};

export function useCuttingPermissions(): CuttingPermissions {
  return useOutletContext<CuttingPermissions>();
}

const TABS = [
  { to: "/cutting", label: "לוח בקרה", end: true },
  { to: "/cutting/station", label: "עמדת גזירה" },
  { to: "/cutting/settings", label: "הגדרות" },
];

export default function CuttingLayout() {
  const { session, logout } = useAuth();
  const [permissions, setPermissions] = useState<CuttingPermissions>(EMPTY_PERMISSIONS);

  useEffect(() => {
    if (!session) return;
    if (session.role === "admin") {
      setPermissions({
        isAdmin: true,
        canCreate: true,
        canEdit: true,
        canReport: true,
        canManageCatalog: true,
        canManageStock: true,
        canManageSettings: true,
      });
      return;
    }
    let cancelled = false;
    myPermissions(session.sessionToken)
      .then((keys) => {
        if (cancelled) return;
        const has = (k: string) => keys.includes(k);
        setPermissions({
          isAdmin: false,
          canCreate: has("cutting.tasks.create"),
          canEdit: has("cutting.tasks.edit"),
          canReport: has("cutting.tasks.report"),
          canManageCatalog: has("cutting.catalog.manage"),
          canManageStock: has("cutting.stock.update"),
          canManageSettings: has("cutting.settings.manage"),
        });
      })
      .catch(() => {
        if (!cancelled) setPermissions(EMPTY_PERMISSIONS);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionToken]);

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
          <h1 className="page-title">חיתוך בד</h1>
          <NavLink to="/" className="btn-link">
            ↩ חזרה לתפריט
          </NavLink>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="tab-content">
          <Outlet context={permissions} />
        </div>
      </div>
    </>
  );
}
