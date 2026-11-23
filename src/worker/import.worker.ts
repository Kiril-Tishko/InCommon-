/// <reference lib="webworker" />
import type { Progress, Request, Response } from "./protocol";
import { doCompare, doImport, doShare } from "./tasks";
import { CodeWordMismatch } from "../core/compare";

const post = (r: Response) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(r);
const running = new Map<number, AbortController>();

self.onmessage = async (ev: MessageEvent<Request>) => {
  const req = ev.data;
  if (req.type === "cancel") {
    running.get(req.id)?.abort();
    return;
  }
  const ctrl = new AbortController();
  running.set(req.id, ctrl);
  const progress = (p: Progress) => post({ id: req.id, type: "progress", progress: p });
  try {
    let result;
    if (req.type === "import") result = await doImport(req.files, progress, ctrl.signal);
    else if (req.type === "share") result = await doShare(req.profile, req.opts, progress);
    else result = await doCompare(req.profile, req.opts, req.friend, progress);
    post({ id: req.id, type: "done", result });
  } catch (err) {
    post({
      id: req.id,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
      code: err instanceof CodeWordMismatch ? "code-word" : undefined,
    });
  } finally {
    running.delete(req.id);
  }
};
