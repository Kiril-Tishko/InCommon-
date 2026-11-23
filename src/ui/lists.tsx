import { useState } from "react";
import type { SharedItem } from "../core/compare";
import { fmt, formatMonth } from "./format";

export interface Row {
  key: string;
  label: string;
  count: number;
  sub?: string;
}

export function RankedList({ rows, initial = 10, mono = false, empty }: { rows: Row[]; initial?: number; mono?: boolean; empty?: string }) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return <p className="muted">{empty ?? "Nothing here yet."}</p>;
  const shown = open ? rows : rows.slice(0, initial);
  const max = rows[0]?.count || 1;
  return (
    <div className="stack-sm">
      <ol className="ranked">
        {shown.map((r) => (
          <li key={r.key}>
            <span className={mono ? "text query" : "text"}>{r.label}</span>
            <span className="count">{fmt(r.count)}</span>
            {r.sub && <span className="sub">{r.sub}</span>}
            <span className="bar" aria-hidden="true">
              <i style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }} />
            </span>
          </li>
        ))}
      </ol>
      {rows.length > initial && (
        <button className="btn quiet small" type="button" onClick={() => setOpen(!open)}>
          {open ? "Show fewer" : `Show all ${fmt(rows.length)}`}
        </button>
      )}
    </div>
  );
}

/** Things you both have, with your count and theirs side by side. */
export function DuoList({ items, myName, friendName, initial = 8, mono = false, showDates = true, empty }: {
  items: SharedItem[];
  myName: string;
  friendName: string;
  initial?: number;
  mono?: boolean;
  showDates?: boolean;
  empty?: string;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return <p className="muted">{empty ?? "Nothing in common here."}</p>;
  const shown = open ? items : items.slice(0, initial);
  const max = Math.max(1, ...shown.map((i) => Math.max(i.mine.count, i.theirs.count)));
  return (
    <div className="stack-sm">
      <ol className="ranked duo">
        {shown.map((it) => (
          <li key={it.ns + it.key}>
            <span className={mono ? "text query" : "text"}>
              {it.label} {it.generic && <span className="tag">everyday</span>}
            </span>
            {it.extra && <span className="sub">{it.extra}</span>}
            <span className="bars">
              <span className="who">{myName}</span>
              <span className="track you" aria-hidden="true">
                <i style={{ width: `${Math.max(2, (it.mine.count / max) * 100)}%` }} />
              </span>
              <span className="n">{fmt(it.mine.count)}</span>
              <span className="who">{friendName}</span>
              <span className="track friend" aria-hidden="true">
                <i style={{ width: `${Math.max(2, (it.theirs.count / max) * 100)}%` }} />
              </span>
              <span className="n">{fmt(it.theirs.count)}</span>
            </span>
            {showDates && it.mine.first !== undefined && it.theirs.first !== undefined && (
              <span className="sub">
                First: {myName} {formatMonth(it.mine.first)} · {friendName} {formatMonth(it.theirs.first)}
              </span>
            )}
          </li>
        ))}
      </ol>
      {items.length > initial && (
        <button className="btn quiet small" type="button" onClick={() => setOpen(!open)}>
          {open ? "Show fewer" : `Show all ${fmt(items.length)}`}
        </button>
      )}
    </div>
  );
}
