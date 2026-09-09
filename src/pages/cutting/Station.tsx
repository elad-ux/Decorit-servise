import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import Modal from "../../components/Modal";
import { useCuttingPermissions } from "../../components/CuttingLayout";
import { type CuttingTask, listTasks, reopenTask, reportComplete } from "../../lib/cutting";

/** Matches the free-text search box against every column shown in either table. */
function matchesSearch(t: CuttingTask, query: string): boolean {
  if (!query) return true;
  const haystack = [
    t.customer_name,
    t.customer_order_number,
    t.fabric_name,
    t.color_name,
    t.office_notes,
    t.cutter_notes,
    t.packaging_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

type ReportFormState = { id: string; quantity_completed: string; packaging_type: string; cutter_notes: string };

export default function CuttingStation() {
  const { session } = useAuth();
  const sessionToken = session?.sessionToken ?? "";
  const { canReport, canEdit } = useCuttingPermissions();

  const [pending, setPending] = useState<CuttingTask[]>([]);
  const [recentlyCompleted, setRecentlyCompleted] = useState<CuttingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reporting, setReporting] = useState<ReportFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [fabricFilter, setFabricFilter] = useState("all");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [limitedOnly, setLimitedOnly] = useState(false);

  const fabricOptions = useMemo(
    () => Array.from(new Set(pending.map((t) => t.fabric_name).filter((n): n is string => !!n))).sort(),
    [pending],
  );

  const filteredPending = useMemo(
    () =>
      pending.filter(
        (t) =>
          matchesSearch(t, search) &&
          (fabricFilter === "all" || t.fabric_name === fabricFilter) &&
          (!urgentOnly || t.is_urgent) &&
          (!limitedOnly || t.is_limited),
      ),
    [pending, search, fabricFilter, urgentOnly, limitedOnly],
  );

  const filteredCompleted = useMemo(
    () => recentlyCompleted.filter((t) => matchesSearch(t, search)),
    [recentlyCompleted, search],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [pendingTasks, completedTasks] = await Promise.all([
        listTasks(sessionToken, { status: "pending" }),
        listTasks(sessionToken, { status: "completed" }),
      ]);
      setPending(pendingTasks);
      setRecentlyCompleted(completedTasks.slice(0, 20));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בטעינת עמדת הגזירה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openReport(task: CuttingTask) {
    setFormError(null);
    setReporting({ id: task.id, quantity_completed: String(task.quantity_ordered), packaging_type: "", cutter_notes: "" });
  }

  async function handleSubmitReport(e: React.FormEvent) {
    e.preventDefault();
    if (!reporting) return;
    const quantity = Number(reporting.quantity_completed);
    if (!quantity || quantity <= 0) {
      setFormError("יש להזין כמות שהושלמה");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await reportComplete(sessionToken, {
        id: reporting.id,
        quantity_completed: quantity,
        packaging_type: reporting.packaging_type.trim() || undefined,
        cutter_notes: reporting.cutter_notes.trim() || undefined,
      });
      setReporting(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "שגיאה בדיווח — ייתכן שהמשימה כבר טופלה");
    } finally {
      setSaving(false);
    }
  }

  async function handleReopen(task: CuttingTask) {
    if (!confirm(`לפתוח מחדש את המשימה של ${task.customer_name}?`)) return;
    setBusyId(task.id);
    setError(null);
    try {
      await reopenTask(sessionToken, task.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בפתיחה מחדש");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="muted">טוען...</p>;

  return (
    <>
      {error && <div className="error-box">{error}</div>}

      <div className="field" style={{ maxWidth: 320 }}>
        <input placeholder="חיפוש (לקוח, בד, צבע, הערות...)" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="chip-row" style={{ margin: "0.5rem 0 1rem" }}>
        <button type="button" className={`chip${fabricFilter === "all" ? " chip-selected" : ""}`} onClick={() => setFabricFilter("all")}>
          כל הבדים
        </button>
        {fabricOptions.map((f) => (
          <button key={f} type="button" className={`chip${fabricFilter === f ? " chip-selected" : ""}`} onClick={() => setFabricFilter(f)}>
            {f}
          </button>
        ))}
        <button type="button" className={`chip${urgentOnly ? " chip-selected" : ""}`} onClick={() => setUrgentOnly((v) => !v)}>
          דחוף בלבד
        </button>
        <button type="button" className={`chip${limitedOnly ? " chip-selected" : ""}`} onClick={() => setLimitedOnly((v) => !v)}>
          אין במלאי בלבד
        </button>
      </div>

      <h2 className="page-subtitle" style={{ marginTop: 0 }}>
        ממתינות לגזירה ({filteredPending.length})
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>לקוח</th>
              <th>בד וצבע</th>
              <th>כמות</th>
              <th>הערות</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredPending.map((t) => (
              <tr key={t.id} className={t.is_urgent ? "row-urgent" : undefined}>
                <td>
                  {t.is_urgent && <span className="pill pill-danger">דחוף</span>} {t.customer_name}
                </td>
                <td>
                  {t.fabric_name ?? "—"} / {t.color_name ?? "—"}
                  {t.color_in_stock === false && (
                    <div>
                      <span className="chip chip-static chip-sm">אין במלאי</span>
                    </div>
                  )}
                </td>
                <td>{t.quantity_ordered}</td>
                <td className="muted">{t.office_notes || "—"}</td>
                <td>
                  {canReport && (
                    <button type="button" className="btn btn-sm" style={{ width: "auto" }} onClick={() => openReport(t)}>
                      סמן כהושלם
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filteredPending.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                  {pending.length === 0 ? "אין משימות ממתינות 🎉" : "אין משימות התואמות את החיפוש"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="page-subtitle">הושלמו לאחרונה</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>לקוח</th>
              <th>בד וצבע</th>
              <th>כמות שהושלמה</th>
              <th>אריזה</th>
              <th>הושלם</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredCompleted.map((t) => (
              <tr key={t.id}>
                <td>{t.customer_name}</td>
                <td>
                  {t.fabric_name ?? "—"} / {t.color_name ?? "—"}
                </td>
                <td>{t.quantity_completed ?? "—"}</td>
                <td className="muted">{t.packaging_type || "—"}</td>
                <td>{t.completed_at ? new Date(t.completed_at).toLocaleString("he-IL") : "—"}</td>
                <td>
                  {canEdit && (
                    <button type="button" className="btn-link" disabled={busyId === t.id} onClick={() => void handleReopen(t)}>
                      פתיחה מחדש
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filteredCompleted.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                  {recentlyCompleted.length === 0 ? "אין משימות שהושלמו עדיין" : "אין משימות התואמות את החיפוש"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {reporting && (
        <Modal title="דיווח השלמת גזירה" onClose={() => setReporting(null)}>
          <form onSubmit={handleSubmitReport}>
            {formError && <div className="error-box">{formError}</div>}
            <div className="field">
              <label>כמות שהושלמה</label>
              <input
                required
                type="number"
                min={0}
                step="0.01"
                value={reporting.quantity_completed}
                onChange={(e) => setReporting({ ...reporting, quantity_completed: e.target.value })}
              />
            </div>
            <div className="field">
              <label>סוג אריזה (אופציונלי)</label>
              <input
                value={reporting.packaging_type}
                onChange={(e) => setReporting({ ...reporting, packaging_type: e.target.value })}
              />
            </div>
            <div className="field">
              <label>הערות (אופציונלי)</label>
              <input value={reporting.cutter_notes} onChange={(e) => setReporting({ ...reporting, cutter_notes: e.target.value })} />
            </div>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "שולח..." : "אישור השלמה"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
