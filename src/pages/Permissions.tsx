import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import TopBar from "../components/TopBar";
import { type FeatureCatalogEntry, listPermissions, setPermission } from "../lib/permissions";

const ADMIN_ROLE = "admin";

export default function Permissions() {
  const { session } = useAuth();
  const sessionToken = session?.sessionToken ?? "";

  const [featureCatalog, setFeatureCatalog] = useState<FeatureCatalogEntry[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");

  function cellKey(role: string, featureKey: string) {
    return `${role}::${featureKey}`;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listPermissions(sessionToken);
      setFeatureCatalog(data.feature_catalog);
      setRoles(data.roles.filter((r) => r !== ADMIN_ROLE));
      setGranted(new Set(data.permissions.map((p) => cellKey(p.role, p.feature_key))));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בטעינת ההרשאות");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string | null, FeatureCatalogEntry[]>();
    for (const f of featureCatalog) {
      const arr = map.get(f.group) ?? [];
      arr.push(f);
      map.set(f.group, arr);
    }
    return Array.from(map.entries());
  }, [featureCatalog]);

  async function toggle(role: string, featureKey: string) {
    const key = cellKey(role, featureKey);
    const wasGranted = granted.has(key);
    setBusyKey(key);
    setError(null);
    setGranted((prev) => {
      const next = new Set(prev);
      if (wasGranted) next.delete(key);
      else next.add(key);
      return next;
    });
    try {
      await setPermission(sessionToken, role, featureKey, !wasGranted);
    } catch (err) {
      setGranted((prev) => {
        const next = new Set(prev);
        if (wasGranted) next.add(key);
        else next.delete(key);
        return next;
      });
      setError(err instanceof ApiError ? err.message : "שגיאה בעדכון ההרשאה");
    } finally {
      setBusyKey(null);
    }
  }

  function handleAddRole(e: React.FormEvent) {
    e.preventDefault();
    const name = newRoleName.trim();
    if (!name || name === ADMIN_ROLE || roles.includes(name)) return;
    setRoles((prev) => [...prev, name]);
    setNewRoleName("");
  }

  return (
    <>
      <TopBar>
        <span className="whoami-name">{session?.name}</span>
        <Link to="/" className="btn-link">
          ↩ חזרה לתפריט
        </Link>
      </TopBar>
      <div className="broadcast-page">
        <div className="broadcast-header">
          <h1 className="page-title">ניהול הרשאות</h1>
        </div>
        <p className="page-subtitle">קובעים לכל תפקיד מה הוא רואה ומה הוא יכול לעשות — משתנה מיידית בפועל, גם בשרת</p>

        {error && <div className="error-box">{error}</div>}

        {loading ? (
          <p className="muted">טוען...</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="permissions-table">
                <thead>
                  <tr>
                    <th></th>
                    <th className="permissions-admin-col">מנהל מערכת</th>
                    {roles.map((r) => (
                      <th key={r}>{r}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map(([group, features]) => (
                    <>
                      {group && (
                        <tr key={`group-${group}`} className="permissions-group-row">
                          <td colSpan={roles.length + 2}>{group}</td>
                        </tr>
                      )}
                      {features.map((f) => (
                        <tr key={f.key}>
                          <td>{f.label}</td>
                          <td className="permissions-admin-col">
                            <input type="checkbox" checked disabled title="מנהל מערכת תמיד עם גישה מלאה" />
                          </td>
                          {roles.map((r) => {
                            const key = cellKey(r, f.key);
                            return (
                              <td key={r}>
                                <input
                                  type="checkbox"
                                  checked={granted.has(key)}
                                  disabled={busyKey === key}
                                  onChange={() => void toggle(r, f.key)}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            <form onSubmit={handleAddRole} className="toolbar" style={{ marginTop: "1.25rem" }}>
              <input
                className="input-inline"
                placeholder="שם תפקיד חדש"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
              />
              <button type="submit" className="btn btn-sm" style={{ width: "auto" }}>
                + תפקיד חדש
              </button>
              <span className="muted" style={{ fontSize: ".8rem" }}>
                התפקיד ייכנס לתוקף ברגע שתסמנו לו הרשאה ראשונה
              </span>
            </form>
          </>
        )}
      </div>
    </>
  );
}
