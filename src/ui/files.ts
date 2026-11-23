/**
 * Getting a file to the user. Inside a claude.ai artifact, page-started
 * downloads are blocked and the `downloads` capability asks the viewer
 * instead; everywhere else a normal download link works.
 */
interface DownloadsCapability {
  save(req: { filename: string; data: Blob | string }): Promise<{ status: string }>;
}
interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

let downloads: Promise<DownloadsCapability | null> | undefined;

function hostDownloads(): Promise<DownloadsCapability | null> {
  const claude = (window as unknown as { claude?: ClaudeHost }).claude;
  if (!claude?.use) return Promise.resolve(null);
  downloads ??= claude.use("downloads").then(
    (d) => (d as DownloadsCapability | null) ?? null,
    () => null,
  );
  return downloads;
}

/** Start resolving the host capability early so the first click is fast. */
export function warmUpDownloads(): void {
  void hostDownloads();
}

export type SaveOutcome = "saved" | "declined" | "unavailable";

export async function saveFile(filename: string, blob: Blob): Promise<SaveOutcome> {
  const host = await hostDownloads();
  if (host) {
    try {
      await host.save({ filename, data: blob });
      return "saved";
    } catch (err) {
      const code = (err as { code?: string })?.code;
      return code === "declined" ? "declined" : "unavailable";
    }
  }
  if ((window as unknown as { claude?: ClaudeHost }).claude) return "unavailable";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "saved";
}

/** The phone share sheet (Messages, WhatsApp, Telegram…), where the browser supports sharing files. */
export function canShareFiles(): boolean {
  try {
    const probe = new File(["{}"], "x.json", { type: "application/json" });
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function shareFile(filename: string, blob: Blob, text: string): Promise<boolean> {
  try {
    await navigator.share({ files: [new File([blob], filename, { type: "application/json" })], text });
    return true;
  } catch {
    return false;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
