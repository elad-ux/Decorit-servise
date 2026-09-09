import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import Modal from "../components/Modal";
import TopBar from "../components/TopBar";
import {
  CONTAINER_STATUS_LABEL,
  type Container,
  type ContainerDocument,
  type ContainerFieldUpdates,
  type ContainerStatus,
  type DocumentType,
  type StatusHistoryEntry,
  DOCUMENT_TYPE_LABEL,
  deleteContainer,
  getContainerDetail,
  getContainerDocumentUrl,
  updateContainerField,
  uploadContainerDocument,
} from "../lib/containers";

const SOURCE_LABEL: Record<string, string> = {
  api: "אוטומטי",
  manual: "עדכון ידני",
  whatsapp: "וואטסאפ",
  photo: "סריקת תמונה",
};

function fmtDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("he-IL") : "—";
}

function fmtDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString("he-IL") : "—";
}

/** Fields the general "עריכת פרטים" form covers — everything editable EXCEPT
 * status, warehouse dates, and ownership, which each get their own dedicated
 * (and differently role-gated) control below. */
function containerToEditableFields(c: Container): ContainerFieldUpdates {
  return {
    container_size: c.container_size ?? "",
    bl_number: c.bl_number ?? "",
    seal_number: c.seal_number ?? "",
    carrier: c.carrier ?? "",
    vessel_name: c.vessel_name ?? "",
    voyage_number: c.voyage_number ?? "",
    customer_name: c.customer_name ?? "",
    cargo_description: c.cargo_description ?? "",
    packages: c.packages,
    gross_weight_kg: c.gross_weight_kg,
    volume_cbm: c.volume_cbm,
    freight_terms: c.freight_terms ?? "",
    origin_port: c.origin_port ?? "",
    dest_port: c.dest_port ?? "",
    place_of_receipt: c.place_of_receipt ?? "",
    place_of_delivery: c.place_of_delivery ?? "",
    departure_date: c.departure_date ?? "",
    eta: c.eta ?? "",
    actual_arrival: c.actual_arrival ?? "",
    shipper_name: c.shipper_name ?? "",
    shipper_address: c.shipper_address ?? "",
    consignee_name: c.consignee_name ?? "",
    consignee_address: c.consignee_address ?? "",
    notify_party: c.notify_party ?? "",
    notes: c.notes ?? "",
  };
}

export default function ContainerDetail() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const sessionToken = session?.sessionToken ?? "";
  const navigate = useNavigate();
  const canEditAll = session?.role === "admin" || session?.role === "manager";
  const canEditWarehouseDates = canEditAll || session?.role === "warehouse";

  const [container, setContainer] = useState<Container | null>(null);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([]);
  const [documents, setDocuments] = useState<ContainerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingFields, setEditingFields] = useState<ContainerFieldUpdates | null>(null);
  const [savingFields, setSavingFields] = useState(false);

  const [warehouseArrival, setWarehouseArrival] = useState("");
  const [warehouseDeparture, setWarehouseDeparture] = useState("");
  const [savingWarehouse, setSavingWarehouse] = useState(false);

  const [statusDraft, setStatusDraft] = useState<ContainerStatus | "">("");
  const [statusLocation, setStatusLocation] = useState("");
  const [statusDetails, setStatusDetails] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const [confirmingOwnership, setConfirmingOwnership] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [uploadDocType, setUploadDocType] = useState<DocumentType>("other");
  const [uploading, setUploading] = useState(false);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getContainerDetail(sessionToken, id);
      if (!res.container) {
        setNotFound(true);
        return;
      }
      setContainer(res.container);
      setStatusHistory(res.status_history);
      setDocuments(res.documents);
      setWarehouseArrival(res.container.warehouse_arrival_date?.slice(0, 16) ?? "");
      setWarehouseDeparture(res.container.warehouse_departure_date?.slice(0, 16) ?? "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בטעינת המכולה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSaveFields(e: React.FormEvent) {
    e.preventDefault();
    if (!container || !editingFields) return;
    setSavingFields(true);
    setError(null);
    try {
      await updateContainerField(sessionToken, container.id, editingFields);
      setEditingFields(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בשמירה");
    } finally {
      setSavingFields(false);
    }
  }

  async function handleSaveWarehouseDates() {
    if (!container) return;
    setSavingWarehouse(true);
    setError(null);
    try {
      await updateContainerField(sessionToken, container.id, {
        warehouse_arrival_date: warehouseArrival || null,
        warehouse_departure_date: warehouseDeparture || null,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בעדכון תאריכי מחסן");
    } finally {
      setSavingWarehouse(false);
    }
  }

  async function handleConfirmOwnership() {
    if (!container || !session) return;
    setConfirmingOwnership(true);
    setError(null);
    try {
      await updateContainerField(sessionToken, container.id, {
        ownership_confirmed_by: `${session.name} | ${session.phone}`,
        ownership_confirmed_at: new Date().toISOString(),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה באישור הבעלות");
    } finally {
      setConfirmingOwnership(false);
    }
  }

  async function handleUpdateStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!container || !statusDraft) return;
    setSavingStatus(true);
    setError(null);
    try {
      await updateContainerField(
        sessionToken,
        container.id,
        { status: statusDraft },
        { location: statusLocation.trim() || undefined, details: statusDetails.trim() || undefined },
      );
      setStatusDraft("");
      setStatusLocation("");
      setStatusDetails("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בעדכון סטטוס");
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleDelete() {
    if (!container) return;
    if (!confirm(`למחוק את מכולה ${container.container_number}? הפעולה אינה הפיכה — היסטוריית סטטוסים ומסמכים לא יימחקו אוטומטית.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteContainer(sessionToken, container.id);
      navigate("/containers");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה במחיקה");
      setDeleting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !container) return;
    setUploading(true);
    setError(null);
    try {
      await uploadContainerDocument(sessionToken, container.container_number, file, uploadDocType);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בהעלאת המסמך");
    } finally {
      setUploading(false);
    }
  }

  async function handleOpenDocument(doc: ContainerDocument) {
    setOpeningDocId(doc.id);
    setError(null);
    try {
      const url = await getContainerDocumentUrl(sessionToken, doc.file_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בפתיחת המסמך");
    } finally {
      setOpeningDocId(null);
    }
  }

  if (notFound) {
    return (
      <>
        <TopBar>
          <Link to="/containers" className="btn-link">
            ↩ חזרה לרשימת מכולות
          </Link>
        </TopBar>
        <div className="broadcast-page">
          <p className="muted">המכולה לא נמצאה.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar>
        <span className="whoami-name">{session?.name}</span>
        <Link to="/containers" className="btn-link">
          ↩ חזרה לרשימת מכולות
        </Link>
      </TopBar>
      <div className="broadcast-page">
        {error && <div className="error-box">{error}</div>}

        {loading || !container ? (
          <p className="muted">טוען...</p>
        ) : (
          <>
            <div className="broadcast-header">
              <h1 className="page-title mono">{container.container_number}</h1>
              <span className={`pill pill-status-${container.status}`}>{CONTAINER_STATUS_LABEL[container.status]}</span>
              {canEditAll && (
                <button type="button" className="btn-link" onClick={() => setEditingFields(containerToEditableFields(container))}>
                  עריכת פרטים
                </button>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "0.75rem",
                marginBottom: "1.25rem",
              }}
            >
              <div className="field">
                <label>לקוח</label>
                <p>{container.customer_name || "—"}</p>
              </div>
              <div className="field">
                <label>ספן (Carrier)</label>
                <p>{container.carrier || "—"}</p>
              </div>
              <div className="field">
                <label>אונייה / שיוט</label>
                <p>
                  {container.vessel_name || "—"} {container.voyage_number ? `/ ${container.voyage_number}` : ""}
                </p>
              </div>
              <div className="field">
                <label>גודל מכולה</label>
                <p>{container.container_size || "—"}</p>
              </div>
              <div className="field">
                <label>נמל מוצא → יעד</label>
                <p>
                  {container.origin_port || "—"} → {container.dest_port || "—"}
                </p>
              </div>
              <div className="field">
                <label>תאריך יציאה</label>
                <p>{fmtDate(container.departure_date)}</p>
              </div>
              <div className="field">
                <label>ETA</label>
                <p>{fmtDate(container.eta)}</p>
              </div>
              <div className="field">
                <label>הגעה בפועל</label>
                <p>{fmtDate(container.actual_arrival)}</p>
              </div>
              <div className="field">
                <label>שטר מטען (B/L)</label>
                <p className="mono">{container.bl_number || "—"}</p>
              </div>
              <div className="field">
                <label>מספר סיל (Seal)</label>
                <p className="mono">{container.seal_number || "—"}</p>
              </div>
              <div className="field">
                <label>משקל ברוטו</label>
                <p>{container.gross_weight_kg != null ? `${container.gross_weight_kg} ק"ג` : "—"}</p>
              </div>
              <div className="field">
                <label>חבילות</label>
                <p>{container.packages ?? "—"}</p>
              </div>
            </div>

            {(container.shipper_name || container.consignee_name || container.notify_party) && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: "0.75rem",
                  marginBottom: "1.25rem",
                }}
              >
                <div className="field">
                  <label>שולח (Shipper)</label>
                  <p>{container.shipper_name || "—"}</p>
                  {container.shipper_address && <p className="muted">{container.shipper_address}</p>}
                </div>
                <div className="field">
                  <label>נשגר אליו (Consignee)</label>
                  <p>{container.consignee_name || "—"}</p>
                  {container.consignee_address && <p className="muted">{container.consignee_address}</p>}
                </div>
                <div className="field">
                  <label>Notify Party</label>
                  <p>{container.notify_party || "—"}</p>
                </div>
              </div>
            )}

            {container.notes && (
              <div className="field" style={{ marginBottom: "1.25rem" }}>
                <label>הערות</label>
                <p>{container.notes}</p>
              </div>
            )}

            <div className="field" style={{ marginBottom: "1.25rem" }}>
              <label>אישור בעלות</label>
              {container.ownership_confirmed_by ? (
                <p className="muted">
                  אושרה ע"י {container.ownership_confirmed_by} · {fmtDateTime(container.ownership_confirmed_at)}
                </p>
              ) : canEditAll ? (
                <button type="button" className="btn btn-sm" style={{ width: "auto" }} disabled={confirmingOwnership} onClick={() => void handleConfirmOwnership()}>
                  {confirmingOwnership ? "מאשר..." : "אישור בעלות על המטען"}
                </button>
              ) : (
                <p className="muted">טרם אושרה</p>
              )}
            </div>

            {container.bl_pl_items_match !== null && (
              <div className="field" style={{ marginBottom: "1.25rem" }}>
                <label>הצלבת B/L ↔ Packing List</label>
                <p>
                  {container.bl_pl_items_match ? (
                    <span className="pill pill-ok">תואם</span>
                  ) : (
                    <span className="pill pill-danger">אי-התאמה</span>
                  )}{" "}
                  {container.bl_total_items != null && container.pl_total_items != null && (
                    <span className="muted">
                      ({container.bl_total_items} פריטים ב-B/L, {container.pl_total_items} ברשימת אריזה)
                    </span>
                  )}
                </p>
              </div>
            )}

            {canEditWarehouseDates && (
              <div className="field" style={{ marginBottom: "1.25rem" }}>
                <label>תאריכי מחסן</label>
                <div className="button-row">
                  <div>
                    <label className="muted" style={{ fontSize: ".8rem" }}>
                      הגעה למחסן
                    </label>
                    <input type="datetime-local" value={warehouseArrival} onChange={(e) => setWarehouseArrival(e.target.value)} />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: ".8rem" }}>
                      יציאה מהמחסן
                    </label>
                    <input type="datetime-local" value={warehouseDeparture} onChange={(e) => setWarehouseDeparture(e.target.value)} />
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ width: "auto", alignSelf: "flex-end" }}
                    disabled={savingWarehouse}
                    onClick={() => void handleSaveWarehouseDates()}
                  >
                    {savingWarehouse ? "שומר..." : "שמירה"}
                  </button>
                </div>
                {(container.warehouse_arrival_by || container.warehouse_departure_by) && (
                  <p className="muted" style={{ fontSize: ".8rem", marginTop: "0.35rem" }}>
                    {container.warehouse_arrival_by && `הגעה עודכנה ע"י ${container.warehouse_arrival_by}`}
                    {container.warehouse_arrival_by && container.warehouse_departure_by && " · "}
                    {container.warehouse_departure_by && `יציאה עודכנה ע"י ${container.warehouse_departure_by}`}
                  </p>
                )}
              </div>
            )}

            {container.container_suppliers.length > 0 && (
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>ספקים</label>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ספק</th>
                        <th>מספר פריטים</th>
                        <th>נוסף בתאריך</th>
                      </tr>
                    </thead>
                    <tbody>
                      {container.container_suppliers.map((s) => (
                        <tr key={s.id}>
                          <td>{s.supplier_name}</td>
                          <td>{s.items_count ?? "—"}</td>
                          <td>{fmtDate(s.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>מסמכים</label>
              {canEditAll && (
                <div className="toolbar" style={{ marginBottom: "0.5rem" }}>
                  <select className="input-inline" value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value as DocumentType)}>
                    {(Object.keys(DOCUMENT_TYPE_LABEL) as DocumentType[]).map((t) => (
                      <option key={t} value={t}>
                        {DOCUMENT_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-sm" style={{ width: "auto" }} disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                    {uploading ? "מעלה..." : "העלאת מסמך"}
                  </button>
                  <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={(e) => void handleFileChange(e)} />
                </div>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>סוג</th>
                      <th>קובץ</th>
                      <th>הועלה ע"י</th>
                      <th>תאריך</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((d) => (
                      <tr key={d.id}>
                        <td>{DOCUMENT_TYPE_LABEL[d.doc_type] ?? d.doc_type}</td>
                        <td>{d.original_name || "—"}</td>
                        <td>{d.uploaded_by || "—"}</td>
                        <td>{fmtDateTime(d.uploaded_at)}</td>
                        <td>
                          <button type="button" className="btn-link" disabled={openingDocId === d.id} onClick={() => void handleOpenDocument(d)}>
                            {openingDocId === d.id ? "פותח..." : "פתיחה"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {documents.length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted" style={{ textAlign: "center", padding: "1.5rem" }}>
                          אין מסמכים עדיין
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {canEditAll && (
              <div className="field" style={{ marginBottom: "1.25rem" }}>
                <label>עדכון סטטוס</label>
                <form onSubmit={handleUpdateStatus} className="button-row">
                  <select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value as ContainerStatus)}>
                    <option value="">בחירת סטטוס חדש...</option>
                    {(Object.keys(CONTAINER_STATUS_LABEL) as ContainerStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {CONTAINER_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <input placeholder="מיקום (אופציונלי)" value={statusLocation} onChange={(e) => setStatusLocation(e.target.value)} />
                  <input placeholder="פירוט (אופציונלי)" value={statusDetails} onChange={(e) => setStatusDetails(e.target.value)} />
                  <button className="btn btn-sm" style={{ width: "auto" }} type="submit" disabled={savingStatus || !statusDraft}>
                    {savingStatus ? "מעדכן..." : "עדכון"}
                  </button>
                </form>
              </div>
            )}

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>היסטוריית סטטוסים</label>
              {statusHistory.length === 0 ? (
                <p className="muted">אין עדיין היסטוריה</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>סטטוס</th>
                        <th>מיקום</th>
                        <th>פירוט</th>
                        <th>מקור</th>
                        <th>עודכן ע"י</th>
                        <th>תאריך</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statusHistory.map((h) => (
                        <tr key={h.id}>
                          <td>
                            <span className={`pill pill-status-${h.status}`}>{CONTAINER_STATUS_LABEL[h.status] ?? h.status}</span>
                          </td>
                          <td>{h.location || "—"}</td>
                          <td>{h.details || "—"}</td>
                          <td className="muted">{SOURCE_LABEL[h.source] ?? h.source}</td>
                          <td>{h.updated_by || "—"}</td>
                          <td>{fmtDateTime(h.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {canEditAll && (
              <button type="button" className="btn-link btn-link-danger" disabled={deleting} onClick={() => void handleDelete()}>
                {deleting ? "מוחק..." : "מחיקת מכולה"}
              </button>
            )}
          </>
        )}
      </div>

      {editingFields && (
        <Modal title="עריכת פרטי מכולה" onClose={() => setEditingFields(null)} wide>
          <form onSubmit={handleSaveFields}>
            <div className="field">
              <label>גודל מכולה</label>
              <input value={editingFields.container_size ?? ""} onChange={(e) => setEditingFields({ ...editingFields, container_size: e.target.value })} placeholder="20GP / 40GP / 40HC" />
            </div>
            <div className="field">
              <label>שטר מטען (B/L)</label>
              <input className="mono" value={editingFields.bl_number ?? ""} onChange={(e) => setEditingFields({ ...editingFields, bl_number: e.target.value })} />
            </div>
            <div className="field">
              <label>מספר סיל (Seal)</label>
              <input className="mono" value={editingFields.seal_number ?? ""} onChange={(e) => setEditingFields({ ...editingFields, seal_number: e.target.value })} />
            </div>
            <div className="field">
              <label>ספן (Carrier)</label>
              <input value={editingFields.carrier ?? ""} onChange={(e) => setEditingFields({ ...editingFields, carrier: e.target.value })} />
            </div>
            <div className="field">
              <label>אונייה</label>
              <input value={editingFields.vessel_name ?? ""} onChange={(e) => setEditingFields({ ...editingFields, vessel_name: e.target.value })} />
            </div>
            <div className="field">
              <label>מספר שיוט</label>
              <input value={editingFields.voyage_number ?? ""} onChange={(e) => setEditingFields({ ...editingFields, voyage_number: e.target.value })} />
            </div>
            <div className="field">
              <label>לקוח</label>
              <input value={editingFields.customer_name ?? ""} onChange={(e) => setEditingFields({ ...editingFields, customer_name: e.target.value })} />
            </div>
            <div className="field">
              <label>תיאור המטען</label>
              <input value={editingFields.cargo_description ?? ""} onChange={(e) => setEditingFields({ ...editingFields, cargo_description: e.target.value })} />
            </div>
            <div className="field">
              <label>חבילות</label>
              <input
                type="number"
                value={editingFields.packages ?? ""}
                onChange={(e) => setEditingFields({ ...editingFields, packages: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>משקל ברוטו (ק"ג)</label>
              <input
                type="number"
                value={editingFields.gross_weight_kg ?? ""}
                onChange={(e) => setEditingFields({ ...editingFields, gross_weight_kg: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>נפח (CBM)</label>
              <input
                type="number"
                value={editingFields.volume_cbm ?? ""}
                onChange={(e) => setEditingFields({ ...editingFields, volume_cbm: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>תנאי הובלה (Freight Terms)</label>
              <input value={editingFields.freight_terms ?? ""} onChange={(e) => setEditingFields({ ...editingFields, freight_terms: e.target.value })} />
            </div>
            <div className="field">
              <label>נמל מוצא</label>
              <input value={editingFields.origin_port ?? ""} onChange={(e) => setEditingFields({ ...editingFields, origin_port: e.target.value })} />
            </div>
            <div className="field">
              <label>נמל יעד</label>
              <input value={editingFields.dest_port ?? ""} onChange={(e) => setEditingFields({ ...editingFields, dest_port: e.target.value })} />
            </div>
            <div className="field">
              <label>מקום קבלה (Place of Receipt)</label>
              <input value={editingFields.place_of_receipt ?? ""} onChange={(e) => setEditingFields({ ...editingFields, place_of_receipt: e.target.value })} />
            </div>
            <div className="field">
              <label>מקום מסירה (Place of Delivery)</label>
              <input value={editingFields.place_of_delivery ?? ""} onChange={(e) => setEditingFields({ ...editingFields, place_of_delivery: e.target.value })} />
            </div>
            <div className="field">
              <label>תאריך יציאה</label>
              <input type="date" value={editingFields.departure_date ?? ""} onChange={(e) => setEditingFields({ ...editingFields, departure_date: e.target.value })} />
            </div>
            <div className="field">
              <label>ETA</label>
              <input type="date" value={editingFields.eta ?? ""} onChange={(e) => setEditingFields({ ...editingFields, eta: e.target.value })} />
            </div>
            <div className="field">
              <label>הגעה בפועל</label>
              <input type="date" value={editingFields.actual_arrival ?? ""} onChange={(e) => setEditingFields({ ...editingFields, actual_arrival: e.target.value })} />
            </div>
            <div className="field">
              <label>שולח (Shipper)</label>
              <input value={editingFields.shipper_name ?? ""} onChange={(e) => setEditingFields({ ...editingFields, shipper_name: e.target.value })} />
            </div>
            <div className="field">
              <label>כתובת השולח</label>
              <input value={editingFields.shipper_address ?? ""} onChange={(e) => setEditingFields({ ...editingFields, shipper_address: e.target.value })} />
            </div>
            <div className="field">
              <label>נשגר אליו (Consignee)</label>
              <input value={editingFields.consignee_name ?? ""} onChange={(e) => setEditingFields({ ...editingFields, consignee_name: e.target.value })} />
            </div>
            <div className="field">
              <label>כתובת הנשגר אליו</label>
              <input value={editingFields.consignee_address ?? ""} onChange={(e) => setEditingFields({ ...editingFields, consignee_address: e.target.value })} />
            </div>
            <div className="field">
              <label>Notify Party</label>
              <input value={editingFields.notify_party ?? ""} onChange={(e) => setEditingFields({ ...editingFields, notify_party: e.target.value })} />
            </div>
            <div className="field">
              <label>הערות</label>
              <textarea rows={3} value={editingFields.notes ?? ""} onChange={(e) => setEditingFields({ ...editingFields, notes: e.target.value })} />
            </div>
            <button className="btn" type="submit" disabled={savingFields}>
              {savingFields ? "שומר..." : "שמירה"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
