/**
 * Two made-up people, "Alex" and "Sam", with Takeout-shaped history files.
 * Used by the in-app demo, the tests and scripts/make-samples.mjs.
 * Every name, channel and site here is fictional (sites use the .example TLD).
 */
import type { RawActivity } from "./parse/classify";

export interface SampleFile {
  path: string;
  content: string;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T,>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

function videoId(rng: Rng): string {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let s = "";
  for (let i = 0; i < 11; i++) s += abc[Math.floor(rng() * abc.length)];
  return s;
}

function channelUrl(name: string): string {
  let h = 0;
  for (const c of name) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  return `https://www.youtube.com/channel/UC${h.toString(36).padStart(8, "0")}SampleChan${name.length}`;
}

interface Channel {
  name: string;
  videos: { id: string; title: string }[];
}

function makeChannel(rng: Rng, name: string, titles: string[]): Channel {
  return { name, videos: titles.map((title) => ({ id: videoId(rng), title })) };
}

interface Persona {
  name: string;
  seed: number;
  /** Peak hour of activity, local time. */
  peakHour: number;
  searches: [string, number][]; // query, weight
  ytSearches: [string, number][];
  mapsSearches: [string, number][];
  channels: [Channel, number][];
  sites: [string, number][];
  subscriptions: Channel[];
  /** Artists and how much they're played. */
  music: [Artist, number][];
  /** Where this person listens. */
  musicApp: "ytmusic" | "spotify";
}

interface Artist {
  name: string;
  /** How the artist's auto-generated YouTube channel is named, if it differs. */
  ytName?: string;
  songs: string[];
}

const ARTISTS = {
  velvet: { name: "Velvet Harbor", songs: ["Paper Lanterns", "Low Tide", "Northbound"] },
  mira: { name: "Mira Sol", songs: ["Glasshouse", "Slow Bloom"] },
  nightbus: { name: "The Night Bus Collective", ytName: "Night Bus Collective", songs: ["3am Tram", "Window Seat"] },
  orchard: { name: "Static Orchard", songs: ["Ninefold", "Copper Wire"] },
  kodama: { name: "Kodama Drive", songs: ["Neon Ferry", "Last Train to Minato"] },
  juniper: { name: "Juniper Vale", songs: ["Cedar Smoke", "Long Way Home"] },
  ada: { name: "Ada Okoro", songs: ["Indigo Hours", "Small Rooms"] },
} satisfies Record<string, Artist>;

function songVideoId(artist: string, song: string): string {
  let h = 7;
  for (const ch of artist + "/" + song) h = (Math.imul(h, 131) + ch.charCodeAt(0)) >>> 0;
  return videoId(mulberry32(h));
}

const START = Date.UTC(2017, 0, 1);
const END = Date.UTC(2026, 10, 1);

function weighted<T>(rng: Rng, xs: [T, number][]): T {
  const total = xs.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [x, w] of xs) {
    r -= w;
    if (r <= 0) return x;
  }
  return xs[xs.length - 1][0];
}

function randomTime(rng: Rng, peakHour: number, from = START, to = END): number {
  const day = Math.floor((from + rng() * (to - from)) / 86_400_000) * 86_400_000;
  // Hours cluster around the peak with a wide spread.
  const spread = (rng() + rng() + rng() - 1.5) * 8;
  const hour = (((Math.round(peakHour + spread) % 24) + 24) % 24);
  return day + hour * 3_600_000 + Math.floor(rng() * 3_600_000);
}

const iso = (t: number) => new Date(t).toISOString();

function search(q: string, t: number): RawActivity {
  return {
    header: "Search",
    title: `Searched for ${q}`,
    titleUrl: `https://www.google.com/search?q=${encodeURIComponent(q).replace(/%20/g, "+")}`,
    time: iso(t),
    products: ["Search"],
  };
}

function visit(site: string, t: number): RawActivity {
  const page = `https://www.${site}/articles/${Math.floor(t / 1e7) % 977}`;
  return {
    header: "Search",
    title: `Visited ${site}`,
    titleUrl: `https://www.google.com/url?q=${encodeURIComponent(page)}&usg=AOvVaw0sample`,
    time: iso(t),
    products: ["Search"],
  };
}

function watch(ch: Channel, v: { id: string; title: string }, t: number): RawActivity {
  return {
    header: "YouTube",
    title: `Watched ${v.title}`,
    titleUrl: `https://www.youtube.com/watch?v=${v.id}`,
    subtitles: [{ name: ch.name, url: channelUrl(ch.name) }],
    time: iso(t),
    products: ["YouTube"],
  };
}

function ytSearch(q: string, t: number): RawActivity {
  return {
    header: "YouTube",
    title: `Searched for ${q}`,
    titleUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(q).replace(/%20/g, "+")}`,
    time: iso(t),
    products: ["YouTube"],
  };
}

function mapsSearch(q: string, t: number): RawActivity {
  return {
    header: "Maps",
    title: `Searched for ${q}`,
    titleUrl: `https://www.google.com/maps/search/${encodeURIComponent(q).replace(/%20/g, "+")}`,
    time: iso(t),
    products: ["Maps"],
  };
}

function ad(t: number): RawActivity {
  return {
    header: "Search",
    title: "Visited Sample Sponsored Result",
    titleUrl: "https://www.googleadservices.com/pagead/aclk?sa=L&ai=sample",
    time: iso(t),
    products: ["Search"],
    details: [{ name: "From Google Ads" }],
  };
}

/* ---------------------------------------------------------------------- */

function buildChannels() {
  const rng = mulberry32(42);
  return {
    crumb: makeChannel(rng, "Crumb & Crust", [
      "Open crumb sourdough, start to finish",
      "My starter died. Here is how I revived it",
      "Baking in a cold kitchen: 5 fixes",
      "Rye bread for beginners",
      "Why your loaf is flat",
    ]),
    pitwall: makeChannel(rng, "Pit Wall Weekly", [
      "Every overtake from the season finale",
      "How tyre strategy really works",
      "The slowest pit stop in history",
      "Ranking every rookie season",
    ]),
    lofi: makeChannel(rng, "Lofi Lantern", ["rainy night study beats (3 hours)", "late tram ride, lofi mix"]),
    sky: makeChannel(rng, "Small Telescope Club", [
      "Watching the 2024 eclipse from a parking lot",
      "Saturn through a $200 telescope",
    ]),
    boulder: makeChannel(rng, "Boulder Notes", ["Footwork drills for V3 to V5", "Finger strength without a hangboard"]),
    code: makeChannel(rng, "Code Garden", ["Python decorators in 12 minutes", "I rewrote my CLI in Rust"]),
    kana: makeChannel(rng, "Kana a Day", ["Hiragana in one week", "Polite Japanese for travellers"]),
    plants: makeChannel(rng, "Monstera Mornings", ["Repotting a root-bound monstera", "Fungus gnats: the full fix"]),
    run: makeChannel(rng, "Long Run Club", ["Week 9 of marathon training", "Easy pace is slower than you think"]),
    jazz: makeChannel(rng, "Blue Hour Sessions", ["Modal jazz, explained on piano", "A whole album in one take"]),
    fix: makeChannel(rng, "Fix It Friday", ["Squeaky door hinge, fixed in 2 minutes", "Patching drywall like a pro"]),
  };
}

function personas(): [Persona, Persona] {
  const c = buildChannels();
  const sharedSearches: [string, number][] = [
    ["sourdough hydration calculator", 20],
    ["sourdough starter smells like acetone", 3],
    ["f1 standings", 12],
    ["how to fix a squeaky door", 1.2],
    ["best budget telescope for beginners", 1.5],
    ["cheap flights lisbon", 2],
    ["is it normal for bread to be gummy", 1],
    ["weather", 8],
    ["translate", 5],
    ["what time is the race tomorrow", 2],
  ];
  const alex: Persona = {
    name: "Alex",
    seed: 1,
    peakHour: 23,
    searches: [
      ...sharedSearches.map(([q, w]) => [q, q.startsWith("sourdough hydration") ? w * 2 : w] as [string, number]),
      ["python list comprehension", 6],
      ["rust borrow checker error e0502", 3],
      ["bouldering gym near me", 4],
      ["how to tape fingers for climbing", 2],
      ["japanese verb conjugation chart", 4],
      ["genki 1 answer key", 2],
      ["tokyo apartment prices", 1],
      ["github actions cache", 2],
      ["vim exit", 1],
      ["climbing shoes sizing", 1],
    ],
    ytSearches: [["sourdough shaping", 3], ["f1 highlights", 4], ["lofi study", 3], ["bouldering technique", 2]],
    mapsSearches: [["bakery", 2], ["climbing gym", 2], ["ramen", 1]],
    channels: [
      [c.crumb, 6], [c.pitwall, 5], [c.lofi, 4], [c.sky, 1], [c.boulder, 4], [c.code, 4], [c.kana, 3], [c.fix, 0.5],
    ],
    sites: [
      ["wikipedia.org", 6], ["breadlab.example", 4], ["f1stats.example", 3], ["stackoverflow.com", 5],
      ["climbbeta.example", 2], ["kanjiwiki.example", 2], ["skyguide.example", 0.6], ["github.com", 3],
    ],
    subscriptions: [c.crumb, c.pitwall, c.boulder, c.code, c.kana, c.lofi],
    music: [[ARTISTS.velvet, 6], [ARTISTS.nightbus, 4], [ARTISTS.mira, 2], [ARTISTS.orchard, 5], [ARTISTS.kodama, 3]],
    musicApp: "ytmusic",
  };
  const sam: Persona = {
    name: "Sam",
    seed: 2,
    peakHour: 8,
    searches: [
      ...sharedSearches,
      ["monstera yellow leaves", 5],
      ["fungus gnats houseplants", 3],
      ["marathon training plan 16 weeks", 5],
      ["how many gels for a marathon", 2],
      ["easy jazz standards piano", 3],
      ["blue note records vinyl", 1],
      ["running shoes for flat feet", 2],
      ["pothos propagation in water", 2],
      ["calathea curling leaves", 1],
      ["lisbon running routes", 1],
    ],
    ytSearches: [["sourdough shaping", 2], ["marathon tips", 3], ["jazz piano", 3], ["f1 highlights", 2]],
    mapsSearches: [["bakery", 3], ["plant shop", 2], ["running track", 1]],
    channels: [
      [c.crumb, 4], [c.pitwall, 3], [c.lofi, 1], [c.sky, 1], [c.plants, 5], [c.run, 5], [c.jazz, 4], [c.fix, 0.5],
    ],
    sites: [
      ["wikipedia.org", 6], ["breadlab.example", 3], ["f1stats.example", 2], ["leafdoctor.example", 3],
      ["runnersnotes.example", 3], ["jazzcharts.example", 2], ["skyguide.example", 0.6], ["reddit.com", 3],
    ],
    subscriptions: [c.crumb, c.pitwall, c.plants, c.run, c.jazz],
    music: [[ARTISTS.velvet, 4], [ARTISTS.mira, 5], [ARTISTS.nightbus, 2], [ARTISTS.juniper, 5], [ARTISTS.ada, 4]],
    musicApp: "spotify",
  };
  return [alex, sam];
}

/** Events both people had on (nearly) the same days, so the demo has coincidences to find. */
function sharedMoments(p: Persona): RawActivity[] {
  const c = buildChannels();
  const eclipse = Date.UTC(2024, 3, p.name === "Alex" ? 6 : 7, p.name === "Alex" ? 22 : 9, 15);
  const finale = Date.UTC(2023, 10, p.name === "Alex" ? 26 : 27, p.name === "Alex" ? 23 : 8, 40);
  return [
    search("solar eclipse viewing glasses", eclipse),
    search("solar eclipse viewing glasses", eclipse + 3_600_000 * 2),
    watch(c.sky, c.sky.videos[0], eclipse + 86_400_000 * 2),
    watch(c.pitwall, c.pitwall.videos[0], finale),
    search("abu dhabi grand prix start time", finale - 3_600_000 * 5),
  ];
}

function personaActivity(p: Persona, scale: number) {
  const rng = mulberry32(p.seed * 7919);
  const searchRecords: RawActivity[] = [];
  const youtubeWatch: RawActivity[] = [];
  const youtubeSearch: RawActivity[] = [];
  const maps: RawActivity[] = [];

  const nSearch = Math.round(2600 * scale);
  for (let i = 0; i < nSearch; i++) {
    const t = randomTime(rng, p.peakHour);
    const r = rng();
    if (r < 0.04) searchRecords.push(ad(t));
    else if (r < 0.3) searchRecords.push(visit(weighted(rng, p.sites), t + 20_000));
    else searchRecords.push(search(weighted(rng, p.searches), t));
  }
  // The "searched it 100 times" moment for Alex.
  if (p.name === "Alex") {
    for (let i = 0; i < 60 * scale; i++) {
      searchRecords.push(search("sourdough hydration calculator", randomTime(rng, p.peakHour, Date.UTC(2020, 2, 1))));
    }
  }
  const nWatch = Math.round(1800 * scale);
  for (let i = 0; i < nWatch; i++) {
    const ch = weighted(rng, p.channels);
    youtubeWatch.push(watch(ch, pick(rng, ch.videos), randomTime(rng, p.peakHour)));
  }
  for (let i = 0; i < 160 * scale; i++) youtubeSearch.push(ytSearch(weighted(rng, p.ytSearches), randomTime(rng, p.peakHour)));
  for (let i = 0; i < 70 * scale; i++) maps.push(mapsSearch(weighted(rng, p.mapsSearches), randomTime(rng, p.peakHour)));

  for (const m of sharedMoments(p)) (m.header === "YouTube" ? youtubeWatch : searchRecords).push(m);

  if (p.musicApp === "ytmusic") {
    for (let i = 0; i < 700 * scale; i++) {
      const artist = weighted(rng, p.music);
      const song = pick(rng, artist.songs);
      const t = randomTime(rng, p.peakHour, Date.UTC(2019, 0, 1));
      const yt = artist.ytName ?? artist.name;
      youtubeWatch.push(
        rng() < 0.85
          ? {
              header: "YouTube Music",
              title: `Watched ${song}`,
              titleUrl: `https://music.youtube.com/watch?v=${songVideoId(artist.name, song)}`,
              subtitles: [{ name: `${yt} - Topic`, url: channelUrl(`${yt} - Topic`) }],
              time: iso(t),
              products: ["YouTube"],
            }
          : {
              header: "YouTube",
              title: `Watched ${artist.name} - ${song} (Official Video)`,
              titleUrl: `https://www.youtube.com/watch?v=${songVideoId(artist.name, song + "/video")}`,
              subtitles: [{ name: `${artist.name.replace(/[^A-Za-z]/g, "")}VEVO`, url: channelUrl(artist.name + "VEVO") }],
              time: iso(t),
              products: ["YouTube"],
            },
      );
    }
  }

  const byTimeDesc = (a: { time?: string | number }, b: { time?: string | number }) => String(b.time).localeCompare(String(a.time));
  searchRecords.sort(byTimeDesc);
  youtubeWatch.sort(byTimeDesc);
  youtubeSearch.sort(byTimeDesc);
  maps.sort(byTimeDesc);
  return { searchRecords, youtubeWatch, youtubeSearch, maps };
}

function subscriptionsCsv(p: Persona): string {
  const rows = ["Channel Id,Channel Url,Channel Title"];
  for (const ch of p.subscriptions) {
    const url = channelUrl(ch.name);
    const id = url.split("/").pop();
    rows.push(`${id},${url.replace("https://", "http://")},${ch.name.includes(",") ? `"${ch.name}"` : ch.name}`);
  }
  return rows.join("\n") + "\n";
}

/** Takeout-shaped files for one sample person. `format` picks My Activity JSON or HTML. */
export function sampleTakeout(who: "Alex" | "Sam", format: "json" | "html" = "json", scale = 1): SampleFile[] {
  const [alex, sam] = personas();
  const p = who === "Alex" ? alex : sam;
  const a = personaActivity(p, scale);
  const enc = (records: RawActivity[]) => (format === "json" ? JSON.stringify(records, null, 2) : renderHtml(records));
  const ext = format === "json" ? "json" : "html";
  return [
    { path: `Takeout/My Activity/Search/MyActivity.${ext}`, content: enc(a.searchRecords) },
    { path: `Takeout/My Activity/Maps/MyActivity.${ext}`, content: enc(a.maps) },
    { path: `Takeout/YouTube and YouTube Music/history/watch-history.${ext}`, content: enc(a.youtubeWatch) },
    { path: `Takeout/YouTube and YouTube Music/history/search-history.${ext}`, content: enc(a.youtubeSearch) },
    { path: `Takeout/YouTube and YouTube Music/subscriptions/subscriptions.csv`, content: subscriptionsCsv(p) },
    { path: `Takeout/archive_browser.html`, content: "<html><body>Archive index</body></html>" },
  ];
}

/** A Spotify "Extended streaming history" file, for people who listen on Spotify. */
export function sampleSpotify(who: "Alex" | "Sam", scale = 1): SampleFile[] {
  const [alex, sam] = personas();
  const p = who === "Alex" ? alex : sam;
  if (p.musicApp !== "spotify") return [];
  const rng = mulberry32(p.seed * 104729);
  const plays: Record<string, unknown>[] = [];
  for (let i = 0; i < 900 * scale; i++) {
    const artist = weighted(rng, p.music);
    const song = pick(rng, artist.songs);
    const t = randomTime(rng, p.peakHour, Date.UTC(2021, 0, 1));
    const skipped = rng() < 0.15;
    plays.push({
      ts: new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z"),
      platform: "android",
      ms_played: skipped ? Math.floor(rng() * 20_000) : 120_000 + Math.floor(rng() * 120_000),
      conn_country: "ZZ",
      master_metadata_track_name: rng() < 0.1 ? `${song} - 2023 Remaster` : song,
      master_metadata_album_artist_name: artist.name,
      master_metadata_album_album_name: `${artist.name} (Sample Album)`,
      spotify_track_uri: `spotify:track:sample${songVideoId(artist.name, song)}`,
      episode_name: null,
      episode_show_name: null,
      reason_start: "trackdone",
      reason_end: skipped ? "fwdbtn" : "trackdone",
      shuffle: false,
      skipped,
    });
  }
  // A podcast episode, which has no track and must be ignored.
  plays.push({
    ts: "2024-05-01T08:00:00Z",
    ms_played: 1_800_000,
    master_metadata_track_name: null,
    master_metadata_album_artist_name: null,
    episode_name: "Sample Episode",
    episode_show_name: "Sample Podcast",
  });
  plays.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return [
    { path: "Spotify Extended Streaming History/Streaming_History_Audio_2021-2026_0.json", content: JSON.stringify(plays, null, 2) },
    { path: "Spotify Account Data/Userdata.json", content: JSON.stringify({ username: "sample", country: "ZZ" }) },
  ];
}

/* ---------------------------------------------------------------------- */
/* HTML rendering in the same shape as Takeout's My Activity pages.        */
/* ---------------------------------------------------------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function htmlDate(t: number): string {
  const d = new Date(t);
  let h = d.getUTCHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${h}:${mm}:${ss} ${ampm} UTC`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function renderHtml(records: RawActivity[]): string {
  const style = "<style>" + ".mdl-grid{display:flex}".repeat(300) + "</style>";
  const cells = records.map((r) => {
    const verb = (r.title ?? "").split(" ")[0] + (r.title?.startsWith("Searched for") ? " for" : "");
    const text = (r.title ?? "").slice(verb.length).trim();
    const link = r.titleUrl ? `<a href="${esc(r.titleUrl)}">${esc(text)}</a>` : esc(text);
    const sub = r.subtitles?.[0] ? `<a href="${esc(r.subtitles[0].url ?? "")}">${esc(r.subtitles[0].name ?? "")}</a><br>` : "";
    const caption = r.details?.length
      ? `<b>Products:</b><br>&emsp;Search<br><b>Details:</b><br>&emsp;From Google Ads<br>`
      : `<b>Products:</b><br>&emsp;${esc(r.header ?? "")}<br>`;
    return (
      `<div class="outer-cell mdl-cell mdl-cell--12-col mdl-shadow--2dp"><div class="mdl-grid">` +
      `<div class="header-cell mdl-cell mdl-cell--12-col"><p class="mdl-typography--title">${esc(r.header ?? "")}<br></p></div>` +
      `<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">${esc(verb)}&nbsp;${link}<br>${sub}${htmlDate(Date.parse(String(r.time)))}<br></div>` +
      `<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1 mdl-typography--text-right"></div>` +
      `<div class="content-cell mdl-cell mdl-cell--12-col mdl-typography--caption">${caption}</div>` +
      `</div></div>`
    );
  });
  return `<html><head><meta charset="utf-8"><title>My Activity</title>${style}</head><body><div class="mdl-grid">${cells.join("")}</div></body></html>`;
}
