export interface WaErrorInfo {
  code: number | null;
  title: string;
  explanation: string;
  recommendation: string;
  raw: string | null;
}

/**
 * Known WhatsApp/Meta send-error codes, translated to plain Hebrew. Sourced
 * from real errors seen in broadcast_sends.error — not the full Meta error
 * catalog, just the ones that actually show up here.
 */
const KNOWN_CODES: Record<number, Omit<WaErrorInfo, "code" | "raw">> = {
  131049: {
    title: "נחסם על ידי המדיניות של Meta (עומס הודעות שיווקיות)",
    explanation:
      "Meta עוקבת אחרי כמות ההודעות השיווקיות שכל אדם מקבל מכל העסקים יחד. הנמען הזה כנראה קיבל הרבה הודעות שיווק לאחרונה ו-Meta חסמה הודעה נוספת אליו — זה לא קשור לאיכות התבנית או לחשבון שלכם.",
    recommendation:
      "לא מומלץ להסיר את איש הקשר בגלל זה — זו חסימה זמנית וספציפית לנמען, לא בעיה איתו או איתכם. פשוט אל תשלחו שוב היום; זה בדרך כלל נפתר מעצמו.",
  },
  131026: {
    title: "ההודעה לא ניתנת למסירה",
    explanation:
      "המספר הזה כנראה לא רשום בוואטסאפ, חסם את העסק, או לא אישר את תנאי השימוש העדכניים של Meta. Meta לא תמיד חושפת את הסיבה המדויקת מטעמי פרטיות.",
    recommendation: 'כדאי לוודא שהמספר נכון ופעיל בוואטסאפ. אם זה חוזר על עצמו לאיש קשר הזה, שקלו להשבית אותו בעמוד "אנשי קשר".',
  },
  131047: {
    title: "מחוץ לחלון 24 השעות",
    explanation:
      "עברו יותר מ-24 שעות מאז שהנמען הגיב לאחרונה, וההודעה שנשלחה לא הייתה הודעת תבנית מאושרת (למשל תגובה חופשית מעמוד הסטטוס). ל-WhatsApp אסור לשלוח הודעות חופשיות מחוץ לחלון הזה.",
    recommendation: "כדי לחדש קשר עם הנמען יש לשלוח תבנית מאושרת (לא הודעה חופשית) — זה יפתח מחדש את חלון 24 השעות אם הוא יגיב.",
  },
  130472: {
    title: "המספר חלק מקבוצת ניסוי של Meta",
    explanation:
      'Meta משבצת אחוז קטן של משתמשים בקבוצת "ניסוי" שבה הודעות שיווקיות נחסמות ללא קשר לעסק השולח. זה לא נובע ממשהו שעשיתם.',
    recommendation: "אין מה לעשות כאן — ניסיון חוזר יחזיר את אותה שגיאה. זה חל רק על אחוז קטן מהנמענים ולא ניתן לעקוף.",
  },
  130429: {
    title: "חריגה ממכסת השליחה",
    explanation: "חשבון הוואטסאפ העסקי חרג ממגבלת קצב השליחה הזמנית של Meta.",
    recommendation: "להאט את קצב השליחה ולנסות שוב בעוד כמה דקות.",
  },
  132000: {
    title: "אי-התאמה בפרמטרים של התבנית",
    explanation: "מספר המשתנים שנשלחו לא תואם את מה שהתבנית המאושרת ב-Meta מצפה לו — כנראה בעיה טכנית בבניית ההודעה.",
    recommendation: 'יש לבדוק את הגדרת התבנית ואת המשתנים שהוגדרו לה בעמוד "תבניות".',
  },
};

/**
 * Meta's send-error payload lands in broadcast_sends.error as a raw JSON
 * string — and sometimes truncated/malformed, so this deliberately extracts
 * fields with regex instead of JSON.parse, which would just throw on a cut
 * string.
 */
export function parseWaError(raw: string | null | undefined): WaErrorInfo {
  if (!raw) {
    return { code: null, raw: null, title: "שגיאה לא ידועה", explanation: "לא התקבלו פרטים נוספים.", recommendation: "" };
  }

  const codeMatch = raw.match(/"code"\s*:\s*(\d+)/);
  const code = codeMatch ? Number(codeMatch[1]) : null;

  if (code !== null && code in KNOWN_CODES) {
    return { code, raw, ...KNOWN_CODES[code] };
  }

  const titleMatch = raw.match(/"title"\s*:\s*"([^"]+)"/);
  return {
    code,
    raw,
    title: code ? `שגיאת וואטסאפ #${code}` : "שגיאת שליחה לא מזוהה",
    explanation: titleMatch ? titleMatch[1] : "וואטסאפ החזירה שגיאה שאין לנו עדיין תרגום מוכן עבורה.",
    recommendation: "אפשר לבדוק את הפרטים הטכניים למטה, או לפנות לתמיכה עם קוד השגיאה אם קיים.",
  };
}
