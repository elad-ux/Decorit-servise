// בדיקה בלי n8n: מדפיס תלוש לדוגמה ישירות. node test-local.js <IP>
const net = require("net");
const { buildSlip } = require("./slip");
const host = process.argv[2]; const footer = process.argv[3];
if (!host) { console.error("usage: node test-local.js <IP>"); process.exit(1); }
const buf = buildSlip({ customer_name: "משה כהן", fabric: "קטיפה", color: "אפור פחם", quantity_ordered: 12.5, customer_order_number: "ORD-10452", office_notes: "לחתוך בבת אחת", is_urgent: true, created_by_name: "דנה", footer, created_at: new Date().toISOString() });
const s = net.createConnection({ host, port: 9100 }, () => s.end(buf));
s.on("close", () => console.log("נשלח.")); s.on("error", (e) => console.error(e.message));
