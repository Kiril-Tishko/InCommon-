import { describe, expect, it } from "vitest";
import { artistFromChannel, cleanTrack, musicFromWatch, songKey, spotifyEvent } from "../src/core/music";
import { classify } from "../src/core/parse/classify";
import { FileTextSink } from "../src/core/parse/router";
import { demoProfile, DEMO_CODE_WORD, profileFromTexts } from "../src/core/demo";
import { sampleSpotify, sampleTakeout } from "../src/core/sample";
import { mergeProfiles, upgradeProfile } from "../src/core/profile";
import { buildMatchFile, DEFAULT_INCLUDE } from "../src/core/matchfile";
import { compare } from "../src/core/compare";
import type { HistoryEvent } from "../src/core/types";

const watch = (title: string, channel: string, extra: Partial<HistoryEvent> = {}): HistoryEvent => ({
  kind: "ytWatch",
  text: title,
  videoId: "abcdefghijk",
  channel,
  ...extra,
});

describe("music recognition", () => {
  it("cleans song titles", () => {
    expect(cleanTrack("Low Tide (Official Video) [4K]")).toBe("Low Tide");
    expect(cleanTrack("Paper Lanterns - 2023 Remaster")).toBe("Paper Lanterns");
    expect(cleanTrack("Glasshouse (feat. Somebody)")).toBe("Glasshouse");
    expect(cleanTrack("Window Seat | Official Lyric Video")).toBe("Window Seat");
    expect(cleanTrack("Northbound (Live)")).toBe("Northbound (Live)");
  });

  it("reads artists from channel names", () => {
    expect(artistFromChannel("Velvet Harbor - Topic")).toBe("Velvet Harbor");
    expect(artistFromChannel("VelvetHarborVEVO")).toBe("Velvet Harbor");
  });

  it("recognises YouTube Music, Topic channels, VEVO and music video titles", () => {
    expect(musicFromWatch(watch("Low Tide", "Velvet Harbor - Topic"))).toEqual({ artist: "Velvet Harbor", track: "Low Tide" });
    expect(musicFromWatch(watch("Low Tide", "Some Uploader", { music: true }))).toEqual({ artist: "Some Uploader", track: "Low Tide" });
    expect(musicFromWatch(watch("Velvet Harbor - Low Tide (Official Video)", "VelvetHarborVEVO"))).toEqual({ artist: "Velvet Harbor", track: "Low Tide" });
    expect(musicFromWatch(watch("Mira Sol - Glasshouse (Official Audio)", "Mira Sol"))).toEqual({ artist: "Mira Sol", track: "Glasshouse" });
  });

  it("leaves ordinary videos alone", () => {
    expect(musicFromWatch(watch("How tyre strategy really works", "Pit Wall Weekly"))).toBeUndefined();
    expect(musicFromWatch(watch("How to fix audio - Windows 11 tutorial", "Tech Tips"))).toBeUndefined();
  });

  it("flags YouTube Music records when classifying", () => {
    const e = classify({
      header: "YouTube Music",
      title: "Watched Low Tide",
      titleUrl: "https://music.youtube.com/watch?v=abcdefghijk",
      subtitles: [{ name: "Velvet Harbor - Topic" }],
      time: "2024-01-01T00:00:00Z",
    });
    expect(e?.music).toBe(true);
  });

  it("matches the same song across Spotify and YouTube", () => {
    expect(songKey("The Night Bus Collective", "3am Tram")).toBe(songKey("Night Bus Collective", "3am Tram (Official Video)"));
  });
});

describe("Spotify", () => {
  it("reads both export formats and ignores skips and podcasts", () => {
    expect(spotifyEvent({ ts: "2023-01-02T03:04:05Z", ms_played: 200000, master_metadata_track_name: "Low Tide", master_metadata_album_artist_name: "Velvet Harbor" })).toMatchObject({
      kind: "musicPlay",
      artist: "Velvet Harbor",
      track: "Low Tide",
      time: Date.UTC(2023, 0, 2, 3, 4, 5),
    });
    expect(spotifyEvent({ endTime: "2023-01-02 03:04", msPlayed: 90000, artistName: "Mira Sol", trackName: "Glasshouse" })).toMatchObject({
      time: Date.UTC(2023, 0, 2, 3, 4),
    });
    expect(spotifyEvent({ ts: "2023-01-02T03:04:05Z", ms_played: 5000, master_metadata_track_name: "x", master_metadata_album_artist_name: "y" })).toBeUndefined();
    expect(spotifyEvent({ ts: "2023-01-02T03:04:05Z", ms_played: 900000, master_metadata_track_name: null, master_metadata_album_artist_name: null })).toBeUndefined();
  });

  it("is recognised inside a Spotify download and other files are skipped", () => {
    const files = sampleSpotify("Sam", 0.3);
    const events: HistoryEvent[] = [];
    const formats: (string | null | undefined)[] = [];
    for (const f of files) {
      const sink = new FileTextSink(f.path, (e) => events.push(e));
      sink.push(f.content);
      sink.end();
      formats.push(sink.recognised);
    }
    expect(formats).toEqual(["spotify-json", null]);
    expect(events.length).toBeGreaterThan(150);
    expect(events.every((e) => e.kind === "musicPlay")).toBe(true);
  });
});

describe("music in profiles and comparisons", () => {
  it("keeps Spotify plays out of the daily rhythm", () => {
    const google = profileFromTexts(sampleTakeout("Sam", "json", 0.2));
    const both = profileFromTexts([...sampleTakeout("Sam", "json", 0.2), ...sampleSpotify("Sam", 0.2)]);
    expect(both.hours).toEqual(google.hours);
    expect(both.totals.musicPlay).toBeGreaterThan(100);
    expect(Object.keys(both.items.art).sort()).toEqual(["ada okoro", "juniper vale", "mira sol", "night bus collective", "velvet harbor"]);
  });

  it("merging a Spotify-only profile equals loading everything at once", () => {
    const google = profileFromTexts(sampleTakeout("Sam", "json", 0.2));
    const spotify = profileFromTexts(sampleSpotify("Sam", 0.2));
    const merged = mergeProfiles(google, spotify);
    const once = profileFromTexts([...sampleTakeout("Sam", "json", 0.2), ...sampleSpotify("Sam", 0.2)]);
    expect(merged.items.song).toEqual(once.items.song);
    expect(merged.totals).toEqual(once.totals);
    expect(merged.hours).toEqual(once.hours);
  });

  it("upgrades profiles saved before music existed", () => {
    const old = profileFromTexts(sampleTakeout("Alex", "json", 0.1)) as unknown as { items: Record<string, unknown>; totals: Record<string, number> };
    delete old.items.art;
    delete old.items.song;
    delete old.totals.musicPlay;
    const up = upgradeProfile(old as never);
    expect(up.items.art).toEqual({});
    expect(up.totals.musicPlay).toBe(0);
  });

  it("finds shared artists and songs between a YouTube Music listener and a Spotify listener", async () => {
    const alex = demoProfile("Alex", 0.4);
    const sam = demoProfile("Sam", 0.4);
    const o = (name: string) => ({ name, codeWord: DEMO_CODE_WORD, include: DEFAULT_INCLUDE, hideWords: [] });
    const c = await compare(alex, o("Alex"), await buildMatchFile(sam, o("Sam")));
    expect(c.shared.art.map((x) => x.key).sort()).toEqual(["mira sol", "night bus collective", "velvet harbor"]);
    expect(c.shared.song.map((x) => x.label)).toContain("Paper Lanterns");
    expect(c.shared.song.map((x) => x.label)).not.toContain("Cedar Smoke");
  });
});
