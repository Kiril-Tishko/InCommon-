/**
 * Recognising music. Google has no "music" label on a YouTube watch, so this
 * uses the conventions music uploads follow: YouTube Music records,
 * auto-generated "Artist - Topic" channels, VEVO channels, and titles like
 * "Artist - Song (Official Video)". Spotify exports are music by definition.
 *
 * Songs are keyed by normalised artist + cleaned title, so the same song
 * matches whether one friend streams it on Spotify and the other on YouTube.
 */
import type { HistoryEvent } from "./types";
import { normalizeText } from "./normalize";

export interface Song {
  artist: string;
  track: string;
}

/** Bracketed or dashed decorations that are not part of a song's name. */
const BRACKET_JUNK =
  /\s*[([]\s*[^)\]]*?\b(official|video|audio|lyrics?|visuali[sz]er|remaster(?:ed)?|hd|hq|4k|mv|m\/v|explicit|clean|color coded|full album|music video|performance video|clip officiel)\b[^)\]]*[)\]]/gi;
const DASH_JUNK = /\s+[-–—]\s+(?:(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?(?:\s+version)?|radio edit|single version|album version|mono|stereo|original mix)\s*$/i;
const FEAT = /\s*[([]?\s*\b(?:feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]?/gi;
const TRAILING_JUNK = /\s*[|/]\s*(official|lyrics?|audio|video|hd)\b.*$/i;

/** "Low Tide (Official Video) [4K]" -> "Low Tide" */
export function cleanTrack(title: string): string {
  let t = title.replace(BRACKET_JUNK, "").replace(FEAT, "").replace(DASH_JUNK, "").replace(TRAILING_JUNK, "");
  t = t.replace(/\s*\b(official (music )?video|official audio|lyric video|lyrics)\s*$/i, "");
  return t.replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
}

/** "Velvet Harbor - Topic" -> "Velvet Harbor"; "VelvetHarborVEVO" -> "Velvet Harbor". */
export function artistFromChannel(channel: string): string {
  let c = channel.trim();
  c = c.replace(/\s+-\s+Topic$/i, "");
  if (/VEVO$/.test(c)) c = c.replace(/VEVO$/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
  c = c.replace(/\s*(official( channel)?|music)$/i, "");
  return c.trim();
}

export function artistKey(artist: string): string {
  return normalizeText(artist).replace(/^the /, "");
}

export function songKey(artist: string, track: string): string {
  return `${artistKey(artist)} — ${normalizeText(cleanTrack(track))}`;
}

const MUSIC_MARKERS =
  /\b(official (music )?video|official audio|lyric video|lyrics|visuali[sz]er|music video|clip officiel|full album)\b|\b(ft|feat)\.\s|[([](audio|lyrics?)[)\]]/i;
const DASH_SPLIT = /\s+[-–—]\s+/;

/** If a YouTube / YouTube Music watch is a song, which one. */
export function musicFromWatch(e: HistoryEvent): Song | undefined {
  if (e.kind !== "ytWatch") return undefined;
  const title = e.text.trim();
  const channel = e.channel?.trim() ?? "";
  const isTopic = /\s+-\s+Topic$/i.test(channel);
  const isVevo = /VEVO$/.test(channel);
  const fromChannel = channel ? artistFromChannel(channel) : "";

  if (e.music || isTopic) {
    if (!fromChannel) return undefined;
    // YouTube Music sometimes plays the video version: "Artist - Song (Official Video)".
    const parts = title.split(DASH_SPLIT);
    const track =
      parts.length > 1 && artistKey(parts[0]) === artistKey(fromChannel) ? parts.slice(1).join(" - ") : title;
    const t = cleanTrack(track);
    return t ? { artist: fromChannel, track: t } : undefined;
  }

  const parts = title.split(DASH_SPLIT);
  if (parts.length > 1 && (isVevo || MUSIC_MARKERS.test(title))) {
    const artist = parts[0].replace(FEAT, "").trim();
    const track = cleanTrack(parts.slice(1).join(" - "));
    if (artist && track && artist.length <= 60) return { artist, track };
  }
  if (isVevo && fromChannel) {
    const t = cleanTrack(title);
    return t ? { artist: fromChannel, track: t } : undefined;
  }
  return undefined;
}

/* ------------------------------------------------------------------------ */
/* Spotify ("Download your data" at spotify.com/account/privacy).          */
/* ------------------------------------------------------------------------ */

/** A play shorter than this doesn't count, the same rule Spotify uses for streams. */
export const MIN_PLAY_MS = 30_000;

interface SpotifyExtended {
  ts?: string;
  ms_played?: number;
  master_metadata_track_name?: string | null;
  master_metadata_album_artist_name?: string | null;
}
interface SpotifyAccount {
  endTime?: string;
  msPlayed?: number;
  artistName?: string;
  trackName?: string;
}

export function spotifyEvent(raw: SpotifyExtended & SpotifyAccount): HistoryEvent | undefined {
  const track = raw.master_metadata_track_name ?? raw.trackName;
  const artist = raw.master_metadata_album_artist_name ?? raw.artistName;
  const ms = raw.ms_played ?? raw.msPlayed ?? 0;
  if (!track || !artist || ms < MIN_PLAY_MS) return undefined; // podcasts have no track; skips are short
  let time: number | undefined;
  if (raw.ts) time = Date.parse(raw.ts);
  else if (raw.endTime) time = Date.parse(raw.endTime.replace(" ", "T") + (raw.endTime.length <= 16 ? ":00Z" : "Z"));
  if (time !== undefined && Number.isNaN(time)) time = undefined;
  return { kind: "musicPlay", text: track, artist, track, time };
}

export function looksLikeSpotify(head: string): boolean {
  return /"master_metadata_track_name"\s*:|"ms_played"\s*:/.test(head) || (/"artistName"\s*:/.test(head) && /"trackName"\s*:/.test(head));
}
