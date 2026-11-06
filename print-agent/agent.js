// סוכן הדפסה: שואל את n8n כל כמה שניות אם יש תלוש, מדפיס ל-TCP 9100 ומאשר.
// הרצה: node agent.js   (קורא הגדרות מ-.env)
const fs = require("fs");
const net = require("net");
const path = require("path");
const { buildSlip } = require("./slip");

// ---- .env ----
try {
  for (const l of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
const CFG = {
  url: process.env.PRINT_API_URL,
  key: process.env.PRINT_API_KEY,
  agentId: process.env.AGENT_ID || "office-server",
  printer: process.env.PRINTER_HOST,
  port: Number(process.env.PRINTER_PORT || 9100),
  pollMs: Number(process.env.POLL_MS || 4000),
};
for (const k of ["url", "key", "printer"]) {
  if (!CFG[k]) { console.error(`חסר הגדרה: ${k} (בדוק .env)`); process.exit(1); }
}

const LOG = path.join(__dirname, "agent.log");
function log(...a) {
  const s = `${new Date().toISOString()} ${a.join(" ")}`;
  console.log(s);
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 2_000_000) fs.renameSync(LOG, LOG + ".old");
    fs.appendFileSync(LOG, s + "\n");
  } catch {}
}

async function api(body) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(CFG.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-print-key": CFG.key },
      body: JSON.stringify({ agent_id: CFG.agentId, ...body }),
      signal: ctl.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(j)}`);
    return j;
  } finally { clearTimeout(t); }
}

function printRaw(buf) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: CFG.printer, port: CFG.port });
    let done = false;
    const fin = (e) => { if (done) return; done = true; sock.destroy(); e ? reject(e) : resolve(); };
    sock.setTimeout(8000, () => fin(new Error("timeout מול המדפסת")));
    sock.on("error", fin);
    sock.on("connect", () => sock.end(buf, () => setTimeout(() => fin(), 300)));
  });
}


// ---- סטטוס מדפסת (ESC/POS DLE EOT 1..4 על אותו חיבור 9100) ----
const bit = (b, n) => !!(b & (1 << n));
const DEC = {
  1: (b) => ({ offline: bit(b, 3) }),
  2: (b) => ({ cover_open: bit(b, 2), paper_feed_button: bit(b, 3), stopped_paper_end: bit(b, 5), error: bit(b, 6) }),
  3: (b) => ({ mechanical_error: bit(b, 2), cutter_error: bit(b, 3), unrecoverable: bit(b, 5), auto_recoverable: bit(b, 6) }),
  4: (b) => ({ paper_near_end: bit(b, 2) || bit(b, 3), paper_end: bit(b, 5) || bit(b, 6) }),
};
// מחזיר אובייקט דגלים, או null אם אין חיבור/תשובה (אז לא חוסמים הדפסה על סמך "לא ידוע")
function readStatus() {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: CFG.printer, port: CFG.port });
    const res = {}; let got = 0, buf = [], waiting = null, finished = false;
    const done = (v) => { if (finished) return; finished = true; sock.destroy(); resolve(v); };
    sock.setTimeout(6000, () => done(got ? res : null));
    sock.on("error", () => done(null));
    sock.on("data", (d) => { buf.push(...d); if (waiting) { const w = waiting; waiting = null; w(); } });
    sock.on("connect", async () => {
      for (const n of [1, 2, 3, 4]) {
        buf = [];
        sock.write(Buffer.from([0x10, 0x04, n]));
        await new Promise((r) => { waiting = r; setTimeout(() => { waiting = null; r(); }, 700); });
        if (buf.length) { Object.assign(res, DEC[n](buf[0])); got++; }
      }
      done(got ? res : null);
    });
  });
}
const notReady = (s) => !!s && (s.offline || s.cover_open || s.paper_end || s.stopped_paper_end || s.error ||
  s.mechanical_error || s.cutter_error || s.unrecoverable);

let printerOk = null;
async function handle(job) {
  log("job", job.id, "attempt", job.attempts);
  try {
    const one = buildSlip(job.payload || {});
    const copies = Math.min(Math.max(Number(job.copies) || 1, 1), 5);
    await printRaw(Buffer.concat(Array(copies).fill(one)));
    printerOk = true;
    await ackWithRetry({ action: "ack", job_id: job.id, result: "printed", printer_ok: true });
    log("printed", job.id);
  } catch (e) {
    printerOk = false;
    log("print failed", job.id, e.message);
    await ackWithRetry({ action: "ack", job_id: job.id, result: "failed", error: String(e.message).slice(0, 300), printer_ok: false });
  }
}

// אחרי הדפסה מוצלחת חשוב שה-ack יגיע; אם לא - ה-housekeeping יחזיר לתור (סיכון להדפסה כפולה, ראה README)
async function ackWithRetry(body) {
  for (let i = 0; i < 4; i++) {
    try { await api(body); return; }
    catch (e) {
      if (/HTTP 409/.test(e.message)) { log("ack 409 (already handled)", e.message); return; }
      log("ack error", e.message);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  log("ack gave up for", body.job_id);
}

async function main() {
  log("agent start", CFG.agentId, "->", CFG.printer + ":" + CFG.port, "poll", CFG.pollMs + "ms");
  let backoff = 0, lastSig = "";
  for (;;) {
    try {
      const st = await readStatus();
      const sig = JSON.stringify(st);
      if (sig !== lastSig) { log("printer status", sig); lastSig = sig; }
      if (st === null) printerOk = false; else printerOk = !notReady(st);

      if (notReady(st)) {
        // המדפסת לא מוכנה: לא תופסים משימות, רק מדווחים סטטוס (נשארות בתור עד שתחזור)
        await api({ action: "status", printer_status: st });
      } else {
        const r = await api({ action: "poll", printer_ok: printerOk, ...(st ? { printer_status: st } : {}) });
        const job = r?.data?.job;
        if (job) { await handle(job); backoff = 0; continue; }
      }
      backoff = 0;
    } catch (e) {
      backoff = Math.min((backoff || 2000) * 2, 60000);
      log("loop error", e.message, "retry in", backoff + "ms");
    }
    await new Promise((r) => setTimeout(r, backoff || CFG.pollMs));
  }
}
process.on("uncaughtException", (e) => log("uncaught", e.stack || e));
process.on("unhandledRejection", (e) => log("unhandled", e));
main();
