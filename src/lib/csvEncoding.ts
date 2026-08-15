// Hebrew CSV files exported from older/localized Excel or DOS-era tools
// commonly use a legacy single-byte encoding instead of UTF-8. The browser's
// File.text() API always assumes UTF-8 and silently corrupts anything else
// into replacement characters (�) rather than throwing — so a bad-encoding
// file fails import with a confusing "missing business name" error instead
// of the real cause. This module reads the raw bytes and tries several
// candidate encodings, scoring each by how many known Hebrew header words
// it recovers, and picks the best match.

const CP862_TABLE: Record<number, number> = {
  128: 0x05d0, 129: 0x05d1, 130: 0x05d2, 131: 0x05d3, 132: 0x05d4, 133: 0x05d5,
  134: 0x05d6, 135: 0x05d7, 136: 0x05d8, 137: 0x05d9, 138: 0x05da, 139: 0x05db,
  140: 0x05dc, 141: 0x05dd, 142: 0x05de, 143: 0x05df, 144: 0x05e0, 145: 0x05e1,
  146: 0x05e2, 147: 0x05e3, 148: 0x05e4, 149: 0x05e5, 150: 0x05e6, 151: 0x05e7,
  152: 0x05e8, 153: 0x05e9, 154: 0x05ea,
};

export function decodeCp862(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    if (b < 128) out += String.fromCharCode(b);
    else out += String.fromCodePoint(CP862_TABLE[b] ?? 0xfffd);
  }
  return out;
}

const CANDIDATE_LABELS = ["utf-8", "windows-1255", "iso-8859-8"] as const;

const HEADER_HINTS = ["שם", "עסק", "טלפון", "עיר", "קטגור", "איש קשר"];

function scoreDecoded(text: string): number {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const replacementCount = (text.match(/�/g) || []).length;
  const hintMatches = HEADER_HINTS.filter((w) => firstLine.includes(w)).length;
  return hintMatches * 100 - replacementCount;
}

export type CsvDecodeResult = {
  text: string;
  encoding: string;
  confident: boolean;
  alternatives: { encoding: string; text: string }[];
};

const ENCODING_LABELS: Record<string, string> = {
  "utf-8": "UTF-8",
  "windows-1255": "Windows-1255 (עברית, אקסל רגיל)",
  "iso-8859-8": "ISO-8859-8 (עברית)",
  cp862: "CP862 (עברית DOS ישנה)",
};

export function decodeCsvBytes(buffer: ArrayBuffer): CsvDecodeResult {
  const bytes = new Uint8Array(buffer);
  const candidates: { encoding: string; text: string }[] = [];

  for (const label of CANDIDATE_LABELS) {
    try {
      const decoder = new TextDecoder(label, { fatal: false });
      candidates.push({ encoding: label, text: decoder.decode(bytes) });
    } catch {
      // Label unsupported in this browser — skip it.
    }
  }
  candidates.push({ encoding: "cp862", text: decodeCp862(bytes) });

  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = scoreDecoded(c.text);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }

  return {
    text: best.text,
    encoding: best.encoding,
    confident: bestScore > 0,
    alternatives: candidates.filter((c) => c.encoding !== best.encoding),
  };
}

export function encodingDisplayName(encoding: string): string {
  return ENCODING_LABELS[encoding] || encoding;
}

export const ENCODING_OPTIONS = ["utf-8", "windows-1255", "iso-8859-8", "cp862"] as const;
