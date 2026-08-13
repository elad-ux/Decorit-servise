import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import Modal from "../../components/Modal";
import {
  type BroadcastCategory,
  type BroadcastContact,
  addCategory,
  deleteContact,
  listCategories,
  listContacts,
  markContactOptedOut,
  reactivateContact,
  setContactActive,
  upsertContact,
} from "../../lib/broadcast";

type FormState = {
  id?: string;
  business_name: string;
  contact_name: string;
  phone: string;
  city: string;
  category: string;
};

const EMPTY_FORM: FormState = { business_name: "", contact_name: "", phone: "", city: "", category: "" };

export default function BroadcastContacts() {
  const { session } = useAuth();
  const [contacts, setContacts] = useState<BroadcastContact[]>([]);
  const [categories, setCategories] = useState<BroadcastCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const sessionToken = session?.sessionToken ?? "";

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [c, cats] = await Promise.all([listContacts(sessionToken), listCategories(sessionToken)]);
      setContacts(c);
      setCategories(cats);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בטעינת אנשי הקשר");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cities = useMemo(
    () => Array.from(new Set(contacts.map((c) => c.city).filter((c): c is string => !!c))).sort(),
    [contacts],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (cityFilter && c.city !== cityFilter) return false;
      if (categoryFilter && c.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        c.business_name.toLowerCase().includes(q) ||
        (c.contact_name ?? "").toLowerCase().includes(q) ||
        c.phone.includes(q)
      );
    });
  }, [contacts, search, cityFilter, categoryFilter]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await upsertContact(sessionToken, {
        id: editing.id,
        business_name: editing.business_name,
        contact_name: editing.contact_name || null,
        phone: editing.phone,
        city: editing.city || null,
        category: editing.category || null,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: BroadcastContact) {
    if (!confirm(`למחוק את ${c.business_name}?`)) return;
    try {
      await deleteContact(sessionToken, c.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה במחיקה");
    }
  }

  async function handleToggleActive(c: BroadcastContact) {
    try {
      await setContactActive(sessionToken, c.id, !c.active);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בעדכון");
    }
  }

  async function handleOptOutToggle(c: BroadcastContact) {
    try {
      if (c.opted_out) await reactivateContact(sessionToken, c.id);
      else await markContactOptedOut(sessionToken, c.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בעדכון");
    }
  }

  async function handleAddCategory() {
    const name = prompt("שם קטגוריה חדשה:");
    if (!name) return;
    try {
      await addCategory(sessionToken, name);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה ביצירת קטגוריה");
    }
  }

  return (
    <div>
      {error && <div className="error-box">{error}</div>}

      <div className="toolbar">
        <input
          className="input-inline"
          placeholder="חיפוש לפי שם / טלפון..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input-inline" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
          <option value="">כל הערים</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
        <select className="input-inline" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">כל הקטגוריות</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.name}>
              {cat.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn-link" onClick={handleAddCategory}>
          + קטגוריה חדשה
        </button>
        <button type="button" className="btn btn-sm" style={{ width: "auto" }} onClick={() => setEditing(EMPTY_FORM)}>
          + איש קשר חדש
        </button>
      </div>

      {loading ? (
        <p className="muted">טוען...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>עסק</th>
                <th>איש קשר</th>
                <th>טלפון</th>
                <th>עיר</th>
                <th>קטגוריה</th>
                <th>פעיל</th>
                <th>הסרה</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>{c.business_name}</td>
                  <td>{c.contact_name || "—"}</td>
                  <td className="mono">{c.phone}</td>
                  <td>{c.city || "—"}</td>
                  <td>{c.category || "—"}</td>
                  <td>
                    <button type="button" className={`pill ${c.active ? "pill-ok" : "pill-off"}`} onClick={() => void handleToggleActive(c)}>
                      {c.active ? "פעיל" : "לא פעיל"}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`pill ${c.opted_out ? "pill-danger" : "pill-neutral"}`}
                      onClick={() => void handleOptOutToggle(c)}
                    >
                      {c.opted_out ? "הוסר" : "רשום"}
                    </button>
                  </td>
                  <td>
                    <button type="button" className="btn-link" onClick={() => setEditing({ ...c, contact_name: c.contact_name ?? "", city: c.city ?? "", category: c.category ?? "" })}>
                      עריכה
                    </button>
                    {" · "}
                    <button type="button" className="btn-link btn-link-danger" onClick={() => void handleDelete(c)}>
                      מחיקה
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                    אין אנשי קשר תואמים
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? "עריכת איש קשר" : "איש קשר חדש"} onClose={() => setEditing(null)}>
          <form onSubmit={handleSave}>
            <div className="field">
              <label>שם העסק</label>
              <input required value={editing.business_name} onChange={(e) => setEditing({ ...editing, business_name: e.target.value })} />
            </div>
            <div className="field">
              <label>איש קשר</label>
              <input value={editing.contact_name} onChange={(e) => setEditing({ ...editing, contact_name: e.target.value })} />
            </div>
            <div className="field">
              <label>טלפון</label>
              <input required value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>עיר</label>
              <input value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} />
            </div>
            <div className="field">
              <label>קטגוריה</label>
              <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                <option value="">—</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
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
    </div>
  );
}
