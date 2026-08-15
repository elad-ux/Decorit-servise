import { useRef, useState } from "react";
import Modal from "../../components/Modal";
import { ApiError } from "../../lib/api";
import { parseCsv } from "../../lib/csv";
import { ENCODING_OPTIONS, decodeCp862, decodeCsvBytes, encodingDisplayName } from "../../lib/csvEncoding";
import {
  type ImportPreviewResult,
  confirmContactImport,
  downloadContactImportTemplate,
  previewContactImport,
} from "../../lib/broadcast";

export default function ContactsImportModal({
  sessionToken,
  existingCategoryNames,
  onClose,
  onImported,
}: {
  sessionToken: string;
  existingCategoryNames: string[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [result, setResult] = useState<{ added: number; updated: number } | null>(null);
  const [detectedEncoding, setDetectedEncoding] = useState<string | null>(null);
  const [encodingConfident, setEncodingConfident] = useState(true);
  const [rawBuffer, setRawBuffer] = useState<ArrayBuffer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      setRawBuffer(buffer);
      const decoded = decodeCsvBytes(buffer);
      setDetectedEncoding(decoded.encoding);
      setEncodingConfident(decoded.confident);
      const rows = parseCsv(decoded.text);
      if (rows.length === 0) {
        setError("הקובץ ריק או שלא זוהו בו שורות");
        return;
      }
      setPreview(await previewContactImport(sessionToken, rows));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בקריאת הקובץ");
    } finally {
      setBusy(false);
    }
  }

  async function retryWithEncoding(encoding: string) {
    if (!rawBuffer) return;
    setBusy(true);
    setError(null);
    try {
      const text =
        encoding === "cp862" ? decodeCp862(new Uint8Array(rawBuffer)) : new TextDecoder(encoding, { fatal: false }).decode(rawBuffer);
      setDetectedEncoding(encoding);
      setEncodingConfident(true);
      const rows = parseCsv(text);
      setPreview(await previewContactImport(sessionToken, rows));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בקריאת הקובץ בקידוד זה");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await confirmContactImport(sessionToken, preview.rows, fileName ?? undefined);
      setResult(res);
      setPreview(null);
      onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בייבוא");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFileName(null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  return (
    <Modal title="ייבוא אנשי קשר מקובץ" onClose={onClose} wide>
      <p className="muted">
        קובץ CSV עם העמודות: שם העסק, איש קשר, טלפון, עיר, קטגוריה (אפשר כמה קטגוריות באותה שורה, מופרדות בפסיק או
        נקודה-פסיק). איש קשר עם מספר טלפון שכבר קיים במערכת יעודכן; מספר חדש יתווסף כאיש קשר חדש. קטגוריה שעדיין לא
        קיימת תיווצר אוטומטית.
      </p>
      <button type="button" className="btn-link" onClick={downloadContactImportTemplate}>
        הורדת קובץ לדוגמה
      </button>

      {error && <div className="error-box">{error}</div>}

      {!preview && !result && (
        <div className="field" style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="btn btn-sm"
            style={{ width: "auto" }}
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {busy ? "בודק..." : "בחירת קובץ CSV"}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => void handleFile(e)} />
        </div>
      )}

      {preview && (
        <>
          <div className="callout-info" style={{ marginTop: "1rem" }}>
            <strong>{preview.total} שורות בקובץ.</strong> {preview.new_count} אנשי קשר חדשים, {preview.update_count}{" "}
            עדכון לקיימים{preview.error_count > 0 && `, ${preview.error_count} שורות עם שגיאה (לא ייובאו)`}.
          </div>

          {detectedEncoding && (
            <div className={encodingConfident ? "callout-info" : "error-box"} style={{ marginTop: "0.75rem" }}>
              <strong>קידוד שזוהה: {encodingDisplayName(detectedEncoding)}</strong>
              {!encodingConfident && (
                <p style={{ margin: "0.35rem 0 0" }}>
                  לא הצלחתי לזהות את הקידוד בביטחון מלא — בדוק למטה שהעברית בעמודות ("עסק", "טלפון" וכו') נראית תקינה.
                  אם לא, נסה קידוד אחר:
                </p>
              )}
              {!encodingConfident && (
                <div className="chip-row" style={{ marginTop: "0.5rem" }}>
                  {ENCODING_OPTIONS.map((enc) => (
                    <button
                      key={enc}
                      type="button"
                      className={`chip${enc === detectedEncoding ? " chip-selected" : ""}`}
                      onClick={() => void retryWithEncoding(enc)}
                    >
                      {encodingDisplayName(enc)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {preview.errors.length > 0 && (
            <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
              <table>
                <thead>
                  <tr>
                    <th>שורה</th>
                    <th>סיבה</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.errors.map((e) => (
                    <tr key={e.row}>
                      <td>{e.row}</td>
                      <td>{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.rows.length > 0 && (
            <div className="table-wrap" style={{ marginTop: "0.75rem", maxHeight: "260px", overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>עסק</th>
                    <th>טלפון</th>
                    <th>עיר</th>
                    <th>קטגוריות</th>
                    <th>סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row}>
                      <td>{r.business_name}</td>
                      <td className="mono">{r.phone}</td>
                      <td>{r.city || "—"}</td>
                      <td>
                        {r.categories.length === 0
                          ? "—"
                          : r.categories.map((cat, i) => (
                              <span key={cat}>
                                {i > 0 && ", "}
                                {existingCategoryNames.includes(cat) ? (
                                  cat
                                ) : (
                                  <span title="קטגוריה חדשה — תיווצר אוטומטית">{cat} ✨</span>
                                )}
                              </span>
                            ))}
                      </td>
                      <td>
                        <span className={`pill ${r._status === "new" ? "pill-ok" : "pill-neutral"}`}>
                          {r._status === "new" ? "חדש" : "עדכון"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="toolbar" style={{ marginTop: "1rem" }}>
            <button type="button" className="btn-link" onClick={reset}>
              בחירת קובץ אחר
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ width: "auto" }}
              disabled={busy || preview.rows.length === 0}
              onClick={() => void handleConfirm()}
            >
              {busy ? "מייבא..." : `ייבוא ${preview.rows.length} אנשי קשר`}
            </button>
          </div>
        </>
      )}

      {result && (
        <>
          <div className="notice-box" style={{ marginTop: "1rem" }}>
            הייבוא הושלם: {result.added} אנשי קשר חדשים, {result.updated} עודכנו.
          </div>
          <div className="toolbar" style={{ marginTop: "1rem" }}>
            <button type="button" className="btn-link" onClick={reset}>
              ייבוא קובץ נוסף
            </button>
            <button type="button" className="btn btn-sm" style={{ width: "auto" }} onClick={onClose}>
              סגירה
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
