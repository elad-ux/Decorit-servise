import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import Modal from "../../components/Modal";
import { useCuttingPermissions } from "../../components/CuttingLayout";
import {
  type CreateTaskInput,
  type CuttingFabric,
  type CuttingTask,
  type CuttingTaskStatus,
  createTask,
  deleteTask,
  listFabrics,
  listTasks,
  suggestCustomers,
  updateTask,
} from "../../lib/cutting";

const STATUS_LABEL: Record<CuttingTaskStatus, string> = {
  pending: "בהמתנה",
  completed: "הושלם",
  archived: "בארכיון",
};

type FormState = {
  id?: string;
  customer_name: string;
  fabric_id: string;
  fabric_color_id: string;
  quantity_ordered: string;
  customer_order_number: string;
  office_notes: string;
  is_urgent: boolean;
};

const EMPTY_FORM: FormState = {
  customer_name: "",
  fabric_id: "",
  fabric_color_id: "",
  quantity_ordered: "",
  customer_order_number: "",
  office_notes: "",
  is_urgent: false,
};

export default function CuttingBoard() {
  const { session } = useAuth();
  const sessionToken = session?.sessionToken ?? "";
  const { canCreate, canEdit, isAdmin, loaded: permissionsLoaded } = useCuttingPermissions();

  const [tasks, setTasks] = useState<CuttingTask[]>([]);
  const [fabrics, setFabrics] = useState<CuttingFabric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<CuttingTaskStatus | "all">("pending");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [customerFilter, setCustomerFilter] = useState("");

  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [customerSuggestions, setCustomerSuggestions] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const filter =
        statusFilter === "all"
          ? {}
          : {
              status: statusFilter,
              ...(urgentOnly ? { is_urgent: true } : {}),
              ...(customerFilter.trim() ? { customer: customerFilter.trim() } : {}),
            };
      setTasks(await listTasks(sessionToken, filter));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בטעינת המשימות");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, urgentOnly]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerFilter]);

  useEffect(() => {
    listFabrics(sessionToken, false)
      .then(setFabrics)
      .catch(() => {
        // non-fatal — the create/edit form just won't have options
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedFabric = useMemo(
    () => fabrics.find((f) => f.id === editing?.fabric_id) ?? null,
    [fabrics, editing?.fabric_id],
  );

  function openCreate() {
    setFormError(null);
    setEditing({ ...EMPTY_FORM });
  }

  function openEdit(task: CuttingTask) {
    setFormError(null);
    setEditing({
      id: task.id,
      customer_name: task.customer_name,
      fabric_id: task.fabric_id,
      fabric_color_id: task.fabric_color_id,
      quantity_ordered: String(task.quantity_ordered),
      customer_order_number: task.customer_order_number ?? "",
      office_notes: task.office_notes ?? "",
      is_urgent: task.is_urgent,
    });
  }

  function handleCustomerNameChange(value: string) {
    setEditing((prev) => (prev ? { ...prev, customer_name: value } : prev));
    if (value.trim().length < 2) {
      setCustomerSuggestions([]);
      return;
    }
    suggestCustomers(sessionToken, value.trim())
      .then(setCustomerSuggestions)
      .catch(() => setCustomerSuggestions([]));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const quantity = Number(editing.quantity_ordered);
    if (!editing.customer_name.trim() || !editing.fabric_id || !editing.fabric_color_id || !quantity || quantity <= 0) {
      setFormError("יש למלא לקוח, בד, צבע וכמות תקינה");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const input: CreateTaskInput = {
        customer_name: editing.customer_name.trim(),
        fabric_id: editing.fabric_id,
        fabric_color_id: editing.fabric_color_id,
        quantity_ordered: quantity,
        customer_order_number: editing.customer_order_number.trim() || undefined,
        office_notes: editing.office_notes.trim() || undefined,
        is_urgent: editing.is_urgent,
      };
      if (editing.id) {
        await updateTask(sessionToken, { id: editing.id, ...input });
      } else {
        await createTask(sessionToken, input);
      }
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(task: CuttingTask) {
    if (!confirm(`למחוק את המשימה של ${task.customer_name}?`)) return;
    setBusyId(task.id);
    setError(null);
    try {
      await deleteTask(sessionToken, task.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה במחיקה");
    } finally {
      setBusyId(null);
    }
  }

  // A cutter has no create/edit rights here — nothing on this page applies
  // to them, so send them to the queue they actually work from. Wait for
  // the permission fetch to resolve first, or everyone gets bounced during
  // the loading flash (permissions start empty until it completes).
  if (permissionsLoaded && !canCreate && !canEdit && !isAdmin) {
    return <Navigate to="/cutting/station" replace />;
  }

  return (
    <>
      <div className="broadcast-header">
        <h2 className="page-subtitle" style={{ margin: 0 }}>
          משימות גזירה
        </h2>
        {canCreate && (
          <button type="button" className="btn btn-sm" style={{ width: "auto" }} onClick={openCreate}>
            + משימה חדשה
          </button>
        )}
      </div>

      <div className="chip-row" style={{ margin: "0.75rem 0" }}>
        {(["pending", "completed", "archived", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`chip${statusFilter === s ? " chip-selected" : ""}`}
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? "הכל" : STATUS_LABEL[s]}
          </button>
        ))}
        <button type="button" className={`chip${urgentOnly ? " chip-selected" : ""}`} onClick={() => setUrgentOnly((v) => !v)}>
          דחוף בלבד
        </button>
      </div>

      <div className="field" style={{ maxWidth: 320 }}>
        <input placeholder="חיפוש לפי לקוח" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} />
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <p className="muted">טוען...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>לקוח</th>
                <th>בד וצבע</th>
                <th>כמות</th>
                <th>סטטוס</th>
                <th>הערות</th>
                <th>נוצר / עודכן</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className={t.is_urgent ? "row-urgent" : undefined}>
                  <td>
                    {t.customer_name}
                    {t.customer_order_number ? <div className="muted mono">{t.customer_order_number}</div> : null}
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
                  <td>
                    <span className={`pill pill-status-${t.status === "archived" ? "deleted_from_meta" : t.status}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                    {t.is_urgent && (
                      <div>
                        <span className="pill pill-danger">דחוף</span>
                      </div>
                    )}
                  </td>
                  <td className="muted">{t.office_notes || "—"}</td>
                  <td>
                    <div>{new Date(t.created_at).toLocaleString("he-IL")}</div>
                    {t.created_by_name && <div className="muted" style={{ fontSize: "0.75rem" }}>ע"י {t.created_by_name}</div>}
                    {t.updated_by && (
                      <div style={{ marginTop: "0.25rem" }}>
                        <span
                          className="chip chip-static chip-sm"
                          title={`נערך על ידי ${t.updated_by_name || t.updated_by} · ${new Date(t.updated_at).toLocaleString("he-IL")}`}
                        >
                          נערך
                        </span>
                      </div>
                    )}
                  </td>
                  <td>
                    {canEdit && t.status === "pending" && (
                      <>
                        <button type="button" className="btn-link" onClick={() => openEdit(t)}>
                          עריכה
                        </button>
                        <button
                          type="button"
                          className="btn-link btn-link-danger"
                          disabled={busyId === t.id}
                          onClick={() => void handleDelete(t)}
                        >
                          מחיקה
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                    אין משימות להצגה
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? "עריכת משימה" : "משימה חדשה"} onClose={() => setEditing(null)}>
          <form onSubmit={handleSave}>
            {formError && <div className="error-box">{formError}</div>}
            <div className="field">
              <label>שם לקוח</label>
              <input
                required
                value={editing.customer_name}
                onChange={(e) => handleCustomerNameChange(e.target.value)}
                list="cutting-customer-suggestions"
              />
              <datalist id="cutting-customer-suggestions">
                {customerSuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="form-row">
              <div className="field">
                <label>בד</label>
                <select
                  required
                  value={editing.fabric_id}
                  onChange={(e) => setEditing({ ...editing, fabric_id: e.target.value, fabric_color_id: "" })}
                >
                  <option value="">בחירה...</option>
                  {fabrics.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>צבע</label>
                <select
                  required
                  disabled={!selectedFabric}
                  value={editing.fabric_color_id}
                  onChange={(e) => setEditing({ ...editing, fabric_color_id: e.target.value })}
                >
                  <option value="">בחירה...</option>
                  {selectedFabric?.colors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.color_name}
                      {!c.in_stock ? " (אין במלאי)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>כמות</label>
                <input
                  required
                  type="number"
                  min={1}
                  step="0.01"
                  value={editing.quantity_ordered}
                  onChange={(e) => setEditing({ ...editing, quantity_ordered: e.target.value })}
                />
              </div>
              <div className="field">
                <label>מספר הזמנה (אופציונלי)</label>
                <input
                  className="mono"
                  value={editing.customer_order_number}
                  onChange={(e) => setEditing({ ...editing, customer_order_number: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>הערות למחלקת הגזירה</label>
              <input value={editing.office_notes} onChange={(e) => setEditing({ ...editing, office_notes: e.target.value })} />
            </div>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={editing.is_urgent}
                  onChange={(e) => setEditing({ ...editing, is_urgent: e.target.checked })}
                  style={{ width: "auto", marginLeft: "0.5rem" }}
                />
                דחוף
              </label>
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
