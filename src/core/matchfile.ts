/**
 * Match files: what one friend sends the other.
 *
 * Every item (a search, a channel, a site …) is replaced by an HMAC-SHA256 tag
 * keyed with a code word both friends agreed on. Your friend's app hashes its
 * own items the same way; equal tags mean you both have that item. Items only
 * you have stay unreadable to them.
 *
 * Limits, stated plainly in the UI: someone who knows the code word can test
 * guesses ("did they ever search X?") against the file. So the code word should
 * be shared only with that friend, and the "never share" list exists for
 * anything sensitive.
 */
import { NAMESPACES, type ItemStat, type MatchEntry, type MatchFile, type Namespace, type Profile } from "./types";
import { NORM_VERSION, normalizeText } from "./normalize";

const SALT = new TextEncoder().encode("incommon/match/v1");
const ITERATIONS = 150_000;
const MAX_DAYS = 48;

export interface ShareOptions {
  name: string;
  codeWord: string;
  /** Namespaces to include. */
  include: Namespace[];
  /** Words or phrases; any item mentioning one is left out of the file and of the comparison. */
  hideWords: string[];
}

export const DEFAULT_INCLUDE: Namespace[] = [...NAMESPACES];

export function normalizeCodeWord(code: string): string {
  return normalizeText(code);
}

export async function deriveKey(codeWord: string): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("This page needs a secure connection (an https:// address) to scramble match files. Open it over https and try again.");
  }
  const normalized = normalizeCodeWord(codeWord);
  if (normalized.length < 4) throw new Error("Pick a code word with at least 4 letters or digits.");
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normalized), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: SALT, iterations: ITERATIONS, hash: "SHA-256" },
    base,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const enc = new TextEncoder();

export async function tag(key: CryptoKey, message: string, bytes = 12): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64url(new Uint8Array(sig, 0, bytes));
}

export function itemMessage(ns: Namespace, key: string): string {
  return `${ns}\u0000${key}`;
}

export async function checkTag(key: CryptoKey): Promise<string> {
  return tag(key, "incommon\u0000check", 6);
}

/** Builds a predicate implementing the user's "never share" list. */
export function hideFilter(hideWords: string[]): (ns: Namespace, key: string, it: ItemStat) => boolean {
  const words = hideWords.map(normalizeText).filter((w) => w.length > 0);
  if (words.length === 0) return () => true;
  return (ns, key, it) => {
    const hay = ` ${normalizeText(ns === "site" ? key.replace(/\./g, " ") : `${key} ${it.label} ${it.extra ?? ""}`)} `;
    return !words.some((w) => hay.includes(` ${w} `));
  };
}

/** Items of a profile that the share options allow, per namespace. */
export function* shareableItems(
  profile: Profile,
  opts: Pick<ShareOptions, "include" | "hideWords">,
): Generator<[Namespace, string, ItemStat]> {
  const keep = hideFilter(opts.hideWords);
  for (const ns of opts.include) {
    for (const [key, it] of Object.entries(profile.items[ns] ?? {})) {
      if (keep(ns, key, it)) yield [ns, key, it];
    }
  }
}

/** First, last and evenly spaced days in between. */
export function sampleDays(days: number[], max = MAX_DAYS): number[] {
  if (days.length <= max) return days.slice();
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(days[Math.round((i * (days.length - 1)) / (max - 1))]);
  return [...new Set(out)];
}

/** Hash many messages without creating hundreds of thousands of promises at once. */
export async function tagAll(
  key: CryptoKey,
  messages: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const out = new Array<string>(messages.length);
  const BATCH = 2000;
  for (let i = 0; i < messages.length; i += BATCH) {
    const slice = messages.slice(i, i + BATCH);
    const tags = await Promise.all(slice.map((m) => tag(key, m)));
    for (let j = 0; j < tags.length; j++) out[i + j] = tags[j];
    onProgress?.(Math.min(messages.length, i + BATCH), messages.length);
  }
  return out;
}

export async function buildMatchFile(
  profile: Profile,
  opts: ShareOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<MatchFile> {
  const key = await deriveKey(opts.codeWord);
  const rows = [...shareableItems(profile, opts)];
  const tags = await tagAll(
    key,
    rows.map(([ns, k]) => itemMessage(ns, k)),
    onProgress,
  );
  const items: Partial<Record<Namespace, Record<string, MatchEntry>>> = {};
  const uniques: Partial<Record<Namespace, number>> = {};
  rows.forEach(([ns, , it], i) => {
    (items[ns] ??= {})[tags[i]] = { c: it.count, d: sampleDays(it.days) };
    uniques[ns] = (uniques[ns] ?? 0) + 1;
  });
  for (const ns of opts.include) items[ns] ??= {};
  return {
    app: "incommon",
    version: 1,
    norm: NORM_VERSION,
    name: opts.name.trim() || "Friend",
    createdAt: new Date().toISOString(),
    check: await checkTag(key),
    totals: { ...profile.totals },
    uniques,
    hours: [...profile.hours],
    weekdays: [...profile.weekdays],
    years: { ...profile.years },
    firstDay: profile.firstDay,
    lastDay: profile.lastDay,
    items,
  };
}

/**
 * Plain JSON on purpose: anyone can open the file in a text editor and see
 * that it holds only scrambled codes and counts. (Gzipped files are also read.)
 */
export async function encodeMatchFile(mf: MatchFile): Promise<Blob> {
  return new Blob([JSON.stringify(mf)], { type: "application/json" });
}

export async function decodeMatchFile(blob: Blob): Promise<MatchFile> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  let text: string;
  if (head[0] === 0x1f && head[1] === 0x8b) {
    try {
      text = await new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).text();
    } catch {
      throw new Error("This file is damaged. Ask your friend to send it again.");
    }
  } else {
    text = await blob.text();
  }
  let mf: MatchFile;
  try {
    mf = JSON.parse(text);
  } catch {
    throw new Error("This is not an InCommon match file.");
  }
  if (mf?.app !== "incommon" || typeof mf.items !== "object") throw new Error("This is not an InCommon match file.");
  if (mf.version !== 1) throw new Error("This match file was made by a newer version of InCommon. Reload the page and try again.");
  if (mf.norm !== NORM_VERSION) {
    throw new Error("This match file was made by a different version of InCommon. You both need the same version.");
  }
  return mf;
}

export function matchFileName(name: string): string {
  const slug = normalizeText(name).replace(/ /g, "-") || "friend";
  return `${slug}.incommon.json`;
}
