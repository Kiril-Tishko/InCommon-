import { useRef, useState } from "react";
import type { Comparison, SharedItem } from "../core/compare";
import type { MatchFile } from "../core/types";
import { decodeMatchFile, normalizeCodeWord } from "../core/matchfile";
import type { Progress } from "../worker/protocol";
import { HourChart, Venn, WeekdayChart } from "./charts";
import { DuoList } from "./lists";
import { AiPanel } from "./AiPanel";
import { togetherMessages } from "../ai/prompts";
import { duration, fmt, formatDay, formatMonth, hourLabel, times } from "./format";

export function Compare({ friend, setFriend, codeWord, setCodeWord, onCompare, busy, progress, error, codeWordError, result, isDemo }: {
  friend?: MatchFile;
  setFriend: (f: MatchFile | undefined) => void;
  codeWord: string;
  setCodeWord: (s: string) => void;
  onCompare: () => void;
  busy: boolean;
  progress?: Progress;
  error?: string;
  codeWordError?: boolean;
  result?: Comparison;
  isDemo: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const codeOk = normalizeCodeWord(codeWord).length >= 4;

  const pick = async (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    setFileError(undefined);
    try {
      setFriend(await decodeMatchFile(f));
    } catch (err) {
      setFriend(undefined);
      setFileError(err instanceof Error ? err.message : String(err));
    }
  };

  if (result && friend && !editing && !busy) {
    return (
      <div className="stack" style={{ gap: "1.5rem" }}>
        <div className="compact-bar">
          <p>
            Compared with <b>{friend.name}</b>
            <span className="small muted"> · their file from {formatDay(Math.floor(Date.parse(friend.createdAt) / 86_400_000))}</span>
          </p>
          <button className="btn quiet small" type="button" onClick={() => setEditing(true)}>
            Use a different file
          </button>
        </div>
        <Results c={result} isDemo={isDemo} />
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: "1.5rem" }}>
      {!friend && (
        <div className="stack-sm prose">
          <h1>Compare with a friend</h1>
          <p className="muted">Load the match file your friend sent you and type the code word you agreed on.</p>
        </div>
      )}
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (friend && codeOk && !busy) {
            setEditing(false);
            onCompare();
          }
        }}
      >
        <div className="grid-2">
          <div className="field">
            <span>Your friend's match file</span>
            <div className="row">
              <button className="btn quiet" type="button" onClick={() => input.current?.click()}>
                {friend ? "Choose a different file" : "Choose file"}
              </button>
              {friend && (
                <span>
                  <b>{friend.name}</b>{" "}
                  <span className="small muted">
                    · made {formatDay(Math.floor(Date.parse(friend.createdAt) / 86_400_000))}
                    {isDemo && friend.name === "Sam" ? " · demo" : ""}
                  </span>
                </span>
              )}
            </div>
            <input
              ref={input}
              id="friend-file"
              className="visually-hidden"
              type="file"
              accept=".json,application/json,.incommon"
              onChange={(e) => {
                void pick(e.target.files);
                e.target.value = "";
              }}
            />
            {fileError && <span className="error small">{fileError}</span>}
          </div>
          <label className="field">
            <span>Code word</span>
            <input
              id="compare-code"
              className="input mono"
              value={codeWord}
              onChange={(e) => setCodeWord(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={codeWordError || undefined}
            />
            {codeWordError ? (
              <span className="error small">{error}</span>
            ) : (
              <span className="small muted">The same one you used for your own match file.</span>
            )}
          </label>
        </div>
        <div className="row">
          <button className="btn" type="submit" disabled={!friend || !codeOk || busy}>
            {busy ? "Comparing…" : result ? "Compare again" : "Compare"}
          </button>
          {busy && progress && <span className="small muted">{progress.step}</span>}
        </div>
        {error && !codeWordError && <p className="error">{error}</p>}
      </form>

      {result && <Results c={result} isDemo={isDemo} />}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function topNonGeneric(items: SharedItem[]): SharedItem | undefined {
  return items.find((x) => !x.generic);
}

function Highlights({ c }: { c: Comparison }) {
  const me = c.myName;
  const them = c.friendName;
  const out: { key: string; body: React.ReactNode }[] = [];

  const q = topNonGeneric(c.shared.q);
  if (q) {
    out.push({
      key: "q",
      body: (
        <>
          You both searched <span className="query">“{q.label}”</span>. {me}: {times(q.mine.count)}. {them}: {times(q.theirs.count)}.
        </>
      ),
    });
  }
  const coincidence = c.coincidences[0];
  if (coincidence && coincidence.gapMine !== undefined) {
    const what = coincidence.ns === "v" ? "watched" : "searched";
    out.push({
      key: "co",
      body: (
        <>
          {coincidence.gap === 0 ? "On the same day" : `Within ${coincidence.gap} ${coincidence.gap === 1 ? "day" : "days"} of each other`}, you both {what}{" "}
          <span className="query">“{coincidence.label}”</span> ({formatDay(coincidence.gapMine)}).
        </>
      ),
    });
  }
  const art = c.shared.art[0];
  if (art) {
    out.push({
      key: "art",
      body: (
        <>
          You both listen to <b>{art.label}</b>. {me}: {fmt(art.mine.count)} plays. {them}: {fmt(art.theirs.count)}.
        </>
      ),
    });
  }
  const song = c.shared.song[0];
  if (song) {
    out.push({
      key: "song",
      body: (
        <>
          Your shared song: <b>{song.label}</b>
          {song.extra ? ` by ${song.extra}` : ""}. {me} played it {times(song.mine.count)}, {them} {times(song.theirs.count)}.
        </>
      ),
    });
  }
  const ch = c.shared.ch[0];
  if (ch) {
    out.push({
      key: "ch",
      body: (
        <>
          You both watch <b>{ch.label}</b>. {me}: {fmt(ch.mine.count)} videos. {them}: {fmt(ch.theirs.count)}.
        </>
      ),
    });
  }
  const v = c.shared.v[0];
  if (v) {
    out.push({
      key: "v",
      body: (
        <>
          {c.shared.v.length === 1 ? "One video" : `${fmt(c.shared.v.length)} videos`} you've both watched, starting with <b>{v.label}</b>.
        </>
      ),
    });
  }
  const lead = c.firsts.biggestLead;
  if (lead && lead.days >= 30) {
    out.push({
      key: "lead",
      body: (
        <>
          {lead.who === "me" ? me : them} searched <span className="query">“{lead.item.label}”</span> {duration(lead.days)} before{" "}
          {lead.who === "me" ? them : me} did.
        </>
      ),
    });
  }
  const r = c.rhythm;
  const bothNight = r.mineNight > 0.2 && r.theirNight > 0.2;
  out.push({
    key: "rhythm",
    body: bothNight ? (
      <>You're both night owls: over a fifth of your activity is between 23:00 and 05:00.</>
    ) : r.minePeak === r.theirPeak ? (
      <>Your busiest hour is the same: {hourLabel(r.minePeak)}.</>
    ) : (
      <>
        {me}'s busiest hour is {hourLabel(r.minePeak)}. {them}'s is {hourLabel(r.theirPeak)}.
      </>
    ),
  });
  const topic = c.topics.find((t) => t.key.includes(" ")) ?? c.topics[0];
  if (topic) {
    out.push({
      key: "topic",
      body: (
        <>
          A topic you share: <b>{topic.label}</b>, in {fmt(topic.mine.count)} of {me}'s searches and {fmt(topic.theirs.count)} of {them}'s.
        </>
      ),
    });
  }
  return (
    <ul className="highlights">
      {out.slice(0, 8).map((h) => (
        <li key={h.key}>{h.body}</li>
      ))}
    </ul>
  );
}

const NS_LABEL: Record<string, string> = {
  q: "Google searches",
  w: "Search words",
  yq: "YouTube searches",
  ch: "YouTube channels",
  sub: "Subscriptions",
  v: "YouTube videos",
  site: "Websites",
  mq: "Maps searches",
  art: "Music artists",
  song: "Songs",
};

function Results({ c, isDemo }: { c: Comparison; isDemo: boolean }) {
  const me = c.myName;
  const them = c.friendName;
  const sharedTotal = c.overlap.reduce((s, o) => s + (o.ns === "w" ? 0 : o.shared), 0);
  const nonGenericQ = c.shared.q.filter((x) => !x.generic);
  const genericQ = c.shared.q.filter((x) => x.generic);
  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="section">
        <div className="venn-hero">
          <Venn
            score={c.score}
            myName={me}
            friendName={them}
            myTally={[fmt(c.myTotals.search), "searches"]}
            friendTally={[fmt(c.theirTotals.search), "searches"]}
          />
          <div className="stack">
            <span className="label">You and {them}</span>
            <h1 style={{ fontSize: "var(--step-3)" }}>{fmt(sharedTotal)} things in common</h1>
            <p className="muted">
              Searches, channels, videos and sites you both have, out of years of history. Scored {c.score} out of 100 for how much your
              interests overlap.
            </p>
            <div className="legend">
              <span>
                <i style={{ background: "var(--you)" }} />
                {me}
              </span>
              <span>
                <i style={{ background: "var(--friend)" }} />
                {them}
              </span>
              <span>
                <i style={{ background: "var(--both)" }} />
                both of you
              </span>
            </div>
          </div>
        </div>
        <Highlights c={c} />
      </section>

      <section className="section">
        <AiPanel
          id="together"
          title="What an AI makes of you two"
          intro={`An AI model running on your PC reads only what you and ${them} share, groups it into themes, describes your shared music taste and builds a playlist for you both.`}
          build={(language) => togetherMessages(c, language)}
          demo={isDemo}
        />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Music you share</h2>
          {c.shared.art.length > 0 && <span className="small muted">{fmt(c.shared.art.length)} artists, {fmt(c.shared.song.length)} songs</span>}
        </div>
        {c.shared.art.length === 0 && c.shared.song.length === 0 ? (
          <p className="muted prose">
            No music in common found.{" "}
            {c.overlap.some((o) => o.ns === "art")
              ? "Adding a Spotify download on the Load step often helps, for either of you."
              : `${them}'s match file has no music in it. They may have made it with an older version or left music out.`}
          </p>
        ) : (
          <div className="grid-2">
            <div className="stack-sm">
              <h3>Artists you both play</h3>
              <DuoList items={c.shared.art} myName={me} friendName={them} showDates={false} />
            </div>
            <div className="stack-sm">
              <h3>Songs you both play</h3>
              <DuoList items={c.shared.song} myName={me} friendName={them} showDates={false} empty="No songs in common, but you share artists." />
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Searches you both made</h2>
          <span className="small muted">{fmt(c.shared.q.length)} in total</span>
        </div>
        <DuoList items={nonGenericQ} myName={me} friendName={them} mono initial={10} />
        {genericQ.length > 0 && (
          <p className="small muted">
            Plus {fmt(genericQ.length)} everyday ones everybody makes, like{" "}
            {genericQ
              .slice(0, 3)
              .map((g) => `“${g.label}”`)
              .join(", ")}
            .
          </p>
        )}
      </section>

      {c.coincidences.length > 0 && (
        <section className="section">
          <h2>Same thing, same week</h2>
          <p className="muted prose">Rare searches and videos you both landed on within three days of each other.</p>
          <ol className="ranked">
            {c.coincidences.map((it) => (
              <li key={it.ns + it.key}>
                <span className={it.ns === "v" ? "text" : "text query"}>
                  {it.label} {it.ns === "v" && <span className="tag">video</span>}
                </span>
                <span className="count">{it.gap === 0 ? "same day" : `${it.gap} ${it.gap === 1 ? "day" : "days"} apart`}</span>
                <span className="sub">
                  {me}: {it.gapMine !== undefined ? formatDay(it.gapMine) : "?"} · {them}: {it.gapTheirs !== undefined ? formatDay(it.gapTheirs) : "?"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {c.topics.length > 0 && (
        <section className="section">
          <h2>Topics you share</h2>
          <p className="muted prose">Words and phrases from both of your searches, even when you worded the searches differently.</p>
          <div className="topic-cloud">
            {c.topics.slice(0, 40).map((t) => (
              <span key={t.key} title={`${me}: ${t.mine.count} · ${them}: ${t.theirs.count}`}>
                {t.label}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2>YouTube</h2>
        <div className="grid-2">
          <div className="stack-sm">
            <h3>Channels you both watch</h3>
            <DuoList items={c.shared.ch} myName={me} friendName={them} showDates={false} empty="No channels in common." />
          </div>
          <div className="stack-sm">
            <h3>Videos you both watched</h3>
            <DuoList items={c.shared.v} myName={me} friendName={them} showDates={false} empty="No videos in common." />
          </div>
          {c.shared.sub.length > 0 && (
            <div className="stack-sm">
              <h3>You're both subscribed to</h3>
              <div className="topic-cloud">
                {c.shared.sub.map((s) => (
                  <span key={s.key}>{s.label}</span>
                ))}
              </div>
            </div>
          )}
          {c.shared.yq.length > 0 && (
            <div className="stack-sm">
              <h3>YouTube searches you both made</h3>
              <DuoList items={c.shared.yq} myName={me} friendName={them} mono showDates={false} />
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="grid-2">
          <div className="stack-sm">
            <h2>Websites</h2>
            <DuoList
              items={[...c.shared.site].sort((a, b) => Number(a.generic) - Number(b.generic) || b.score - a.score)}
              myName={me}
              friendName={them}
              showDates={false}
              empty="No sites in common."
            />
          </div>
          {c.shared.mq.length > 0 && (
            <div className="stack-sm">
              <h2>Maps searches</h2>
              <DuoList items={c.shared.mq} myName={me} friendName={them} mono showDates={false} />
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <h2>Your daily rhythm</h2>
        <div className="legend">
          <span>
            <i style={{ background: "var(--you)" }} />
            {me}
          </span>
          <span>
            <i style={{ background: "var(--friend)" }} />
            {them}
          </span>
        </div>
        <div className="grid-2">
          <div className="stack-sm">
            <h3>Hour of day</h3>
            <HourChart mine={c.rhythm.mineHours} theirs={c.rhythm.theirHours} label={`Activity by hour, ${me} and ${them}`} />
          </div>
          <div className="stack-sm">
            <h3>Day of week</h3>
            <WeekdayChart mine={c.rhythm.mineWeekdays} theirs={c.rhythm.theirWeekdays} label={`Activity by weekday, ${me} and ${them}`} />
          </div>
        </div>
        <p className="small muted">
          Each person's bars are a share of their own activity, so a heavy user and a light user compare fairly. Hours are in each
          person's own time zone.
        </p>
      </section>

      <section className="section">
        <h2>Who got there first</h2>
        <p>
          Of the searches and channels you share, {me} found {fmt(c.firsts.mine)} first and {them} found {fmt(c.firsts.theirs)} first.
          {c.myRange[0] !== undefined && c.theirRange[0] !== undefined && (
            <span className="muted">
              {" "}
              {me}'s history starts {formatMonth(c.myRange[0])}; {them}'s starts {formatMonth(c.theirRange[0])}.
            </span>
          )}
        </p>
      </section>

      <section className="section">
        <details className="more">
          <summary>How the score works</summary>
          <div className="stack-sm small muted prose" style={{ marginTop: "0.75rem" }}>
            <p>
              For each kind of item, the app measures how similar your two lists are (cosine similarity of log counts), leaving out
              everyday items like “weather” and huge sites everyone visits. Search words count most, then music artists, channels,
              websites, searches, videos, subscriptions and songs. Your daily rhythm counts a little. The combined value is spread onto 0 to 100.
            </p>
            <div className="table-wrap">
            <table className="num" style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Kind</th>
                  <th style={{ textAlign: "right" }}>{me}</th>
                  <th style={{ textAlign: "right" }}>{them}</th>
                  <th style={{ textAlign: "right" }}>Both</th>
                  <th style={{ textAlign: "right" }}>Similarity</th>
                </tr>
              </thead>
              <tbody>
                {c.overlap.map((o) => (
                  <tr key={o.ns}>
                    <td>{NS_LABEL[o.ns]}</td>
                    <td style={{ textAlign: "right" }}>{fmt(o.mine)}</td>
                    <td style={{ textAlign: "right" }}>{fmt(o.theirs)}</td>
                    <td style={{ textAlign: "right" }}>{fmt(o.shared)}</td>
                    <td style={{ textAlign: "right" }}>{(o.similarity * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
