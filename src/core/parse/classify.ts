import type { HistoryEvent } from "../types";
import { isGoogleInternal } from "../normalize";

/** One My Activity record, as found in Takeout JSON (HTML is converted to this shape). */
export interface RawActivity {
  header?: string;
  title?: string;
  titleUrl?: string;
  subtitles?: { name?: string; url?: string }[];
  details?: { name?: string }[];
  /** ISO string in JSON exports, already parsed to ms for HTML exports. */
  time?: string | number;
  products?: string[];
}

/** Leading verbs Google puts in front of titles, in the languages we have seen. */
const TITLE_PREFIXES = [
  "Watched ",
  "Searched for ",
  "Visited ",
  "Viewed ",
  "Просмотрено: ",
  "Просмотрено ",
  "Вы смотрели ",
  "Вы искали ",
  "Искали ",
  "Посещено: ",
  "Переглянуто: ",
  "Переглянуто ",
  "Шукали ",
  "Ha visto ",
  "Has visto ",
  "Has buscado ",
  "Assistiu a ",
  "Pesquisou ",
  "A regardé ",
  "A recherché ",
  "Angesehen: ",
  "Gesucht nach: ",
  "Hai guardato ",
  "Hai cercato ",
];

export function stripVerb(title: string): string {
  for (const p of TITLE_PREFIXES) {
    if (title.startsWith(p)) return title.slice(p.length).trim();
  }
  return title.trim();
}

function parseUrl(s: string | undefined): URL | undefined {
  if (!s) return undefined;
  try {
    return new URL(s);
  } catch {
    return undefined;
  }
}

function isAd(raw: RawActivity): boolean {
  if (raw.details?.some((d) => d.name && /google ads|from google ad/i.test(d.name))) return true;
  const u = raw.titleUrl ?? "";
  return u.includes("googleadservices.com") || u.includes("doubleclick.net") || u.includes("/aclk?");
}

function timeOf(raw: RawActivity): number | undefined {
  if (typeof raw.time === "number") return Number.isFinite(raw.time) ? raw.time : undefined;
  if (typeof raw.time === "string") {
    const t = Date.parse(raw.time);
    return Number.isNaN(t) ? undefined : t;
  }
  return undefined;
}

const YT_HOSTS = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/;
const GOOGLE_HOST = /(^|\.)google\.[a-z.]+$/;

/** Channel id from "https://www.youtube.com/channel/UCxxxx". */
export function channelIdOf(url: string | undefined): string | undefined {
  const m = url?.match(/youtube\.com\/channel\/(UC[\w-]{10,})/);
  return m?.[1];
}

/**
 * Turn a My Activity record into a history event, or undefined if it is not
 * something we compare (ads, removed videos, assistant commands, …).
 * Classification is by URL, which is the same in every language.
 */
export function classify(raw: RawActivity): HistoryEvent | undefined {
  if (isAd(raw)) return undefined;
  const url = parseUrl(raw.titleUrl);
  const time = timeOf(raw);
  const title = raw.title ?? "";
  const header = (raw.header ?? "").toLowerCase();

  if (!url) {
    // A few old search records have no link; fall back to the English verb.
    if (title.startsWith("Searched for ") && header !== "youtube") {
      const q = title.slice("Searched for ".length).trim();
      return q ? { kind: "search", text: q, time } : undefined;
    }
    return undefined;
  }

  const host = url.hostname.toLowerCase();

  if (YT_HOSTS.test(host)) {
    let videoId: string | undefined;
    if (host.endsWith("youtu.be")) videoId = url.pathname.slice(1) || undefined;
    else if (url.pathname === "/watch") videoId = url.searchParams.get("v") ?? undefined;
    else {
      const shorts = url.pathname.match(/^\/shorts\/([\w-]+)/);
      if (shorts) videoId = shorts[1];
    }
    if (videoId) {
      const ch = raw.subtitles?.[0];
      return {
        kind: "ytWatch",
        text: stripVerb(title) || videoId,
        url: raw.titleUrl,
        time,
        videoId,
        music: host === "music.youtube.com" || header === "youtube music" || undefined,
        channel: ch?.name?.trim() || undefined,
        channelId: channelIdOf(ch?.url),
      };
    }
    if (url.pathname === "/results") {
      const q = url.searchParams.get("search_query") ?? url.searchParams.get("q");
      return q?.trim() ? { kind: "ytSearch", text: q.trim(), time } : undefined;
    }
    return undefined;
  }

  if (GOOGLE_HOST.test(host)) {
    if (url.pathname.startsWith("/maps")) {
      const m = url.pathname.match(/^\/maps\/search\/([^/@]+)/);
      const q = m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : url.searchParams.get("q");
      return q?.trim() ? { kind: "mapsSearch", text: q.trim(), time } : undefined;
    }
    if (url.pathname === "/search" || url.pathname === "/webhp") {
      const q = url.searchParams.get("q");
      return q?.trim() ? { kind: "search", text: q.trim(), time } : undefined;
    }
    if (url.pathname === "/url") {
      const target = url.searchParams.get("q") ?? url.searchParams.get("url");
      if (target && /^https?:\/\//i.test(target) && !isGoogleInternal(target)) {
        return { kind: "visit", text: stripVerb(title), url: target, time };
      }
      return undefined;
    }
    return undefined;
  }

  if ((url.protocol === "http:" || url.protocol === "https:") && !isGoogleInternal(url.href)) {
    return { kind: "visit", text: stripVerb(title), url: url.href, time };
  }
  return undefined;
}
