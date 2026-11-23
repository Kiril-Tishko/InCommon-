import {
  emptyItems,
  emptyTotals,
  type HistoryEvent,
  type ItemStat,
  type Namespace,
  type Profile,
  type SourceReport,
} from "./types";
import { keywordsAndPhrases, localDay, normalizeText, siteOf } from "./normalize";
import { artistKey, cleanTrack, musicFromWatch, songKey } from "./music";

interface Building {
  count: number;
  days: number[];
  label: string;
  extra?: string;
}

/** Folds history events into a Profile. Duplicate events (same thing, same moment) are counted once. */
export class ProfileBuilder {
  private readonly items: Record<Namespace, Map<string, Building>> = {
    q: new Map(), yq: new Map(), mq: new Map(), w: new Map(), ch: new Map(), sub: new Map(), v: new Map(), site: new Map(),
    art: new Map(), song: new Map(),
  };
  private readonly totals = emptyTotals();
  private readonly hours = new Array<number>(24).fill(0);
  private readonly weekdays = new Array<number>(7).fill(0);
  private readonly years: Record<string, number> = {};
  private readonly seen = new Set<string>();
  private firstDay?: number;
  private lastDay?: number;
  readonly sources: SourceReport[] = [];

  get eventCount(): number {
    return this.seen.size;
  }

  add(e: HistoryEvent): void {
    const id =
      e.kind === "musicPlay"
        ? songKey(e.artist ?? "", e.track ?? e.text)
        : (e.videoId ?? e.channelId ?? (e.kind === "visit" ? e.url : normalizeText(e.text)));
    // My Activity and YouTube history overlap, as do My Activity and Chrome; collapse to the same second.
    const dedupe = `${e.kind}|${id}|${e.time === undefined ? "" : Math.floor(e.time / 1000)}`;
    if (this.seen.has(dedupe)) return;
    this.seen.add(dedupe);

    this.totals[e.kind]++;
    let day: number | undefined;
    if (e.time !== undefined) day = localDay(e.time);
    // Rhythm and date range describe Google activity; a year of Spotify plays would drown it out.
    if (e.time !== undefined && day !== undefined && e.kind !== "musicPlay") {
      const d = new Date(e.time);
      this.hours[d.getHours()]++;
      this.weekdays[d.getDay()]++;
      const y = String(d.getFullYear());
      this.years[y] = (this.years[y] ?? 0) + 1;
      if (this.firstDay === undefined || day < this.firstDay) this.firstDay = day;
      if (this.lastDay === undefined || day > this.lastDay) this.lastDay = day;
    }

    switch (e.kind) {
      case "search":
      case "ytSearch":
      case "mapsSearch": {
        const key = normalizeText(e.text);
        if (!key) return;
        const ns: Namespace = e.kind === "search" ? "q" : e.kind === "ytSearch" ? "yq" : "mq";
        this.bump(ns, key, e.text.trim(), day);
        for (const w of keywordsAndPhrases(key)) this.bump("w", w, w, day);
        return;
      }
      case "ytWatch": {
        if (e.videoId) this.bump("v", e.videoId, e.text, day, e.channel);
        const ch = e.channelId ?? (e.channel ? normalizeText(e.channel) : "");
        if (ch) this.bump("ch", ch, e.channel ?? ch, day);
        const song = musicFromWatch(e);
        if (song) {
          this.totals.musicPlay++;
          this.bumpMusic(song.artist, song.track, day);
        }
        return;
      }
      case "musicPlay": {
        if (e.artist && e.track) this.bumpMusic(e.artist, e.track, day);
        return;
      }
      case "ytSub": {
        const ch = e.channelId ?? normalizeText(e.text);
        if (ch) this.bump("sub", ch, e.channel ?? e.text, day);
        return;
      }
      case "visit": {
        const site = e.url ? siteOf(e.url) : undefined;
        if (site) this.bump("site", site, site, day);
        return;
      }
    }
  }

  private bumpMusic(artist: string, track: string, day: number | undefined): void {
    const a = artistKey(artist);
    const t = cleanTrack(track);
    if (!a || !t) return;
    this.bump("art", a, artist.trim(), day);
    this.bump("song", songKey(artist, track), t, day, artist.trim());
  }

  private bump(ns: Namespace, key: string, label: string, day: number | undefined, extra?: string): void {
    const map = this.items[ns];
    let it = map.get(key);
    if (!it) {
      it = { count: 0, days: [], label: label || key, extra };
      map.set(key, it);
    } else if (!it.extra && extra) {
      it.extra = extra;
    }
    it.count++;
    if (day !== undefined) it.days.push(day);
  }

  finish(): Profile {
    const items = emptyItems();
    for (const ns of Object.keys(this.items) as Namespace[]) {
      const out: Record<string, ItemStat> = {};
      for (const [key, b] of this.items[ns]) {
        const days = uniqueSorted(b.days);
        out[key] = b.extra ? { count: b.count, days, label: b.label, extra: b.extra } : { count: b.count, days, label: b.label };
      }
      items[ns] = out;
    }
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      firstDay: this.firstDay,
      lastDay: this.lastDay,
      totals: { ...this.totals },
      items,
      hours: [...this.hours],
      weekdays: [...this.weekdays],
      years: { ...this.years },
      sources: [...this.sources],
    };
  }
}

function uniqueSorted(days: number[]): number[] {
  if (days.length <= 1) return days.slice();
  const s = days.slice().sort((a, b) => a - b);
  const out = [s[0]];
  for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1]) out.push(s[i]);
  return out;
}

export interface RankedItem extends ItemStat {
  key: string;
}

export function topItems(profile: Profile, ns: Namespace, n: number, filter?: (it: RankedItem) => boolean): RankedItem[] {
  const all: RankedItem[] = [];
  for (const [key, it] of Object.entries(profile.items[ns])) {
    const r = { key, ...it };
    if (!filter || filter(r)) all.push(r);
  }
  all.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return all.slice(0, n);
}

export function profileEventTotal(p: Profile): number {
  return Object.values(p.totals).reduce((a, b) => a + b, 0);
}

/** Fill in anything a profile saved by an older version of the app is missing. */
export function upgradeProfile(p: Profile): Profile {
  const items = { ...emptyItems(), ...p.items };
  return { ...p, items, totals: { ...emptyTotals(), ...p.totals } };
}

function mergeDays(a: number[], b: number[]): number[] {
  return uniqueSorted([...a, ...b]);
}

/**
 * Combine two profiles, e.g. a Google export and a Spotify export loaded at
 * different times. Loading the same files twice would double-count them.
 */
export function mergeProfiles(a: Profile, b: Profile): Profile {
  const x = upgradeProfile(a);
  const y = upgradeProfile(b);
  const items = emptyItems();
  for (const ns of Object.keys(items) as Namespace[]) {
    const out: Record<string, ItemStat> = { ...x.items[ns] };
    for (const [key, it] of Object.entries(y.items[ns])) {
      const prev = out[key];
      out[key] = prev
        ? { ...prev, count: prev.count + it.count, days: mergeDays(prev.days, it.days), extra: prev.extra ?? it.extra }
        : it;
    }
    items[ns] = out;
  }
  const sum = (u: number[], v: number[]) => u.map((n, i) => n + (v[i] ?? 0));
  const years: Record<string, number> = { ...x.years };
  for (const [k, n] of Object.entries(y.years)) years[k] = (years[k] ?? 0) + n;
  const totals = emptyTotals();
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = x.totals[k] + y.totals[k];
  const minDay = [x.firstDay, y.firstDay].filter((d): d is number => d !== undefined);
  const maxDay = [x.lastDay, y.lastDay].filter((d): d is number => d !== undefined);
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    tz: x.tz,
    firstDay: minDay.length ? Math.min(...minDay) : undefined,
    lastDay: maxDay.length ? Math.max(...maxDay) : undefined,
    totals,
    items,
    hours: sum(x.hours, y.hours),
    weekdays: sum(x.weekdays, y.weekdays),
    years,
    sources: [...x.sources, ...y.sources],
  };
}
