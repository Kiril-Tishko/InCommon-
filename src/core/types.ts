/**
 * Shared data model.
 *
 * Raw Takeout files are parsed into `HistoryEvent`s, which are folded into a
 * plaintext `Profile` that never leaves the device. A `MatchFile` is the only
 * thing a person sends to a friend: every item in it is an HMAC keyed by a
 * code word both friends agreed on, so the friend can only recognise items
 * they also have.
 */

export type EventKind =
  | "search" // Google Search query
  | "ytWatch" // YouTube / YouTube Music video watched
  | "ytSearch" // YouTube search query
  | "visit" // a website visited (from Search clicks, Chrome, etc.)
  | "mapsSearch" // Google Maps search
  | "ytSub" // YouTube channel subscription (no timestamp)
  | "musicPlay"; // a song played (Spotify, or music recognised on YouTube / YouTube Music)

export interface HistoryEvent {
  kind: EventKind;
  /** Primary text: query, video title, page title, channel name. */
  text: string;
  url?: string;
  /** Milliseconds since epoch, or undefined if the export had no parseable time. */
  time?: number;
  /** YouTube channel name, for ytWatch / ytSub. */
  channel?: string;
  /** YouTube channel id (UC…), when known. */
  channelId?: string;
  /** YouTube video id, for ytWatch. */
  videoId?: string;
  /** True when the record came from YouTube Music. */
  music?: boolean;
  /** For musicPlay. */
  artist?: string;
  track?: string;
}

/**
 * Item namespaces. Each namespace is compared separately.
 *  q    – exact Google searches
 *  yq   – exact YouTube searches
 *  mq   – exact Maps searches
 *  w    – keywords and two-word phrases from all searches
 *  ch   – YouTube channels watched
 *  sub  – YouTube channels subscribed to
 *  v    – YouTube videos watched
 *  site – websites (registrable domain)
 *  art  – music artists
 *  song – songs ("artist — title")
 */
export type Namespace = "q" | "yq" | "mq" | "w" | "ch" | "sub" | "v" | "site" | "art" | "song";

export const NAMESPACES: Namespace[] = ["q", "yq", "mq", "w", "ch", "sub", "v", "site", "art", "song"];

export interface ItemStat {
  count: number;
  /** Sorted unique local day numbers (days since 1970-01-01) on which it happened. */
  days: number[];
  /** Human-readable label (original casing of the most common spelling). */
  label: string;
  /** Extra display info, e.g. the channel of a video. */
  extra?: string;
}

export interface Profile {
  version: 1;
  createdAt: string;
  /** IANA time zone used for hours and days. */
  tz: string;
  firstDay?: number;
  lastDay?: number;
  totals: Record<EventKind, number>;
  items: Record<Namespace, Record<string, ItemStat>>;
  /** Events per local hour of day (0–23). */
  hours: number[];
  /** Events per local weekday (0 = Sunday). */
  weekdays: number[];
  /** Events per calendar year. */
  years: Record<string, number>;
  /** Files that were recognised, for the import report. */
  sources: SourceReport[];
}

export interface SourceReport {
  path: string;
  format: "activity-json" | "activity-html" | "chrome-json" | "subscriptions-csv" | "spotify-json";
  events: number;
  /** Earliest and latest timestamp in the file (ms), when it has any. */
  first?: number;
  last?: number;
}

/** Per-item entry inside a match file. */
export interface MatchEntry {
  /** count */
  c: number;
  /** sampled day numbers (first, last and evenly spaced in between) */
  d: number[];
}

export interface MatchFile {
  app: "incommon";
  version: 1;
  /** Normalisation version; both sides must match for hashes to line up. */
  norm: number;
  name: string;
  createdAt: string;
  /** Short fingerprint of the code word, so a mismatch is reported instead of "nothing in common". */
  check: string;
  totals: Record<EventKind, number>;
  uniques: Partial<Record<Namespace, number>>;
  hours: number[];
  weekdays: number[];
  years: Record<string, number>;
  firstDay?: number;
  lastDay?: number;
  items: Partial<Record<Namespace, Record<string, MatchEntry>>>;
}

export function emptyTotals(): Record<EventKind, number> {
  return { search: 0, ytWatch: 0, ytSearch: 0, visit: 0, mapsSearch: 0, ytSub: 0, musicPlay: 0 };
}

export function emptyItems(): Record<Namespace, Record<string, ItemStat>> {
  return { q: {}, yq: {}, mq: {}, w: {}, ch: {}, sub: {}, v: {}, site: {}, art: {}, song: {} };
}
