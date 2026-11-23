import { useMemo, useState } from "react";
import type { Namespace, Profile } from "../core/types";
import { isGenericQuery, isGenericSite } from "../core/normalize";
import { HourChart, WeekdayChart, YearChart } from "./charts";
import { RankedList, type Row } from "./lists";
import { fmt, formatDay, formatMonth, hourLabel, plural, times } from "./format";

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

export function MyHistory({ profile, isDemo, onForget, onNext }: {
  profile: Profile;
  isDemo: boolean;
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
                {s.path}: {fmt(s.events)} items
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
