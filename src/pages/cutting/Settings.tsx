import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import Modal from "../../components/Modal";
import { useCuttingPermissions } from "../../components/CuttingLayout";
import {
  type CuttingFabric,
  type CuttingFabricColor,
  addColor,
  addFabric,
  getSettings,
  listFabrics,
  setSetting,
  updateColor,
  updateFabric,
  updateStock,
} from "../../lib/cutting";

type FabricForm = { id?: string; name: string; active: boolean };
type ColorForm = { id?: string; fabricId: string; color_name: string; in_stock: boolean };

export default function CuttingSettings() {
  const { session } = useAuth();
  const sessionToken = session?.sessionToken ?? "";
  const { canManageCatalog, canManageSettings } = useCuttingPermissions();

  const [fabrics, setFabrics] = useState<CuttingFabric[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editingFabric, setEditingFabric] = useState<FabricForm | null>(null);
  const [editingColor, setEditingColor] = useState<ColorForm | null>(null);
  const [savingModal, setSavingModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [archiveDays, setArchiveDays] = useState("");
  const [savingArchive, setSavingArchive] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);

  async function loadFabrics() {
    setLoading(true);
    setError(null);
    try {
      setFabrics(await listFabrics(sessionToken, showInactive));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בטעינת קטלוג הבדים");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFabrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  useEffect(() => {
    if (!canManageSettings) return;
    getSettings(sessionToken, "archive_after_days")
      .then((rows) => setArchiveDays(rows[0]?.value ?? ""))
      .catch(() => {
        // non-fatal — the field just starts empty
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageSettings]);

  async function handleToggleStock(color: CuttingFabricColor) {
    setBusyId(color.id);
    setError(null);
    try {
      await updateStock(sessionToken, color.id, !color.in_stock);
      await loadFabrics();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בעדכון מלאי");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleFabricActive(fabric: CuttingFabric) {
    setBusyId(fabric.id);
    setError(null);
    try {
      await updateFabric(sessionToken, fabric.id, { active: !fabric.active });
      await loadFabrics();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בעדכון בד");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveFabric(e: React.FormEvent) {
    e.preventDefault();
    if (!editingFabric || !editingFabric.name.trim()) return;
    setSavingModal(true);
    setModalError(null);
    try {
      if (editingFabric.id) {
        await updateFabric(sessionToken, editingFabric.id, { name: editingFabric.name.trim() });
      } else {
        await addFabric(sessionToken, editingFabric.name.trim());
      }
      setEditingFabric(null);
      await loadFabrics();
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : "שגיאה בשמירה");
    } finally {
      setSavingModal(false);
    }
  }

  async function handleSaveColor(e: React.FormEvent) {
    e.preventDefault();
    if (!editingColor || !editingColor.color_name.trim()) return;
    setSavingModal(true);
    setModalError(null);
    try {
      if (editingColor.id) {
        await updateColor(sessionToken, editingColor.id, { color_name: editingColor.color_name.trim() });
      } else {
        await addColor(sessionToken, editingColor.fabricId, editingColor.color_name.trim());
      }
      setEditingColor(null);
      await loadFabrics();
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : "שגיאה בשמירה");
    } finally {
      setSavingModal(false);
    }
  }

  async function handleSaveArchiveDays(e: React.FormEvent) {
    e.preventDefault();
    const days = Number(archiveDays);
    if (!days || days <= 0) {
      setSettingsError("יש להזין מספר ימים תקין");
      return;
    }
    setSavingArchive(true);
    setSettingsError(null);
    setSettingsSaved(false);
    try {
      await setSetting(sessionToken, "archive_after_days", String(days), "כמה ימים אחרי completed_at משימה עוברת אוטומטית לארכיון");
      setSettingsSaved(true);
    } catch (err) {
      setSettingsError(err instanceof ApiError ? err.message : "שגיאה בשמירת ההגדרה");
    } finally {
      setSavingArchive(false);
    }
  }

  return (
    <>
      <div className="broadcast-header">
        <h2 className="page-subtitle" style={{ margin: 0 }}>
          קטלוג בדים וצבעים
        </h2>
        {canManageCatalog && (
          <button
            type="button"
            className="btn btn-sm"
            style={{ width: "auto" }}
            onClick={() => setEditingFabric({ name: "", active: true })}
          >
            + בד חדש
          </button>
        )}
      </div>

      <div className="chip-row" style={{ margin: "0.5rem 0 1rem" }}>
        <button type="button" className={`chip${showInactive ? " chip-selected" : ""}`} onClick={() => setShowInactive((v) => !v)}>
          הצג בדים לא פעילים
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <p className="muted">טוען...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>בד</th>
                <th>צבעים</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fabrics.map((f) => (
                <tr key={f.id}>
                  <td style={{ verticalAlign: "top" }}>
                    <div>{f.name}</div>
                    {canManageCatalog && (
                      <div style={{ marginTop: "0.35rem" }}>
                        <button
                          type="button"
                          className={`pill ${f.active ? "pill-ok" : "pill-off"}`}
                          disabled={busyId === f.id}
                          onClick={() => void handleToggleFabricActive(f)}
                        >
                          {f.active ? "פעיל" : "לא פעיל"}
                        </button>
                        <button type="button" className="btn-link" onClick={() => setEditingFabric({ id: f.id, name: f.name, active: f.active })}>
                          עריכה
                        </button>
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="chip-row">
                      {f.colors.map((c) => (
                        <span key={c.id} className="chip chip-static" style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
                          {c.color_name}
                          {canManageCatalog && (
                            <button
                              type="button"
                              className={`pill ${c.in_stock ? "pill-ok" : "pill-danger"}`}
                              style={{ marginRight: "0.3rem" }}
                              disabled={busyId === c.id}
                              onClick={() => void handleToggleStock(c)}
                            >
                              {c.in_stock ? "במלאי" : "אין במלאי"}
                            </button>
                          )}
                        </span>
                      ))}
                      {f.colors.length === 0 && <span className="muted">אין צבעים עדיין</span>}
                    </div>
                    {canManageCatalog && (
                      <button
                        type="button"
                        className="btn-link"
                        style={{ marginTop: "0.35rem" }}
                        onClick={() => setEditingColor({ fabricId: f.id, color_name: "", in_stock: true })}
                      >
                        + צבע
                      </button>
                    )}
                  </td>
                  <td></td>
                </tr>
              ))}
              {fabrics.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                    אין בדים בקטלוג עדיין
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {canManageSettings && (
        <>
          <h2 className="page-subtitle">ארכוב אוטומטי</h2>
          <form onSubmit={handleSaveArchiveDays} className="form-row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ maxWidth: 220 }}>
              <label>ימים עד ארכוב אוטומטי של משימה שהושלמה</label>
              <input
                type="number"
                min={1}
                value={archiveDays}
                onChange={(e) => {
                  setArchiveDays(e.target.value);
                  setSettingsSaved(false);
                }}
              />
            </div>
            <button className="btn btn-sm" style={{ width: "auto" }} type="submit" disabled={savingArchive}>
              {savingArchive ? "שומר..." : "שמירה"}
            </button>
          </form>
          {settingsSaved && <p className="muted">נשמר.</p>}
          {settingsError && <div className="error-box">{settingsError}</div>}
        </>
      )}

      {editingFabric && (
        <Modal title={editingFabric.id ? "עריכת בד" : "בד חדש"} onClose={() => setEditingFabric(null)}>
          <form onSubmit={handleSaveFabric}>
            {modalError && <div className="error-box">{modalError}</div>}
            <div className="field">
              <label>שם הבד</label>
              <input required value={editingFabric.name} onChange={(e) => setEditingFabric({ ...editingFabric, name: e.target.value })} />
            </div>
            <button className="btn" type="submit" disabled={savingModal}>
              {savingModal ? "שומר..." : "שמירה"}
            </button>
          </form>
        </Modal>
      )}

      {editingColor && (
        <Modal title={editingColor.id ? "עריכת צבע" : "צבע חדש"} onClose={() => setEditingColor(null)}>
          <form onSubmit={handleSaveColor}>
            {modalError && <div className="error-box">{modalError}</div>}
            <div className="field">
              <label>שם הצבע</label>
              <input required value={editingColor.color_name} onChange={(e) => setEditingColor({ ...editingColor, color_name: e.target.value })} />
            </div>
            <button className="btn" type="submit" disabled={savingModal}>
              {savingModal ? "שומר..." : "שמירה"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
