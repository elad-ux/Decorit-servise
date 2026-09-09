import { useRef, useState } from "react";
import Modal from "../../components/Modal";
import { ApiError } from "../../lib/api";
import { buildCsv, downloadCsv, parseCsv } from "../../lib/csv";
import { ENCODING_OPTIONS, decodeCp862, decodeCsvBytes, encodingDisplayName } from "../../lib/csvEncoding";
import { type CuttingFabric, addColor, addFabric, updateStock } from "../../lib/cutting";

const FABRIC_HEADERS = ["בד", "שם בד", "fabric"];
const COLOR_HEADERS = ["צבע", "color"];
const STOCK_HEADERS = ["במלאי", "in_stock", "מלאי"];
const OUT_OF_STOCK_VALUES = new Set(["לא", "0", "false", "no", "אין"]);

interface ParsedRow {
  row: number;
  fabricName: string;
  colorName: string | null;
  inStock: boolean;
}

interface ImportPreview {
  rows: ParsedRow[];
  errors: { row: number; reason: string }[];
  fabricNames: string[];
}

function pickField(record: Record<string, string>, candidates: string[]): string {
  for (const key of Object.keys(record)) {
    if (candidates.some((c) => key.trim() === c)) return record[key];
  }
  return "";
}

function buildPreview(csvRows: Record<string, string>[]): ImportPreview {
  const rows: ParsedRow[] = [];
  const errors: { row: number; reason: string }[] = [];
  csvRows.forEach((r, i) => {
    const rowNum = i + 2; // +1 for header, +1 for 1-indexing
    const fabricName = pickField(r, FABRIC_HEADERS).trim();
    if (!fabricName) {
      errors.push({ row: rowNum, reason: "חסר שם בד" });
      return;
    }
    const colorName = pickField(r, COLOR_HEADERS).trim();
    const stockRaw = pickField(r, STOCK_HEADERS).trim().toLowerCase();
    rows.push({
      row: rowNum,
      fabricName,
      colorName: colorName || null,
      inStock: !OUT_OF_STOCK_VALUES.has(stockRaw),
    });
  });
  const fabricNames = Array.from(new Set(rows.map((r) => r.fabricName)));
  return { rows, errors, fabricNames };
}

export default function FabricImportModal({
  sessionToken,
  existingFabrics,
  onClose,
  onImported,
}: {
  sessionToken: string;
  existingFabrics: CuttingFabric[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [detectedEncoding, setDetectedEncoding] = useState<string | null>(null);
  const [encodingConfident, setEncodingConfident] = useState(true);
  const [rawBuffer, setRawBuffer] = useState<ArrayBuffer | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ fabrics: number; colors: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingNames = new Set(existingFabrics.map((f) => f.name.trim().toLowerCase()));

  function loadRows(text: string) {
    const csvRows = parseCsv(text);
    if (csvRows.length === 0) {
      setError("הקובץ ריק או שלא זוהו בו שורות");
      setPreview(null);
      return;
    }
    setPreview(buildPreview(csvRows));
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      setRawBuffer(buffer);
      const decoded = decodeCsvBytes(buffer, ["בד", "צבע", "מלאי"]);
      setDetectedEncoding(decoded.encoding);
      setEncodingConfident(decoded.confident);
      loadRows(decoded.text);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בקריאת הקובץ");
    } finally {
      setBusy(false);
    }
  }

  function retryWithEncoding(encoding: string) {
    if (!rawBuffer) return;
    const text =
      encoding === "cp862" ? decodeCp862(new Uint8Array(rawBuffer)) : new TextDecoder(encoding, { fatal: false }).decode(rawBuffer);
    setDetectedEncoding(encoding);
    setEncodingConfident(true);
    loadRows(text);
  }

  async function handleConfirm() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const errors: string[] = [];
    let colorCount = 0;
    const fabricIdByName = new Map<string, string>();
    const total = preview.fabricNames.length + preview.rows.filter((r) => r.colorName).length;
    let done = 0;
    setProgress({ done, total });

    for (const name of preview.fabricNames) {
      try {
        const fabric = await addFabric(sessionToken, name);
        fabricIdByName.set(name, fabric.id);
      } catch (err) {
        errors.push(`בד "${name}": ${err instanceof ApiError ? err.message : "שגיאה"}`);
      }
      done++;
      setProgress({ done, total });
    }

    for (const r of preview.rows) {
      if (!r.colorName) continue;
      const fabricId = fabricIdByName.get(r.fabricName);
      if (!fabricId) {
        done++;
        setProgress({ done, total });
        continue; // fabric itself failed above — already reported
      }
      try {
        const color = await addColor(sessionToken, fabricId, r.colorName);
        if (!r.inStock && color.in_stock) {
          await updateStock(sessionToken, color.id, false);
        }
        colorCount++;
      } catch (err) {
        errors.push(`שורה ${r.row} (${r.fabricName} / ${r.colorName}): ${err instanceof ApiError ? err.message : "שגיאה"}`);
      }
      done++;
      setProgress({ done, total });
    }

    setResult({ fabrics: fabricIdByName.size, colors: colorCount, errors });
    setPreview(null);
    setProgress(null);
    setBusy(false);
    onImported();
  }

  function reset() {
    setPreview(null);
    setResult(null);
    setError(null);
    setProgress(null);
  }

  function downloadTemplate() {
    downloadCsv(
      "בדים-לדוגמה.csv",
      buildCsv(
        ["בד", "צבע", "במלאי"],
        [
          ["פשתן טבעי", "לבן", "כן"],
          ["פשתן טבעי", "בז׳", "לא"],
          ["כותנה משובחת", "כחול", "כן"],
        ],
      ),
    );
  }

  return (
    <Modal title="ייבוא בדים מקובץ" onClose={onClose} wide>
      <p className="muted">
        קובץ CSV עם העמודות: בד, צבע (אופציונלי), במלאי (אופציונלי — "כן"/"לא", ברירת מחדל כן). כל שורה היא צירוף
        בד+צבע אחד; בד עם כמה צבעים מופיע בכמה שורות. בד או צבע שכבר קיימים במערכת לא ישוכפלו — רק יעודכן להם סטטוס
        מלאי אם צריך.
      </p>
      <button type="button" className="btn-link" onClick={downloadTemplate}>
        הורדת קובץ לדוגמה
      </button>

      {error && <div className="error-box">{error}</div>}

      {!preview && !result && (
        <div className="field" style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="btn btn-sm btn-with-spinner"
            style={{ width: "auto" }}
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {busy && <span className="spinner" />}
            {busy ? "בודק..." : "בחירת קובץ CSV"}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => void handleFile(e)} />
        </div>
      )}

      {preview && (
        <>
          <div className="callout-info" style={{ marginTop: "1rem" }}>
            <strong>{preview.fabricNames.length} בדים</strong>, {preview.rows.filter((r) => r.colorName).length} צירופי
            צבע{preview.errors.length > 0 && `, ${preview.errors.length} שורות עם שגיאה (לא ייובאו)`}.
          </div>

          {detectedEncoding && (
            <div className={encodingConfident ? "callout-info" : "error-box"} style={{ marginTop: "0.75rem" }}>
              <strong>קידוד שזוהה: {encodingDisplayName(detectedEncoding)}</strong>
              {!encodingConfident && (
                <>
                  <p style={{ margin: "0.35rem 0 0" }}>
                    לא הצלחתי לזהות את הקידוד בביטחון מלא — בדוק למטה שהעברית נראית תקינה. אם לא, נסה קידוד אחר:
                  </p>
                  <div className="chip-row" style={{ marginTop: "0.5rem" }}>
                    {ENCODING_OPTIONS.map((enc) => (
                      <button
                        key={enc}
                        type="button"
                        className={`chip${enc === detectedEncoding ? " chip-selected" : ""}`}
                        onClick={() => retryWithEncoding(enc)}
                      >
                        {encodingDisplayName(enc)}
                      </button>
                    ))}
                  </div>
                </>
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
                    <th>בד</th>
                    <th>צבע</th>
                    <th>במלאי</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row}>
                      <td>
                        {existingNames.has(r.fabricName.trim().toLowerCase()) ? r.fabricName : <span title="בד חדש — ייווצר אוטומטית">{r.fabricName} ✨</span>}
                      </td>
                      <td>{r.colorName || "—"}</td>
                      <td>{r.colorName ? (r.inStock ? "כן" : "לא") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="toolbar" style={{ marginTop: "1rem" }}>
            <button type="button" className="btn-link" onClick={reset} disabled={busy}>
              בחירת קובץ אחר
            </button>
            <button
              type="button"
              className="btn btn-sm btn-with-spinner"
              style={{ width: "auto" }}
              disabled={busy || preview.rows.length === 0}
              onClick={() => void handleConfirm()}
            >
              {busy && <span className="spinner" />}
              {busy && progress ? `מייבא... ${progress.done}/${progress.total}` : `ייבוא ${preview.fabricNames.length} בדים`}
            </button>
          </div>
        </>
      )}

      {result && (
        <>
          <div className="notice-box" style={{ marginTop: "1rem" }}>
            הייבוא הושלם: {result.fabrics} בדים, {result.colors} צבעים.
            {result.errors.length > 0 && ` ${result.errors.length} שורות נכשלו.`}
          </div>
          {result.errors.length > 0 && (
            <ul className="muted" style={{ marginTop: "0.5rem" }}>
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
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
