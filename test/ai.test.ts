import { afterAll, beforeAll, describe, expect, it } from "vitest";
type Server = { close(): void };
// @ts-expect-error plain JS helper without types
import { startMockAi } from "../scripts/mock-ai.mjs";
import { probe, streamChat, visibleText, findLocalAi } from "../src/ai/localAi";
import { portraitMessages, togetherMessages, asPlainPrompt } from "../src/ai/prompts";
import { parseBlocks } from "../src/ui/Markdown";
import { demoProfile, DEMO_CODE_WORD } from "../src/core/demo";
import { buildMatchFile, DEFAULT_INCLUDE } from "../src/core/matchfile";
import { compare, type Comparison } from "../src/core/compare";
import type { Profile } from "../src/core/types";

let alex: Profile;
let together: Comparison;
const servers: Server[] = [];

beforeAll(async () => {
  alex = demoProfile("Alex", 0.4);
  const sam = demoProfile("Sam", 0.4);
  const o = (name: string) => ({ name, codeWord: DEMO_CODE_WORD, include: DEFAULT_INCLUDE, hideWords: [] });
  together = await compare(alex, o("Alex"), await buildMatchFile(sam, o("Sam")));
  servers.push(await startMockAi({ port: 39434, kind: "ollama" }));
  servers.push(await startMockAi({ port: 39435, kind: "openai" }));
});
afterAll(() => servers.forEach((s) => s.close()));

describe("prompts", () => {
  it("summarise your own history within budget, music first", () => {
    const [sys, user] = portraitMessages(alex, "Alex", "English");
    expect(sys.content).toMatch(/Never speculate about health/);
    expect(user.content).toContain("MUSIC ARTISTS");
    expect(user.content).toContain("Velvet Harbor");
    expect(user.content).toContain("sourdough hydration calculator");
    expect(user.content).not.toMatch(/^- weather —/m);
    expect(user.content.length).toBeLessThan(12_000);
  });

  it("only describe what both friends share", () => {
    const text = asPlainPrompt(togetherMessages(together, "Russian"));
    expect(text).toContain("Write in Russian");
    expect(text).toContain("MUSIC ARTISTS BOTH PLAY");
    expect(text).toContain("Velvet Harbor");
    // Alex-only and Sam-only interests can't be in there
    expect(text).not.toContain("Static Orchard");
    expect(text).not.toContain("Juniper Vale");
    expect(text).not.toContain("python");
    expect(text).not.toContain("monstera");
    expect(text.length).toBeLessThan(13_000);
  });
});

describe("local AI client", () => {
  it("recognises Ollama and OpenAI-compatible servers and skips embedding models", async () => {
    expect(await probe("http://127.0.0.1:39434", "Ollama")).toEqual({
      base: "http://127.0.0.1:39434",
      kind: "ollama",
      label: "Ollama",
      models: ["mock-model:latest"],
    });
    expect(await probe("http://127.0.0.1:39435/", "LM Studio")).toMatchObject({ kind: "openai", models: ["mock-model:latest"] });
    expect(await probe("http://127.0.0.1:39499", "nothing", 500)).toBeUndefined();
  });

  it("tries a custom address first", async () => {
    expect(await findLocalAi("http://127.0.0.1:39435")).toMatchObject({ label: "Your AI server", kind: "openai" });
  });

  for (const [port, kind] of [[39434, "ollama"], [39435, "openai"]] as const) {
    it(`streams an answer from ${kind}`, async () => {
      const server = (await probe(`http://127.0.0.1:${port}`, kind))!;
      let raw = "";
      for await (const piece of streamChat(server, "mock-model:latest", togetherMessages(together, "English"))) raw += piece;
      const { text, thinking } = visibleText(raw);
      expect(thinking).toBe(false);
      expect(text).not.toContain("planning the answer");
      expect(text).toContain("You both keep coming back to **Velvet Harbor**");
      expect(parseBlocks(text).filter((b) => b.type === "h").length).toBe(2);
    });
  }

  it("hides reasoning while the model is still thinking", () => {
    expect(visibleText("<think>hmm")).toEqual({ text: "", thinking: true });
    expect(visibleText("<think>a</think>\n## Hi")).toEqual({ text: "## Hi", thinking: false });
  });
});

describe("markdown", () => {
  it("parses headings, lists and paragraphs", () => {
    const blocks = parseBlocks("## Title\nSome text\ncontinues\n\n- a\n- b\n1. one\n2. two");
    expect(blocks).toEqual([
      { type: "h", level: 2, text: "Title" },
      { type: "p", text: "Some text continues" },
      { type: "ul", items: ["a", "b"] },
      { type: "ol", items: ["one", "two"] },
    ]);
  });
});
