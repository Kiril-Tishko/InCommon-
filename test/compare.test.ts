import { describe, expect, it, beforeAll } from "vitest";
import { demoProfile, DEMO_CODE_WORD } from "../src/core/demo";
import { buildMatchFile, decodeMatchFile, encodeMatchFile, DEFAULT_INCLUDE, sampleDays, type ShareOptions } from "../src/core/matchfile";
import { compare, closestGap, CodeWordMismatch, type Comparison } from "../src/core/compare";
import type { MatchFile, Profile } from "../src/core/types";

const opts = (name: string, extra: Partial<ShareOptions> = {}): ShareOptions => ({
  name,
  codeWord: DEMO_CODE_WORD,
  include: DEFAULT_INCLUDE,
  hideWords: [],
  ...extra,
});

let alex: Profile;
let sam: Profile;
let alexFile: MatchFile;
let samFile: MatchFile;
let alexView: Comparison;
let samView: Comparison;

beforeAll(async () => {
  alex = demoProfile("Alex", 0.5);
  sam = demoProfile("Sam", 0.5);
  alexFile = await decodeMatchFile(await encodeMatchFile(await buildMatchFile(alex, opts("Alex"))));
  samFile = await decodeMatchFile(await encodeMatchFile(await buildMatchFile(sam, opts("Sam"))));
  alexView = await compare(alex, opts("Alex"), samFile);
  samView = await compare(sam, opts("Sam"), alexFile);
});

describe("match file", () => {
  it("contains no readable history", async () => {
    const text = JSON.stringify(alexFile);
    for (const secret of ["sourdough", "python", "Crumb", "breadlab", "bouldering", DEMO_CODE_WORD]) {
      expect(text.toLowerCase()).not.toContain(secret.toLowerCase());
    }
    expect(alexFile.name).toBe("Alex");
  });

  it("rejects files that are not match files", async () => {
    await expect(decodeMatchFile(new Blob(["hello"]))).rejects.toThrow(/not an InCommon match file/);
  });

  it("samples days but keeps first and last", () => {
    const days = Array.from({ length: 500 }, (_, i) => 1000 + i * 2);
    const s = sampleDays(days, 48);
    expect(s.length).toBeLessThanOrEqual(48);
    expect(s[0]).toBe(1000);
    expect(s[s.length - 1]).toBe(1998);
  });
});

describe("compare", () => {
  it("sees the same overlap from both sides", () => {
    for (const ns of ["q", "yq", "w", "ch", "sub", "v", "site"] as const) {
      const a = alexView.shared[ns].map((x) => x.key).sort();
      const b = samView.shared[ns].map((x) => x.key).sort();
      expect(a, ns).toEqual(b);
    }
    expect(alexView.score).toBe(samView.score);
  });

  it("finds the shared interests and not the private ones", () => {
    const q = alexView.shared.q.map((x) => x.key);
    expect(q[0]).toBe("sourdough hydration calculator");
    expect(q).toContain("solar eclipse viewing glasses");
    expect(q).not.toContain("python list comprehension");
    expect(q).not.toContain("monstera yellow leaves");
    // Generic searches are shared but ranked last
    expect(q.indexOf("weather")).toBeGreaterThan(q.indexOf("how to fix a squeaky door"));
    const channels = alexView.shared.ch.map((x) => x.label);
    expect(channels).toContain("Crumb & Crust");
    expect(channels).not.toContain("Code Garden");
    expect(alexView.shared.sub.map((x) => x.label).sort()).toEqual(["Crumb & Crust", "Pit Wall Weekly"]);
    expect(alexView.shared.site.map((x) => x.key)).toContain("breadlab.example");
    expect(alexView.shared.site.map((x) => x.key)).not.toContain("climbbeta.example");
  });

  it("finds same-week coincidences", () => {
    const labels = alexView.coincidences.map((c) => c.label);
    expect(labels).toContain("solar eclipse viewing glasses");
    const eclipse = alexView.coincidences.find((c) => c.label === "solar eclipse viewing glasses")!;
    expect(eclipse.gap).toBeLessThanOrEqual(1);
  });

  it("notices different daily rhythms", () => {
    expect(alexView.rhythm.minePeak).not.toBe(alexView.rhythm.theirPeak);
    expect(alexView.rhythm.mineNight).toBeGreaterThan(alexView.rhythm.theirNight);
  });

  it("gives a score between 0 and 100", () => {
    expect(alexView.score).toBeGreaterThan(10);
    expect(alexView.score).toBeLessThan(100);
  });

  it("refuses a different code word", async () => {
    await expect(compare(alex, opts("Alex", { codeWord: "wrong words" }), samFile)).rejects.toBeInstanceOf(CodeWordMismatch);
  });

  it("keeps hidden words out of the file and the comparison", async () => {
    const hidden = opts("Sam", { hideWords: ["Eclipse"] });
    const file = await buildMatchFile(sam, hidden);
    const view = await compare(alex, opts("Alex"), file);
    expect(view.shared.q.map((x) => x.key)).not.toContain("solar eclipse viewing glasses");
    expect(view.shared.w.map((x) => x.key)).not.toContain("eclipse");
    const own = await compare(sam, hidden, alexFile);
    expect(own.shared.q.map((x) => x.key)).not.toContain("solar eclipse viewing glasses");
  });
});

describe("closestGap", () => {
  it("finds the nearest pair", () => {
    expect(closestGap([1, 10, 20], [14, 30])).toEqual({ gap: 4, a: 10, b: 14 });
    expect(closestGap([], [1])).toBeUndefined();
  });
});
