import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import {
  type BroadcastBatch,
  type BroadcastTemplate,
  countTarget,
  createBatch,
  listBatches,
  listSendTemplates,
} from "../../lib/broadcast";

const BATCH_STATUS_LABEL: Record<BroadcastBatch["status"], string> = {
  scheduled: "מתוזמן",
  sending: "בשליחה",
  completed: "הושלם",
  cancelled: "בוטל",
};

function parseCommaList(v: string): string[] | undefined {
  const items = v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

export default function BroadcastSend() {
  const { session } = useAuth();
  const sessionToken = session?.sessionToken ?? "";

  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [batches, setBatches] = useState<BroadcastBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [templateId, setTemplateId] = useState("");
  const [cities, setCities] = useState("");
  const [categories, setCategories] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [targetCount, setTargetCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [t, b] = await Promise.all([listSendTemplates(sessionToken), listBatches(sessionToken)]);
      setTemplates(t);
      setBatches(b);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCount() {
    setCounting(true);
    setError(null);
    try {
      const count = await countTarget(sessionToken, {
        filter_cities: parseCommaList(cities),
        filter_categories: parseCommaList(categories),
      });
      setTargetCount(count);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בספירת קהל היעד");
    } finally {
      setCounting(false);
    }
  }

  async function handleCreateBatch() {
    if (!templateId) {
      setError("בחרו תבנית קודם");
      return;
    }
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await createBatch(sessionToken, {
        template_id: templateId,
        filter_cities: parseCommaList(cities),
        filter_categories: parseCommaList(categories),
        scheduled_for: scheduledFor || undefined,
      });
      setNotice(`${res.queued} הודעות נכנסו לתור. ${res.note}`);
      setTargetCount(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה ביצירת הקמפיין");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="callout-info">
        <strong>שימו לב:</strong> שליחת ההודעות בפועל מול וואטסאפ עדיין לא מחוברת בצד השרת. יצירת קמפיין כאן
        מכניסה את ההודעות לתור בלבד — הן לא נשלחות בפועל עדיין.
      </div>

      {error && <div className="error-box">{error}</div>}
      {notice && <div className="notice-box">{notice}</div>}

      <h2 className="section-title">קמפיין חדש</h2>
      <div className="form-row">
        <div className="field">
          <label>תבנית</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">בחרו תבנית</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>ערים (מופרד בפסיקים, ריק = הכל)</label>
          <input value={cities} onChange={(e) => setCities(e.target.value)} placeholder="חיפה, תל אביב" />
        </div>
        <div className="field">
          <label>קטגוריות (מופרד בפסיקים, ריק = הכל)</label>
          <input value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="רהיטים" />
        </div>
        <div className="field">
          <label>תזמון (אופציונלי)</label>
          <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        </div>
      </div>

      <div className="toolbar">
        <button type="button" className="btn btn-sm" style={{ width: "auto" }} onClick={() => void handleCount()} disabled={counting}>
          {counting ? "סופר..." : "ספירת קהל יעד"}
        </button>
        {targetCount !== null && <span className="muted">קהל יעד: {targetCount} אנשי קשר</span>}
        <button
          type="button"
          className="btn btn-sm"
          style={{ width: "auto" }}
          onClick={() => void handleCreateBatch()}
          disabled={creating || !templateId}
        >
          {creating ? "יוצר..." : "צור קמפיין"}
        </button>
      </div>

      <h2 className="section-title">קמפיינים קודמים</h2>
      {loading ? (
        <p className="muted">טוען...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>סטטוס</th>
                <th>יעד</th>
                <th>מתוזמן ל</th>
                <th>נוצר</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td>
                    <span className={`pill pill-status-${b.status}`}>{BATCH_STATUS_LABEL[b.status]}</span>
                  </td>
                  <td>{b.target_count ?? "—"}</td>
                  <td>{b.scheduled_for ? new Date(b.scheduled_for).toLocaleString("he-IL") : "מיידי"}</td>
                  <td>{new Date(b.created_at).toLocaleString("he-IL")}</td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                    אין קמפיינים עדיין
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
