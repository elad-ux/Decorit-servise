import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import {
  type BroadcastBatch,
  type BroadcastCategory,
  type BroadcastTemplate,
  cancelBatch,
  countTarget,
  createBatch,
  listBatches,
  listCategories,
  listDistinctCities,
  listSendTemplates,
  uploadBroadcastMedia,
} from "../../lib/broadcast";
import { META_MEDIA_LIMITS, UPLOAD_TRANSPORT_SAFE_IMAGE_BYTES, compressImageIfNeeded } from "../../lib/mediaLimits";

const CANCELLABLE_BATCH_STATUSES = new Set(["sending", "scheduled"]);

const MEDIA_HEADER_TYPES = ["image", "video", "document"] as const;

const MEDIA_TYPE_LABEL: Record<(typeof MEDIA_HEADER_TYPES)[number], string> = {
  image: "תמונה",
  video: "וידאו",
  document: "מסמך",
};

const BATCH_STATUS_LABEL: Record<string, string> = {
  scheduled: "מתוזמן",
  sending: "בשליחה",
  completed: "הושלם",
  cancelled: "בוטל",
  created: "נוצר",
};

const BATCHES_PAGE_SIZE = 5;

type BatchSortKey = "status" | "target_count" | "scheduled_for" | "created_at";

function BatchSortableHeader({
  label,
  sortKey: key,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: BatchSortKey;
  activeKey: BatchSortKey;
  dir: "asc" | "desc";
  onSort: (key: BatchSortKey) => void;
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

export default function BroadcastSend() {
  const { session } = useAuth();
  const sessionToken = session?.sessionToken ?? "";

  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [categories, setCategories] = useState<BroadcastCategory[]>([]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [batches, setBatches] = useState<BroadcastBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [templateId, setTemplateId] = useState("");
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [scheduledFor, setScheduledFor] = useState("");
  const [campaignMediaUrl, setCampaignMediaUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [targetCount, setTargetCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [batchSortKey, setBatchSortKey] = useState<BatchSortKey>("created_at");
  const [batchSortDir, setBatchSortDir] = useState<"asc" | "desc">("desc");
  const [batchPage, setBatchPage] = useState(1);

  const readyTemplates = templates.filter((t) => t.status === "approved" && !!t.meta_template_name);
  const selectedTemplate = readyTemplates.find((t) => t.id === templateId);
  const needsMedia = selectedTemplate ? (MEDIA_HEADER_TYPES as readonly string[]).includes(selectedTemplate.header_type) : false;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [t, c, cities, b] = await Promise.all([
        listSendTemplates(sessionToken),
        listCategories(sessionToken),
        listDistinctCities(sessionToken),
        listBatches(sessionToken),
      ]);
      setTemplates(t);
      setCategories(c);
      setAvailableCities(cities.slice().sort((a, b2) => a.localeCompare(b2, "he")));
      setBatches(b);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCity(name: string) {
    setSelectedCities((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
    setTargetCount(null);
  }

  function toggleCategory(name: string) {
    setSelectedCategories((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
    setTargetCount(null);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);

    const mediaType = selectedTemplate?.header_type;
    if (mediaType !== "image" && mediaType !== "video" && mediaType !== "document") return;
    const limit = META_MEDIA_LIMITS[mediaType];

    let toUpload: File = file;
    if (mediaType === "image") {
      // Uploads go through our own n8n webhook as base64 JSON first, which
      // inflates size ~33% on top of a typical 1MB proxy body cap — a raw
      // photo well under Meta's own 5MB limit can still be big enough to
      // get silently rejected before it ever reaches our workflow.
      const compressionTarget = Math.min(limit.bytes, UPLOAD_TRANSPORT_SAFE_IMAGE_BYTES);
      if (file.size > compressionTarget) {
        toUpload = await compressImageIfNeeded(file, compressionTarget);
      }
    }

    if (toUpload.size > limit.bytes) {
      setError(
        `הקובץ גדול מדי (${(toUpload.size / 1024 / 1024).toFixed(1)}MB) — Meta מגבילה ${MEDIA_TYPE_LABEL[mediaType]} עד ${limit.label}.`,
      );
      return;
    }

    setUploading(true);
    try {
      const { url } = await uploadBroadcastMedia(sessionToken, toUpload);
      setCampaignMediaUrl(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בהעלאת הקובץ");
    } finally {
      setUploading(false);
    }
  }

  async function handleCount() {
    setCounting(true);
    setError(null);
    try {
      const count = await countTarget(sessionToken, {
        filter_cities: selectedCities.length ? selectedCities : undefined,
        filter_categories: selectedCategories.length ? selectedCategories : undefined,
      });
      setTargetCount(count);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בספירת קהל היעד");
    } finally {
      setCounting(false);
    }
  }

  async function handleCreateBatch() {
    if (!templateId) {
      setError("בחרו תבנית קודם");
      return;
    }
    if (needsMedia && !campaignMediaUrl) {
      setError("התבנית הנבחרת דורשת מדיה בכותרת — יש להעלות קובץ קודם");
      return;
    }
    const template = readyTemplates.find((t) => t.id === templateId);
    const confirmMsg = scheduledFor
      ? `הקמפיין יתוזמן ל-${new Date(scheduledFor).toLocaleString("he-IL")} וישלח הודעות וואטסאפ אמיתיות ללקוחות. להמשיך?`
      : `פעולה זו תשלח הודעות וואטסאפ אמיתיות ללקוחות תוך עד 5 דקות (תבנית: "${template?.name ?? ""}"). להמשיך?`;
    if (!confirm(confirmMsg)) return;

    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await createBatch(sessionToken, {
        template_id: templateId,
        filter_cities: selectedCities.length ? selectedCities : undefined,
        filter_categories: selectedCategories.length ? selectedCategories : undefined,
        scheduled_for: scheduledFor || undefined,
        campaign_media_url: needsMedia ? campaignMediaUrl : undefined,
      });
      setNotice(`${res.queued} הודעות נכנסו לתור. ${res.note}`);
      setTargetCount(null);
      setCampaignMediaUrl("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה ביצירת הקמפיין");
    } finally {
      setCreating(false);
    }
  }

  async function handleCancelBatch(b: BroadcastBatch) {
    if (!confirm("לבטל את הקמפיין? הודעות שכבר יצאו לא יושפעו — רק הודעות שעדיין בתור יבוטלו.")) return;
    setCancellingId(b.id);
    setError(null);
    setNotice(null);
    try {
      const res = await cancelBatch(sessionToken, b.id);
      setNotice(`${res.cancelled_sends} הודעות בוטלו. ${res.note}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בביטול הקמפיין");
    } finally {
      setCancellingId(null);
    }
  }

  function handleBatchSort(key: BatchSortKey) {
    if (batchSortKey === key) {
      setBatchSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setBatchSortKey(key);
      setBatchSortDir(key === "created_at" || key === "scheduled_for" ? "desc" : "asc");
    }
    setBatchPage(1);
  }

  const sortedBatches = useMemo(() => {
    function val(b: BroadcastBatch): string | number {
      switch (batchSortKey) {
        case "status":
          return b.status || "";
        case "target_count":
          return b.target_count ?? -1;
        case "scheduled_for":
          return b.scheduled_for ? new Date(b.scheduled_for).getTime() : 0;
        case "created_at":
          return new Date(b.created_at).getTime();
        default:
          return "";
      }
    }
    return [...batches].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return batchSortDir === "asc" ? cmp : -cmp;
    });
  }, [batches, batchSortKey, batchSortDir]);

  const batchTotalPages = Math.max(1, Math.ceil(sortedBatches.length / BATCHES_PAGE_SIZE));
  const batchSafePage = Math.min(batchPage, batchTotalPages);
  const pagedBatches = sortedBatches.slice((batchSafePage - 1) * BATCHES_PAGE_SIZE, batchSafePage * BATCHES_PAGE_SIZE);

  return (
    <div>
      {readyTemplates.length === 0 ? (
        <div className="callout-info">
          <strong>אין כרגע תבניות מוכנות לשליחה.</strong> שליחה בפועל מחוברת ופעילה מול WhatsApp, אבל היא דורשת תבנית
          שאושרה ב-Meta ושמה המדויק (meta_template_name) עודכן בעמוד "תבניות". ברגע שתבנית תסומן כ"מאושר" עם שם תבנית
          מוזן, היא תופיע כאן לבחירה.
        </div>
      ) : (
        <div className="callout-info">
          <strong>שימו לב:</strong> שליחה בפועל מחוברת ופעילה. לחיצה על "צור קמפיין" תיצור הודעות אמיתיות שיישלחו
          בוואטסאפ ללקוחות תוך עד 5 דקות (או במועד המתוזמן, אם נבחר).
        </div>
      )}

      {error && <div className="error-box">{error}</div>}
      {notice && <div className="notice-box">{notice}</div>}

      <h2 className="section-title">קמפיין חדש</h2>
      <div className="form-row">
        <div className="field">
          <label>תבנית</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">בחרו תבנית</option>
            {readyTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {needsMedia && (
          <div className="field">
            <label>מדיה לכותרת ההודעה (נדרש לתבנית זו)</label>
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
              <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={(e) => void handleFileChange(e)} />
              {campaignMediaUrl && <span className="muted mono">הועלה ✓</span>}
            </div>
            <input className="mono" value={campaignMediaUrl} onChange={(e) => setCampaignMediaUrl(e.target.value)} placeholder="או הדביקו כתובת URL" />
          </div>
        )}
        <div className="field">
          <label>תזמון (אופציונלי)</label>
          <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>ערים (ריק = הכל)</label>
        <div className="chip-row">
          {availableCities.map((city) => {
            const selected = selectedCities.includes(city);
            return (
              <button key={city} type="button" className={`chip${selected ? " chip-selected" : ""}`} onClick={() => toggleCity(city)}>
                {selected ? "✓ " : ""}
                {city}
              </button>
            );
          })}
          {availableCities.length === 0 && <span className="muted">אין עדיין ערים באנשי הקשר</span>}
        </div>
      </div>

      <div className="field">
        <label>קהל יעד — קטגוריות (ריק = הכל)</label>
        <div className="chip-row">
          {categories.map((cat) => {
            const selected = selectedCategories.includes(cat.name);
            return (
              <button
                key={cat.id}
                type="button"
                className={`chip${selected ? " chip-selected" : ""}`}
                onClick={() => toggleCategory(cat.name)}
              >
                {selected ? "✓ " : ""}
                {cat.name}
              </button>
            );
          })}
          {categories.length === 0 && <span className="muted">אין קטגוריות עדיין</span>}
        </div>
      </div>

      <div className="toolbar">
        <button type="button" className="btn btn-sm" style={{ width: "auto" }} onClick={() => void handleCount()} disabled={counting}>
          {counting ? "סופר..." : "ספירת קהל יעד"}
        </button>
        {targetCount !== null && <span className="muted">קהל יעד: {targetCount} אנשי קשר</span>}
        <button
          type="button"
          className="btn btn-sm"
          style={{ width: "auto" }}
          onClick={() => void handleCreateBatch()}
          disabled={creating || !templateId}
        >
          {creating ? "יוצר..." : "צור קמפיין"}
        </button>
      </div>

      <h2 className="section-title">קמפיינים קודמים</h2>
      {loading ? (
        <p className="muted">טוען...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <BatchSortableHeader label="סטטוס" sortKey="status" activeKey={batchSortKey} dir={batchSortDir} onSort={handleBatchSort} />
                <BatchSortableHeader label="יעד" sortKey="target_count" activeKey={batchSortKey} dir={batchSortDir} onSort={handleBatchSort} />
                <BatchSortableHeader label="מתוזמן ל" sortKey="scheduled_for" activeKey={batchSortKey} dir={batchSortDir} onSort={handleBatchSort} />
                <BatchSortableHeader label="נוצר" sortKey="created_at" activeKey={batchSortKey} dir={batchSortDir} onSort={handleBatchSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagedBatches.map((b) => (
                <tr key={b.id}>
                  <td>
                    <span className={`pill pill-status-${b.status}`}>{BATCH_STATUS_LABEL[b.status] ?? b.status}</span>
                  </td>
                  <td>{b.target_count ?? "—"}</td>
                  <td>{b.scheduled_for ? new Date(b.scheduled_for).toLocaleString("he-IL") : "מיידי"}</td>
                  <td>{new Date(b.created_at).toLocaleString("he-IL")}</td>
                  <td>
                    {CANCELLABLE_BATCH_STATUSES.has(b.status) && (
                      <button
                        type="button"
                        className="btn-link btn-link-danger"
                        disabled={cancellingId === b.id}
                        onClick={() => void handleCancelBatch(b)}
                      >
                        {cancellingId === b.id ? "מבטל..." : "ביטול קמפיין"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                    אין קמפיינים עדיין
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && batchTotalPages > 1 && (
        <div className="toolbar" style={{ justifyContent: "center" }}>
          <button
            type="button"
            className="btn-link"
            disabled={batchSafePage <= 1}
            onClick={() => setBatchPage(batchSafePage - 1)}
          >
            ← הקודם
          </button>
          <span className="muted" style={{ fontSize: ".85rem" }}>
            עמוד {batchSafePage} מתוך {batchTotalPages}
          </span>
          <button
            type="button"
            className="btn-link"
            disabled={batchSafePage >= batchTotalPages}
            onClick={() => setBatchPage(batchSafePage + 1)}
          >
            הבא →
          </button>
        </div>
      )}
    </div>
  );
}
