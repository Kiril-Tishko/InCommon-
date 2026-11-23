# InCommon: notes for Claude

## What this is and what the owner wants

InCommon lets two friends compare their Google history (Takeout) and find what they have in common, without either of them seeing the other's history. The owner cares most about:

1. **Music taste in common.** This is the "big thing". Sources: YouTube Music, music videos on YouTube, Spotify downloads.
2. **AI analysis that runs locally on the PC** (Ollama or LM Studio), so the result is more interesting than lists, and the data never leaves the computer.
3. Fun findings: the search you made 100 times, the rare thing you both looked up the same week.

The owner isn't a developer. Explain in plain words, do the technical steps for them, and keep their personal data on their machine.

## How it works (see README.md for detail)

- Browser-only React + TypeScript app (Vite). Takeout zips are streamed and parsed on the device (`src/core/parse/*`), then grouped into a `Profile` (`src/core/profile.ts`) of searches, keywords, YouTube channels and videos, sites, and music artists and songs (`src/core/music.ts`).
- Friends exchange **match files** (`src/core/matchfile.ts`). Each item is HMAC-SHA-256-keyed by a shared code word, so each side only learns the overlap. `src/core/compare.ts` ranks shared items, finds same-week coincidences and computes the 0–100 score.
- Local AI: `src/ai/localAi.ts` finds Ollama or an OpenAI-compatible server. When served by `npm run local`, it goes through the `/local-ai/ollama` and `/local-ai/lmstudio` proxies in `vite.config.ts`. `src/ai/prompts.ts` builds compact prompts (about 8k context). The comparison prompt contains only shared items, and the system prompt forbids speculation about sensitive topics.
- `InCommon.html` in the repo root is a prebuilt single-file copy that works by double-click (no AI). Rebuild it with `npm run build:standalone` after UI changes. `index.html` is the source entry and shows a "open InCommon.html" message when opened directly.

## Commands

```
npm install
npm test                  # vitest, 51 tests
npm run typecheck
npm run local             # build + serve on http://127.0.0.1:4173 with the local-AI proxy (start.bat does this)
npm run sample            # fake Takeout/Spotify zips for "Alex" and "Sam" in samples/
node scripts/mock-ai.mjs  # fake Ollama on :11434 for testing the AI panels
npm run build:standalone  # refresh InCommon.html
```

Node 20.19+ or 22.12+ is required (Vite 8). `.npmrc` sets `legacy-peer-deps` because of a peer-dependency quirk with vitest.

## Rules

- Never upload, paste or commit the owner's real history: no Takeout files, no match files, no profile dumps. `.gitignore` covers the usual names. When debugging their export, print only counts, date ranges and record *shapes*, never their search text, unless they ask to see it.
- Ask before installing software (Node.js, Ollama, models); installs and model downloads are big.
- If normalisation output changes (`src/core/normalize.ts`, `music.ts` keys), bump `NORM_VERSION`. Otherwise old match files silently stop matching.
- Keep everything working offline. The only network calls are to an AI program on the same PC.

## Where things stand

Done and tested: Takeout parsing (JSON and HTML, multi-language dates), Spotify import, music matching across apps, match files, comparison, coverage warnings, AI panels (tested with a real Qwen2.5 1.5B model through an OpenAI-compatible server; small models make mistakes, so recommend 7B+).

## Next steps on the owner's PC (Windows, computer "TKS")

1. **Set up:** check `node -v`. If Node is missing, offer to install the LTS (`winget install OpenJS.NodeJS.LTS`, with their OK). Then run `npm install` and `npm test`.
2. **Local AI:** check `ollama --version` and `ollama list`. If Ollama is missing, offer `winget install Ollama.Ollama`. Pick a model to fit the hardware: check `nvidia-smi` for GPU memory; use `qwen2.5:7b` by default, `gemma3:12b` with 12 GB+ VRAM, and something smaller only if the PC is weak. Then run `npm run local`, open the demo, and check that "Connect to the AI on this PC" finds Ollama and writes both write-ups.
3. **Their real data:** they have a Google Takeout zip whose history seems to cover **only 2022**, with a My Activity **HTML** file of about 12 MB.
   - Help them load it in the app.
   - If the import shows no dates, odd years or zero items, debug the parser locally against their file, without printing their searches. The HTML date format may be non-English: see `parseActivityDate` in `src/core/parse/htmlActivity.ts`.
   - Explain the 2022 limit: usually auto-delete, paused Web & App Activity, or an older download. The app shows coverage warnings for this. Suggest checking myactivity.google.com and requesting a fresh export (JSON format, My Activity + YouTube history/subscriptions).
   - Suggest adding their Spotify "Extended streaming history" download for the music side.
4. **Then improve with them:** prompt quality with their chosen model, and music matching on their real data (e.g. channels that should count as music but don't).

Development branch: `ccr-3d73e667-c3o359` on `github.com/Kiril-Tishko/InCommon-`.
