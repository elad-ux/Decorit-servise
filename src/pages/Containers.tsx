import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import Modal from "../components/Modal";
import TopBar from "../components/TopBar";
import {
  CONTAINER_STATUS_LABEL,
  CONTAINER_STATUS_STAGE,
  type ContainerListRow,
  type ContainerStatus,
  type UpsertContainerInput,
  listContainers,
  upsertContainer,
} from "../lib/containers";

type SortKey = "container_number" | "customer_name" | "supplier" | "route" | "status" | "eta";

function SortableHeader({
  label,
  sortKey: key,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const isActive = key === activeKey;
  return (
    <th>
      <button
        type="button"
        onClick={() => onSort(key)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit",
          fontWeight: "inherit",
          color: "inherit",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
        }}
      >
        {label}
        <span style={{ opacity: isActive ? 1 : 0.25, fontSize: "0.75em" }}>{isActive && dir === "desc" ? "▲" : "▼"}</span>
      </button>
    </th>
  );
}

type FormState = UpsertContainerInput;
const EMPTY_FORM: FormState = { container_number: "", status: "pending" };

export default function Containers() {
  const { session } = useAuth();
  const sessionToken = session?.sessionToken ?? "";
  const navigate = useNavigate();
  const canCreate = session?.role === "admin" || session?.role === "manager";

  const [containers, setContainers] = useState<ContainerListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("eta");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [creating, setCreating] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setContainers(await listContainers(sessionToken));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בטעינת המכולות");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return containers;
    return containers.filter((c) => {
      const haystack = [c.container_number, c.customer_name, c.carrier, c.vessel_name, c.origin_port, c.dest_port]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [containers, search]);

  const stats = useMemo(() => {
    let sea = 0;
    let port = 0;
    let warehouse = 0;
    for (const c of containers) {
      const stage = CONTAINER_STATUS_STAGE[c.status];
      if (stage === "sea") sea++;
      else if (stage === "port") port++;
      else if (stage === "warehouse") warehouse++;
    }
    return { total: containers.length, sea, port, warehouse };
  }, [containers]);

  const sorted = useMemo(() => {
    function supplierOf(c: ContainerListRow): string {
      return c.container_suppliers[0]?.supplier_name ?? "";
    }
    function routeOf(c: ContainerListRow): string {
      return `${c.origin_port ?? ""} ${c.dest_port ?? ""}`.trim();
    }
    function val(c: ContainerListRow): string | number {
      switch (sortKey) {
        case "container_number":
          return c.container_number;
        case "customer_name":
          return c.customer_name ?? "";
        case "supplier":
          return supplierOf(c);
        case "route":
          return routeOf(c);
        case "status":
          return c.status;
        case "eta":
          return c.eta ? new Date(c.eta).getTime() : 0;
        default:
          return "";
      }
    }
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!creating) return;
    setSaving(true);
    setError(null);
    try {
      const container = await upsertContainer(sessionToken, creating);
      setCreating(null);
      await load();
      navigate(`/containers/${container.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה ביצירת המכולה");
    } finally {
      setSaving(false);
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
          <h1 className="page-title">מכולות</h1>
          {canCreate && (
            <button type="button" className="btn btn-sm" style={{ width: "auto" }} onClick={() => setCreating(EMPTY_FORM)}>
              + מכולה חדשה
            </button>
          )}
        </div>
        <p className="page-subtitle">מעקב, פרטי מכולה ועדכון סטטוס</p>

        {error && <div className="error-box">{error}</div>}

        <div className="stat-row">
          <div className="stat-tile">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">סה"כ</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{stats.sea}</span>
            <span className="stat-label">בים</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{stats.port}</span>
            <span className="stat-label">בנמל</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{stats.warehouse}</span>
            <span className="stat-label">במחסן</span>
          </div>
        </div>

        <div className="toolbar">
          <input
            className="input-inline"
            placeholder="חיפוש לפי מספר מכולה / לקוח / ספן / נמל..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="muted">טוען...</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortableHeader label="מספר מכולה" sortKey="container_number" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHeader label="לקוח" sortKey="customer_name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHeader label="ספק" sortKey="supplier" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHeader label="מסלול" sortKey="route" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHeader label="סטטוס" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHeader label="ETA" sortKey="eta" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/containers/${c.id}`)} style={{ cursor: "pointer" }}>
                    <td className="mono">{c.container_number}</td>
                    <td>{c.customer_name || "—"}</td>
                    <td>{c.container_suppliers[0]?.supplier_name || "—"}</td>
                    <td>
                      {c.origin_port || "—"} → {c.dest_port || "—"}
                    </td>
                    <td>
                      <span className={`pill pill-status-${c.status}`}>{CONTAINER_STATUS_LABEL[c.status]}</span>
                    </td>
                    <td>{c.eta ? new Date(c.eta).toLocaleDateString("he-IL") : "—"}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                      אין מכולות תואמות
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <Modal title="מכולה חדשה" onClose={() => setCreating(null)}>
          <form onSubmit={handleCreate}>
            <div className="field">
              <label>מספר מכולה</label>
              <input
                required
                className="mono"
                value={creating.container_number}
                onChange={(e) => setCreating({ ...creating, container_number: e.target.value.toUpperCase() })}
                placeholder="MSCU1234567"
              />
            </div>
            <div className="field">
              <label>לקוח</label>
              <input
                value={creating.customer_name ?? ""}
                onChange={(e) => setCreating({ ...creating, customer_name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>ספן (Carrier)</label>
              <input value={creating.carrier ?? ""} onChange={(e) => setCreating({ ...creating, carrier: e.target.value })} />
            </div>
            <div className="field">
              <label>אונייה</label>
              <input value={creating.vessel_name ?? ""} onChange={(e) => setCreating({ ...creating, vessel_name: e.target.value })} />
            </div>
            <div className="field">
              <label>נמל מוצא</label>
              <input value={creating.origin_port ?? ""} onChange={(e) => setCreating({ ...creating, origin_port: e.target.value })} />
            </div>
            <div className="field">
              <label>נמל יעד</label>
              <input value={creating.dest_port ?? ""} onChange={(e) => setCreating({ ...creating, dest_port: e.target.value })} />
            </div>
            <div className="field">
              <label>תאריך יציאה</label>
              <input
                type="date"
                value={creating.departure_date ?? ""}
                onChange={(e) => setCreating({ ...creating, departure_date: e.target.value })}
              />
            </div>
            <div className="field">
              <label>ETA</label>
              <input type="date" value={creating.eta ?? ""} onChange={(e) => setCreating({ ...creating, eta: e.target.value })} />
            </div>
            <div className="field">
              <label>שולח (Shipper)</label>
              <input value={creating.shipper_name ?? ""} onChange={(e) => setCreating({ ...creating, shipper_name: e.target.value })} />
            </div>
            <div className="field">
              <label>סטטוס</label>
              <select
                value={creating.status ?? "pending"}
                onChange={(e) => setCreating({ ...creating, status: e.target.value as ContainerStatus })}
              >
                {(Object.keys(CONTAINER_STATUS_LABEL) as ContainerStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {CONTAINER_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "יוצר..." : "יצירה"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
