import { useState, useEffect, useRef, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import Modal from "../../components/Modal";
import {
  type AiContentSuggestion,
  type BroadcastTemplate,
  type TemplateButton,
  type TemplateCarouselCard,
  archiveTemplate,
  deleteTemplate,
  forceSyncTemplate,
  listTemplates,
  refreshTemplateStatus,
  submitTemplateToMeta,
  suggestTemplateContent,
  unarchiveTemplate,
  uploadBroadcastMedia,
  upsertTemplate,
} from "../../lib/broadcast";
import { META_MEDIA_LIMITS, UPLOAD_TRANSPORT_SAFE_IMAGE_BYTES, compressImageIfNeeded } from "../../lib/mediaLimits";

type HeaderType = "none" | "text" | "image" | "video" | "document" | "carousel";

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
  carousel_cards: TemplateCarouselCard[];
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
  carousel_cards: [],
  variable_examples: {},
};

const EMPTY_CAROUSEL_CARD: TemplateCarouselCard = { header_type: "image", header_sample_media_url: "", body_text: "", buttons: [] };

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
  carousel: "קרוסלה (כמה כרטיסים)",
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
    carousel_cards: t.carousel_cards ?? [],
    variable_examples: {},
  };
}

function carouselWarning(cards: TemplateCarouselCard[]): string | null {
  if (cards.length === 0) return null;
  if (cards.length < 2) return "קרוסלה דורשת לפחות 2 כרטיסים.";
  if (cards.length > 10) return "קרוסלה תומכת בעד 10 כרטיסים.";
  if (cards.some((c) => !c.header_sample_media_url)) return "לכל כרטיס חייבת להיות תמונה/וידאו.";
  const headerTypes = new Set(cards.map((c) => c.header_type));
  if (headerTypes.size > 1) return "כל הכרטיסים חייבים להיות מאותו סוג מדיה (כולם תמונה או כולם וידאו).";
  const signatures = new Set(cards.map((c) => c.buttons.map((b) => b.type).join(",")));
  if (signatures.size > 1) return 'לכל הכרטיסים חייב להיות אותו מספר וסוג כפתורים, באותו סדר (לפי הגבלת Meta).';
  return null;
}

/**
 * "EYtemplate_" + current time (HHMMSS, no separators) + "_" + current date
 * (DDMMYYYY, no separators) — digits only after the prefix, so every new
 * template gets a unique, valid Meta template name without the user having
 * to think one up (WhatsApp template names must be simple slugs anyway).
 */
function generateTemplateName(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `EYtemplate_${hh}${mm}${ss}_${dd}${MM}${yyyy}`;
}

/** Short single-line preview of a template's body, for the table row (no line breaks, capped length). */
function previewText(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max).trim() + "…" : flat;
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
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [form.header_sample_media_url]);

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
            {form.header_sample_media_url && !imgFailed ? (
              <img src={form.header_sample_media_url} alt="" onError={() => setImgFailed(true)} />
            ) : (
              <span>🖼 תמונה ({imgFailed ? "הקישור לתמונה לא תקין — יש להעלות קובץ מחדש" : "יש להעלות קובץ"})</span>
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
      {form.header_type === "carousel" && form.carousel_cards.length > 0 && (
        <div className="wa-carousel">
          {form.carousel_cards.map((card, i) => (
            <div key={i} className="wa-carousel-card">
              <div className="wa-carousel-card-media">
                {card.header_sample_media_url ? (
                  card.header_type === "video" ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={card.header_sample_media_url} preload="metadata" />
                  ) : (
                    <img src={card.header_sample_media_url} alt="" />
                  )
                ) : (
                  <span>{card.header_type === "video" ? "🎬" : "🖼"}</span>
                )}
              </div>
              {card.body_text && <div className="wa-carousel-card-body">{substituteVars(card.body_text, form.variable_examples)}</div>}
              {card.buttons.length > 0 && (
                <div className="wa-carousel-card-buttons">
                  {card.buttons.map((b, bi) => (
                    <div key={bi} className="wa-carousel-card-button">
                      {b.type === "url" && "🔗 "}
                      {b.type === "phone" && "📞 "}
                      {b.text || "(כיתוב כפתור)"}
                    </div>
                  ))}
                </div>
              )}
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
  const [uploadingCardIndex, setUploadingCardIndex] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AiContentSuggestion | null>(null);
  const [showArchived, setShowArchived] = useState(false);
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
      carousel_cards: t.carousel_cards ?? [],
      variable_examples: {},
    });
  }

  async function load() {
    setLoading(true);
    setError(null);
    setSelectedId(null);
    try {
      setTemplates(await listTemplates(sessionToken, showArchived));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בטעינת התבניות");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    // A blob: URL is the local, in-tab-only preview set the instant a file
    // is picked (before the real upload finishes) — it's meaningless outside
    // this browser tab and must never be persisted. Belt-and-suspenders on
    // top of disabling the Save button while uploading, in case of a
    // race (e.g. Enter-key submit firing between the two state updates).
    if (editing.header_sample_media_url.startsWith("blob:") || editing.carousel_cards.some((c) => c.header_sample_media_url.startsWith("blob:"))) {
      setError("הקובץ עדיין מועלה לשרת — יש להמתין לסיום ההעלאה לפני השמירה.");
      return;
    }
    if (editing.header_type === "carousel") {
      const warning = carouselWarning(editing.carousel_cards);
      if (warning) {
        setError(warning);
        return;
      }
    }
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
        footer_text: editing.header_type === "carousel" ? undefined : editing.footer_text || undefined,
        has_optout_line: editing.header_type === "carousel" ? false : editing.has_optout_line,
        buttons: editing.header_type === "carousel" ? [] : editing.buttons,
        carousel_cards: editing.header_type === "carousel" ? editing.carousel_cards : undefined,
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

  async function handleArchive(t: BroadcastTemplate) {
    setBusyId(t.id);
    setError(null);
    try {
      await archiveTemplate(sessionToken, t.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בהעברה לארכיון");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnarchive(t: BroadcastTemplate) {
    setBusyId(t.id);
    setError(null);
    try {
      await unarchiveTemplate(sessionToken, t.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בהוצאה מהארכיון");
    } finally {
      setBusyId(null);
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
    if (mediaType === "image") {
      // Compress against whichever is smaller: Meta's own limit, or our
      // upload transport's own safe budget — a file well under Meta's 5MB
      // can still be large enough, once base64-inflated for the trip to
      // our webhook, to get silently rejected before Meta ever sees it.
      const compressionTarget = Math.min(limit.bytes, UPLOAD_TRANSPORT_SAFE_IMAGE_BYTES);
      if (file.size > compressionTarget) {
        toUpload = await compressImageIfNeeded(file, compressionTarget);
      }
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

  async function handleAiSuggest() {
    if (!editing || !editing.body_text.trim()) return;
    setAiSuggesting(true);
    setError(null);
    try {
      const { suggestion } = await suggestTemplateContent(sessionToken, editing.body_text);
      setAiSuggestion(suggestion);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בקבלת הצעת AI");
    } finally {
      setAiSuggesting(false);
    }
  }

  function applyAiSuggestion() {
    if (!editing || !aiSuggestion) return;
    setEditing({
      ...editing,
      body_text: aiSuggestion.suggested_text ?? editing.body_text,
      category: aiSuggestion.category,
    });
    setAiSuggestion(null);
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

  function addCard() {
    if (!editing) return;
    if (editing.carousel_cards.length >= 10) return;
    setEditing({ ...editing, carousel_cards: [...editing.carousel_cards, { ...EMPTY_CAROUSEL_CARD, buttons: [] }] });
  }

  function updateCard(i: number, patch: Partial<TemplateCarouselCard>) {
    if (!editing) return;
    const cards = editing.carousel_cards.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    setEditing({ ...editing, carousel_cards: cards });
  }

  function removeCard(i: number) {
    if (!editing) return;
    setEditing({ ...editing, carousel_cards: editing.carousel_cards.filter((_, idx) => idx !== i) });
  }

  function addCardButton(cardIndex: number) {
    if (!editing) return;
    const card = editing.carousel_cards[cardIndex];
    if (!card || card.buttons.length >= 2) return;
    updateCard(cardIndex, { buttons: [...card.buttons, { type: "quick_reply", text: "", value: "" }] });
  }

  function updateCardButton(cardIndex: number, buttonIndex: number, patch: Partial<TemplateButton>) {
    if (!editing) return;
    const card = editing.carousel_cards[cardIndex];
    if (!card) return;
    const buttons = card.buttons.map((b, idx) => (idx === buttonIndex ? { ...b, ...patch } : b));
    updateCard(cardIndex, { buttons });
  }

  function removeCardButton(cardIndex: number, buttonIndex: number) {
    if (!editing) return;
    const card = editing.carousel_cards[cardIndex];
    if (!card) return;
    updateCard(cardIndex, { buttons: card.buttons.filter((_, idx) => idx !== buttonIndex) });
  }

  async function handleCardFileChange(cardIndex: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editing) return;
    setError(null);

    const limit = META_MEDIA_LIMITS.image;
    let toUpload: File = file;
    const compressionTarget = Math.min(limit.bytes, UPLOAD_TRANSPORT_SAFE_IMAGE_BYTES);
    if (file.size > compressionTarget) {
      toUpload = await compressImageIfNeeded(file, compressionTarget);
    }
    if (toUpload.size > limit.bytes) {
      setError(`הקובץ גדול מדי (${(toUpload.size / 1024 / 1024).toFixed(1)}MB) — Meta מגבילה תמונה עד ${limit.label}.`);
      return;
    }

    const localPreviewUrl = URL.createObjectURL(toUpload);
    updateCard(cardIndex, { header_sample_media_url: localPreviewUrl });

    setUploadingCardIndex(cardIndex);
    try {
      const { url } = await uploadBroadcastMedia(sessionToken, toUpload);
      updateCard(cardIndex, { header_sample_media_url: url });
      URL.revokeObjectURL(localPreviewUrl);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "שגיאה בהעלאת הקובץ — התצוגה המקדימה עדיין מציגה את הקובץ שנבחר, אפשר לנסות שוב.",
      );
    } finally {
      setUploadingCardIndex(null);
    }
  }

  return (
    <div>
      {error && <div className="error-box">{error}</div>}

      <div className="toolbar">
        <button
          type="button"
          className="btn btn-sm"
          style={{ width: "auto" }}
          onClick={() => setEditing({ ...EMPTY_FORM, name: generateTemplateName() })}
        >
          + תבנית חדשה
        </button>
      </div>

      <nav className="tabs">
        <button type="button" className={`tab${showArchived ? "" : " active"}`} onClick={() => setShowArchived(false)}>
          פעילות
        </button>
        <button type="button" className={`tab${showArchived ? " active" : ""}`} onClick={() => setShowArchived(true)}>
          ארכיון
        </button>
      </nav>

      {loading ? (
        <p className="muted">טוען...</p>
      ) : (
        <div className="templates-layout">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>תוכן ההודעה</th>
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
                    <td>{previewText(t.body_text)}</td>
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
                      {showArchived ? "אין תבניות בארכיון" : "אין תבניות עדיין"}
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
                {selected.archived ? (
                  <button
                    type="button"
                    className="btn-link"
                    disabled={busyId === selected.id}
                    onClick={() => void handleUnarchive(selected)}
                  >
                    {busyId === selected.id ? "מוציא..." : "הוצאה מארכיון"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-link"
                    disabled={busyId === selected.id}
                    onClick={() => void handleArchive(selected)}
                  >
                    {busyId === selected.id ? "מעביר..." : "העברה לארכיון"}
                  </button>
                )}
                {" · "}
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
                <input
                  required
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value.replace(/[^\x20-\x7E]/g, "") })}
                />
                <p className="muted" style={{ marginTop: "0.25rem" }}>
                  מותרים רק אותיות באנגלית, מספרים ותווים מיוחדים (לא עברית).
                </p>
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

              {editing.header_type === "carousel" && (
                <div className="field">
                  <label>כרטיסי הקרוסלה (2–10)</label>
                  {editing.carousel_cards.map((card, i) => (
                    <div key={i} style={{ border: "1px solid var(--linen)", borderRadius: 8, padding: "0.75rem", marginBottom: "0.6rem" }}>
                      <div className="button-row" style={{ marginBottom: "0.4rem" }}>
                        <strong>כרטיס {i + 1}</strong>
                        <button type="button" className="btn-link btn-link-danger" onClick={() => removeCard(i)}>
                          הסרת כרטיס
                        </button>
                      </div>

                      <select
                        value={card.header_type}
                        onChange={(e) => updateCard(i, { header_type: e.target.value as TemplateCarouselCard["header_type"] })}
                        style={{ marginBottom: "0.4rem" }}
                      >
                        <option value="image">תמונה</option>
                        <option value="video">וידאו</option>
                      </select>

                      <input
                        type="file"
                        accept={card.header_type === "image" ? "image/*" : "video/*"}
                        disabled={uploadingCardIndex === i}
                        onChange={(e) => void handleCardFileChange(i, e)}
                        style={{ marginBottom: "0.3rem" }}
                      />
                      {uploadingCardIndex === i && <p className="muted">מעלה...</p>}
                      <input
                        className="mono"
                        value={card.header_sample_media_url}
                        onChange={(e) => updateCard(i, { header_sample_media_url: e.target.value })}
                        placeholder="או הדביקו כתובת URL ישירות"
                        style={{ marginBottom: "0.4rem" }}
                      />

                      <textarea
                        rows={2}
                        value={card.body_text ?? ""}
                        onChange={(e) => updateCard(i, { body_text: e.target.value })}
                        placeholder="טקסט הכרטיס (אופציונלי — אם כרטיס אחד מקבל טקסט, כולם חייבים)"
                        style={{ marginBottom: "0.4rem" }}
                      />

                      {card.buttons.map((b, bi) => (
                        <div key={bi} className="button-row">
                          <select value={b.type} onChange={(e) => updateCardButton(i, bi, { type: e.target.value as TemplateButton["type"] })}>
                            {(Object.keys(BUTTON_TYPE_LABEL) as TemplateButton["type"][]).map((bt) => (
                              <option key={bt} value={bt}>
                                {BUTTON_TYPE_LABEL[bt]}
                              </option>
                            ))}
                          </select>
                          <input placeholder="כיתוב" value={b.text} onChange={(e) => updateCardButton(i, bi, { text: e.target.value })} />
                          {b.type !== "quick_reply" && (
                            <input
                              placeholder={b.type === "url" ? "https://..." : "מספר טלפון"}
                              value={b.value}
                              onChange={(e) => updateCardButton(i, bi, { value: e.target.value })}
                            />
                          )}
                          <button type="button" className="btn-link btn-link-danger" onClick={() => removeCardButton(i, bi)}>
                            ✕
                          </button>
                        </div>
                      ))}
                      {card.buttons.length < 2 && (
                        <button type="button" className="btn-link" onClick={() => addCardButton(i)}>
                          + הוספת כפתור לכרטיס (עד 2)
                        </button>
                      )}
                    </div>
                  ))}
                  {editing.carousel_cards.length < 10 && (
                    <button type="button" className="btn-link" onClick={addCard}>
                      + הוספת כרטיס
                    </button>
                  )}
                  {carouselWarning(editing.carousel_cards) && (
                    <p className="muted" style={{ color: "var(--danger-500)" }}>
                      {carouselWarning(editing.carousel_cards)}
                    </p>
                  )}
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
                <button
                  type="button"
                  className="btn-link"
                  disabled={aiSuggesting || !editing.body_text.trim()}
                  onClick={() => void handleAiSuggest()}
                >
                  {aiSuggesting ? "חושב..." : "✨ עזרה בניסוח AI"}
                </button>
                {aiSuggestion && (
                  <div
                    className="ai-suggestion-box"
                    style={{ border: "1px solid var(--linen)", borderRadius: 8, padding: "0.75rem", marginTop: "0.5rem" }}
                  >
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      הצעת AI — קטגוריה: {aiSuggestion.category === "marketing" ? "MARKETING (שיווקי)" : "UTILITY (שירות)"}{" "}
                      ({aiSuggestion.confidence === "high" ? "ודאות גבוהה" : aiSuggestion.confidence === "medium" ? "ודאות בינונית" : "ודאות נמוכה"})
                    </p>
                    <p className="muted" style={{ fontSize: ".85rem", margin: "0.25rem 0" }}>
                      {aiSuggestion.reasoning}
                    </p>
                    {aiSuggestion.suggested_text && (
                      <p style={{ background: "var(--sand)", padding: "0.5rem", borderRadius: 6, margin: "0.5rem 0" }}>
                        {aiSuggestion.suggested_text}
                      </p>
                    )}
                    <div className="button-row">
                      <button type="button" className="btn btn-sm" style={{ width: "auto" }} onClick={applyAiSuggestion}>
                        החלפה בתוכן ובקטגוריה שהוצעו
                      </button>
                      <button type="button" className="btn-link" onClick={() => setAiSuggestion(null)}>
                        התעלמות
                      </button>
                    </div>
                  </div>
                )}
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
              {editing.header_type !== "carousel" && (
                <>
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
                </>
              )}

              {editing.header_type !== "carousel" && (
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
              )}

              <button className="btn" type="submit" disabled={saving || uploading || uploadingCardIndex !== null}>
                {saving ? "שומר..." : uploading || uploadingCardIndex !== null ? "ממתין לסיום ההעלאה..." : "שמירה"}
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
