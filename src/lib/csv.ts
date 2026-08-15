/**
 * Minimal RFC4180-ish CSV parser (quoted fields, embedded commas/newlines,
 * doubled-quote escaping) — good enough for spreadsheet exports, without
 * pulling in a library. Auto-detects comma vs semicolon delimiter from the
 * header line, since Hebrew-locale Excel often exports semicolon-separated
 * CSVs. Returns rows keyed by the header row (first line).
 */
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, "");
  const rows = parseCsvRows(clean);
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = (r[i] ?? "").trim();
      });
      return obj;
    });
}

/** Builds RFC4180 CSV text (quoting fields that need it) from a header row + data rows, with a BOM so Excel opens Hebrew content correctly. */
export function buildCsv(headers: string[], rows: string[][]): string {
  const escape = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [headers, ...rows].map((r) => r.map(escape).join(","));
  return "﻿" + lines.join("\r\n");
}

/** Triggers a browser download of CSV text — file never touches a server, built and saved entirely client-side. */
export function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Some browsers only honor `download` reliably when the anchor is in the DOM at click time.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseCsvRows(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignore — \n (or end of input) closes the row
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
