/**
 * Text normalisation. Both friends must produce byte-identical keys for the
 * same search, so everything here is deterministic and locale-independent.
 * Bump NORM_VERSION whenever the output of any function here changes.
 */

export const NORM_VERSION = 1;

const COMBINING_MARKS = /\p{M}+/gu;
const NON_WORD = /[^\p{L}\p{N}]+/gu;

/** "How to cook RICE?!" -> "how to cook rice" */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(NON_WORD, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Words that say nothing about a person's interests. Multilingual, deliberately broad. */
const STOPWORDS = new Set(
  (
    // English
    "a an the and or but if of to in on at by for with from as is are was were be been being am do does did done " +
    "i me my mine you your yours he him his she her it its we us our they them their this that these those there here " +
    "what which who whom whose when where why how not no yes can could should would will shall may might must " +
    "so than then too very just also about into over under up down out off again more most some any all each other " +
    "such own same only both few many much own s t d ll m re ve y o " +
    // search filler
    "best top good vs versus near nearby me online free download near meaning definition define translate translation " +
    "price prices cheap buy review reviews new 2010 2011 2012 2013 2014 2015 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025 2026 2027 " +
    "www com http https html org net app get make like using use way ways time today tomorrow yesterday " +
    // Russian / Ukrainian
    "и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему " +
    "теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между " +
    "як що це та але для від до на не так чи у в з за по про її його їх ми ви вони він вона воно я ти є був була було бути або коли де чому який яка яке які " +
    // Spanish / Portuguese / French / German / Italian (basics)
    "el la los las un una unos unas de del y o en que por para con sin es son como mas pero su sus al lo le les se " +
    "o os as um uma do da dos das em no na nos nas com por para que e é " +
    "le la les un une des du de et ou en dans sur pour par avec sans est sont ce cette ces qui que quoi comment " +
    "der die das ein eine einer eines und oder in im an am auf mit von zu zum zur ist sind wie was wer wo nicht " +
    "il lo la gli le un una di da in con su per tra fra che e è come"
  ).split(/\s+/).filter(Boolean),
);

export function isStopword(w: string): boolean {
  return STOPWORDS.has(w);
}

/** Meaningful words of an already-normalised string. */
export function keywords(normalized: string): string[] {
  const out: string[] = [];
  for (const w of normalized.split(" ")) {
    if (w.length < 2) continue;
    if (/^\p{N}+$/u.test(w)) continue; // plain numbers
    if (STOPWORDS.has(w)) continue;
    out.push(w);
  }
  return out;
}

/**
 * Keywords plus two-word phrases made of adjacent meaningful words
 * ("elden ring", "new york" is dropped because "new" is filler).
 */
export function keywordsAndPhrases(normalized: string): string[] {
  const words = normalized.split(" ");
  const keep = words.map((w) => w.length >= 2 && !/^\p{N}+$/u.test(w) && !STOPWORDS.has(w));
  const out = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    if (!keep[i]) continue;
    out.add(words[i]);
    if (i + 1 < words.length && keep[i + 1]) out.add(words[i] + " " + words[i + 1]);
  }
  return [...out];
}

/** Searches so common they say nothing about anyone (mostly navigational). */
const GENERIC_QUERY_SET = new Set<string>([
  "google", "youtube", "facebook", "gmail", "translate", "google translate", "weather", "maps",
  "google maps", "amazon", "netflix", "instagram", "whatsapp", "whatsapp web", "twitter", "x",
  "tiktok", "reddit", "wikipedia", "ebay", "yahoo", "hotmail", "outlook", "bing", "chatgpt",
  "chat gpt", "news", "time", "calculator", "calendar", "speed test", "speedtest", "my ip",
  "what is my ip", "weather tomorrow", "погода", "переводчик", "ютуб", "вк", "вконтакте",
  "google переводчик", "гугл карты", "переводчик google",
]);

export const GENERIC_QUERIES: readonly string[] = [...GENERIC_QUERY_SET];

export function isGenericQuery(normalized: string): boolean {
  if (GENERIC_QUERY_SET.has(normalized)) return true;
  if (normalized.startsWith("weather ") || normalized.startsWith("погода ")) return true;
  return false;
}

/** Sites nearly everyone visits. Shared visits to these are not interesting. */
const GENERIC_SITES = new Set(
  (
    "google.com youtube.com facebook.com instagram.com wikipedia.org amazon.com twitter.com x.com reddit.com " +
    "netflix.com linkedin.com microsoft.com apple.com yahoo.com bing.com live.com office.com whatsapp.com " +
    "tiktok.com github.com stackoverflow.com gmail.com t.co bit.ly vk.com yandex.ru mail.ru ok.ru wildberries.ru " +
    "ozon.ru avito.ru gosuslugi.ru openai.com chatgpt.com zoom.us dropbox.com paypal.com ebay.com pinterest.com " +
    "imdb.com spotify.com twitch.tv discord.com telegram.org t.me icloud.com adobe.com cloudflare.com"
  ).split(/\s+/),
);

export const GENERIC_SITE_LIST: readonly string[] = [...GENERIC_SITES];

export function isGenericSite(domain: string): boolean {
  return GENERIC_SITES.has(domain) || /^google\.[a-z.]+$/.test(domain);
}

/** Second-level labels that act as public suffixes (co.uk, com.au, …). Small but covers most traffic. */
const SECOND_LEVEL = new Set(
  "co com net org gov edu ac or ne go gob nic mil ltd plc sch nhs info biz".split(" "),
);

/**
 * "https://m.en.wikipedia.org/wiki/X" -> "wikipedia.org"
 * Returns undefined for things that are not web pages.
 */
export function siteOf(url: string): string | undefined {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    host = u.hostname.toLowerCase();
  } catch {
    return undefined;
  }
  if (!host || /^[\d.]+$/.test(host) || host.includes(":") || host === "localhost") return undefined;
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return undefined;
  const last = labels[labels.length - 1];
  const second = labels[labels.length - 2];
  if (labels.length >= 3 && last.length === 2 && SECOND_LEVEL.has(second)) {
    return labels.slice(-3).join(".");
  }
  return labels.slice(-2).join(".");
}

/** Google's own search/redirect hosts – visits to these are the search itself, not a site. */
export function isGoogleInternal(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      /(^|\.)google\.[a-z.]+$/.test(h) ||
      h.endsWith("googleadservices.com") ||
      h.endsWith("doubleclick.net") ||
      h.endsWith("gstatic.com") ||
      h.endsWith("googleusercontent.com")
    );
  } catch {
    return false;
  }
}

/** Local calendar day number (days since 1970-01-01 in the given offset-aware Date). */
export function localDay(ms: number): number {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

export function dayToDate(day: number): Date {
  return new Date(day * 86_400_000);
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 19456 -> "Apr 8, 2023" (day numbers are UTC-anchored, so format in UTC). */
export function formatDay(day: number): string {
  const d = dayToDate(day);
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function formatMonth(day: number): string {
  const d = dayToDate(day);
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
