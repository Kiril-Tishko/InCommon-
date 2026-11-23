import { FileTextSink } from "./parse/router";
import { ProfileBuilder } from "./profile";
import { sampleTakeout, type SampleFile } from "./sample";
import type { Profile } from "./types";

/** Build a profile from in-memory Takeout files (no zip). */
export function profileFromTexts(files: SampleFile[]): Profile {
  const b = new ProfileBuilder();
  for (const f of files) {
    const sink = new FileTextSink(f.path, (e) => b.add(e));
    sink.push(f.content);
    sink.end();
    if (sink.recognised && sink.events > 0) b.sources.push({ path: f.path, format: sink.recognised, events: sink.events });
  }
  return b.finish();
}

export const DEMO_CODE_WORD = "sourdough sunday";

export function demoProfile(who: "Alex" | "Sam", scale = 1): Profile {
  return profileFromTexts(sampleTakeout(who, "json", scale));
}
