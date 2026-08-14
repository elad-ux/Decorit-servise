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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setUploading(true);
    setError(null);
    try {
      const { url } = await uploadBroadcastMedia(sessionToken, file);
      setEditing({ ...editing, header_sample_media_url: url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בהעלאת הקובץ");
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
        <div className="card-grid">
          {templates.map((t) => (
            <div key={t.id} className="template-card">
              <div className="template-card-head">
                <h3>{t.name}</h3>
                <span className={`pill pill-status-${t.status}`}>{STATUS_LABEL[t.status]}</span>
              </div>
              <p className="template-body">{t.body_text}</p>
              {t.footer_text && <p className="template-footer">{t.footer_text}</p>}
              {t.meta_template_name && <p className="muted mono">Meta: {t.meta_template_name}</p>}
              {t.status === "rejected" && t.rejection_reason && (
                <p className="muted" style={{ color: "var(--danger-500)" }}>
                  סיבת דחייה: {t.rejection_reason}
                </p>
              )}
              <div className="template-actions">
                {(t.status === "draft" || t.status === "rejected") && (
                  <>
                    <button type="button" className="btn-link" disabled={busyId === t.id} onClick={() => void handleSubmitToMeta(t)}>
                      {busyId === t.id ? "שולח..." : "שליחה לאישור Meta"}
                    </button>
                    {" · "}
                  </>
                )}
                {t.status === "pending" && (
                  <>
                    <button type="button" className="btn-link" disabled={busyId === t.id} onClick={() => void handleRefreshStatus(t)}>
                      {busyId === t.id ? "בודק..." : "בדיקת סטטוס"}
                    </button>
                    {" · "}
                  </>
                )}
                {t.status !== "draft" && (
                  <>
                    <button type="button" className="btn-link" disabled={busyId === t.id} onClick={() => void handleForceSync(t)}>
                      {busyId === t.id ? "בודק..." : "סנכרון כפוי מול Meta"}
                    </button>
                    {" · "}
                  </>
                )}
                {t.status !== "pending" && (
                  <>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() =>
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
                        })
                      }
                    >
                      עריכה
                    </button>
                    {" · "}
                  </>
                )}
                <button type="button" className="btn-link btn-link-danger" onClick={() => void handleDelete(t)}>
                  מחיקה
                </button>
              </div>
            </div>
          ))}
          {templates.length === 0 && <p className="muted">אין תבניות עדיין</p>}
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
