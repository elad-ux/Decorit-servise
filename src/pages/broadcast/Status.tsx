import { Fragment, useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import { type BroadcastBatch, type BroadcastSendRow, type SendStatusSummary, listBatches, listMessageStatus } from "../../lib/broadcast";

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
              {sends.map((s) => (
                <Fragment key={s.send_id}>
                  <tr
                    onClick={() => setExpandedId(expandedId === s.send_id ? null : s.send_id)}
                    style={{ cursor: "pointer" }}
                    title="לחץ לתצוגת השיחה בוואטסאפ"
                  >
                    <td>
                      {s.business_name}
                      {s.contact_name ? ` (${s.contact_name})` : ""}
                    </td>
                    <td className="mono">{s.phone}</td>
                    <td>{s.template_name}</td>
                    <td>
                      <span className={`pill pill-status-${s.status}`}>{STATUS_LABEL[s.status]}</span>
                      {s.error && <div className="muted" style={{ fontSize: ".75rem" }}>{s.error}</div>}
                    </td>
                    <td>{s.sent_at ? new Date(s.sent_at).toLocaleString("he-IL") : "—"}</td>
                    <td>{s.delivered_at ? new Date(s.delivered_at).toLocaleString("he-IL") : "—"}</td>
                    <td>{s.read_at ? new Date(s.read_at).toLocaleString("he-IL") : "—"}</td>
                    <td>{s.reply_text || (s.button_clicked ? `כפתור: ${s.button_clicked}` : "—")}</td>
                  </tr>
                  {expandedId === s.send_id && (
                    <tr key={s.send_id + "-chat"}>
                      <td colSpan={8} style={{ background: "var(--sand)", padding: "1rem" }}>
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
                              <div className="wa-body">
                                {s.reply_text || `לחץ על כפתור: ${s.button_clicked}`}
                              </div>
                            </div>
                          )}
                          {!s.reply_text && !s.button_clicked && (
                            <p className="muted" style={{ fontSize: ".8rem", marginTop: "0.5rem" }}>
                              אין עדיין תגובה מאיש הקשר
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {sends.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
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
