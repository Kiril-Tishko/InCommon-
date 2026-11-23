import { describe, expect, it } from "vitest";
import { coverageNotes, sourceName } from "../src/core/coverage";
import { profileFromTexts } from "../src/core/demo";
import { sampleTakeout } from "../src/core/sample";
import type { Profile } from "../src/core/types";

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86_400_000;

function fake(first: number, last: number, sources: Profile["sources"] = []): Profile {
  const p = profileFromTexts(sampleTakeout("Alex", "json", 0.05));
  return { ...p, firstDay: first, lastDay: last, sources };
}

describe("coverage notes", () => {
  it("is quiet for a long, recent history", () => {
    expect(coverageNotes(fake(day(2015, 1, 1), day(2026, 11, 1)), Date.UTC(2026, 10, 23))).toEqual([]);
  });

  it("flags a history that stops long ago and covers only about a year", () => {
    const notes = coverageNotes(fake(day(2022, 1, 3), day(2022, 12, 20)), Date.UTC(2026, 10, 23));
    expect(notes.map((n) => n.kind)).toEqual(["ends", "short"]);
  });

  it("flags products that reach back very different distances", () => {
    const src = (path: string, from: number): Profile["sources"][number] => ({
      path,
      format: "activity-json",
      events: 500,
      first: Date.UTC(from, 0, 1),
      last: Date.UTC(2026, 9, 1),
    });
    const notes = coverageNotes(
      fake(day(2014, 1, 1), day(2026, 10, 1), [src("Takeout/My Activity/Search/MyActivity.json", 2023), src("Takeout/YouTube and YouTube Music/history/watch-history.json", 2014)]),
      Date.UTC(2026, 10, 23),
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].kind).toBe("uneven");
  });

  it("names Takeout files the way people recognise them", () => {
    expect(sourceName("Takeout/My Activity/Search/MyActivity.json")).toBe("My Activity: Search");
    expect(sourceName("Takeout/YouTube and YouTube Music/history/watch-history.html")).toBe("YouTube watch history");
    expect(sourceName("Spotify Extended Streaming History/Streaming_History_Audio_2021-2026_0.json")).toBe("Spotify");
  });

  it("records each file's date range", () => {
    const p = profileFromTexts(sampleTakeout("Sam", "json", 0.1));
    const search = p.sources.find((s) => s.path.includes("Search"))!;
    expect(search.first).toBeLessThan(search.last!);
  });
});
