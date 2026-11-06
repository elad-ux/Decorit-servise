# סוכן הדפסת תלושי חיתוך (Windows)

דרישות: Node.js 18+ (יש fetch מובנה). אין תלויות npm.

## התקנה
1. העתק את התיקייה ל-`C:\print-agent`.
2. העתק `.env.example` ל-`.env` ומלא `PRINT_API_KEY` (המפתח נמסר בנפרד, לא נשמר בקוד) ו-`PRINTER_HOST`.
3. בדיקת הדפסה בלי n8n: `node test-local.js 192.168.2.18`
4. הרצה ידנית: `node agent.js` (לוג גם ב-agent.log).
5. הרצה קבועה ב-Windows — הדרך המומלצת: PowerShell כמנהל, בתיקייה `C:\print-agent`: `powershell -ExecutionPolicy Bypass -File .\install-task.ps1` (יוצר משימה `DecoritPrintAgent` שרצה כ-SYSTEM בעליית המחשב ומופעלת מחדש אחרי נפילה; הסרה: `uninstall-task.ps1`). חלופות ידניות:
   - Task Scheduler: Trigger "At startup", Action: `node.exe C:\print-agent\agent.js`, Start in: `C:\print-agent`, "Run whether user is logged on or not", Restart on failure כל דקה.
   - NSSM: `nssm install PrintAgent "C:\Program Files\nodejs\node.exe" C:\print-agent\agent.js` ואז `nssm set PrintAgent AppDirectory C:\print-agent`.

## התנהגות
- poll כל 4 שניות; כשל רשת -> backoff עד 60 שניות.
- כשל הדפסה -> ack failed; השרת מחזיר לתור עד 3 ניסיונות.
- אם ההדפסה הצליחה ו-ack נכשל (נפל האינטרנט) — אחרי ~2 דקות המשימה חוזרת לתור ועלולה להיות מודפסת פעמיים. זה פשרה מכוונת (עדיף כפול מאשר אבוד).
- עיצוב התלוש: `slip.js` בלבד.
- בייצור: לקבוע למדפסת DHCP reservation על MAC 00:13:41:05:01:8D (או IP סטטי) ולעדכן PRINTER_HOST.

## עדכון
החבילה זמינה להורדה מהפאנל: חיתוך בד > הגדרות > סוכן הדפסה. אחרי החלפת קבצים יש להפעיל מחדש: `Restart-ScheduledTask DecoritPrintAgent` (PowerShell כמנהל). קובץ `.env` (עם המפתח) לא נכלל בחבילה ולא נדרס.
