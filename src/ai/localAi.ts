/**
 * Talking to an AI model that runs on this computer: Ollama (native API) or
 * anything OpenAI-compatible, such as LM Studio. Nothing here contacts an
 * online service; every address is this machine.
 *
 * When InCommon itself runs on this PC (start.bat / `npm run local`), its
 * server forwards /local-ai/ollama and /local-ai/lmstudio to those programs,
 * which avoids browser cross-origin rules. Direct localhost addresses are
 * tried too, for setups that allow them.
 */
import type { ChatMessage } from "./prompts";

export type ServerKind = "ollama" | "openai";

export interface AiServer {
  base: string;
  kind: ServerKind;
  label: string;
  models: string[];
}

export const CANDIDATES: { base: string; label: string }[] = [
  { base: "/local-ai/ollama", label: "Ollama" },
  { base: "/local-ai/lmstudio", label: "LM Studio" },
  { base: "http://localhost:11434", label: "Ollama" },
  { base: "http://localhost:1234", label: "LM Studio" },
];

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return undefined;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("json")) return undefined; // e.g. the app's own index.html
    return await res.json();
  } catch {
    return undefined;
  }
}

const isChatModel = (name: string) => !/embed|bge-|nomic-embed|rerank|whisper/i.test(name);

export async function probe(base: string, label: string, timeoutMs = 2500): Promise<AiServer | undefined> {
  const clean = base.replace(/\/+$/, "");
  const tags = (await getJson(`${clean}/api/tags`, timeoutMs)) as { models?: { name?: string; model?: string }[] } | undefined;
  if (tags && Array.isArray(tags.models)) {
    const models = tags.models.map((m) => m.name ?? m.model ?? "").filter((m) => m && isChatModel(m));
    return { base: clean, kind: "ollama", label, models };
  }
  const list = (await getJson(`${clean}/v1/models`, timeoutMs)) as { data?: { id?: string }[] } | undefined;
  if (list && Array.isArray(list.data)) {
    const models = list.data.map((m) => m.id ?? "").filter((m) => m && isChatModel(m));
    return { base: clean, kind: "openai", label, models };
  }
  return undefined;
}

/** Finds the first AI server that answers. A custom address, if given, is tried first. */
export async function findLocalAi(custom?: string): Promise<AiServer | undefined> {
  const list = custom?.trim() ? [{ base: custom.trim(), label: "Your AI server" }, ...CANDIDATES] : CANDIDATES;
  for (const c of list) {
    const found = await probe(c.base, c.label);
    if (found) return found;
  }
  return undefined;
}

/** True when the page itself is served from this computer, which is what makes local AI reachable. */
export function servedLocally(): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
}

async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl = buf.indexOf("\n");
      while (nl >= 0) {
        yield buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        nl = buf.indexOf("\n");
      }
    }
    buf += decoder.decode();
    if (buf) yield buf;
  } finally {
    reader.releaseLock();
  }
}

async function failure(res: Response): Promise<Error> {
  let detail = "";
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      detail = j.error?.message ?? j.error ?? text;
    } catch {
      detail = text;
    }
  } catch {
    /* no body */
  }
  if (res.status === 404 && /model/i.test(detail)) return new Error(`The AI server doesn't have that model. ${detail}`);
  return new Error(`The AI server answered ${res.status}${detail ? `: ${String(detail).slice(0, 200)}` : ""}`);
}

/** Streams the reply as text pieces. */
export async function* streamChat(
  server: AiServer,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  if (server.kind === "ollama") {
    const res = await fetch(`${server.base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true, options: { num_ctx: 8192, temperature: 0.8 } }),
      signal,
    });
    if (!res.ok || !res.body) throw await failure(res);
    for await (const line of lines(res.body)) {
      if (!line.trim()) continue;
      const obj = JSON.parse(line) as { message?: { content?: string }; error?: string; done?: boolean };
      if (obj.error) throw new Error(obj.error);
      if (obj.message?.content) yield obj.message.content;
      if (obj.done) return;
    }
    return;
  }

  const res = await fetch(`${server.base}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.8 }),
    signal,
  });
  if (!res.ok || !res.body) throw await failure(res);
  for await (const line of lines(res.body)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return;
    const obj = JSON.parse(data) as { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
    if (obj.error) throw new Error(obj.error.message ?? "The AI server reported an error.");
    const piece = obj.choices?.[0]?.delta?.content;
    if (piece) yield piece;
  }
}

/**
 * Reasoning models wrap their scratch work in <think>…</think>. Hide it, and
 * report whether the model is still inside such a block.
 */
export function visibleText(raw: string): { text: string; thinking: boolean } {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const open = text.indexOf("<think>");
  const thinking = open >= 0;
  if (thinking) text = text.slice(0, open);
  return { text: text.replace(/^\s+/, ""), thinking };
}
