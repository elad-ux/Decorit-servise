import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import Modal from "../../components/Modal";
import { useCuttingPermissions } from "../../components/CuttingLayout";
import SortableTh from "../../components/SortableTh";
import { PrinterIcon } from "../../components/icons";
import { type SortState, nextSort, sortRows } from "../../lib/tableSort";
import { PACKAGING_OPTIONS, type CuttingTask, formatPackaging, listTasks, reopenTask, reportComplete } from "../../lib/cutting";

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type PendingSortKey = "customer" | "fabric" | "quantity" | "created" | "notes";
type CompletedSortKey = "customer" | "fabric" | "quantity" | "packaging" | "created" | "completed";

const fabricLabel = (t: CuttingTask) => `${t.fabric_name ?? ""} ${t.color_name ?? ""}`.trim();
const PENDING_SORT: Record<PendingSortKey, (t: CuttingTask) => string | number | null> = {
  customer: (t) => t.customer_name,
  fabric: fabricLabel,
  quantity: (t) => t.quantity_ordered,
  created: (t) => (t.created_at ? new Date(t.created_at).getTime() : null),
  notes: (t) => t.office_notes,
};
const COMPLETED_SORT: Record<CompletedSortKey, (t: CuttingTask) => string | number | null> = {
  customer: (t) => t.customer_name,
  fabric: fabricLabel,
  quantity: (t) => t.quantity_completed,
  packaging: (t) => formatPackaging(t),
  created: (t) => (t.created_at ? new Date(t.created_at).getTime() : null),
  completed: (t) => (t.completed_at ? new Date(t.completed_at).getTime() : null),
};
const PENDING_SORT_LABEL: Record<PendingSortKey, string> = {
  customer: "לקוח",
  fabric: "בד וצבע",
  quantity: "כמות",
  created: "נוצרה",
  notes: "הערות",
};

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

type ReportFormState = { id: string; quantity_completed: string; packaging_types: string[]; packages_count: string; cutter_notes: string };

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
  const [pendingSort, setPendingSort] = useState<SortState<PendingSortKey> | null>(null);
  const [completedSort, setCompletedSort] = useState<SortState<CompletedSortKey> | null>(null);
  const printedAtRef = useRef<HTMLSpanElement>(null);

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

  // Default order is the server's (urgent first, then oldest first); a header click overrides it.
  const sortedPending = useMemo(() => sortRows(filteredPending, pendingSort, PENDING_SORT), [filteredPending, pendingSort]);
  const sortedCompleted = useMemo(() => sortRows(filteredCompleted, completedSort, COMPLETED_SORT), [filteredCompleted, completedSort]);

  // The pending table prints on its own (see the print rules in global.css). Stamp the print time at
  // the moment of printing — for the button and for Ctrl+P alike — straight into the DOM.
  useEffect(() => {
    document.body.classList.add("print-station");
    const stamp = () => {
      if (printedAtRef.current) printedAtRef.current.textContent = fmtDateTime(new Date().toISOString());
    };
    window.addEventListener("beforeprint", stamp);
    return () => {
      document.body.classList.remove("print-station");
      window.removeEventListener("beforeprint", stamp);
    };
  }, []);

  const printNote = [
    pendingSort ? `מיון: ${PENDING_SORT_LABEL[pendingSort.key]} ${pendingSort.dir === "asc" ? "▲ עולה" : "▼ יורד"}` : "מיון: דחוף ואז הישן ביותר",
    search && `חיפוש: ${search}`,
    fabricFilter !== "all" && `בד: ${fabricFilter}`,
    urgentOnly && "דחוף בלבד",
    limitedOnly && "אין במלאי בלבד",
  ]
    .filter(Boolean)
    .join(" · ");

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
    setReporting({ id: task.id, quantity_completed: String(task.quantity_ordered), packaging_types: [], packages_count: "", cutter_notes: "" });
  }

  async function handleSubmitReport(e: React.FormEvent) {
    e.preventDefault();
    if (!reporting) return;
    const quantity = Number(reporting.quantity_completed);
    if (!quantity || quantity <= 0) {
      setFormError("יש להזין כמות שהושלמה");
      return;
    }
    const kinds = reporting.packaging_types;
    const packages = Number(reporting.packages_count);
    if (kinds.length > 0 && (!Number.isInteger(packages) || packages < kinds.length)) {
      setFormError(
        kinds.length > 1
          ? `יש להזין מספר חבילות כולל (לפחות ${kinds.length} — חבילה אחת לכל סוג אריזה שנבחר)`
          : "יש להזין מספר חבילות (מספר שלם, לפחות 1)",
      );
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await reportComplete(sessionToken, {
        id: reporting.id,
        quantity_completed: quantity,
        packaging_types: kinds.length > 0 ? kinds : undefined,
        packages_count: kinds.length > 0 ? packages : undefined,
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

      <div className="field no-print" style={{ maxWidth: 320 }}>
        <input placeholder="חיפוש (לקוח, בד, צבע, הערות...)" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="chip-row no-print" style={{ margin: "0.5rem 0 1rem" }}>
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

      <section className="print-area">
      <div className="print-only print-header">
        <h1>DECORIT — עמדת גזירה</h1>
        <p>
          הודפס: <span ref={printedAtRef} />
        </p>
        <p>{printNote}</p>
      </div>
      <div className="broadcast-header">
        <h2 className="page-subtitle" style={{ margin: 0 }}>
          ממתינות לגזירה ({filteredPending.length})
        </h2>
        <button type="button" className="btn btn-sm no-print" style={{ width: "auto", display: "inline-flex", gap: "0.4rem", alignItems: "center" }} onClick={() => window.print()}>
          <PrinterIcon /> הדפסה
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortableTh label="לקוח" sortKey="customer" sort={pendingSort} onSort={(k) => setPendingSort((c) => nextSort(c, k))} />
              <SortableTh label="בד וצבע" sortKey="fabric" sort={pendingSort} onSort={(k) => setPendingSort((c) => nextSort(c, k))} />
              <SortableTh label="כמות" sortKey="quantity" sort={pendingSort} onSort={(k) => setPendingSort((c) => nextSort(c, k))} />
              <SortableTh label="נוצרה" sortKey="created" sort={pendingSort} onSort={(k) => setPendingSort((c) => nextSort(c, k))} />
              <SortableTh label="הערות" sortKey="notes" sort={pendingSort} onSort={(k) => setPendingSort((c) => nextSort(c, k))} />
              <th className="no-print"></th>
            </tr>
          </thead>
          <tbody>
            {sortedPending.map((t) => (
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
                <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(t.created_at)}</td>
                <td className="muted">{t.office_notes || "—"}</td>
                <td className="no-print">
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
                <td colSpan={6} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                  {pending.length === 0 ? "אין משימות ממתינות 🎉" : "אין משימות התואמות את החיפוש"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </section>

      <div className="no-print">
      <h2 className="page-subtitle">הושלמו לאחרונה</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortableTh label="לקוח" sortKey="customer" sort={completedSort} onSort={(k) => setCompletedSort((c) => nextSort(c, k))} />
              <SortableTh label="בד וצבע" sortKey="fabric" sort={completedSort} onSort={(k) => setCompletedSort((c) => nextSort(c, k))} />
              <SortableTh label="כמות שהושלמה" sortKey="quantity" sort={completedSort} onSort={(k) => setCompletedSort((c) => nextSort(c, k))} />
              <SortableTh label="אריזה" sortKey="packaging" sort={completedSort} onSort={(k) => setCompletedSort((c) => nextSort(c, k))} />
              <SortableTh label="נוצרה" sortKey="created" sort={completedSort} onSort={(k) => setCompletedSort((c) => nextSort(c, k))} />
              <SortableTh label="הושלם" sortKey="completed" sort={completedSort} onSort={(k) => setCompletedSort((c) => nextSort(c, k))} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedCompleted.map((t) => (
              <tr key={t.id}>
                <td>{t.customer_name}</td>
                <td>
                  {t.fabric_name ?? "—"} / {t.color_name ?? "—"}
                </td>
                <td>{t.quantity_completed ?? "—"}</td>
                <td className="muted">{formatPackaging(t) || "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(t.created_at)}</td>
                <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(t.completed_at)}</td>
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
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                  {recentlyCompleted.length === 0 ? "אין משימות שהושלמו עדיין" : "אין משימות התואמות את החיפוש"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
              <label>סוג אריזה (אפשר לבחור כמה)</label>
              <div className="chip-row">
                {PACKAGING_OPTIONS.map((o) => {
                  const on = reporting.packaging_types.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={on}
                      className={`chip${on ? " chip-selected" : ""}`}
                      onClick={() => {
                        const next = on
                          ? reporting.packaging_types.filter((k) => k !== o.value)
                          : [...reporting.packaging_types, o.value];
                        setReporting({ ...reporting, packaging_types: next, packages_count: next.length === 0 ? "" : reporting.packages_count });
                      }}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {reporting.packaging_types.length > 0 && (
              <div className="field">
                <label>מספר חבילות כולל</label>
                <input
                  required
                  type="number"
                  inputMode="numeric"
                  min={reporting.packaging_types.length}
                  step={1}
                  value={reporting.packages_count}
                  onChange={(e) => setReporting({ ...reporting, packages_count: e.target.value })}
                />
                <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                  סך כל החבילות בהזמנה, מכל הסוגים שסומנו יחד (למשל גליל + שקית, ובסך הכל 5).
                </p>
              </div>
            )}
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
