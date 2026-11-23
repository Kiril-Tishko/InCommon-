import { describe, expect, it } from "vitest";
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import { classify } from "../src/core/parse/classify";
import { parseActivityDate, parseBlock } from "../src/core/parse/htmlActivity";
import { JsonObjectSplitter } from "../src/core/parse/jsonStream";
import { FileTextSink } from "../src/core/parse/router";
import { normalizeText, siteOf, keywordsAndPhrases } from "../src/core/normalize";
import { importTakeout } from "../src/core/takeout";
import { sampleTakeout } from "../src/core/sample";
import type { HistoryEvent } from "../src/core/types";

async function zipOf(files: { path: string; content: string }[], name = "takeout-001.zip"): Promise<File> {
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  for (const f of files) await writer.add(f.path, new TextReader(f.content));
  const blob = await writer.close();
  return new File([blob], name, { type: "application/zip" });
}

describe("normalize", () => {
  it("normalises case, accents and punctuation", () => {
    expect(normalizeText("  How to cook RICE?! ")).toBe("how to cook rice");
    expect(normalizeText("Café  Crème")).toBe("cafe creme");
    expect(normalizeText("Привет, Мир")).toBe("привет мир");
  });
  it("finds registrable domains", () => {
    expect(siteOf("https://m.en.wikipedia.org/wiki/X")).toBe("wikipedia.org");
    expect(siteOf("https://www.bbc.co.uk/news")).toBe("bbc.co.uk");
    expect(siteOf("chrome://settings")).toBeUndefined();
  });
  it("extracts keywords and two-word phrases", () => {
    expect(keywordsAndPhrases("how to fix a squeaky door").sort()).toEqual(["door", "fix", "squeaky", "squeaky door"]);
  });
});

describe("classify", () => {
  it("reads Google searches from the URL, whatever the language", () => {
    const e = classify({ title: "Искали котики", titleUrl: "https://www.google.ru/search?q=%D0%BA%D0%BE%D1%82%D0%B8%D0%BA%D0%B8", time: "2023-01-02T03:04:05.000Z" });
    expect(e).toMatchObject({ kind: "search", text: "котики" });
  });
  it("reads YouTube watches with channel", () => {
    const e = classify({
      header: "YouTube",
      title: "Watched Lofi beats",
      titleUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      subtitles: [{ name: "Lofi Lantern", url: "https://www.youtube.com/channel/UC1234567890abcdef" }],
      time: "2023-01-02T03:04:05.000Z",
    });
    expect(e).toMatchObject({ kind: "ytWatch", videoId: "abcdefghijk", text: "Lofi beats", channel: "Lofi Lantern", channelId: "UC1234567890abcdef" });
  });
  it("unwraps search result clicks and drops ads", () => {
    expect(classify({ title: "Visited X", titleUrl: "https://www.google.com/url?q=https://breadlab.example/a&usg=1" })).toMatchObject({
      kind: "visit",
      url: "https://breadlab.example/a",
    });
    expect(classify({ title: "Visited Ad", titleUrl: "https://www.googleadservices.com/pagead/aclk?x=1", details: [{ name: "From Google Ads" }] })).toBeUndefined();
  });
});

describe("dates in HTML exports", () => {
  it("parses en-US with narrow no-break space", () => {
    expect(parseActivityDate("Apr 12, 2023, 6:22:11 PM EDT")).toBe(Date.UTC(2023, 3, 12, 22, 22, 11));
  });
  it("parses en-GB, Russian and numeric styles", () => {
    expect(parseActivityDate("12 Apr 2023, 18:22:11 BST")).toBe(Date.UTC(2023, 3, 12, 17, 22, 11));
    expect(parseActivityDate("12 апр. 2023 г., 18:22:11 MSK")).toBe(Date.UTC(2023, 3, 12, 15, 22, 11));
    expect(parseActivityDate("12.04.2023, 18:22:11 GMT+03:00")).toBe(Date.UTC(2023, 3, 12, 15, 22, 11));
    expect(parseActivityDate("2023/04/12 18:22:11 UTC")).toBe(Date.UTC(2023, 3, 12, 18, 22, 11));
  });
  it("rejects lines that are not dates", () => {
    expect(parseActivityDate("Lofi Lantern")).toBeUndefined();
  });
});

describe("streaming JSON", () => {
  it("splits objects across arbitrary chunk boundaries", () => {
    const doc = JSON.stringify([{ a: "x}{\"]" }, { b: [1, { c: 2 }] }, { d: "\\" }]);
    for (const size of [1, 2, 3, 7, 1000]) {
      const got: unknown[] = [];
      const s = new JsonObjectSplitter(1, (t) => got.push(JSON.parse(t)));
      for (let i = 0; i < doc.length; i += size) s.push(doc.slice(i, i + size));
      expect(got).toEqual([{ a: "x}{\"]" }, { b: [1, { c: 2 }] }, { d: "\\" }]);
    }
  });
  it("finds Chrome history entries at depth 2", () => {
    const doc = JSON.stringify({ "Browser History": [{ url: "https://a.example/", time_usec: 1 }, { url: "chrome://x" }] });
    const events: HistoryEvent[] = [];
    const sink = new FileTextSink("Takeout/Chrome/History.json", (e) => events.push(e));
    sink.push(doc);
    sink.end();
    expect(sink.recognised).toBe("chrome-json");
    expect(events.map((e) => e.url)).toEqual(["https://a.example/"]);
  });
});

describe("HTML records", () => {
  it("parses a My Activity block", () => {
    const raw = parseBlock(
      '<div class="outer-cell mdl-cell"><div class="mdl-grid"><div class="header-cell mdl-cell"><p class="mdl-typography--title">YouTube<br></p></div>' +
        '<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">Watched&nbsp;<a href="https://www.youtube.com/watch?v=abcdefghijk">Rock &amp; Roll</a><br>' +
        '<a href="https://www.youtube.com/channel/UC1234567890abcdef">Some Channel</a><br>Jan 5, 2021, 9:00:00 AM UTC<br></div></div></div>',
    );
    expect(raw).toMatchObject({ header: "YouTube", title: "Rock & Roll", titleUrl: "https://www.youtube.com/watch?v=abcdefghijk", time: Date.UTC(2021, 0, 5, 9) });
    expect(classify(raw!)).toMatchObject({ kind: "ytWatch", text: "Rock & Roll", channel: "Some Channel" });
  });
});

describe("importTakeout", () => {
  it("reads a JSON Takeout zip and an HTML one to the same profile", async () => {
    const jsonZip = await zipOf(sampleTakeout("Alex", "json", 0.3));
    const htmlZip = await zipOf(sampleTakeout("Alex", "html", 0.3));
    const fromJson = await importTakeout([jsonZip]);
    const fromHtml = await importTakeout([htmlZip]);

    expect(fromJson.totals.search).toBeGreaterThan(400);
    expect(fromJson.totals.ytWatch).toBeGreaterThan(400);
    expect(fromJson.totals.ytSub).toBe(6);
    expect(fromJson.sources.map((s) => s.format).sort()).toEqual(
      ["activity-json", "activity-json", "activity-json", "activity-json", "subscriptions-csv"],
    );
    // Ads are dropped
    expect(Object.keys(fromJson.items.site)).not.toContain("googleadservices.com");
    // Same data, either format
    expect(fromHtml.totals).toEqual(fromJson.totals);
    expect(fromHtml.items.q).toEqual(fromJson.items.q);
    expect(fromHtml.items.v).toEqual(fromJson.items.v);
    expect(fromHtml.hours).toEqual(fromJson.hours);
  });

  it("counts duplicate records only once across overlapping files", async () => {
    const files = sampleTakeout("Sam", "json", 0.2);
    const watch = files.find((f) => f.path.endsWith("watch-history.json"))!;
    const dup = { path: "Takeout/My Activity/YouTube/MyActivity.json", content: watch.content };
    const once = await importTakeout([await zipOf(files)]);
    const twice = await importTakeout([await zipOf([...files, dup])]);
    expect(twice.totals.ytWatch).toBe(once.totals.ytWatch);
  });

  it("accepts loose files and several zip parts", async () => {
    const files = sampleTakeout("Sam", "json", 0.2);
    const loose = files.map((f) => new File([f.content], f.path.split("/").pop()!));
    const a = await importTakeout(loose);
    const b = await importTakeout([await zipOf(files.slice(0, 2), "part1.zip"), await zipOf(files.slice(2), "part2.zip")]);
    expect(a.totals).toEqual(b.totals);
  });
});
