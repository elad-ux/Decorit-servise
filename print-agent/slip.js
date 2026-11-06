// תבנית התלוש. כל שינוי עיצוב/סדר נעשה כאן בלבד (לא נוגעים ב-n8n).
const ESC = 0x1b, GS = 0x1d;
const CODEPAGE = 15;   // ESC t 15
const HEB_BASE = 0x80; // א = 0x80 ... ת = 0x9A
const WIDTH = 42;           // תווים בשורה בפונט A (12 נק'). נמדד בפועל: האזור המודפס ~504 נקודות (לא 576) כי יש שוליים בדף 80 מ"מ

const isHeb = (w) => /[א-ת]/.test(w);

function wrap(text, width) {
  const lines = []; let cur = "";
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= width) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function toVisual(line) {
  return line.split(" ").reverse().map((w) => (isHeb(w) ? [...w].reverse().join("") : w)).join(" ");
}

const enc = (s) => Buffer.from([...s].map((ch) => {
  const c = ch.charCodeAt(0);
  if (c >= 0x05d0 && c <= 0x05ea) return HEB_BASE + (c - 0x05d0);
  return c < 128 ? c : 0x3f;
}));

function fmtDateTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  const f = (o) => new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", ...o }).format(d);
  return {
    date: f({ day: "2-digit", month: "2-digit", year: "numeric" }),
    time: f({ hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

// payload מגיע מ-n8n (snapshot בזמן יצירת המשימה)
// גדלים: GS ! n  (n = (רוחב-1)<<4 | (גובה-1)); רוחב תו בפונט A = 12 נקודות * מכפיל
let LOGO = null;
try { LOGO = require("./logo"); } catch {}

function buildSlip(p) {
  const { date, time } = fmtDateTime(p.created_at);
  const out = [];
  const raw = (...b) => out.push(Buffer.from(b));
  const size = (w, h) => raw(GS, 0x21, ((w - 1) << 4) | (h - 1));
  const bold = (on) => raw(ESC, 0x45, on ? 1 : 0);
  const align = (a) => raw(ESC, 0x61, a); // 0 שמאל, 1 מרכז, 2 ימין
  const sep = () => out.push(Buffer.from("-".repeat(WIDTH) + "\n"));
  const line = (s) => out.push(enc(toVisual(s)), Buffer.from("\n"));
  // מדפיס טקסט בגודל נתון (גלישה לפי רוחב/מכפיל)
  const big = (s, w, h) => { size(w, h); bold(true); wrap(s, Math.floor(WIDTH / w)).forEach(line); bold(false); size(1, 1); };

  // פס הפוך (לבן על שחור) לרוחב כל השורה, הטקסט במרכז (גודל כפול = 21 תווים)
  const inverseBar = (text) => {
    const cols = Math.floor(WIDTH / 2);
    const word = wrap(text, cols).join(" ");
    const left = Math.max(0, Math.floor((cols - word.length) / 2));
    const row = " ".repeat(left) + toVisual(word) + " ".repeat(Math.max(0, cols - word.length - left));
    size(2, 2); bold(true); raw(GS, 0x42, 1);
    out.push(enc(row), Buffer.from("\n"));
    raw(GS, 0x42, 0); bold(false); size(1, 1);
  };

  raw(ESC, 0x40);
  raw(ESC, 0x74, CODEPAGE);

  // לוגו כפתיח
  if (LOGO) {
    align(1);
    raw(GS, 0x76, 0x30, 0x00, LOGO.widthBytes & 0xff, LOGO.widthBytes >> 8, LOGO.height & 0xff, LOGO.height >> 8);
    out.push(LOGO.data);
    out.push(Buffer.from("\n"));
  }

  align(1);
  big("משימת חיתוך", 2, 1);
  if (p.is_urgent) inverseBar("דחוף");
  align(2);
  sep();

  // שם לקוח - גדול
  if (p.customer_name) big(p.customer_name, 2, 2);
  // בד וצבע - שורה גדולה אחת (גולשת אם ארוכה)
  const fc = [p.fabric, p.color].filter(Boolean).join(" - ");
  if (fc) big(fc, 2, 2);
  sep();

  // כמות - במרכז, גדולה מאוד
  align(1);
  const qtyText = `${p.quantity_ordered ?? ""} מטר`;
  const m = qtyText.length <= 10 ? 4 : qtyText.length <= 14 ? 3 : 2; // 4x = 48 נק' לתו; 10 תווים = 480 מתוך 504
  big(qtyText, m, m);
  align(2);
  sep();

  // הערות ומספר הזמנה - רק אם קיימים, בגודל רגיל
  if (p.customer_order_number) wrap(`מספר הזמנה: ${p.customer_order_number}`, WIDTH).forEach(line);
  if (p.office_notes) wrap(`הערות: ${p.office_notes}`, WIDTH).forEach(line);
  if (p.customer_order_number || p.office_notes) sep();
  // תאריך ושעה (של יצירת ההזמנה) והמפיק באותה שורה; אם ארוך מדי - גולש לשורה הבאה
  const dateText = `תאריך: ${date} ${time}`;
  const withCreator = p.created_by_name ? `${dateText}  המפיק: ${p.created_by_name}` : dateText;
  if (withCreator.length <= WIDTH) line(withCreator);
  else { line(dateText); wrap(`המפיק: ${p.created_by_name}`, WIDTH).forEach(line); }

  // פס תחתון הפוך (לבן על שחור) לרוחב כל השורה: עדכון הזמנה / בוטל
  const FOOTERS = { update: "עדכון הזמנה", cancel: "בוטל" };
  if (FOOTERS[p.footer]) {
    out.push(Buffer.from("\n"));
    align(1);
    inverseBar(FOOTERS[p.footer]);
    align(2);
  }

  out.push(Buffer.from("\n\n\n"));
  raw(GS, 0x56, 0x42, 0x00);
  return Buffer.concat(out);
}

module.exports = { buildSlip, toVisual, wrap };
