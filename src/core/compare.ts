import type { EventKind, MatchEntry, MatchFile, Namespace, Profile } from "./types";
import {
  GENERIC_QUERIES,
  GENERIC_SITE_LIST,
  isGenericQuery,
  isGenericSite,
  isStopword,
} from "./normalize";
import { checkTag, deriveKey, itemMessage, shareableItems, tagAll, type ShareOptions } from "./matchfile";

export interface Side {
  count: number;
  first?: number;
  last?: number;
}

export interface SharedItem {
  ns: Namespace;
  key: string;
  label: string;
  extra?: string;
  mine: Side;
  theirs: Side;
  /** Ranking score: higher is more interesting. */
  score: number;
  generic: boolean;
  /** Smallest number of days between one of your days and one of theirs. */
  gap?: number;
  gapMine?: number;
  gapTheirs?: number;
}

export interface CategoryOverlap {
  ns: Namespace;
  mine: number;
  theirs: number;
  shared: number;
  /** Cosine similarity of log counts, generic items excluded (0..1). */
  similarity: number;
}

export interface Rhythm {
  mineHours: number[];
  theirHours: number[];
  hourSimilarity: number;
  minePeak: number;
  theirPeak: number;
  /** Share of activity between 23:00 and 04:59. */
  mineNight: number;
  theirNight: number;
  mineWeekdays: number[];
  theirWeekdays: number[];
  weekdaySimilarity: number;
}

export interface Comparison {
  myName: string;
  friendName: string;
  friendCreatedAt: string;
  score: number;
  overlap: CategoryOverlap[];
  shared: Record<Namespace, SharedItem[]>;
  /** Shared keywords with the ones already explained by a shared search or a longer phrase removed. */
  topics: SharedItem[];
  coincidences: SharedItem[];
  rhythm: Rhythm;
  firsts: { mine: number; theirs: number; biggestLead?: { item: SharedItem; days: number; who: "me" | "them" } };
  myTotals: Record<EventKind, number>;
  theirTotals: Record<EventKind, number>;
  myYears: Record<string, number>;
  theirYears: Record<string, number>;
  myRange: [number | undefined, number | undefined];
  theirRange: [number | undefined, number | undefined];
}

export class CodeWordMismatch extends Error {
  constructor() {
    super("The code word doesn't match the one your friend used. Check it with them and try again.");
  }
}

function isGeneric(ns: Namespace, key: string): boolean {
  switch (ns) {
    case "q":
    case "yq":
    case "mq":
      return isGenericQuery(key);
    case "w":
      return isGenericQuery(key) || isStopword(key) || key.length <= 2;
    case "site":
      return isGenericSite(key);
    default:
      return false;
  }
}

function specificity(ns: Namespace, key: string, generic: boolean): number {
  if (generic) return 0.05;
  switch (ns) {
    case "q":
    case "yq":
    case "mq": {
      const words = key.split(" ").length;
      if (words === 1) return 0.6;
      if (words === 2) return 1;
      return Math.min(1.8, 1.3 + 0.1 * (words - 3));
    }
    case "w":
      return key.includes(" ") ? 1.6 : key.length <= 3 ? 0.5 : 1;
    case "v":
      return 2;
    case "sub":
      return 1.5;
    case "art":
      return 1.3;
    case "song":
      return 1.6;
    default:
      return 1;
  }
}

/** Smallest |a - b| over two sorted arrays, with the pair that achieves it. */
export function closestGap(a: number[], b: number[]): { gap: number; a: number; b: number } | undefined {
  if (!a.length || !b.length) return undefined;
  let i = 0;
  let j = 0;
  let best = { gap: Infinity, a: a[0], b: b[0] };
  while (i < a.length && j < b.length) {
    const g = Math.abs(a[i] - b[j]);
    if (g < best.gap) best = { gap: g, a: a[i], b: b[j] };
    if (best.gap === 0) break;
    if (a[i] < b[j]) i++;
    else j++;
  }
  return best;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function peak(hours: number[]): number {
  let best = 0;
  for (let h = 1; h < 24; h++) if (hours[h] > hours[best]) best = h;
  return best;
}

function nightShare(hours: number[]): number {
  const total = hours.reduce((s, x) => s + x, 0);
  if (!total) return 0;
  const night = [23, 0, 1, 2, 3, 4].reduce((s, h) => s + hours[h], 0);
  return night / total;
}

/** How much each category counts towards the single "in common" score. */
const SCORE_WEIGHTS: Partial<Record<Namespace, number>> = { w: 3, art: 2.5, ch: 2, site: 1.5, q: 1, v: 1, sub: 1, song: 1, yq: 0.5 };

/**
 * Compare your own (plaintext) profile against a friend's match file.
 * `opts` must be the same settings you used for your own match file, so both
 * sides see the same overlap.
 */
export async function compare(
  profile: Profile,
  opts: ShareOptions,
  friend: MatchFile,
  onProgress?: (done: number, total: number) => void,
): Promise<Comparison> {
  const key = await deriveKey(opts.codeWord);
  if ((await checkTag(key)) !== friend.check) throw new CodeWordMismatch();

  // Only compare categories both sides chose to share.
  const include = opts.include.filter((ns) => friend.items[ns] !== undefined);
  const rows = [...shareableItems(profile, { include, hideWords: opts.hideWords })];
  const tags = await tagAll(
    key,
    rows.map(([ns, k]) => itemMessage(ns, k)),
    onProgress,
  );

  // Tags of well-known generic items, so they can be left out of the friend's side of the score too.
  const genericTagLists = await Promise.all(
    (["q", "yq", "mq", "w", "site"] as Namespace[]).map(async (ns) => {
      const keys = ns === "site" ? GENERIC_SITE_LIST : GENERIC_QUERIES;
      return [ns, new Set(await tagAll(key, keys.map((k) => itemMessage(ns, k))))] as const;
    }),
  );
  const genericTags = new Map<Namespace, Set<string>>(genericTagLists);

  const shared = { q: [], yq: [], mq: [], w: [], ch: [], sub: [], v: [], site: [], art: [], song: [] } as Record<Namespace, SharedItem[]>;
  const dot: Partial<Record<Namespace, number>> = {};
  const normMine: Partial<Record<Namespace, number>> = {};
  const mineCount: Partial<Record<Namespace, number>> = {};
  let mineFirst = 0;
  let theirsFirst = 0;
  let biggestLead: Comparison["firsts"]["biggestLead"];

  rows.forEach(([ns, k, it], i) => {
    mineCount[ns] = (mineCount[ns] ?? 0) + 1;
    const generic = isGeneric(ns, k);
    const wMine = Math.log1p(it.count);
    if (!generic) normMine[ns] = (normMine[ns] ?? 0) + wMine * wMine;

    const theirs: MatchEntry | undefined = friend.items[ns]?.[tags[i]];
    if (!theirs) return;

    const wTheirs = Math.log1p(theirs.c);
    if (!generic) dot[ns] = (dot[ns] ?? 0) + wMine * wTheirs;

    const close = closestGap(it.days, theirs.d);
    const item: SharedItem = {
      ns,
      key: k,
      label: it.label,
      extra: it.extra,
      mine: { count: it.count, first: it.days[0], last: it.days[it.days.length - 1] },
      theirs: { count: theirs.c, first: theirs.d[0], last: theirs.d[theirs.d.length - 1] },
      score: Math.sqrt(it.count * theirs.c) * specificity(ns, k, generic),
      generic,
      gap: close?.gap,
      gapMine: close?.a,
      gapTheirs: close?.b,
    };
    shared[ns].push(item);

    if ((ns === "q" || ns === "yq" || ns === "ch") && !generic && item.mine.first !== undefined && item.theirs.first !== undefined) {
      const lead = item.theirs.first - item.mine.first;
      if (lead > 0) mineFirst++;
      else if (lead < 0) theirsFirst++;
      if (Math.min(item.mine.count, item.theirs.count) >= 2 && ns !== "ch") {
        if (!biggestLead || Math.abs(lead) > biggestLead.days) {
          biggestLead = { item, days: Math.abs(lead), who: lead >= 0 ? "me" : "them" };
        }
      }
    }
  });

  for (const ns of Object.keys(shared) as Namespace[]) shared[ns].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  const overlap: CategoryOverlap[] = include.map((ns) => {
    const theirsItems = friend.items[ns] ?? {};
    const gen = genericTags.get(ns);
    let normTheirs = 0;
    for (const [t, e] of Object.entries(theirsItems)) {
      if (gen?.has(t)) continue;
      const w = Math.log1p(e.c);
      normTheirs += w * w;
    }
    const nm = normMine[ns] ?? 0;
    const similarity = nm && normTheirs ? Math.min(1, (dot[ns] ?? 0) / Math.sqrt(nm * normTheirs)) : 0;
    return {
      ns,
      mine: mineCount[ns] ?? 0,
      theirs: friend.uniques[ns] ?? Object.keys(theirsItems).length,
      shared: shared[ns].length,
      similarity,
    };
  });

  // Same search or video, within a few days of each other, and rare for both of you.
  const coincidences = (["q", "yq", "v", "mq"] as Namespace[])
    .flatMap((ns) => shared[ns])
    .filter(
      (it) =>
        !it.generic &&
        it.gap !== undefined &&
        it.gap <= 3 &&
        it.mine.count <= 12 &&
        it.theirs.count <= 12 &&
        (it.ns === "v" || it.key.includes(" ")),
    )
    .sort((a, b) => a.gap! - b.gap! || b.score - a.score)
    .slice(0, 12);

  const topics = distinctTopics(shared.w.filter((x) => !x.generic), shared.q);

  const rhythm: Rhythm = {
    mineHours: profile.hours,
    theirHours: friend.hours,
    hourSimilarity: cosine(profile.hours, friend.hours),
    minePeak: peak(profile.hours),
    theirPeak: peak(friend.hours),
    mineNight: nightShare(profile.hours),
    theirNight: nightShare(friend.hours),
    mineWeekdays: profile.weekdays,
    theirWeekdays: friend.weekdays,
    weekdaySimilarity: cosine(profile.weekdays, friend.weekdays),
  };

  let weighted = 0;
  let weights = 0;
  for (const o of overlap) {
    const w = SCORE_WEIGHTS[o.ns];
    if (!w || !o.mine || !o.theirs) continue;
    weighted += w * o.similarity;
    weights += w;
  }
  // Daily rhythm counts a little; most people are awake at similar times, so rescale.
  const rhythmPart = Math.max(0, (rhythm.hourSimilarity - 0.5) * 2);
  weighted += 0.5 * rhythmPart * rhythmPart;
  weights += 0.5;
  const score = weights ? Math.round(100 * Math.sqrt(weighted / weights)) : 0;

  return {
    myName: opts.name.trim() || "You",
    friendName: friend.name,
    friendCreatedAt: friend.createdAt,
    score,
    overlap,
    shared,
    topics,
    coincidences,
    rhythm,
    firsts: { mine: mineFirst, theirs: theirsFirst, biggestLead },
    myTotals: profile.totals,
    theirTotals: friend.totals,
    myYears: profile.years,
    theirYears: friend.years,
    myRange: [profile.firstDay, profile.lastDay],
    theirRange: [friend.firstDay, friend.lastDay],
  };
}

const covers = (outer: SharedItem, inner: SharedItem) =>
  ` ${outer.key} `.includes(` ${inner.key} `) &&
  outer.mine.count >= 0.8 * inner.mine.count &&
  outer.theirs.count >= 0.8 * inner.theirs.count;

/**
 * "sourdough", "hydration" and "sourdough hydration" all come from the one
 * search "sourdough hydration calculator". Keep only keywords that tell you
 * something the exact searches and longer phrases don't.
 */
export function distinctTopics(words: SharedItem[], searches: SharedItem[]): SharedItem[] {
  const phrases = words.filter((w) => w.key.includes(" "));
  return words.filter((w) => {
    if (searches.some((q) => covers(q, w))) return false;
    if (!w.key.includes(" ") && phrases.some((p) => covers(p, w))) return false;
    return true;
  });
}
