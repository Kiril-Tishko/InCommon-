/**
 * Spotting exports that don't cover what the person expects. Google only
 * exports what it still keeps: auto-delete settings, paused activity
 * controls and old downloads all show up as gaps.
 */
import type { Profile, SourceReport } from "./types";
import { localDay } from "./normalize";

export type CoverageNote =
  | { kind: "ends"; lastDay: number }
  | { kind: "short"; firstDay: number; lastDay: number }
  | { kind: "uneven"; short: SourceReport; long: SourceReport };

const DAY = 86_400_000;

export function coverageNotes(profile: Profile, now = Date.now()): CoverageNote[] {
  const notes: CoverageNote[] = [];
  const { firstDay, lastDay } = profile;
  if (firstDay === undefined || lastDay === undefined) return notes;
  const today = localDay(now);
  if (today - lastDay > 180) notes.push({ kind: "ends", lastDay });
  if (lastDay - firstDay < 400) notes.push({ kind: "short", firstDay, lastDay });

  // One product reaching back years further than another usually means different auto-delete settings.
  const dated = profile.sources.filter((s) => s.first !== undefined && s.last !== undefined && s.format !== "spotify-json" && s.events >= 50);
  if (dated.length >= 2) {
    const byStart = [...dated].sort((a, b) => a.first! - b.first!);
    const long = byStart[0];
    const short = byStart[byStart.length - 1];
    if (short.first! - long.first! > 730 * DAY && !notes.some((n) => n.kind === "short")) notes.push({ kind: "uneven", short, long });
  }
  return notes;
}

/** "Takeout/My Activity/Search/MyActivity.json" -> "Search" */
export function sourceName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  const file = parts[parts.length - 1] ?? path;
  if (/watch-history/i.test(file)) return "YouTube watch history";
  if (/search-history/i.test(file)) return "YouTube search history";
  if (/subscriptions/i.test(file)) return "YouTube subscriptions";
  if (/streaming_?history/i.test(file)) return "Spotify";
  if (/^(browser)?history\.json$/i.test(file)) return "Chrome history";
  if (/activit/i.test(file) && parts.length >= 2) return `My Activity: ${parts[parts.length - 2]}`;
  return file;
}
