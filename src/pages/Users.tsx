import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import type { Role } from "../lib/api";
import Modal from "../components/Modal";
import TopBar from "../components/TopBar";
import { type AuthorizedUser, listUsers, setUserActive, upsertUser } from "../lib/users";

const ROLE_LABEL: Record<Role, string> = {
  admin: "מנהל מערכת",
  manager: "מנהל",
  warehouse: "מחסן",
};

const ROLE_CLASS: Record<Role, string> = {
  admin: "role-admin",
  manager: "role-manager",
  warehouse: "role-warehouse",
};

type FormState = { id?: string; name: string; phone: string; role: Role };
const EMPTY_FORM: FormState = { name: "", phone: "", role: "warehouse" };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[1][0];
}

export default function Users() {
  const { session } = useAuth();
  const sessionToken = session?.sessionToken ?? "";
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers(sessionToken));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בטעינת המשתמשים");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await upsertUser(sessionToken, editing);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(u: AuthorizedUser) {
    const verb = u.active ? "להשבית" : "להפעיל";
    if (!confirm(`${verb} את ${u.name}?`)) return;
    setBusyId(u.id);
    setError(null);
    try {
      await setUserActive(sessionToken, u.id, !u.active);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בעדכון");
    } finally {
      setBusyId(null);
    }
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
          <h1 className="page-title">משתמשי המערכת</h1>
          <button type="button" className="btn btn-sm" style={{ width: "auto" }} onClick={() => setEditing(EMPTY_FORM)}>
            + משתמש חדש
          </button>
        </div>
        <p className="page-subtitle">מי יכול להיכנס לפאנל, ובאיזה תפקיד</p>

        {error && <div className="error-box">{error}</div>}

        {loading ? (
          <p className="muted">טוען...</p>
        ) : (
          <div className="user-grid">
            {users.map((u) => (
              <div key={u.id} className={`user-card${u.active ? "" : " user-card-inactive"}`}>
                <div className={`user-avatar ${ROLE_CLASS[u.role]}`}>{initials(u.name)}</div>
                <div className="user-card-body">
                  <h3>{u.name}</h3>
                  <p className="muted mono">{u.phone}</p>
                  <span className={`chip chip-static role-badge ${ROLE_CLASS[u.role]}`}>{ROLE_LABEL[u.role]}</span>
                </div>
                <div className="user-card-actions">
                  <button
                    type="button"
                    className={`pill ${u.active ? "pill-ok" : "pill-off"}`}
                    disabled={busyId === u.id}
                    onClick={() => void handleToggleActive(u)}
                  >
                    {busyId === u.id ? "..." : u.active ? "פעיל" : "לא פעיל"}
                  </button>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => setEditing({ id: u.id, name: u.name, phone: u.phone, role: u.role })}
                  >
                    עריכה
                  </button>
                </div>
              </div>
            ))}
            {users.length === 0 && <p className="muted">אין עדיין משתמשים.</p>}
          </div>
        )}
      </div>

      {editing && (
        <Modal title={editing.id ? "עריכת משתמש" : "משתמש חדש"} onClose={() => setEditing(null)}>
          <form onSubmit={handleSave}>
            <div className="field">
              <label>שם</label>
              <input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="field">
              <label>טלפון (כולל קידומת מדינה, למשל 972501234567)</label>
              <input required className="mono" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>תפקיד</label>
              <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "שומר..." : "שמירה"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
