// A fake local AI server for tests and demos. Speaks enough of the Ollama API
// (/api/tags, /api/chat) or the OpenAI-compatible API (/v1/models,
// /v1/chat/completions) to stream a canned answer.
//   node scripts/mock-ai.mjs            -> fake Ollama on 127.0.0.1:11434
//   node scripts/mock-ai.mjs openai 1234 -> fake LM Studio on 127.0.0.1:1234
import { createServer } from "node:http";

function answer(prompt) {
  const firstArtist = (prompt.match(/MUSIC ARTISTS[^\n]*:\n- ([^—\n]+)/) ?? [])[1]?.trim();
  return [
    "## You two in one line",
    "**The Night Bus Bakery Club**: two people who knead dough and watch race replays.",
    "",
    "## Your shared music taste",
    firstArtist ? `You both keep coming back to **${firstArtist}**, probably dreamy indie.` : "No shared music found.",
    "",
    "- Paper Lanterns",
    "- 3am Tram",
    "",
    `_Read ${prompt.length} characters._`,
  ].join("\n");
}

function chunks(text) {
  const out = [];
  for (let i = 0; i < text.length; i += 12) out.push(text.slice(i, i + 12));
  return out;
}

export function startMockAi({ port = 11434, kind = "ollama", models = ["mock-model:latest"], delayMs = 5 } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let body = "";
    for await (const c of req) body += c;
    const json = body ? JSON.parse(body) : {};
    const prompt = (json.messages ?? []).map((m) => m.content).join("\n");
    const wait = () => new Promise((r) => setTimeout(r, delayMs));

    if (kind === "ollama" && url.pathname === "/api/tags") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ models: [...models, "nomic-embed-text:latest"].map((name) => ({ name, model: name })) }));
      return;
    }
    if (kind === "ollama" && url.pathname === "/api/chat") {
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      for (const piece of ["<think>", "planning the answer", "</think>", ...chunks(answer(prompt))]) {
        res.write(JSON.stringify({ model: json.model, message: { role: "assistant", content: piece }, done: false }) + "\n");
        await wait();
      }
      res.end(JSON.stringify({ model: json.model, message: { role: "assistant", content: "" }, done: true }) + "\n");
      return;
    }
    if (kind === "openai" && url.pathname === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: models.map((id) => ({ id, object: "model" })) }));
      return;
    }
    if (kind === "openai" && url.pathname === "/v1/chat/completions") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const piece of chunks(answer(prompt))) {
        res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: piece } }] })}\n\n`);
        await wait();
      }
      res.end("data: [DONE]\n\n");
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const kind = process.argv[2] ?? "ollama";
  const port = Number(process.argv[3] ?? (kind === "ollama" ? 11434 : 1234));
  await startMockAi({ kind, port });
  console.log(`Mock ${kind} AI listening on http://127.0.0.1:${port}`);
}
