/**
 * What the AI gets to read. Everything here is plain text built from data
 * already on this device, sized to fit the context window of a small local
 * model. The comparison prompt only contains what both friends share: the
 * app never knows the rest of the friend's history, and says so to the model.
 */
import type { Comparison, SharedItem } from "../core/compare";
import { formatMonth, isGenericQuery, isGenericSite } from "../core/normalize";
import { topItems } from "../core/profile";
import type { Namespace, Profile } from "../core/types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Roughly 2,500 tokens of data, leaving room for instructions and the answer in an 8k context. */
const DATA_BUDGET = 9_500;

const fmt = (n: number) => n.toLocaleString("en-US");

function system(language: string): string {
  return [
    "You are a warm, witty and perceptive writer. You help people enjoy what their own internet history says about them.",
    "Rules:",
    "- Use only what is in the data. You may infer hobbies, themes and music genres from names you recognise, but say \"probably\" when you guess. Never invent searches, songs, channels or events.",
    "- Never speculate about health, sexuality, religion, politics, money problems, relationships or anything else sensitive, even if an item hints at it. Leave such items out without mentioning them.",
    "- Be kind and playful, never creepy or judgemental. Don't lecture about privacy or screen time.",
    `- Write in ${language || "English"}. Use Markdown: "## " headings, short paragraphs, "- " bullets, **bold** for names. No tables, no code blocks.`,
    "- Stay under 450 words.",
  ].join("\n");
}

/** Adds lines until the budget runs out, so the most important sections go first. */
class Budget {
  private parts: string[] = [];
  private used = 0;
  constructor(private readonly limit: number) {}
  section(title: string, lines: string[]): void {
    if (lines.length === 0) return;
    const head = `\n${title}:\n`;
    if (this.used + head.length > this.limit) return;
    this.parts.push(head);
    this.used += head.length;
    for (const line of lines) {
      const l = `- ${line}\n`;
      if (this.used + l.length > this.limit) break;
      this.parts.push(l);
      this.used += l.length;
    }
  }
  line(text: string): void {
    this.parts.push(text + "\n");
    this.used += text.length + 1;
  }
  toString(): string {
    return this.parts.join("");
  }
}

function busiestHours(hours: number[], n = 3): string {
  return hours
    .map((v, h) => [h, v] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([h]) => `${String(h).padStart(2, "0")}:00`)
    .join(", ");
}

function nightShare(hours: number[]): number {
  const total = hours.reduce((s, x) => s + x, 0) || 1;
  return [23, 0, 1, 2, 3, 4].reduce((s, h) => s + hours[h], 0) / total;
}

/* ------------------------------------------------------------------------ */

export function portraitMessages(profile: Profile, name: string, language: string): ChatMessage[] {
  const who = name.trim() || "this person";
  const t = profile.totals;
  const b = new Budget(DATA_BUDGET);
  const range =
    profile.firstDay !== undefined && profile.lastDay !== undefined
      ? `${formatMonth(profile.firstDay)} to ${formatMonth(profile.lastDay)}`
      : "unknown";
  b.line(`PERIOD: ${range}.`);
  b.line(
    `TOTALS: ${fmt(t.search)} Google searches, ${fmt(t.ytWatch)} YouTube videos watched, ${fmt(t.ytSearch)} YouTube searches, ${fmt(t.visit)} site visits, ${fmt(t.musicPlay)} songs played.`,
  );
  b.line(`BUSIEST HOURS (local time): ${busiestHours(profile.hours)}. Share of activity between 23:00 and 05:00: ${Math.round(nightShare(profile.hours) * 100)}%.`);
  const years = Object.entries(profile.years).sort(([a], [c]) => a.localeCompare(c));
  if (years.length) b.line(`ACTIVITY BY YEAR: ${years.map(([y, n]) => `${y}: ${fmt(n)}`).join(", ")}.`);

  const list = (ns: Namespace, n: number, unit: string, skip?: (k: string) => boolean) =>
    topItems(profile, ns, n, (it) => !skip?.(it.key)).map((it) => `${label(ns, it.label, it.extra)} — ${fmt(it.count)} ${unit}`);

  b.section("MUSIC ARTISTS (plays)", list("art", 25, "plays"));
  b.section("SONGS (plays)", list("song", 15, "plays"));
  b.section("TOP GOOGLE SEARCHES (times searched)", list("q", 45, "times", isGenericQuery));
  b.section("SEARCH TOPICS (words and phrases, times used)", list("w", 35, "times", isGenericQuery));
  b.section("YOUTUBE CHANNELS (videos watched)", list("ch", 25, "videos"));
  b.section("MOST REWATCHED VIDEOS", list("v", 10, "times"));
  b.section("YOUTUBE SEARCHES", list("yq", 15, "times"));
  b.section("WEBSITES (visits, big everyday sites left out)", list("site", 15, "visits", isGenericSite));

  // How interests changed: things that faded, and things that are new.
  if (profile.lastDay !== undefined) {
    const last = profile.lastDay;
    const faded: string[] = [];
    const fresh: string[] = [];
    for (const ns of ["q", "ch", "art"] as Namespace[]) {
      for (const it of topItems(profile, ns, 400, (x) => !(ns === "q" && isGenericQuery(x.key)))) {
        const first = it.days[0];
        const end = it.days[it.days.length - 1];
        if (first === undefined || end === undefined) continue;
        if (it.count >= 5 && end < last - 730) faded.push(`${it.label} (${formatMonth(first)}–${formatMonth(end)})`);
        else if (it.count >= 3 && first > last - 365) fresh.push(`${it.label} (since ${formatMonth(first)})`);
      }
    }
    b.section("OLD INTERESTS THAT FADED", faded.slice(0, 12));
    b.section("NEW THIS PAST YEAR", fresh.slice(0, 12));
  }

  const user = [
    `Here is a summary of ${who}'s Google, YouTube and music history.`,
    b.toString(),
    `Write a portrait of ${who}. Write exactly these sections, each starting with its heading line:`,
    "## In one line",
    "## What you're into",
    "## Your music taste",
    "## How you've changed",
    "## Fun facts",
    "",
    "What goes in each section:",
    "- In one line: one playful sentence that sums them up.",
    "- What you're into: 3 to 6 bullets, each a theme backed by items from the data.",
    "- Your music taste: the genres and moods they probably like, based on the artists and songs listed. If there is no music data, say so in one sentence.",
    "- How you've changed: compare OLD INTERESTS THAT FADED with NEW THIS PAST YEAR. If those lists are missing, describe how their activity changed over the years.",
    "- Fun facts: 3 to 5 bullets, each with a real number from the data.",
    "",
    `Voice: talk to ${who} as "you". Never write as if you were ${who}, and never use "I" or "we".`,
  ].join("\n");
  return [
    { role: "system", content: system(language) },
    { role: "user", content: user },
  ];
}

/* ------------------------------------------------------------------------ */

/** Quote titles and attach their artist or channel, so small models don't mix them up. */
function label(ns: Namespace, text: string, extra?: string): string {
  if (ns === "song") return `"${text}"${extra ? ` by ${extra}` : ""}`;
  if (ns === "v") return `"${text}"${extra ? ` (video from ${extra})` : " (video)"}`;
  if (ns === "q" || ns === "yq" || ns === "mq") return `"${text}"`;
  return text;
}

function shared(items: SharedItem[], n: number, me: string, them: string, unit: string): string[] {
  return items
    .filter((x) => !x.generic)
    .slice(0, n)
    .map((x) => `${label(x.ns, x.label, x.extra)} — ${me} ${fmt(x.mine.count)} ${unit}, ${them} ${fmt(x.theirs.count)} ${unit}`);
}

export function togetherMessages(c: Comparison, language: string): ChatMessage[] {
  const me = c.myName;
  const them = c.friendName;
  const b = new Budget(DATA_BUDGET);
  const total = c.overlap.reduce((s, o) => s + (o.ns === "w" ? 0 : o.shared), 0);
  b.line(`SCORE: ${c.score} out of 100 for how much their interests overlap. Things in common: ${fmt(total)}.`);
  b.section(`MUSIC ARTISTS BOTH PLAY (${me}'s plays, ${them}'s plays)`, shared(c.shared.art, 20, me, them, "plays"));
  b.section("SONGS BOTH PLAY", shared(c.shared.song, 15, me, them, "plays"));
  b.section("GOOGLE SEARCHES BOTH MADE (times each)", shared(c.shared.q, 35, me, them, "times"));
  b.section("TOPICS BOTH SEARCH FOR", shared(c.topics, 25, me, them, "times"));
  b.section("YOUTUBE CHANNELS BOTH WATCH (videos each)", shared(c.shared.ch, 15, me, them, "videos"));
  b.section("VIDEOS BOTH WATCHED", shared(c.shared.v, 10, me, them, "times"));
  b.section("YOUTUBE SEARCHES BOTH MADE", shared(c.shared.yq, 10, me, them, "times"));
  b.section("WEBSITES BOTH VISIT", shared(c.shared.site, 12, me, them, "visits"));
  b.section("MAPS SEARCHES BOTH MADE", shared(c.shared.mq, 8, me, them, "times"));
  b.section(
    "SAME THING WITHIN A FEW DAYS OF EACH OTHER",
    c.coincidences.map((x) => `${x.label} — ${x.gap === 0 ? "same day" : `${x.gap} days apart`}${x.gapMine !== undefined ? `, ${formatMonth(x.gapMine)}` : ""}`),
  );
  const r = c.rhythm;
  b.line(
    `\nDAILY RHYTHM: ${me}'s busiest hours ${busiestHours(r.mineHours)}, night share ${Math.round(r.mineNight * 100)}%. ${them}'s busiest hours ${busiestHours(r.theirHours)}, night share ${Math.round(r.theirNight * 100)}%.`,
  );
  b.line(`WHO GOT THERE FIRST: ${me} found ${c.firsts.mine} of their shared searches and channels first, ${them} found ${c.firsts.theirs} first.`);
  if (c.firsts.biggestLead) {
    const l = c.firsts.biggestLead;
    b.line(`BIGGEST HEAD START: ${l.who === "me" ? me : them} searched "${l.item.label}" ${l.days} days before the other.`);
  }

  const user = [
    `${me} and ${them} compared their Google, YouTube and music histories privately. The comparison only reveals what they BOTH have.`,
    `Nothing else about either of them is known. Don't guess what else they like, and don't describe their jobs or lives.`,
    b.toString(),
    "Write exactly these sections, each starting with its heading line:",
    "## You two in one line",
    "## What you really have in common",
    "## Your shared music taste",
    "## The most surprising match",
    "## Things to talk about next time",
    "",
    "What goes in each section:",
    "- You two in one line: one sentence that gives the two of them a funny name, like a band or a club, based on what they share.",
    "- What you really have in common: group the shared items into 2 to 4 themes, one bullet each, naming the items.",
    "- Your shared music taste: the genres they both probably like. Then a playlist of up to 8 songs copied exactly from SONGS BOTH PLAY, each with its artist (if there are no shared songs, use ARTISTS BOTH PLAY). Then, under the words \"You might also like\", at most 3 other songs. If there is no shared music, say so in one sentence.",
    "- The most surprising match: one shared item that is unexpected, and why.",
    "- Things to talk about next time: 3 bullet questions, each about a shared item listed above.",
    "",
    `Voice: talk to ${me} and ${them} as "you two". Never write as if you were ${me} or ${them}, and never use "I" or "we".`,
  ].join("\n");
  return [
    { role: "system", content: system(language) },
    { role: "user", content: user },
  ];
}

/** One text block for pasting into any AI chat. */
export function asPlainPrompt(messages: ChatMessage[]): string {
  return messages.map((m) => m.content).join("\n\n");
}
