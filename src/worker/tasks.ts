/** The actual work, shared by the worker and the main-thread fallback. */
import { importTakeout } from "../core/takeout";
import { buildMatchFile, type ShareOptions } from "../core/matchfile";
import { compare } from "../core/compare";
import type { MatchFile, Profile } from "../core/types";
import type { Progress } from "./protocol";

type OnProgress = (p: Progress) => void;

export function doImport(files: File[], onProgress: OnProgress, signal?: AbortSignal): Promise<Profile> {
  return importTakeout(files, { onProgress, signal });
}

export function doShare(profile: Profile, opts: ShareOptions, onProgress: OnProgress): Promise<MatchFile> {
  onProgress({ step: "Scrambling your items with the code word", fraction: 0 });
  return buildMatchFile(profile, opts, (done, total) =>
    onProgress({ step: "Scrambling your items with the code word", fraction: done / total }),
  );
}

export function doCompare(profile: Profile, opts: ShareOptions, friend: MatchFile, onProgress: OnProgress) {
  onProgress({ step: "Looking for matches", fraction: 0 });
  return compare(profile, opts, friend, (done, total) => onProgress({ step: "Looking for matches", fraction: done / total }));
}
