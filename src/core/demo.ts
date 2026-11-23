import { FileTextSink } from "./parse/router";
import { ProfileBuilder } from "./profile";
import { sampleSpotify, sampleTakeout, type SampleFile } from "./sample";
import type { Profile } from "./types";

/** Build a profile from in-memory Takeout files (no zip). */
export function profileFromTexts(files: SampleFile[]): Profile {
  const b = new ProfileBuilder();
  for (const f of files) {
    const sink = new FileTextSink(f.path, (e) => b.add(e));
    sink.push(f.content);
    sink.end();
    const rep = sink.report();
    if (rep) b.sources.push(rep);
  }
  return b.finish();
}

export const DEMO_CODE_WORD = "sourdough sunday";

export function demoProfile(who: "Alex" | "Sam", scale = 1): Profile {
  return profileFromTexts([...sampleTakeout(who, "json", scale), ...sampleSpotify(who, scale)]);
}
