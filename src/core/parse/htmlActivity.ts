import type { RawActivity } from "./classify";

/**
 * Streaming parser for the HTML flavour of My Activity / YouTube history.
 * Takeout's default export format is HTML, and DOMParser is not available in
 * web workers, so this works on strings.
 *
 * Each record looks like:
 *   <div class="outer-cell …"><div class="mdl-grid">
 *     <div class="header-cell …"><p class="mdl-typography--title">Search<br></p></div>
 *     <div class="content-cell … mdl-typography--body-1">Searched for&nbsp;<a href="…">query</a><br>Apr 12, 2023, 6:22:11 PM EDT<br></div>
 *     <div class="content-cell … mdl-typography--caption"><b>Products:</b><br>&emsp;Search<br></div>
 *   </div></div>
 */
const MARKER = '<div class="outer-cell';

export class HtmlActivitySplitter {
  private buf = "";

  constructor(private readonly onRecord: (raw: RawActivity) => void) {}

  push(chunk: string): void {
    this.buf += chunk;
    let first = this.buf.indexOf(MARKER);
    if (first < 0) {
      // Keep only a tail long enough to contain a split marker.
      if (this.buf.length > MARKER.length) this.buf = this.buf.slice(-MARKER.length);
      return;
    }
    let next = this.buf.indexOf(MARKER, first + MARKER.length);
    while (next >= 0) {
      this.emit(this.buf.slice(first, next));
      first = next;
      next = this.buf.indexOf(MARKER, first + MARKER.length);
    }
    this.buf = this.buf.slice(first);
  }

  end(): void {
    if (this.buf.startsWith(MARKER)) this.emit(this.buf);
    this.buf = "";
  }

  private emit(block: string): void {
    const raw = parseBlock(block);
    if (raw) this.onRecord(raw);
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  emsp: " ",
  ensp: " ",
  thinsp: " ",
  "#39": "'",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return m;
      const ch = String.fromCodePoint(code);
      return ch === " " ? " " : ch;
    }
    return ENTITIES[name.toLowerCase()] ?? m;
  });
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, "")).replace(/[\s  ]+/g, " ").trim();
}

export function parseBlock(block: string): RawActivity | undefined {
  const headerMatch = block.match(/<p class="mdl-typography--title">([\s\S]*?)<\/p>/);
  const header = headerMatch ? stripTags(headerMatch[1]) : undefined;

  const bodyStart = block.search(/<div class="content-cell[^"]*mdl-typography--body-1(?![^"]*text-right)[^"]*">/);
  if (bodyStart < 0) return undefined;
  const openEnd = block.indexOf(">", bodyStart) + 1;
  const close = block.indexOf("</div>", openEnd);
  const body = block.slice(openEnd, close < 0 ? undefined : close);

  const anchors: { href: string; text: string }[] = [];
  for (const m of body.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
    anchors.push({ href: decodeEntities(m[1]), text: stripTags(m[2]) });
  }

  const lines = body
    .split(/<br\s*\/?>/i)
    .map(stripTags)
    .filter(Boolean);
  if (lines.length === 0) return undefined;

  // The timestamp is the last line that parses as a date.
  let time: number | undefined;
  for (let i = lines.length - 1; i >= 1; i--) {
    time = parseActivityDate(lines[i]);
    if (time !== undefined) break;
  }

  const caption = block.match(/mdl-typography--caption">([\s\S]*?)<\/div>/);
  const details: { name: string }[] = [];
  if (caption && /google ads/i.test(caption[1])) details.push({ name: "From Google Ads" });

  const first = anchors[0];
  return {
    header,
    // For HTML we know the anchor text exactly, so put it after a neutral verb.
    title: first ? first.text : lines[0],
    titleUrl: first?.href,
    subtitles: anchors.slice(1).map((a) => ({ name: a.text, url: a.href })),
    details,
    time,
  };
}

/* ------------------------------------------------------------------------ */
/* Dates. The HTML export prints dates in the account's language.           */
/* ------------------------------------------------------------------------ */

const MONTH_PREFIXES: [string, number][] = [
  // English
  ["jan", 1], ["feb", 2], ["mar", 3], ["apr", 4], ["may", 5], ["jun", 6],
  ["jul", 7], ["aug", 8], ["sep", 9], ["oct", 10], ["nov", 11], ["dec", 12],
  // Russian (genitive forms included by prefix)
  ["янв", 1], ["фев", 2], ["мар", 3], ["апр", 4], ["мая", 5], ["май", 5], ["июн", 6],
  ["июл", 7], ["авг", 8], ["сен", 9], ["окт", 10], ["ноя", 11], ["дек", 12],
  // Ukrainian
  ["січ", 1], ["лют", 2], ["бер", 3], ["кві", 4], ["тра", 5], ["чер", 6],
  ["лип", 7], ["сер", 8], ["вер", 9], ["жов", 10], ["лис", 11], ["гру", 12],
  // Spanish / Portuguese / Italian / German / French
  ["ene", 1], ["abr", 4], ["ago", 8], ["set", 9], ["dic", 12], ["fev", 2],
  ["out", 10], ["dez", 12], ["gen", 1], ["mag", 5], ["giu", 6], ["lug", 7], ["ott", 10],
  ["mär", 3], ["mai", 5], ["okt", 10], ["janv", 1], ["févr", 2], ["fév", 2], ["avr", 4],
  ["juin", 6], ["juil", 7], ["aoû", 8], ["déc", 12],
];
// Longest prefixes first so "juin" wins over a shorter match.
MONTH_PREFIXES.sort((a, b) => b[0].length - a[0].length);

const TZ_OFFSETS_MIN: Record<string, number> = {
  UTC: 0, GMT: 0, UT: 0, Z: 0, WET: 0, WEST: 60, BST: 60, IST: 330, CET: 60, CEST: 120,
  MEZ: 60, MESZ: 120, EET: 120, EEST: 180, MSK: 180, MSD: 240, SAMT: 240, YEKT: 300,
  EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420,
  AKST: -540, AKDT: -480, HST: -600, AST: -240, ADT: -180, NST: -210, NDT: -150,
  AEST: 600, AEDT: 660, ACST: 570, ACDT: 630, AWST: 480, JST: 540, KST: 540, NZST: 720,
  NZDT: 780, SGT: 480, HKT: 480, PHT: 480, WIB: 420, ICT: 420, SAST: 120, CAT: 120,
  EAT: 180, WAT: 60, BRT: -180, ART: -180, CLT: -240, CLST: -180, COT: -300, PET: -300,
  TRT: 180, GST: 240, PKT: 300,
};

function monthFromWord(word: string): number | undefined {
  const w = word.toLowerCase().replace(/\.$/, "");
  for (const [p, m] of MONTH_PREFIXES) if (w.startsWith(p)) return m;
  return undefined;
}

/**
 * Parses dates like:
 *   "Apr 12, 2023, 6:22:11 PM EDT"      (en-US)
 *   "12 Apr 2023, 18:22:11 BST"         (en-GB)
 *   "12 апр. 2023 г., 18:22:11 MSK"     (ru)
 *   "12.04.2023, 18:22:11 GMT+03:00"    (numeric)
 *   "2023/04/12 18:22:11 JST"           (ja-style numeric)
 * Returns ms since epoch, or undefined. Without a zone, local time is assumed.
 */
export function parseActivityDate(input: string): number | undefined {
  const s = input.replace(/[   ]/g, " ").trim();
  if (s.length < 8 || s.length > 80) return undefined;

  const timeM = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?/);
  if (!timeM) return undefined;
  let hour = +timeM[1];
  const minute = +timeM[2];
  const second = timeM[3] ? +timeM[3] : 0;
  const ampm = timeM[4]?.replace(/[.\s]/g, "").toLowerCase();
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;

  const datePart = s.slice(0, timeM.index) + " " + s.slice((timeM.index ?? 0) + timeM[0].length);

  let year: number | undefined;
  let month: number | undefined;
  let day: number | undefined;

  const iso = datePart.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  const numeric = datePart.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (iso) {
    year = +iso[1];
    month = +iso[2];
    day = +iso[3];
  } else if (numeric) {
    year = +numeric[3];
    const a = +numeric[1];
    const b = +numeric[2];
    const sep = datePart[datePart.indexOf(numeric[0]) + numeric[1].length];
    // Dots and dashes are day-first everywhere; slashes are ambiguous.
    if (sep === "/" && a <= 12 && b > 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
  } else {
    const yearM = datePart.match(/\b(19\d{2}|20\d{2})\b/);
    if (!yearM) return undefined;
    year = +yearM[1];
    for (const word of datePart.match(/\p{L}+\.?/gu) ?? []) {
      month = monthFromWord(word);
      if (month) break;
    }
    const withoutYear = datePart.replace(yearM[0], " ");
    const dayM = withoutYear.match(/\b(\d{1,2})\b/);
    if (dayM) day = +dayM[1];
  }

  if (!year || !month || !day || month > 12 || day > 31 || hour > 23 || minute > 59) return undefined;

  // Zone: "GMT+03:00", "UTC-5", or an abbreviation.
  let offsetMin: number | undefined;
  const gmt = s.match(/(?:GMT|UTC)\s?([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (gmt) {
    offsetMin = (gmt[1] === "-" ? -1 : 1) * (+gmt[2] * 60 + (gmt[3] ? +gmt[3] : 0));
  } else {
    const abbr = s.match(/\b([A-Z]{2,5})\s*$/);
    if (abbr && abbr[1] in TZ_OFFSETS_MIN) offsetMin = TZ_OFFSETS_MIN[abbr[1]];
  }

  if (offsetMin === undefined) {
    const t = new Date(year, month - 1, day, hour, minute, second).getTime();
    return Number.isNaN(t) ? undefined : t;
  }
  return Date.UTC(year, month - 1, day, hour, minute, second) - offsetMin * 60_000;
}
