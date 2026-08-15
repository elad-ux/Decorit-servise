import { useState, useEffect, useRef, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import Modal from "../../components/Modal";
import {
  type BroadcastTemplate,
  type TemplateButton,
  deleteTemplate,
  forceSyncTemplate,
  listTemplates,
  refreshTemplateStatus,
  submitTemplateToMeta,
  uploadBroadcastMedia,
  upsertTemplate,
} from "../../lib/broadcast";
import { META_MEDIA_LIMITS, compressImageIfNeeded } from "../../lib/mediaLimits";

type HeaderType = "none" | "text" | "image" | "video" | "document";

type FormState = {
  id?: string;
  name: string;
  category: string;
  language: string;
  header_type: HeaderType;
  header_text: string;
  header_sample_media_url: string;
  body_text: string;
  footer_text: string;
  has_optout_line: boolean;
  buttons: TemplateButton[];
  /** UI-only — not sent to the server, just powers the live preview. */
  variable_examples: Record<string, string>;
};

const EMPTY_FORM: FormState = {
  name: "",
  category: "marketing",
  language: "he",
  header_type: "none",
  header_text: "",
  header_sample_media_url: "",
  body_text: "",
  footer_text: "",
  has_optout_line: false,
  buttons: [],
  variable_examples: {},
};

const STATUS_LABEL: Record<BroadcastTemplate["status"], string> = {
  draft: "טיוטה",
  pending: "ממתין לאישור מ-Meta",
  approved: "מאושר",
  rejected: "נדחה",
  deleted_from_meta: "נמחקה מ-Meta",
};

const HEADER_TYPE_LABEL: Record<HeaderType, string> = {
  none: "ללא כותרת",
  text: "טקסט",
  image: "תמונה",
  video: "וידאו",
  document: "מסמך",
};

const BUTTON_TYPE_LABEL: Record<TemplateButton["type"], string> = {
  quick_reply: "תשובה מהירה",
  url: "קישור",
  phone: "חיוג",
};

/**
 * Meta's actual template categories. AUTHENTICATION isn't offered here —
 * it requires a fixed OTP-style structure Meta auto-generates, not the
 * free-form body/buttons this editor builds.
 */
const TEMPLATE_CATEGORY_LABEL: Record<string, string> = {
  marketing: "MARKETING — שיווקי",
  utility: "UTILITY — עדכון שירות",
};

const OPT_OUT_TEXT = 'השב "הסר" להסרה מרשימת התפוצות';

function extractVariables(text: string): string[] {
  const matches = [...text.matchAll(/\{\{\s*([a-zA-Z_א-ת]+)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(matches)];
}

// Replaces {{var}} with the real example value the user typed, falling back
// to a generic placeholder only if they haven't filled it in yet — this is
// what actually lets you "understand what's in the template" instead of
// staring at a wall of {{שם_עסק}} tokens.
function substituteVars(text: string, examples: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z_א-ת]+)\s*\}\}/g, (_match, name: string) => {
    const val = examples[name];
    return val && val.trim() ? val : `[${name}]`;
  });
}

function templateToPreviewForm(t: BroadcastTemplate): FormState {
  return {
    id: t.id,
    name: t.name,
    category: t.category ?? "marketing",
    language: t.language,
    header_type: t.header_type,
    header_text: t.header_text ?? "",
    header_sample_media_url: t.header_sample_media_url ?? "",
    body_text: t.body_text,
    footer_text: t.footer_text ?? "",
    has_optout_line: t.has_optout_line,
    buttons: t.buttons ?? [],
    variable_examples: {},
  };
}

function buttonLimitWarning(buttons: TemplateButton[]): string | null {
  const urlCount = buttons.filter((b) => b.type === "url").length;
  const phoneCount = buttons.filter((b) => b.type === "phone").length;
  if (urlCount > 2) return "מותרים עד 2 כפתורי קישור לפי מגבלות Meta.";
  if (phoneCount > 1) return "מותר כפתור חיוג אחד בלבד לפי מגבלות Meta.";
  if (buttons.length > 10) return 'מותרים עד 10 כפתורים בסה"כ.';
  return null;
}

function TemplatePreview({ form }: { form: FormState }) {
  const footer = form.has_optout_line
    ? form.footer_text
      ? `${form.footer_text} • ${OPT_OUT_TEXT}`
      : OPT_OUT_TEXT
    : form.footer_text;

  const fileName = (url: string) => {
    try {
      const clean = url.split("?")[0];
      return decodeURIComponent(clean.substring(clean.lastIndexOf("/") + 1)) || "מסמך";
    } catch {
      return "מסמך";
    }
  };

  return (
    <div className="wa-preview">
      <div className="wa-bubble">
        {form.header_type === "text" && form.header_text && <div className="wa-header-text">{form.header_text}</div>}

        {form.header_type === "image" && (
          <div className="wa-header-media">
            {form.header_sample_media_url ? (
              <img src={form.header_sample_media_url} alt="" />
            ) : (
              <span>🖼 תמונה (יש להעלות קובץ)</span>
            )}
          </div>
        )}

        {form.header_type === "video" && (
          <div className="wa-header-media wa-header-media-video">
            {form.header_sample_media_url ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={form.header_sample_media_url} controls preload="metadata" />
            ) : (
              <span>🎬 וידאו (יש להעלות קובץ)</span>
            )}
          </div>
        )}

        {form.header_type === "document" && (
          <div className="wa-header-doc">
            {form.header_sample_media_url ? (
              <a href={form.header_sample_media_url} target="_blank" rel="noreferrer" className="wa-doc-link">
                📄 <span className="wa-doc-name">{fileName(form.header_sample_media_url)}</span>
              </a>
            ) : (
              <span>📄 מסמך (יש להעלות קובץ)</span>
            )}
          </div>
        )}

        <div className="wa-body">{substituteVars(form.body_text, form.variable_examples) || "(גוף ההודעה יופיע כאן)"}</div>
        {footer && <div className="wa-footer">{footer}</div>}
      </div>
      {form.buttons.length > 0 && (
        <div className="wa-buttons">
          {form.buttons.map((b, i) => (
            <div key={i} className="wa-button">
              {b.type === "url" && "🔗 "}
              {b.type === "phone" && "📞 "}
              {b.text || "(כיתוב כפתור)"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BroadcastTemplates() {
  const { session } = useAuth();
  const sessionToken = session?.sessionToken ?? "";
  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  function openEdit(t: BroadcastTemplate) {
    setEditing({
      id: t.id,
      name: t.name,
      category: t.category && t.category in TEMPLATE_CATEGORY_LABEL ? t.category : "marketing",
      language: t.language,
      header_type: t.header_type,
      header_text: t.header_text ?? "",
      header_sample_media_url: t.header_sample_media_url ?? "",
      body_text: t.body_text,
      footer_text: t.footer_text ?? "",
      has_optout_line: t.has_optout_line,
      buttons: t.buttons ?? [],
      variable_examples: {},
    });
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await listTemplates(sessionToken));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בטעינת התבניות");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await upsertTemplate(sessionToken, {
        id: editing.id,
        name: editing.name,
        category: editing.category || undefined,
        language: editing.language,
        header_type: editing.header_type,
        header_text: editing.header_type === "text" ? editing.header_text || undefined : undefined,
        header_sample_media_url:
          editing.header_type === "image" || editing.header_type === "video" || editing.header_type === "document"
            ? editing.header_sample_media_url || undefined
            : undefined,
        body_text: editing.body_text,
        footer_text: editing.footer_text || undefined,
        has_optout_line: editing.has_optout_line,
        buttons: editing.buttons,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: BroadcastTemplate) {
    if (!confirm(`למחוק את התבנית "${t.name}"?`)) return;
    try {
      await deleteTemplate(sessionToken, t.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה במחיקה");
    }
  }

  async function handleSubmitToMeta(t: BroadcastTemplate) {
    if (!confirm(`לשלוח את התבנית "${t.name}" לאישור Meta? לאחר השליחה לא ניתן לערוך אותה עד לקבלת תשובה.`)) return;
    setBusyId(t.id);
    setError(null);
    try {
      await submitTemplateToMeta(sessionToken, t.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בשליחה ל-Meta");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRefreshStatus(t: BroadcastTemplate) {
    setBusyId(t.id);
    setError(null);
    try {
      await refreshTemplateStatus(sessionToken, t.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בבדיקת סטטוס מול Meta");
    } finally {
      setBusyId(null);
    }
  }

  async function handleForceSync(t: BroadcastTemplate) {
    setBusyId(t.id);
    setError(null);
    try {
      await forceSyncTemplate(sessionToken, t.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בסנכרון מול Meta");
    } finally {
      setBusyId(null);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editing) return;
    setError(null);

    const mediaType = editing.header_type;
    if (mediaType !== "image" && mediaType !== "video" && mediaType !== "document") return;
    const limit = META_MEDIA_LIMITS[mediaType];

    let toUpload: File = file;
    if (mediaType === "image" && file.size > limit.bytes) {
      toUpload = await compressImageIfNeeded(file, limit.bytes);
    }

    if (toUpload.size > limit.bytes) {
      setError(
        `הקובץ גדול מדי (${(toUpload.size / 1024 / 1024).toFixed(1)}MB) — Meta מגבילה ${HEADER_TYPE_LABEL[mediaType]} עד ${limit.label}.`,
      );
      return;
    }

    // Show the picked file immediately, before the upload even starts —
    // don't make the person wait to confirm they chose the right file.
    const localPreviewUrl = URL.createObjectURL(toUpload);
    setEditing((prev) => (prev ? { ...prev, header_sample_media_url: localPreviewUrl } : prev));

    setUploading(true);
    try {
      const { url } = await uploadBroadcastMedia(sessionToken, toUpload);
      setEditing((prev) => (prev ? { ...prev, header_sample_media_url: url } : prev));
      URL.revokeObjectURL(localPreviewUrl);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "שגיאה בהעלאת הקובץ — התצוגה המקדימה עדיין מציגה את הקובץ שנבחר, אפשר לנסות שוב.",
      );
    } finally {
      setUploading(false);
    }
  }

  function addButton() {
    if (!editing) return;
    setEditing({ ...editing, buttons: [...editing.buttons, { type: "quick_reply", text: "", value: "" }] });
  }

  function updateButton(i: number, patch: Partial<TemplateButton>) {
    if (!editing) return;
    const buttons = editing.buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b));
    setEditing({ ...editing, buttons });
  }

  function removeButton(i: number) {
    if (!editing) return;
    setEditing({ ...editing, buttons: editing.buttons.filter((_, idx) => idx !== i) });
  }

  return (
    <div>
      {error && <div className="error-box">{error}</div>}

      <div className="toolbar">
        <button type="button" className="btn btn-sm" style={{ width: "auto" }} onClick={() => setEditing(EMPTY_FORM)}>
          + תבנית חדשה
        </button>
      </div>

      {loading ? (
        <p className="muted">טוען...</p>
      ) : (
        <div className="templates-layout">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>שם</th>
                  <th>סטטוס</th>
                  <th>Meta</th>
                  <th>עודכן</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr
                    key={t.id}
                    className={`template-row${t.id === selectedId ? " template-row-selected" : ""}`}
                    onClick={() => setSelectedId(t.id)}
                  >
                    <td>{t.name}</td>
                    <td>
                      <span className={`pill pill-status-${t.status}`}>{STATUS_LABEL[t.status]}</span>
                    </td>
                    <td className="mono">{t.meta_template_name || "—"}</td>
                    <td>{new Date(t.updated_at).toLocaleString("he-IL")}</td>
                  </tr>
                ))}
                {templates.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                      אין תבניות עדיין
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selected && (
            <div className="template-side-panel">
              <div className="template-side-panel-head">
                <h3>{selected.name}</h3>
                <div className="template-side-panel-badges">
                  <span className={`pill pill-status-${selected.status}`}>{STATUS_LABEL[selected.status]}</span>
                  <button type="button" className="modal-close" onClick={() => setSelectedId(null)} aria-label="סגור">
                    ×
                  </button>
                </div>
              </div>
              {selected.meta_template_name && <p className="muted mono">Meta: {selected.meta_template_name}</p>}
              {selected.status === "rejected" && selected.rejection_reason && (
                <p className="muted" style={{ color: "var(--danger-500)" }}>
                  סיבת דחייה: {selected.rejection_reason}
                </p>
              )}
              {selected.status === "deleted_from_meta" && (
                <p className="muted">
                  התבנית נמחקה ב-Meta. היא נשמרת כאן רק כי יש לה היסטוריית שליחות אמיתית — לא ניתן לערוך, לשלוח מחדש
                  או לסנכרן אותה.
                </p>
              )}

              <TemplatePreview form={templateToPreviewForm(selected)} />

              <div className="template-actions">
                {(selected.status === "draft" || selected.status === "rejected") && (
                  <>
                    <button
                      type="button"
                      className="btn-link"
                      disabled={busyId === selected.id}
                      onClick={() => void handleSubmitToMeta(selected)}
                    >
                      {busyId === selected.id ? "שולח..." : "שליחה לאישור Meta"}
                    </button>
                    {" · "}
                  </>
                )}
                {selected.status === "pending" && (
                  <>
                    <button
                      type="button"
                      className="btn-link"
                      disabled={busyId === selected.id}
                      onClick={() => void handleRefreshStatus(selected)}
                    >
                      {busyId === selected.id ? "בודק..." : "בדיקת סטטוס"}
                    </button>
                    {" · "}
                  </>
                )}
                {selected.status !== "draft" && selected.status !== "deleted_from_meta" && (
                  <>
                    <button
                      type="button"
                      className="btn-link"
                      disabled={busyId === selected.id}
                      onClick={() => void handleForceSync(selected)}
                    >
                      {busyId === selected.id ? "בודק..." : "סנכרון כפוי מול Meta"}
                    </button>
                    {" · "}
                  </>
                )}
                {selected.status !== "pending" && selected.status !== "deleted_from_meta" && (
                  <>
                    <button type="button" className="btn-link" onClick={() => openEdit(selected)}>
                      עריכה
                    </button>
                    {" · "}
                  </>
                )}
                <button type="button" className="btn-link btn-link-danger" onClick={() => void handleDelete(selected)}>
                  מחיקה
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? "עריכת תבנית" : "תבנית חדשה"} onClose={() => setEditing(null)} wide>
          <div className="template-editor">
            <form onSubmit={handleSave}>
              <div className="field">
                <label>שם התבנית</label>
                <input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="field">
                <label>קטגוריית התבנית (לפי Meta)</label>
                <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                  {Object.entries(TEMPLATE_CATEGORY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>כותרת (Header)</label>
                <select
                  value={editing.header_type}
                  onChange={(e) => setEditing({ ...editing, header_type: e.target.value as HeaderType })}
                >
                  {(Object.keys(HEADER_TYPE_LABEL) as HeaderType[]).map((ht) => (
                    <option key={ht} value={ht}>
                      {HEADER_TYPE_LABEL[ht]}
                    </option>
                  ))}
                </select>
              </div>
              {editing.header_type === "text" && (
                <div className="field">
                  <label>טקסט הכותרת</label>
                  <input value={editing.header_text} onChange={(e) => setEditing({ ...editing, header_text: e.target.value })} />
                </div>
              )}
              {(editing.header_type === "image" || editing.header_type === "video" || editing.header_type === "document") && (
                <div className="field">
                  <label>קובץ לדוגמה (יועלה ל-Meta לצורך אישור התבנית)</label>
                  <div className="toolbar" style={{ marginBottom: "0.4rem" }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ width: "auto" }}
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? "מעלה..." : "בחירת קובץ"}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={editing.header_type === "image" ? "image/*" : editing.header_type === "video" ? "video/*" : undefined}
                      style={{ display: "none" }}
                      onChange={(e) => void handleFileChange(e)}
                    />
                    {editing.header_sample_media_url && <span className="muted mono">הועלה ✓</span>}
                  </div>
                  <input
                    className="mono"
                    value={editing.header_sample_media_url}
                    onChange={(e) => setEditing({ ...editing, header_sample_media_url: e.target.value })}
                    placeholder="או הדביקו כתובת URL ישירות"
                  />
                </div>
              )}

              <div className="field">
                <label>גוף ההודעה</label>
                <textarea
                  required
                  rows={4}
                  value={editing.body_text}
                  onChange={(e) => setEditing({ ...editing, body_text: e.target.value })}
                />
                <p className="muted" style={{ marginTop: "0.25rem" }}>
                  להוספת משתנה: {"{{"}שם_עסק{"}}"} וכדומה (עברית/אנגלית, קו תחתון בלבד).
                </p>
              </div>
              {extractVariables(editing.body_text).length > 0 && (
                <div className="field">
                  <label>ערכי דוגמה למשתנים (לתצוגה מקדימה בלבד)</label>
                  {extractVariables(editing.body_text).map((v) => (
                    <div key={v} className="button-row">
                      <span className="mono" style={{ minWidth: "6rem" }}>
                        {"{{" + v + "}}"}
                      </span>
                      <input
                        value={editing.variable_examples[v] ?? ""}
                        onChange={(e) =>
                          setEditing({ ...editing, variable_examples: { ...editing.variable_examples, [v]: e.target.value } })
                        }
                        placeholder={`ערך לדוגמה עבור ${v}`}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="field">
                <label>שורת תחתית (footer, אופציונלי)</label>
                <input value={editing.footer_text} onChange={(e) => setEditing({ ...editing, footer_text: e.target.value })} />
              </div>
              <div className="field">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editing.has_optout_line}
                    onChange={(e) => setEditing({ ...editing, has_optout_line: e.target.checked })}
                  />
                  הוספת שורת הסרה מרשימת תפוצה (נדרש לפי מדיניות שיווק ב-WhatsApp)
                </label>
              </div>

              <div className="field">
                <label>כפתורים (אופציונלי)</label>
                {editing.buttons.map((b, i) => (
                  <div key={i} className="button-row">
                    <select value={b.type} onChange={(e) => updateButton(i, { type: e.target.value as TemplateButton["type"] })}>
                      {(Object.keys(BUTTON_TYPE_LABEL) as TemplateButton["type"][]).map((bt) => (
                        <option key={bt} value={bt}>
                          {BUTTON_TYPE_LABEL[bt]}
                        </option>
                      ))}
                    </select>
                    <input placeholder="כיתוב" value={b.text} onChange={(e) => updateButton(i, { text: e.target.value })} />
                    {b.type !== "quick_reply" && (
                      <input
                        placeholder={b.type === "url" ? "https://..." : "מספר טלפון"}
                        value={b.value}
                        onChange={(e) => updateButton(i, { value: e.target.value })}
                      />
                    )}
                    <button type="button" className="btn-link btn-link-danger" onClick={() => removeButton(i)}>
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" className="btn-link" onClick={addButton}>
                  + הוספת כפתור
                </button>
                {buttonLimitWarning(editing.buttons) && (
                  <p className="muted" style={{ color: "var(--danger-500)" }}>
                    {buttonLimitWarning(editing.buttons)}
                  </p>
                )}
              </div>

              <button className="btn" type="submit" disabled={saving}>
                {saving ? "שומר..." : "שמירה"}
              </button>
            </form>

            <div>
              <label className="preview-label">תצוגה מקדימה</label>
              <TemplatePreview form={editing} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
