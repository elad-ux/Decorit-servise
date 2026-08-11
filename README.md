# Decorit — פאנל ניהול (GitHub Pages)

אתר סטטי (Vite + React + TypeScript) שמחליף בהדרגה את דשבורד ה-Appsmith
הקיים. רקע מלא, ארכיטקטורה, ומפת עמודים: ראו את איפיון המערכת (בלוק
תכנון שפורסם בשיחה שהובילה לקוד הזה).

**שלב נוכחי (Phase 1 — PoC):** Login (OTP בוואטסאפ) + Hub. שאר המודולים
(מכולות, מוצרים, משתמשים, תפוצות) מסומנים "בקרוב" ב-Hub — עדיין לא בנויים.

## פיתוח מקומי

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # tsc --noEmit && vite build → dist/
```

## Deploy

`.github/workflows/deploy.yml` בונה ופורס אוטומטית ל-GitHub Pages בכל push
ל-`main`. יש להפעיל GitHub Pages בהגדרות הריפו (Settings → Pages → Source:
GitHub Actions) פעם אחת.

## אבטחה

לפני שנוגעים בקוד — קראו את [`SECURITY.md`](./SECURITY.md). זה כולל את מודל
האמון (client לא מהימן, n8n הוא שכבת האכיפה האמיתית), מה מומש כאן, ומה עדיין
פתוח/לא מאומת (במיוחד: **CORS מול n8n לא נבדק בפועל מסביבת הבנייה הזו** —
צריך לאמת בדפדפן אמיתי לפני שממשיכים לשלב הבא).
