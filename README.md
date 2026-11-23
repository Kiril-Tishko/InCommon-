# InCommon

Two friends each download their Google history, and InCommon shows what they have in common: the search you both made a hundred times, the channel you both binge, the artists you both play, the rare thing you both looked up in the same week. An AI model running on your own PC can then write it up as a portrait of you, or of the two of you.

Everything runs on your device. Nobody's history is uploaded anywhere, and you never see your friend's history, only the overlap.

## Run it on your PC (Windows)

**Without installing anything:** download this repository (on GitHub: **Code → Download ZIP**), unzip it, and double-click **InCommon.html**. Everything works except the AI write-ups. (`index.html` is the app's source and won't run on its own.)

**With the AI write-ups:**

1. Install [Node.js](https://nodejs.org/) (the LTS version).
2. For the AI write-ups, install [Ollama](https://ollama.com/download) and download a model from a terminal: `ollama pull qwen2.5:7b` (about 5 GB), or `ollama pull gemma3:12b` if you have a graphics card with 12 GB or more. Models under about 7B tend to make things up. LM Studio works too: load a model and start its server.
3. Download this repository (on GitHub: **Code → Download ZIP**, then unzip it).
4. Double-click **start.bat**. The first start installs what InCommon needs (about a minute), then your browser opens InCommon at `http://127.0.0.1:4173`.

On macOS or Linux, run `./start.sh` instead.

## How it works

1. **Load.** Each person downloads their data from [Google Takeout](https://takeout.google.com/) (My Activity, YouTube history and subscriptions, optionally Chrome) and loads the `.zip` into the app. The app streams through the zip on the device: no upload, no server.
2. **Your history.** The export is grouped into searches, search words, YouTube channels, videos, YouTube searches, Maps searches, websites, music artists and songs, with counts and dates. You get your own stats: top searches by year, the search you came back to most, your top artists and songs, your hour-of-day rhythm. A Spotify download can be added on top.
3. **Match file.** The two friends agree on a code word. Each person makes a *match file*: every item is replaced by `HMAC-SHA-256(key, item)`, where the key comes from the code word (PBKDF2, 150k iterations), plus counts and up to 48 dates per item. They send each other these files.
4. **Compare.** Each person's app scrambles their own items the same way and looks them up in the friend's file. Equal codes mean both of you have the item. You see the overlap in plain text, taken from your own data, ranked so that specific, shared things come first and "weather" comes last.
5. **Ask the AI (optional).** With Ollama or LM Studio on the same PC, InCommon asks a local model to write a portrait of you (interests, music taste, how you've changed) or of the two of you (shared themes, shared music taste with a playlist, conversation starters). The comparison prompt contains only what you share, and the model is told not to speculate about sensitive topics.

### Music

Music comes from three places, and a song matches between friends whichever app each of you uses:

- **YouTube Music**: every play is in the YouTube watch history.
- **Music videos on regular YouTube**: recognised by "Artist - Topic" and VEVO channels and by titles like "Artist - Song (Official Video)". Mixes and covers without those labels are missed.
- **Spotify**: request *Extended streaming history* (all years) or *Account data* (last year) at [spotify.com/account/privacy](https://www.spotify.com/account/privacy/) and load the zip with **Add to my history**. Plays under 30 seconds and podcasts are skipped.

Titles are cleaned before matching ("Low Tide (Official Video) [4K]" and "Low Tide - 2023 Remaster" are both "Low Tide"), and a leading "The" in artist names is ignored.

### Privacy model, plainly

- The Takeout export never leaves the device. The grouped summary is kept in the browser's IndexedDB so you don't have to load the export again; **Forget my data** deletes it.
- A match file contains no readable text, except your display name and aggregate numbers: totals, activity by hour, weekday and year.
- Anyone holding both a match file and the code word can test guesses ("did they ever search X?"). That's inherent to any matching scheme. So the code word should go only to that friend, and the **Never share** list removes every item mentioning a given word from your file *and* from your own view of the comparison, so both sides always see the same overlap.
- The page makes no network requests after it loads, except to an AI program on your own PC when you press **Connect to the AI on this PC**. The font is bundled.
- The AI runs on your PC, so its input and answer stay there. **Copy the prompt instead** gives you the same text to paste into any AI chat; if that chat is an online service, the summary goes to that company.

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # parser, matching and comparison tests (vitest)
npm run typecheck
npm run sample       # writes fake Takeout zips for "Alex" and "Sam" (and Sam's Spotify zip) to samples/
npm run local        # build and open on http://127.0.0.1:4173, with the local-AI proxy
node scripts/mock-ai.mjs  # a fake Ollama on port 11434, for trying the AI panels without a model
npm run build        # static site in dist/ for any static host (e.g. GitHub Pages)
npm run build:artifact  # single self-contained page in dist-single/
npm run build:standalone  # refresh InCommon.html, the double-click version in the repo root
```

The demo people, Alex and Sam, and the sample zips are generated by `src/core/sample.ts`. Every name, channel and site in them is made up.

### Layout

```
src/core/            everything that isn't UI, runs in a worker or in Node
  parse/router.ts      sniffs each file in the zip and streams it to the right parser
  parse/jsonStream.ts  splits huge JSON arrays without loading them whole
  parse/htmlActivity.ts  the HTML flavour of My Activity, with multi-language dates
  parse/classify.ts    turns a My Activity record into a search / watch / visit, by URL
  normalize.ts         text normalisation, stopwords, site names (NORM_VERSION)
  profile.ts           folds events into a Profile (counts + days per item)
  takeout.ts           reads zips and loose files, reports progress
  matchfile.ts         builds, encodes and reads match files
  compare.ts           overlap, ranking, coincidences, rhythm, score
  music.ts             recognising songs on YouTube, cleaning titles, reading Spotify exports
src/ai/
  prompts.ts           what the AI reads: compact summaries, sized for an 8k context
  localAi.ts           finds Ollama / LM Studio on this PC and streams the answer
src/worker/          runs the heavy steps off the main thread (falls back if workers are blocked)
src/ui/              React screens: Load, MyHistory, Share, Compare
```

### What Takeout gives us

| Takeout product | File(s) | Used for |
|---|---|---|
| My Activity → Search | `MyActivity.json` / `.html` | Google searches, sites opened from results |
| My Activity → YouTube, YouTube history | `watch-history.json`, `search-history.json` | videos, channels, YouTube searches |
| YouTube subscriptions | `subscriptions.csv` | channels you subscribe to |
| My Activity → Maps | `MyActivity.json` | Maps searches |
| My Activity → Chrome, Chrome | `History.json` | websites |
| Spotify (separate download) | `Streaming_History_Audio_*.json`, `StreamingHistory_music_*.json` | artists, songs |

Records are classified by URL rather than by their localised titles, so exports in any language work. JSON is preferred; HTML exports are supported, with dates parsed for English, Russian, Ukrainian, Spanish, Portuguese, German, French and Italian formats. Location history is no longer part of Takeout (Google moved Timeline onto phones), so places aren't compared.

## Ideas for next steps

- **AI in the browser.** Run a small model inside the page with WebGPU, so the AI write-ups work without installing Ollama.
- **Genres.** Artist genres would make music matching broader ("you both like shoegaze" even without a shared artist); today the AI infers them.
- **Fuzzy matching.** Today two searches match only when they normalise to the same words. Shared topics already catch different wordings; embeddings would catch "sourdough starter" vs "levain".
- **Timeline.** A year-by-year view of when your interests overlapped.
- **Group mode.** Three or more friends, each pair compared.
- **Hosting.** `npm run build` output can be served from GitHub Pages or any static host; a workflow for that is easy to add. Local AI then needs Ollama's `OLLAMA_ORIGINS` to allow that site.
