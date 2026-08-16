import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import {
  type BroadcastBatch,
  type BroadcastSendRow,
  type SendStatusSummary,
  type ConversationMessage,
  listBatches,
  listMessageStatus,
  markReplySeen,
  setReplyTags,
  listConversation,
  sendReply,
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

function documentFileName(url: string): string {
  try {
    const clean = url.split("?")[0];
    return decodeURIComponent(clean.substring(clean.lastIndexOf("/") + 1)) || "מסמך";
  } catch {
    return "מסמך";
  }
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
  const [panelSend, setPanelSend] = useState<BroadcastSendRow | null>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
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

  function openPanel(s: BroadcastSendRow) {
    setPanelSend(s);
    setReplyText("");
    setReplyError(null);
    // Mark as seen the moment a reply is actually opened — like email. Optimistic
    // local update so the dot clears instantly; the next poll will independently
    // confirm it from the server either way, so a failed background call here isn't destructive.
    if (hasReply(s) && !s.reply_seen_at) {
      const now = new Date().toISOString();
      setSends((prev) => prev.map((row) => (row.send_id === s.send_id ? { ...row, reply_seen_at: now } : row)));
      void markReplySeen(sessionToken, s.send_id).catch(() => {
        // best-effort
      });
    }
  }

  function closePanel() {
    setPanelSend(null);
    setConversation([]);
  }

  async function loadConversation(contactId: string, silent = false) {
    if (!silent) setConversationLoading(true);
    try {
      const res = await listConversation(sessionToken, contactId);
      setConversation(res.messages);
    } catch {
      // best-effort — the panel still shows the last-known reply_text from the row itself
    } finally {
      if (!silent) setConversationLoading(false);
    }
  }

  async function handleSendReply() {
    if (!panelSend || !replyText.trim()) return;
    setReplySending(true);
    setReplyError(null);
    try {
      const res = await sendReply(sessionToken, panelSend.contact_id, replyText.trim());
      if (!res.success) {
        setReplyError(res.error || "שגיאה בשליחת ההודעה");
        return;
      }
      setReplyText("");
      void loadConversation(panelSend.contact_id, true);
    } catch (err) {
      setReplyError(err instanceof ApiError ? err.message : "שגיאה בשליחת ההודעה");
    } finally {
      setReplySending(false);
    }
  }

  useEffect(() => {
    if (!panelSend) return;
    void loadConversation(panelSend.contact_id);
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadConversation(panelSend.contact_id, true);
    }, 2500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelSend?.contact_id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
                  <tr key={s.send_id} onClick={() => openPanel(s)} style={{ cursor: "pointer" }} title="לחץ לתצוגת השיחה בוואטסאפ">
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

      {panelSend && (
        <>
          <div
            onClick={closePanel}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 40 }}
          />
          <div
            style={{
              position: "fixed",
              top: 0,
              bottom: 0,
              insetInlineEnd: 0,
              width: "min(420px, 100vw)",
              background: "var(--paper, #fff)",
              boxShadow: "-4px 0 16px rgba(0,0,0,0.15)",
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "1rem", borderBottom: "1px solid var(--linen)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <strong style={{ fontSize: "1.05rem" }}>
                  {panelSend.business_name}
                  {panelSend.contact_name ? ` (${panelSend.contact_name})` : ""}
                </strong>
                <div className="muted mono" style={{ fontSize: ".85rem", marginTop: "0.2rem" }}>{panelSend.phone}</div>
              </div>
              <button type="button" className="btn-link" onClick={closePanel} aria-label="סגירה">✕</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
              {panelSend.opted_out && (
                <div className="error-box" style={{ marginBottom: "0.75rem" }}>
                  איש הקשר הוסר מרשימת התפוצה
                  {panelSend.opted_out_at && ` ב-${new Date(panelSend.opted_out_at).toLocaleString("he-IL")}`}.
                  לא יישלחו אליו הודעות תפוצה נוספות עד שמנהל יפעיל אותו מחדש בעמוד "אנשי קשר".
                </div>
              )}
              {panelSend.error && (
                <div className="error-box" style={{ marginBottom: "0.75rem" }}>
                  <strong>שגיאה מלאה:</strong>
                  <div style={{ marginTop: "0.25rem", whiteSpace: "pre-wrap" }}>{panelSend.error}</div>
                </div>
              )}

              {hasReply(panelSend) && (
                <div className="field" style={{ marginBottom: "1rem" }}>
                  <label>תגיות</label>
                  <div className="chip-row">
                    {REPLY_TAG_OPTIONS.map((tag) => {
                      const active = panelSend.reply_tags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          className={`chip${active ? " chip-selected" : ""}`}
                          onClick={() => void toggleTag(panelSend, tag)}
                        >
                          {active ? "✓ " : ""}{tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="muted" style={{ fontSize: ".75rem", marginBottom: ".3rem" }} title="שם התבנית הפנימי">
                תבנית: {panelSend.template_name}
              </p>

              <div className="wa-preview">
                <div className="wa-bubble">
                  {panelSend.template_header_type === "text" && panelSend.template_header_text && (
                    <div className="wa-header-text">{panelSend.template_header_text}</div>
                  )}

                  {panelSend.template_header_type === "image" && panelSend.template_header_media_url && (
                    <div className="wa-header-media">
                      <img src={panelSend.template_header_media_url} alt="" />
                    </div>
                  )}

                  {panelSend.template_header_type === "video" && panelSend.template_header_media_url && (
                    <div className="wa-header-media wa-header-media-video">
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <video src={panelSend.template_header_media_url} controls preload="metadata" />
                    </div>
                  )}

                  {panelSend.template_header_type === "document" && panelSend.template_header_media_url && (
                    <div className="wa-header-doc">
                      <a href={panelSend.template_header_media_url} target="_blank" rel="noreferrer" className="wa-doc-link">
                        📄 <span className="wa-doc-name">{documentFileName(panelSend.template_header_media_url)}</span>
                      </a>
                    </div>
                  )}

                  <div className="wa-body">
                    {panelSend.template_body_text || `תבנית: ${panelSend.template_name}`}
                    <div className="muted mono" style={{ fontSize: ".75rem", marginTop: "0.3rem" }}>
                      {panelSend.sent_at && `נשלח ${new Date(panelSend.sent_at).toLocaleTimeString("he-IL")}`}
                      {panelSend.delivered_at && ` · נמסר ✓✓`}
                      {panelSend.read_at && ` · נקרא ✓✓`}
                    </div>
                  </div>
                  {panelSend.template_footer_text && <div className="wa-footer">{panelSend.template_footer_text}</div>}
                </div>
                {panelSend.template_buttons && panelSend.template_buttons.length > 0 && (
                  <div className="wa-buttons">
                    {panelSend.template_buttons.map((b, i) => (
                      <div key={i} className="wa-button">
                        {b.type === "url" && "🔗 "}
                        {b.type === "phone" && "📞 "}
                        {b.text}
                      </div>
                    ))}
                  </div>
                )}

                {conversationLoading ? (
                  <p className="muted" style={{ fontSize: ".85rem", marginTop: "0.5rem" }}>טוען שיחה...</p>
                ) : conversation.length > 0 ? (
                  conversation.map((m) => (
                    <div
                      key={m.id}
                      className="wa-bubble"
                      style={{
                        marginTop: "0.5rem",
                        background: m.direction === "inbound" ? "#dcf8c6" : "var(--sand)",
                        marginInlineStart: m.direction === "outbound" ? "2rem" : 0,
                      }}
                    >
                      <div className="wa-body">
                        {m.body}
                        <div className="muted" style={{ fontSize: ".7rem", marginTop: "0.25rem" }}>
                          {new Date(m.created_at).toLocaleString("he-IL")}
                        </div>
                      </div>
                    </div>
                  ))
                ) : panelSend.reply_text || panelSend.button_clicked ? (
                  <div className="wa-bubble" style={{ marginTop: "0.5rem", background: "#dcf8c6" }}>
                    <div className="wa-body">{panelSend.reply_text || `לחץ על כפתור: ${panelSend.button_clicked}`}</div>
                  </div>
                ) : (
                  <p className="muted" style={{ fontSize: ".8rem", marginTop: "0.5rem" }}>אין עדיין תגובה מאיש הקשר</p>
                )}
              </div>
            </div>

            <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid var(--linen)" }}>
              {replyError && <div className="error-box" style={{ marginBottom: "0.5rem", fontSize: ".85rem" }}>{replyError}</div>}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  className="input-inline"
                  style={{ flex: 1 }}
                  placeholder="כתוב תשובה..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !replySending) void handleSendReply();
                  }}
                />
                <button type="button" className="btn" style={{ width: "auto" }} disabled={replySending || !replyText.trim()} onClick={() => void handleSendReply()}>
                  {replySending ? "שולח..." : "שליחה"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
