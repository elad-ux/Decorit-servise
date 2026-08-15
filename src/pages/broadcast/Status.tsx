import { Fragment, useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import {
  type BroadcastBatch,
  type BroadcastSendRow,
  type SendStatusSummary,
  listBatches,
  listMessageStatus,
  markReplySeen,
  setReplyTags,
} from "../../lib/broadcast";

const STATUS_LABEL: Record<BroadcastSendRow["status"], string> = {
  queued: "בתור",
  sent: "נשלח",
  delivered: "נמסר",
  read: "נקרא",
  failed: "נכשל",
  skipped_optout: "דולג (הסרה)",
  cancelled: "בוטל",
};

// Delivery/read/reply updates land in broadcast_sends the moment WhatsApp's
// webhook fires (see Flow 1 — Is Status Update? / Is Broadcast Contact?),
// completely independent of this page. Polling is what makes that already-
// live backend state actually show up here without a manual reload.
const POLL_INTERVAL_MS = 10000;

const ERROR_PREVIEW_MAX = 40;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trim() + "…" : text;
}

const REPLY_TAG_OPTIONS = ["חשוב", "המשך טיפול"];

function hasReply(s: BroadcastSendRow): boolean {
  return !!s.reply_text || !!s.button_clicked;
}

export default function BroadcastStatus() {
  const { session } = useAuth();
  const sessionToken = session?.sessionToken ?? "";
  const [sends, setSends] = useState<BroadcastSendRow[]>([]);
  const [summary, setSummary] = useState<SendStatusSummary | null>(null);
  const [batches, setBatches] = useState<BroadcastBatch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const batchIdRef = useRef(batchId);
  batchIdRef.current = batchId;

  async function load(selectedBatchId: string, silent = false) {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [res, b] = await Promise.all([listMessageStatus(sessionToken, selectedBatchId || undefined), listBatches(sessionToken)]);
      setSends(res.sends);
      setSummary(res.summary);
      setBatches(b);
    } catch (err) {
      if (!silent) setError(err instanceof ApiError ? err.message : "שגיאה בטעינת סטטוסים");
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load(batchIdRef.current, true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  function toggleExpand(s: BroadcastSendRow) {
    const isOpening = expandedId !== s.send_id;
    setExpandedId(isOpening ? s.send_id : null);
    // Mark as seen the moment a reply is actually opened — like email. Optimistic
    // local update so the dot clears instantly; the next poll will independently
    // confirm it from the server either way, so a failed background call here isn't destructive.
    if (isOpening && hasReply(s) && !s.reply_seen_at) {
      const now = new Date().toISOString();
      setSends((prev) => prev.map((row) => (row.send_id === s.send_id ? { ...row, reply_seen_at: now } : row)));
      void markReplySeen(sessionToken, s.send_id).catch(() => {
        // best-effort
      });
    }
  }

  async function toggleTag(s: BroadcastSendRow, tag: string) {
    const had = s.reply_tags.includes(tag);
    const nextTags = had ? s.reply_tags.filter((t) => t !== tag) : [...s.reply_tags, tag];
    setSends((prev) => prev.map((row) => (row.send_id === s.send_id ? { ...row, reply_tags: nextTags } : row)));
    try {
      await setReplyTags(sessionToken, s.send_id, nextTags);
    } catch (err) {
      setSends((prev) => prev.map((row) => (row.send_id === s.send_id ? { ...row, reply_tags: s.reply_tags } : row)));
      setError(err instanceof ApiError ? err.message : "שגיאה בעדכון תגית");
    }
  }

  return (
    <div>
      {error && <div className="error-box">{error}</div>}

      <div className="toolbar">
        <select
          className="input-inline"
          value={batchId}
          onChange={(e) => {
            setBatchId(e.target.value);
            void load(e.target.value);
          }}
        >
          <option value="">כל הקמפיינים</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {new Date(b.created_at).toLocaleString("he-IL")} — {b.status}
            </option>
          ))}
        </select>
        {refreshing && (
          <span className="muted" style={{ fontSize: ".8rem" }}>
            מתעדכן...
          </span>
        )}
      </div>

      {summary && (
        <div className="stat-row">
          <div className="stat-tile">
            <span className="stat-value">{summary.total}</span>
            <span className="stat-label">סה"כ</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{summary.queued}</span>
            <span className="stat-label">בתור</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{summary.delivered}</span>
            <span className="stat-label">נמסר</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{summary.read}</span>
            <span className="stat-label">נקרא</span>
          </div>
          <div className="stat-tile stat-tile-danger">
            <span className="stat-value">{summary.failed}</span>
            <span className="stat-label">נכשל</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{summary.replied}</span>
            <span className="stat-label">השיבו</span>
          </div>
        </div>
      )}

      {loading ? (
        <p className="muted">טוען...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>עסק</th>
                <th>טלפון</th>
                <th>תבנית</th>
                <th>סטטוס</th>
                <th>נשלח</th>
                <th>נמסר</th>
                <th>נקרא</th>
                <th>תשובה</th>
              </tr>
            </thead>
            <tbody>
              {sends.map((s) => {
                const unread = hasReply(s) && !s.reply_seen_at;
                return (
                  <Fragment key={s.send_id}>
                    <tr onClick={() => toggleExpand(s)} style={{ cursor: "pointer" }} title="לחץ לתצוגת השיחה בוואטסאפ">
                      <td>
                        {s.opted_out ? (
                          <span className="status-dot status-dot-danger" title="איש הקשר הוסר מרשימת התפוצה" />
                        ) : unread ? (
                          <span className="status-dot status-dot-ok" title="תשובה חדשה שלא נצפתה" />
                        ) : null}
                      </td>
                      <td>
                        {s.business_name}
                        {s.contact_name ? ` (${s.contact_name})` : ""}
                      </td>
                      <td className="mono">{s.phone}</td>
                      <td>{s.template_name}</td>
                      <td>
                        <span className={`pill pill-status-${s.status}`}>{STATUS_LABEL[s.status]}</span>
                        {s.error && (
                          <div className="muted" style={{ fontSize: ".75rem" }}>
                            {truncate(s.error, ERROR_PREVIEW_MAX)}
                          </div>
                        )}
                      </td>
                      <td>{s.sent_at ? new Date(s.sent_at).toLocaleString("he-IL") : "—"}</td>
                      <td>{s.delivered_at ? new Date(s.delivered_at).toLocaleString("he-IL") : "—"}</td>
                      <td>{s.read_at ? new Date(s.read_at).toLocaleString("he-IL") : "—"}</td>
                      <td>
                        {s.reply_text || (s.button_clicked ? `כפתור: ${s.button_clicked}` : "—")}
                        {s.reply_tags.length > 0 && (
                          <div className="chip-row" style={{ marginTop: "0.25rem" }}>
                            {s.reply_tags.map((tag) => (
                              <span key={tag} className="chip chip-static chip-sm">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                    {expandedId === s.send_id && (
                      <tr key={s.send_id + "-chat"}>
                        <td colSpan={9} style={{ background: "var(--sand)", padding: "1rem" }}>
                          {s.opted_out && (
                            <div className="error-box" style={{ maxWidth: 340, marginBottom: "0.75rem" }}>
                              איש הקשר הוסר מרשימת התפוצה
                              {s.opted_out_at && ` ב-${new Date(s.opted_out_at).toLocaleString("he-IL")}`}. לא יישלחו
                              אליו הודעות תפוצה נוספות עד שמנהל יפעיל אותו מחדש בעמוד "אנשי קשר".
                            </div>
                          )}
                          {s.error && (
                            <div className="error-box" style={{ maxWidth: 340, marginBottom: "0.75rem" }}>
                              <strong>שגיאה מלאה:</strong>
                              <div style={{ marginTop: "0.25rem", whiteSpace: "pre-wrap" }}>{s.error}</div>
                            </div>
                          )}
                          <div className="wa-preview" style={{ maxWidth: 340 }}>
                            <div className="wa-bubble">
                              <div className="wa-body">
                                תבנית: {s.template_name}
                                <div className="muted mono" style={{ fontSize: ".75rem", marginTop: "0.3rem" }}>
                                  {s.sent_at && `נשלח ${new Date(s.sent_at).toLocaleTimeString("he-IL")}`}
                                  {s.delivered_at && ` · נמסר ✓✓`}
                                  {s.read_at && ` · נקרא ✓✓`}
                                </div>
                              </div>
                            </div>
                            {(s.reply_text || s.button_clicked) && (
                              <div className="wa-bubble" style={{ marginTop: "0.5rem", background: "#dcf8c6" }}>
                                <div className="wa-body">{s.reply_text || `לחץ על כפתור: ${s.button_clicked}`}</div>
                              </div>
                            )}
                            {!s.reply_text && !s.button_clicked && (
                              <p className="muted" style={{ fontSize: ".8rem", marginTop: "0.5rem" }}>
                                אין עדיין תגובה מאיש הקשר
                              </p>
                            )}
                          </div>
                          {hasReply(s) && (
                            <div className="field" style={{ marginTop: "0.75rem", maxWidth: 340 }}>
                              <label>תגיות</label>
                              <div className="chip-row">
                                {REPLY_TAG_OPTIONS.map((tag) => {
                                  const active = s.reply_tags.includes(tag);
                                  return (
                                    <button
                                      key={tag}
                                      type="button"
                                      className={`chip${active ? " chip-selected" : ""}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void toggleTag(s, tag);
                                      }}
                                    >
                                      {active ? "✓ " : ""}
                                      {tag}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {sends.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                    אין הודעות עדיין
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
