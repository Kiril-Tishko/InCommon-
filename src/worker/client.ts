/**
 * Runs heavy work in a web worker so the page stays responsive while a
 * multi-gigabyte export is read. If the worker can't start (some sandboxed
 * pages refuse workers), the same code runs on the main thread instead.
 */
import ImportWorker from "./import.worker?worker&inline";
import { CodeWordMismatch, type Comparison } from "../core/compare";
import type { ShareOptions } from "../core/matchfile";
import type { MatchFile, Profile } from "../core/types";
import type { Progress, Request, Response } from "./protocol";

export class TaskError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

type Payload = Request extends infer R ? (R extends { type: "cancel" } ? never : Omit<R, "id">) : never;

interface Pending {
  payload: Payload;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  onProgress?: (p: Progress) => void;
}

let worker: Worker | null | undefined;
/** Set once the worker has answered at least once, i.e. it really started. */
let workerStarted = false;
const pending = new Map<number, Pending>();
let nextId = 1;

async function runOnMainThread<T>(payload: Payload, onProgress?: (p: Progress) => void, signal?: AbortSignal): Promise<T> {
  const tasks = await import("./tasks");
  const prog = onProgress ?? (() => {});
  try {
    if (payload.type === "import") return (await tasks.doImport(payload.files, prog, signal)) as T;
    if (payload.type === "share") return (await tasks.doShare(payload.profile, payload.opts, prog)) as T;
    return (await tasks.doCompare(payload.profile, payload.opts, payload.friend, prog)) as T;
  } catch (err) {
    throw new TaskError(err instanceof Error ? err.message : String(err), err instanceof CodeWordMismatch ? "code-word" : undefined);
  }
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const w = new ImportWorker();
    w.onmessage = (ev: MessageEvent<Response>) => {
      workerStarted = true;
      const msg = ev.data;
      const p = pending.get(msg.id);
      if (!p) return;
      if (msg.type === "progress") p.onProgress?.(msg.progress);
      else {
        pending.delete(msg.id);
        if (msg.type === "done") p.resolve(msg.result);
        else p.reject(new TaskError(msg.message, msg.code));
      }
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      const waiting = [...pending.values()];
      pending.clear();
      if (!workerStarted) {
        // Never started: switch to the main thread for good and retry what was queued.
        worker = null;
        w.terminate();
        for (const p of waiting) runOnMainThread(p.payload, p.onProgress).then(p.resolve, p.reject);
        return;
      }
      for (const p of waiting) p.reject(new TaskError("The background reader stopped unexpectedly, possibly out of memory. Reload the page and try again."));
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

interface Running<T> {
  promise: Promise<T>;
  cancel: () => void;
}

function run<T>(payload: Payload, onProgress?: (p: Progress) => void): Running<T> {
  const w = getWorker();
  if (!w) {
    const ctrl = new AbortController();
    return { promise: runOnMainThread<T>(payload, onProgress, ctrl.signal), cancel: () => ctrl.abort() };
  }
  const id = nextId++;
  const promise = new Promise<T>((resolve, reject) => {
    pending.set(id, { payload, resolve: resolve as (v: unknown) => void, reject, onProgress });
    w.postMessage({ ...payload, id } as Request);
  });
  return { promise, cancel: () => worker?.postMessage({ id, type: "cancel" } satisfies Request) };
}

export const importFiles = (files: File[], onProgress?: (p: Progress) => void) =>
  run<Profile>({ type: "import", files }, onProgress);

export const makeMatchFile = (profile: Profile, opts: ShareOptions, onProgress?: (p: Progress) => void) =>
  run<MatchFile>({ type: "share", profile, opts }, onProgress);

export const compareWith = (profile: Profile, opts: ShareOptions, friend: MatchFile, onProgress?: (p: Progress) => void) =>
  run<Comparison>({ type: "compare", profile, opts, friend }, onProgress);
