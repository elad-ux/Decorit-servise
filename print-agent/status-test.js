// בדיקת קריאת סטטוס מהמדפסת דרך TCP 9100 (פקודות ESC/POS DLE EOT). לא מדפיס כלום.
// הרצה: node status-test.js 192.168.2.18
const net = require("net");
const host = process.argv[2];
if (!host) { console.error("usage: node status-test.js <IP>"); process.exit(1); }

const bit = (b, n) => !!(b & (1 << n));
const decoders = {
  1: (b) => ({ offline: bit(b, 3) }),
  2: (b) => ({ cover_open: bit(b, 2), paper_feed_button: bit(b, 3), stopped_paper_end: bit(b, 5), error: bit(b, 6) }),
  3: (b) => ({ mechanical_error: bit(b, 2), cutter_error: bit(b, 3), unrecoverable: bit(b, 5), auto_recoverable: bit(b, 6) }),
  4: (b) => ({ paper_near_end: bit(b, 2) || bit(b, 3), paper_end: bit(b, 5) || bit(b, 6) }),
};

const sock = net.createConnection({ host, port: 9100 });
let buf = [];
sock.setTimeout(10000, () => { console.log("timeout"); sock.destroy(); });
sock.on("error", (e) => console.error("שגיאה:", e.message));
sock.on("data", (d) => buf.push(...d));
sock.on("connect", async () => {
  for (const n of [1, 2, 3, 4]) {
    buf = [];
    sock.write(Buffer.from([0x10, 0x04, n]));
    await new Promise((r) => setTimeout(r, 1200));
    if (!buf.length) console.log(`n=${n}: אין תשובה`);
    else console.log(`n=${n}: 0x${buf[0].toString(16).padStart(2, "0")}`, JSON.stringify(decoders[n](buf[0])), buf.length > 1 ? `(+${buf.length - 1} בתים נוספים)` : "");
  }
  sock.end();
});
