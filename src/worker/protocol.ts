import type { Comparison } from "../core/compare";
import type { ShareOptions } from "../core/matchfile";
import type { MatchFile, Profile } from "../core/types";

export type Request =
  | { id: number; type: "import"; files: File[] }
  | { id: number; type: "share"; profile: Profile; opts: ShareOptions }
  | { id: number; type: "compare"; profile: Profile; opts: ShareOptions; friend: MatchFile }
  | { id: number; type: "cancel" };

export interface Progress {
  step: string;
  fraction: number;
  events?: number;
}

export type Response =
  | { id: number; type: "progress"; progress: Progress }
  | { id: number; type: "done"; result: Profile | MatchFile | Comparison }
  | { id: number; type: "error"; message: string; code?: string };
