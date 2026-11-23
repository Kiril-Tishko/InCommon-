import { useMemo, useState } from "react";
import type { Namespace, Profile } from "../core/types";
import { isGenericQuery, isGenericSite } from "../core/normalize";
import { HourChart, WeekdayChart, YearChart } from "./charts";
import { RankedList, type Row } from "./lists";
import { fmt, formatDay, formatMonth, hourLabel, plural, times } from "./format";
import { AiPanel } from "./AiPanel";
import { portraitMessages } from "../ai/prompts";
import { coverageNotes, sourceName, type CoverageNote } from "../core/coverage";
import { localDay } from "../core/normalize";

const yearStart = (y: number) => Date.UTC(y, 0, 1) / 86_400_000;

function countInYear(days: number[], year: number): number {
  const lo = yearStart(year);
  const hi = yearStart(year + 1);
  let n = 0;
  for (const d of days) if (d >= lo && d < hi) n++;
  return n;
}

function rows(profile: Profile, ns: Namespace, year: number | null, opts: { skip?: (key: string) => boolean; sub?: boolean } = {}): Row[] {
  const out: Row[] = [];
  for (const [key, it] of Object.entries(profile.items[ns])) {
    if (opts.skip?.(key)) continue;
    // In a single year we can only count days, not repeats within a day.
    const count = year === null ? it.count : countInYear(it.days, year);
    if (count > 0) out.push({ key, label: it.label, count, sub: opts.sub ? it.extra : undefined });
  }
  out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return out.slice(0, 300);
}

export function MyHistory({ profile, isDemo, name, onForget, onNext }: {
  profile: Profile;
  isDemo: boolean;
  name: string;
  onForget: () => void;
  onNext: () => void;
}) {
  const [year, setYear] = useState<number | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);
  const years = Object.keys(profile.years).map(Number).sort((a, b) => b - a);

  const lists = useMemo(
    () => ({
      q: rows(profile, "q", year),
      w: rows(profile, "w", year, { skip: (k) => isGenericQuery(k) }),
      ch: rows(profile, "ch", year),
      v: rows(profile, "v", year, { sub: true }),
      art: rows(profile, "art", year),
      song: rows(profile, "song", year, { sub: true }),
      site: rows(profile, "site", year),
      yq: rows(profile, "yq", year),
      mq: rows(profile, "mq", year),
    }),
    [profile, year],
  );

  const top = rows(profile, "q", null, { skip: (k) => isGenericQuery(k) })[0];
  const topStat = top ? profile.items.q[top.key] : undefined;
  const topSite = rows(profile, "site", null, { skip: isGenericSite })[0];
  const peakHour = profile.hours.indexOf(Math.max(...profile.hours));
  const topArtist = rows(profile, "art", null)[0];
  const topSong = rows(profile, "song", null, { sub: true })[0];
  const t = profile.totals;
  const sinceLabel = profile.firstDay !== undefined ? formatMonth(profile.firstDay) : undefined;

  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="section">
        <div className="stack-sm">
          <span className="label">{isDemo ? "Demo person: Alex" : "Your history"}</span>
          <h1>{sinceLabel ? `Since ${sinceLabel}` : "Your history"}</h1>
          {profile.firstDay !== undefined && profile.lastDay !== undefined && (
            <p className="muted">
              {formatDay(profile.firstDay)} to {formatDay(profile.lastDay)}, grouped from {plural(profile.sources.length, "file")}.
            </p>
          )}
        </div>
        {!isDemo && <Coverage notes={coverageNotes(profile)} />}
        <div className="stat-row">
          <div className="stat">
            <b>{fmt(t.search)}</b>
            <span className="small muted">Google searches</span>
          </div>
          <div className="stat">
            <b>{fmt(t.ytWatch)}</b>
            <span className="small muted">YouTube videos watched</span>
          </div>
          <div className="stat">
            <b>{fmt(t.ytSearch)}</b>
            <span className="small muted">YouTube searches</span>
          </div>
          <div className="stat">
            <b>{fmt(t.visit)}</b>
            <span className="small muted">site visits</span>
          </div>
          {t.musicPlay > 0 && (
            <div className="stat">
              <b>{fmt(t.musicPlay)}</b>
              <span className="small muted">songs played</span>
            </div>
          )}
          {t.mapsSearch > 0 && (
            <div className="stat">
              <b>{fmt(t.mapsSearch)}</b>
              <span className="small muted">Maps searches</span>
            </div>
          )}
        </div>
      </section>

      {top && topStat && (
        <section className="section">
          <span className="label">The search you came back to most</span>
          <div className="hero-query">{top.label}</div>
          <p>
            You searched this <b>{times(topStat.count)}</b>
            {topStat.days.length > 1 && (
              <>
                , on {plural(topStat.days.length, "different day")} between {formatMonth(topStat.days[0])} and{" "}
                {formatMonth(topStat.days[topStat.days.length - 1])}
              </>
            )}
            .{" "}
            <span className="muted">
              Everyday searches like "weather" are left out here
              {topSite ? `. Your most visited site that isn't one of the giants: ${topSite.label}` : ""}.
            </span>
          </p>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Your music</h2>
          {topArtist && <span className="small muted">{plural(Object.keys(profile.items.art).length, "artist")}</span>}
        </div>
        {topArtist ? (
          <>
            <p className="prose">
              Most played: <b>{topArtist.label}</b>, {plural(topArtist.count, "play")}.
              {topSong && (
                <>
                  {" "}
                  Your most played song is <b>{topSong.label}</b>
                  {topSong.sub ? ` by ${topSong.sub}` : ""} ({plural(topSong.count, "play")}).
                </>
              )}
            </p>
            <div className="grid-2">
              <div className="stack-sm">
                <h3>Artists</h3>
                <RankedList rows={lists.art} />
              </div>
              <div className="stack-sm">
                <h3>Songs</h3>
                <RankedList rows={lists.song} />
              </div>
            </div>
            <p className="small muted prose">
              From YouTube Music, music videos on YouTube and Spotify. Music on regular YouTube is recognised by how it's labelled
              ("Artist - Topic" channels, "Official Video" titles), so some mixes and covers are missed.
            </p>
          </>
        ) : (
          <p className="muted prose">
            No music found yet. Music comes from YouTube Music and music videos in your YouTube history, or from a Spotify download
            you add on the Load step.
          </p>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Top of the list</h2>
          <div className="chips" role="group" aria-label="Year">
            <button type="button" className="chip" aria-pressed={year === null} onClick={() => setYear(null)}>
              All years
            </button>
            {years.map((y) => (
              <button key={y} type="button" className="chip" aria-pressed={year === y} onClick={() => setYear(y)}>
                {y}
              </button>
            ))}
          </div>
        </div>
        {year !== null && <p className="small muted">For a single year, counts are the number of days you did it.</p>}
        <div className="grid-2">
          <div className="stack-sm">
            <h3>Searches</h3>
            <RankedList rows={lists.q} mono />
          </div>
          <div className="stack-sm">
            <h3>Words you search with</h3>
            <RankedList rows={lists.w} />
          </div>
          <div className="stack-sm">
            <h3>YouTube channels</h3>
            <RankedList rows={lists.ch} empty="No YouTube history found." />
          </div>
          <div className="stack-sm">
            <h3>Videos you rewatched</h3>
            <RankedList rows={lists.v} empty="No YouTube history found." />
          </div>
          <div className="stack-sm">
            <h3>Websites</h3>
            <RankedList rows={lists.site} empty="No visited sites found." />
          </div>
          <div className="stack-sm">
            <h3>YouTube searches</h3>
            <RankedList rows={lists.yq} mono empty="No YouTube searches found." />
          </div>
          {lists.mq.length > 0 && (
            <div className="stack-sm">
              <h3>Maps searches</h3>
              <RankedList rows={lists.mq} mono />
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <h2>When you're online</h2>
        <div className="grid-2">
          <div className="stack-sm">
            <h3>Hour of day</h3>
            <HourChart mine={profile.hours} label="Share of activity by hour of day" />
            <p className="small muted">
              Busiest hour: {hourLabel(peakHour)} ({profile.tz} time).
            </p>
          </div>
          <div className="stack-sm">
            <h3>Day of week</h3>
            <WeekdayChart mine={profile.weekdays} label="Share of activity by day of week" />
          </div>
          <div className="stack-sm">
            <h3>Year by year</h3>
            <YearChart years={profile.years} label="Activity per year" />
          </div>
        </div>
      </section>

      <section className="section">
        <AiPanel
          id="portrait"
          title="What an AI makes of you"
          intro="An AI model running on your own PC reads a summary of your history (top searches, channels, artists, how your interests changed) and writes a portrait of you, including your music taste."
          build={(language) => portraitMessages(profile, name, language)}
          demo={isDemo}
        />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Next: send a match file</h2>
        </div>
        <p className="prose muted">
          Pick a code word with your friend, make your match file, and send it to them. They do the same for you.
        </p>
        <div className="row">
          <button className="btn" type="button" onClick={onNext}>
            Make my match file
          </button>
        </div>
      </section>

      <section className="section">
        <details className="more">
          <summary>Files that were read ({profile.sources.length})</summary>
          <ul className="small muted" style={{ paddingLeft: "1.1rem" }}>
            {profile.sources.map((s) => (
              <li key={s.path} style={{ overflowWrap: "anywhere" }}>
                <b>{sourceName(s.path)}</b>: {fmt(s.events)} items
                {s.first !== undefined && s.last !== undefined && (
                  <>
                    , {formatMonth(localDay(s.first))} to {formatMonth(localDay(s.last))}
                  </>
                )}
                <br />
                <span className="mono">{s.path}</span>
              </li>
            ))}
          </ul>
        </details>
        {!isDemo && (
          <div className="row">
            {confirmForget ? (
              <>
                <span>Delete your history summary from this browser?</span>
                <button className="btn danger small" type="button" onClick={onForget}>
                  Delete it
                </button>
                <button className="btn quiet small" type="button" onClick={() => setConfirmForget(false)}>
                  Keep it
                </button>
              </>
            ) : (
              <button className="btn danger small" type="button" onClick={() => setConfirmForget(true)}>
                Forget my data
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Coverage({ notes }: { notes: CoverageNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="banner stack-sm" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <b>Your export may be missing some history</b>
      <ul className="small" style={{ margin: 0, paddingLeft: "1.1rem" }}>
        {notes.map((n) =>
          n.kind === "ends" ? (
            <li key="ends">
              It stops in {formatMonth(n.lastDay)}. If you used Google after that, this may be an older download, or saving was
              paused: check <b>Web &amp; App Activity</b> and <b>YouTube History</b> at{" "}
              <a href="https://myactivity.google.com/activitycontrols" target="_blank" rel="noreferrer">
                myactivity.google.com
              </a>
              , then request a fresh export.
            </li>
          ) : n.kind === "short" ? (
            <li key="short">
              It covers only {formatMonth(n.firstDay)} to {formatMonth(n.lastDay)}. Google may be auto-deleting older activity (My
              Activity → <b>Auto-delete</b>). Anything already deleted can't be exported, but you can turn auto-delete off so history
              is kept from now on.
            </li>
          ) : (
            <li key="uneven">
              {sourceName(n.long.path)} goes back to {formatMonth(localDay(n.long.first!))}, but {sourceName(n.short.path)} only to{" "}
              {formatMonth(localDay(n.short.first!))}. Each Google product has its own auto-delete setting.
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
