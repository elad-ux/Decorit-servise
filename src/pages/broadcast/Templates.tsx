import { useState, useEffect, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import Modal from "../../components/Modal";
import {
  type BroadcastTemplate,
  deleteTemplate,
  listTemplates,
  refreshTemplateStatus,
  submitTemplateToMeta,
  upsertTemplate,
} from "../../lib/broadcast";

type FormState = {
  id?: string;
  name: string;
  category: string;
  language: string;
  body_text: string;
  footer_text: string;
};

const EMPTY_FORM: FormState = { name: "", category: "", language: "he", body_text: "", footer_text: "" };

const STATUS_LABEL: Record<BroadcastTemplate["status"], string> = {
  draft: "טיוטה",
  pending: "ממתין לאישור מ-Meta",
  approved: "מאושר",
  rejected: "נדחה",
};

export default function BroadcastTemplates() {
  const { session } = useAuth();
  const sessionToken = session?.sessionToken ?? "";
  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await listTemplates(sessionToken));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בטעינת התבניות");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await upsertTemplate(sessionToken, {
        id: editing.id,
        name: editing.name,
        category: editing.category || undefined,
        language: editing.language,
        body_text: editing.body_text,
        footer_text: editing.footer_text || undefined,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: BroadcastTemplate) {
    if (!confirm(`למחוק את התבנית "${t.name}"?`)) return;
    try {
      await deleteTemplate(sessionToken, t.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה במחיקה");
    }
  }

  async function handleSubmitToMeta(t: BroadcastTemplate) {
    if (!confirm(`לשלוח את התבנית "${t.name}" לאישור Meta? לאחר השליחה לא ניתן לערוך אותה עד לקבלת תשובה.`)) return;
    setBusyId(t.id);
    setError(null);
    try {
      await submitTemplateToMeta(sessionToken, t.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בשליחה ל-Meta");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRefreshStatus(t: BroadcastTemplate) {
    setBusyId(t.id);
    setError(null);
    try {
      await refreshTemplateStatus(sessionToken, t.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בבדיקת סטטוס מול Meta");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {error && <div className="error-box">{error}</div>}

      <div className="toolbar">
        <button type="button" className="btn btn-sm" style={{ width: "auto" }} onClick={() => setEditing(EMPTY_FORM)}>
          + תבנית חדשה
        </button>
      </div>

      {loading ? (
        <p className="muted">טוען...</p>
      ) : (
        <div className="card-grid">
          {templates.map((t) => (
            <div key={t.id} className="template-card">
              <div className="template-card-head">
                <h3>{t.name}</h3>
                <span className={`pill pill-status-${t.status}`}>{STATUS_LABEL[t.status]}</span>
              </div>
              <p className="template-body">{t.body_text}</p>
              {t.footer_text && <p className="template-footer">{t.footer_text}</p>}
              {t.meta_template_name && <p className="muted mono">Meta: {t.meta_template_name}</p>}
              {t.status === "rejected" && t.rejection_reason && (
                <p className="muted" style={{ color: "var(--danger-500)" }}>
                  סיבת דחייה: {t.rejection_reason}
                </p>
              )}
              <div className="template-actions">
                {(t.status === "draft" || t.status === "rejected") && (
                  <>
                    <button type="button" className="btn-link" disabled={busyId === t.id} onClick={() => void handleSubmitToMeta(t)}>
                      {busyId === t.id ? "שולח..." : "שליחה לאישור Meta"}
                    </button>
                    {" · "}
                  </>
                )}
                {t.status === "pending" && (
                  <>
                    <button type="button" className="btn-link" disabled={busyId === t.id} onClick={() => void handleRefreshStatus(t)}>
                      {busyId === t.id ? "בודק..." : "בדיקת סטטוס"}
                    </button>
                    {" · "}
                  </>
                )}
                {t.status !== "pending" && (
                  <>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() =>
                        setEditing({
                          id: t.id,
                          name: t.name,
                          category: t.category ?? "",
                          language: t.language,
                          body_text: t.body_text,
                          footer_text: t.footer_text ?? "",
                        })
                      }
                    >
                      עריכה
                    </button>
                    {" · "}
                  </>
                )}
                <button type="button" className="btn-link btn-link-danger" onClick={() => void handleDelete(t)}>
                  מחיקה
                </button>
              </div>
            </div>
          ))}
          {templates.length === 0 && <p className="muted">אין תבניות עדיין</p>}
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? "עריכת תבנית" : "תבנית חדשה"} onClose={() => setEditing(null)}>
          <form onSubmit={handleSave}>
            <div className="field">
              <label>שם התבנית</label>
              <input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="field">
              <label>קטגוריה</label>
              <input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
            </div>
            <div className="field">
              <label>גוף ההודעה</label>
              <textarea
                required
                rows={4}
                value={editing.body_text}
                onChange={(e) => setEditing({ ...editing, body_text: e.target.value })}
              />
            </div>
            <div className="field">
              <label>שורת תחתית (footer, אופציונלי)</label>
              <input value={editing.footer_text} onChange={(e) => setEditing({ ...editing, footer_text: e.target.value })} />
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
