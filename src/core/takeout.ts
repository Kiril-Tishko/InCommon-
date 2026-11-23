import { BlobReader, ZipReader, configure, type Entry, type FileEntry } from "@zip.js/zip.js";
import { FileTextSink, isCandidatePath } from "./parse/router";
import { ProfileBuilder } from "./profile";
import type { Profile } from "./types";

// We already run inside our own worker; don't let zip.js spawn more.
configure({ useWebWorkers: false });

export interface ImportProgress {
  /** Human-readable step, e.g. the file being read. */
  step: string;
  /** 0..1 across everything selected. */
  fraction: number;
  events: number;
}

export interface ImportOptions {
  onProgress?: (p: ImportProgress) => void;
  signal?: AbortSignal;
}

class Aborted extends Error {
  constructor() {
    super("Import cancelled");
  }
}

/** Stream a byte source through a text sink, stopping early if the sink loses interest. */
async function pump(
  stream: ReadableStream<Uint8Array>,
  sink: FileTextSink,
  onBytes: (n: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const decoder = new TextDecoder("utf-8");
  const reader = stream.getReader();
  try {
    for (;;) {
      if (signal?.aborted) throw new Aborted();
      const { done, value } = await reader.read();
      if (done) break;
      onBytes(value.byteLength);
      sink.push(decoder.decode(value, { stream: true }));
      if (sink.ignored) {
        await reader.cancel().catch(() => {});
        return;
      }
    }
    sink.push(decoder.decode());
    sink.end();
  } finally {
    reader.releaseLock?.();
  }
}

function entryStream(entry: FileEntry): ReadableStream<Uint8Array> {
  // getData writes into the writable side; we read the readable side.
  const ts = new TransformStream<Uint8Array, Uint8Array>();
  // Cancelling the reader early rejects this promise; real errors also reach the readable side.
  entry.getData(ts.writable).catch(() => {});
  return ts.readable;
}

/**
 * Read one or more Takeout zips (or loose .json/.html/.csv files taken out of
 * them) and build a Profile. Runs fine on the main thread, but is meant to be
 * called from a worker.
 */
export async function importTakeout(files: File[], opts: ImportOptions = {}): Promise<Profile> {
  const builder = new ProfileBuilder();
  const totalBytes = files.reduce((s, f) => s + f.size, 0) || 1;
  let doneBytes = 0;
  const report = (step: string, extra = 0) =>
    opts.onProgress?.({ step, fraction: Math.min(1, (doneBytes + extra) / totalBytes), events: builder.eventCount });

  for (const file of files) {
    if (opts.signal?.aborted) throw new Aborted();
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".zip")) {
      const zip = new ZipReader(new BlobReader(file));
      let entries: Entry[];
      try {
        entries = await zip.getEntries();
      } catch {
        throw new Error(`"${file.name}" is not a zip file Takeout produced, or it is damaged.`);
      }
      const candidates = entries.filter((e): e is FileEntry => !e.directory && isCandidatePath(e.filename));
      const candidateBytes = candidates.reduce((s, e) => s + (e.compressedSize || 0), 0) || 1;
      let zipDone = 0;
      for (const entry of candidates) {
        const sink = new FileTextSink(entry.filename, (ev) => builder.add(ev));
        const ratio = (entry.compressedSize || 0) / Math.max(1, entry.uncompressedSize || 1);
        let read = 0;
        report(shortName(entry.filename), (zipDone / candidateBytes) * file.size);
        try {
          await pump(
            entryStream(entry),
            sink,
            (n) => {
              read += n;
              const approx = zipDone + Math.min(entry.compressedSize || 0, read * ratio);
              if (read % (1 << 22) < n) report(shortName(entry.filename), (approx / candidateBytes) * file.size);
            },
            opts.signal,
          );
        } catch (err) {
          if (err instanceof Aborted) throw err;
          console.warn("Skipped", entry.filename, err);
        }
        zipDone += entry.compressedSize || 0;
        if (sink.recognised && sink.events > 0) {
          builder.sources.push({ path: entry.filename, format: sink.recognised, events: sink.events });
        }
      }
      await zip.close();
    } else if (isCandidatePath(file.name)) {
      const sink = new FileTextSink(file.name, (ev) => builder.add(ev));
      let read = 0;
      report(file.name);
      await pump(
        file.stream(),
        sink,
        (n) => {
          read += n;
          if (read % (1 << 22) < n) report(file.name, read);
        },
        opts.signal,
      );
      if (sink.recognised && sink.events > 0) {
        builder.sources.push({ path: file.name, format: sink.recognised, events: sink.events });
      }
    }
    doneBytes += file.size;
    report("Finishing up");
  }

  report("Grouping everything");
  return builder.finish();
}

function shortName(path: string): string {
  const parts = path.split("/");
  return parts.slice(-3).join(" / ");
}
