import type { HistoryEvent, SourceReport } from "../types";
import { classify, channelIdOf, type RawActivity } from "./classify";
import { JsonObjectSplitter } from "./jsonStream";
import { HtmlActivitySplitter } from "./htmlActivity";

/** Takeout ships one JSON metadata file per photo; those are never history. */
const MEDIA_SIDECAR = /\.(jpe?g|png|heic|heif|gif|webp|mp4|mov|avi|3gp|m4v|mkv|dng|raw|tiff?|bmp)(\(\d+\))?\.[^/]*json$/i;

/** Quick path-based filter before we spend time decompressing an entry. */
export function isCandidatePath(path: string): boolean {
  const lower = path.toLowerCase();
  if (!/\.(json|html?|csv)$/.test(lower)) return false;
  if (MEDIA_SIDECAR.test(lower)) return false;
  if (lower.includes("supplemental-metadata") || lower.endsWith("metadata.json")) return false;
  if (lower.endsWith("archive_browser.html")) return false;
  return true;
}

type Format = SourceReport["format"];

/**
 * Receives the decoded text of one file in chunks, sniffs what kind of
 * Takeout file it is from the first few kilobytes, then streams it through
 * the right parser. Unknown files are skipped cheaply.
 */
export class FileTextSink {
  private head = "";
  private format: Format | null | undefined; // undefined = not decided yet, null = ignore
  private json?: JsonObjectSplitter;
  private html?: HtmlActivitySplitter;
  private csvRest = "";
  private csvRow = 0;
  events = 0;

  constructor(
    private readonly path: string,
    private readonly emit: (e: HistoryEvent) => void,
  ) {}

  get recognised(): Format | null | undefined {
    return this.format;
  }

  /** True once we know the file is not interesting; the caller may stop reading. */
  get ignored(): boolean {
    return this.format === null;
  }

  push(chunk: string): void {
    if (this.format === null) return;
    if (this.format === undefined) {
      this.head += chunk;
      if (this.head.length < 4096) return;
      this.decide(false);
      const buffered = this.head;
      this.head = "";
      this.feed(buffered);
      return;
    }
    this.feed(chunk);
  }

  end(): void {
    if (this.format === undefined) {
      this.decide(true);
      const buffered = this.head;
      this.head = "";
      this.feed(buffered);
    }
    this.html?.end();
    if (this.format === "subscriptions-csv" && this.csvRest) this.csvLine(this.csvRest);
  }

  private decide(complete: boolean): void {
    const head = this.head.replace(/^﻿/, "").trimStart();
    const lower = this.path.toLowerCase();
    if (lower.endsWith(".json")) {
      if (head.startsWith("[") && (/"(header|title|titleUrl|time)"\s*:/.test(head) || (complete && /^\[\s*\]/.test(head)))) {
        this.format = "activity-json";
      } else if (head.startsWith("{") && /"Browser History"\s*:/.test(head)) {
        this.format = "chrome-json";
      } else {
        this.format = null;
      }
    } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
      // My Activity pages start with a large <style> block, so the marker may come later.
      this.format = /<html|<!doctype/i.test(head) ? "activity-html" : null;
    } else if (lower.endsWith(".csv")) {
      this.format = /youtube\.com\/channel\/UC|^\s*channel id\s*,/im.test(head) ? "subscriptions-csv" : null;
    } else {
      this.format = null;
    }
    if (this.format === "activity-json") this.json = new JsonObjectSplitter(1, (t) => this.activityJson(t));
    if (this.format === "chrome-json") this.json = new JsonObjectSplitter(2, (t) => this.chromeJson(t));
    if (this.format === "activity-html") this.html = new HtmlActivitySplitter((r) => this.activity(r));
  }

  private feed(text: string): void {
    if (!text) return;
    if (this.json) this.json.push(text);
    else if (this.html) this.html.push(text);
    else if (this.format === "subscriptions-csv") {
      const lines = (this.csvRest + text).split(/\r?\n/);
      this.csvRest = lines.pop() ?? "";
      for (const line of lines) this.csvLine(line);
    }
  }

  private out(e: HistoryEvent | undefined): void {
    if (!e) return;
    this.events++;
    this.emit(e);
  }

  private activity(raw: RawActivity): void {
    this.out(classify(raw));
  }

  private activityJson(text: string): void {
    let raw: RawActivity;
    try {
      raw = JSON.parse(text);
    } catch {
      return;
    }
    this.activity(raw);
  }

  private chromeJson(text: string): void {
    let raw: { url?: string; title?: string; time_usec?: number };
    try {
      raw = JSON.parse(text);
    } catch {
      return;
    }
    if (!raw.url || !/^https?:\/\//i.test(raw.url)) return;
    // Chrome history repeats Google searches that My Activity already has; keep sites only.
    const e = classify({ title: raw.title, titleUrl: raw.url, time: raw.time_usec ? raw.time_usec / 1000 : undefined });
    if (e?.kind === "visit") this.out(e);
  }

  private csvLine(line: string): void {
    this.csvRow++;
    const cells = parseCsvLine(line);
    if (cells.length < 3) return;
    const id = cells.find((c) => /^UC[\w-]{10,}$/.test(c)) ?? channelIdOf(cells[1]);
    if (!id) return; // header row or junk
    const name = cells[2]?.trim();
    this.out({ kind: "ytSub", text: name || id, channel: name || undefined, channelId: id });
  }
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}
