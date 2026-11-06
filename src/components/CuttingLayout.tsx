import { useEffect, useState } from "react";
import { NavLink, Outlet, useOutletContext } from "react-router-dom";
import TopBar from "./TopBar";
import { useAuth } from "../lib/auth";
import { isStationOnly, myPermissions } from "../lib/permissions";

export interface CuttingPermissions {
  isAdmin: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canReport: boolean;
  canManageCatalog: boolean;
  canManageStock: boolean;
  canManageSettings: boolean;
  /** Cutter: the cutting workstation is their whole access, so the layout hides every way back out to the module hub. */
  stationOnly: boolean;
  /** False until the initial permission fetch resolves — pages that redirect based on missing permissions must wait for this, or they'll bounce everyone during the loading flash. */
  loaded: boolean;
}

const EMPTY_PERMISSIONS: CuttingPermissions = {
  isAdmin: false,
  canCreate: false,
  canEdit: false,
  canReport: false,
  canManageCatalog: false,
  canManageStock: false,
  canManageSettings: false,
  stationOnly: false,
  loaded: false,
};

export function useCuttingPermissions(): CuttingPermissions {
  return useOutletContext<CuttingPermissions>();
}

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
        stationOnly: false,
        loaded: true,
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
          stationOnly: isStationOnly(keys),
          loaded: true,
        });
      })
      .catch(() => {
        if (!cancelled) setPermissions({ ...EMPTY_PERMISSIONS, loaded: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionToken]);

  if (!session) return null;

  const tabs = [
    // Cutters only ever act on their own queue — the office task board has
    // nothing for them to do (no create/edit rights) and just confuses them.
    ...(permissions.canCreate || permissions.canEdit || permissions.isAdmin
      ? [{ to: "/cutting", label: "לוח בקרה", end: true }]
      : []),
    { to: "/cutting/station", label: "עמדת גזירה" },
    // For a cutter this tab is where they mark colors as out of stock — it is
    // not "settings" to them, so name it for what they use it for.
    { to: "/cutting/settings", label: permissions.stationOnly ? "מלאי בדים" : "הגדרות" },
  ];

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
          {permissions.loaded && !permissions.stationOnly && (
            <NavLink to="/" className="btn-link">
              ↩ חזרה לתפריט
            </NavLink>
          )}
        </div>
        {/* Wait for permissions so tabs and their labels don't flicker/shift on load. */}
        {permissions.loaded && (
          <nav className="tabs">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
                {t.label}
              </NavLink>
            ))}
          </nav>
        )}
        <div className="tab-content">
          <Outlet context={permissions} />
        </div>
      </div>
    </>
  );
}
