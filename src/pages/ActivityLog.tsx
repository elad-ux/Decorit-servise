import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import Modal from "../components/Modal";
import { type ActivityEntityType, type ActivityLogEntry, type ActivityLogFilters, listActivityLog } from "../lib/activityLog";
import { type AuthorizedUser, listUsers } from "../lib/users";
import TopBar from "../components/TopBar";

const PAGE_SIZE = 100;

const ROLE_LABEL_OVERRIDES: Record<string, string> = {
  admin: "מנהל מערכת",
  manager: "מנהל",
  warehouse: "מחסן",
  whatsapp: "צוות תפוצות",
};

function roleLabel(role: string): string {
  return ROLE_LABEL_OVERRIDES[role] ?? role;
}

const ENTITY_TYPE_LABEL: Record<ActivityEntityType, string> = {
  contact: "איש קשר",
  template: "תבנית",
  batch: "קמפיין",
  send: "הודעה",
  category: "קטגוריה",
  user: "משתמש",
  permission: "הרשאה",
};

function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABEL[entityType as ActivityEntityType] ?? entityType;
}

/**
 * Not a closed list — new action values can be added server-side over time
 * (see lib/activityLog.ts). This is a best-effort translation for the ones
 * documented today; anything unrecognized (including future additions)
 * falls back to showing the raw value, never breaks.
 */
const ACTION_LABEL: Record<string, string> = {
  create: "יצירה",
  update: "עדכון",
  delete: "מחיקה",
  bulk_activate: "הפעלה מרובה",
  bulk_deactivate: "השבתה מרובה",
  bulk_delete: "מחיקה מרובה",
  bulk_update: "עדכון מרובה",
  opt_out: "הסרה מתפוצה",
  reactivate: "הפעלה מחדש",
  import: "ייבוא",
  submit_to_meta: "שליחה לאישור Meta",
  edit: "עריכה",
  archive: "העברה לארכיון",
  unarchive: "הוצאה מארכיון",
  create_campaign: "יצירת קמפיין",
  cancel_campaign: "ביטול קמפיין",
  mark_seen: "סימון כנקרא",
  set_tags: "עדכון תגיות",
  send_reply: "שליחת תשובה",
  create_user: "יצירת משתמש",
  update_user: "עדכון משתמש",
  activate_user: "הפעלת משתמש",
  deactivate_user: "השבתת משתמש",
  revoke_session: "ניתוק סשן",
  grant_permission: "הענקת הרשאה",
  revoke_permission: "ביטול הרשאה",
};

const BLOCKED_SUFFIX = "_blocked";

function actionDisplay(action: string): { label: string; blocked: boolean } {
  const blocked = action.endsWith(BLOCKED_SUFFIX);
  const base = blocked ? action.slice(0, -BLOCKED_SUFFIX.length) : action;
  const label = ACTION_LABEL[base] ?? base;
  return { label: blocked ? `${label} — נחסם` : label, blocked };
}

function parseDetails(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function DetailsModal({ entry, onClose }: { entry: ActivityLogEntry; onClose: () => void }) {
  const parsed = parseDetails(entry.details);
  const isPlainObject = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  const record = isPlainObject ? (parsed as Record<string, unknown>) : null;
  const errorValue = record && "error" in record ? record.error : null;

  function renderValue(v: unknown): string {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
    return JSON.stringify(v, null, 2);
  }

  return (
    <Modal title="פרטי הפעולה" onClose={onClose}>
      <p className="muted">
        {new Date(entry.created_at).toLocaleString("he-IL")} · {entry.actor_name || entry.actor_phone} ·{" "}
        {actionDisplay(entry.action).label} · {entityTypeLabel(entry.entity_type)}
        {entry.entity_label ? ` — ${entry.entity_label}` : ""}
      </p>

      {errorValue != null && (
        <div className="error-box">
          <strong>שגיאה:</strong> {renderValue(errorValue)}
        </div>
      )}

      {record ? (
        Object.keys(record).length === 0 ? (
          <p className="muted">אין פרטים נוספים.</p>
        ) : (
          <table>
            <tbody>
              {Object.entries(record)
                .filter(([k]) => k !== "error")
                .map(([k, v]) => (
                  <tr key={k}>
                    <td className="mono" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                      {k}
                    </td>
                    <td style={{ whiteSpace: "pre-wrap" }}>{renderValue(v)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )
      ) : (
        <pre style={{ whiteSpace: "pre-wrap", fontSize: ".85rem" }}>
          {typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </Modal>
  );
}

const EMPTY_FILTERS: ActivityLogFilters = {};

export default function ActivityLog() {
  const { session } = useAuth();
  const sessionToken = session?.sessionToken ?? "";

  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [detailsEntry, setDetailsEntry] = useState<ActivityLogEntry | null>(null);

  const [actorPhone, setActorPhone] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  async function load(filters: ActivityLogFilters, offset: number, append: boolean) {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await listActivityLog(sessionToken, { ...filters, limit: PAGE_SIZE, offset });
      setEntries((prev) => (append ? [...prev, ...res.entries] : res.entries));
      setHasMore(res.entries.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בטעינת לוג הפעילות");
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }

  function currentFilters(): ActivityLogFilters {
    return {
      actor_phone: actorPhone || undefined,
      action: actionFilter.trim() || undefined,
      entity_type: entityType || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    };
  }

  useEffect(() => {
    void load(EMPTY_FILTERS, 0, false);
    listUsers(sessionToken)
      .then(setUsers)
      .catch(() => {
        // non-fatal — actor filter just falls back to an empty dropdown
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilterSubmit(e: FormEvent) {
    e.preventDefault();
    void load(currentFilters(), 0, false);
  }

  function handleReset() {
    setActorPhone("");
    setActionFilter("");
    setEntityType("");
    setDateFrom("");
    setDateTo("");
    void load(EMPTY_FILTERS, 0, false);
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
          <h1 className="page-title">לוג פעילות</h1>
        </div>
        <p className="page-subtitle">מי עשה מה ומתי בדשבורד התפוצות</p>

        {error && <div className="error-box">{error}</div>}

        <form className="toolbar" onSubmit={handleFilterSubmit}>
          <select className="input-inline" value={actorPhone} onChange={(e) => setActorPhone(e.target.value)}>
            <option value="">כל המשתמשים</option>
            {users.map((u) => (
              <option key={u.id} value={u.phone}>
                {u.name} ({u.phone})
              </option>
            ))}
          </select>

          <input
            className="input-inline"
            list="activity-action-options"
            placeholder="סוג פעולה (למשל create, delete)"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
          <datalist id="activity-action-options">
            {Object.keys(ACTION_LABEL).map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>

          <select className="input-inline" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">כל סוגי הישויות</option>
            {(Object.keys(ENTITY_TYPE_LABEL) as ActivityEntityType[]).map((et) => (
              <option key={et} value={et}>
                {ENTITY_TYPE_LABEL[et]}
              </option>
            ))}
          </select>

          <input
            className="input-inline"
            type="date"
            title="מתאריך"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <input
            className="input-inline"
            type="date"
            title="עד תאריך"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />

          <button type="submit" className="btn btn-sm" style={{ width: "auto" }}>
            סינון
          </button>
          <button type="button" className="btn-link" onClick={handleReset}>
            איפוס
          </button>
        </form>

        {loading ? (
          <p className="muted">טוען...</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>תאריך ושעה</th>
                    <th>משתמש</th>
                    <th>תפקיד</th>
                    <th>פעולה</th>
                    <th>סוג ישות</th>
                    <th>פרטים</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const { label, blocked } = actionDisplay(entry.action);
                    return (
                      <tr key={entry.id}>
                        <td>{new Date(entry.created_at).toLocaleString("he-IL")}</td>
                        <td>{entry.actor_name || entry.actor_phone}</td>
                        <td>{roleLabel(entry.actor_role)}</td>
                        <td>
                          <span className={`pill${blocked ? " pill-danger" : ""}`}>{label}</span>
                        </td>
                        <td>{entityTypeLabel(entry.entity_type)}</td>
                        <td>
                          {entry.entity_label || "—"}
                          {" · "}
                          <button type="button" className="btn-link" onClick={() => setDetailsEntry(entry)}>
                            הצג פרטים
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                        אין רשומות פעילות תואמות
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="toolbar" style={{ justifyContent: "center", marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ width: "auto" }}
                  disabled={loadingMore}
                  onClick={() => void load(currentFilters(), entries.length, true)}
                >
                  {loadingMore ? "טוען..." : "טען עוד"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {detailsEntry && <DetailsModal entry={detailsEntry} onClose={() => setDetailsEntry(null)} />}
    </>
  );
}
