import { hourLabel } from "./format";

function shares(xs: number[]): number[] {
  const total = xs.reduce((s, x) => s + x, 0) || 1;
  return xs.map((x) => x / total);
}

/** Activity by hour of day, as a share of each person's total so different volumes compare fairly. */
export function HourChart({ mine, theirs, label }: { mine: number[]; theirs?: number[]; label: string }) {
  const a = shares(mine);
  const b = theirs ? shares(theirs) : undefined;
  const max = Math.max(...a, ...(b ?? [0]), 0.0001);
  const W = 480;
  const H = 150;
  const top = 10;
  const bottom = 22;
  const left = 4;
  const slot = (W - left * 2) / 24;
  const plotH = H - top - bottom;
  const barW = b ? slot * 0.36 : slot * 0.62;
  const y = (v: number) => top + plotH - (v / max) * plotH;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line className="grid" x1={left} x2={W - left} y1={y(max / 2)} y2={y(max / 2)} />
      {a.map((v, h) => {
        const x0 = left + h * slot + (b ? slot * 0.12 : (slot - barW) / 2);
        return (
          <g key={h}>
            <rect className={b ? "bar-you" : "bar-one"} x={x0} y={y(v)} width={barW} height={Math.max(0, top + plotH - y(v))} rx={1.5}>
              <title>{`${hourLabel(h)}: ${(v * 100).toFixed(1)}%`}</title>
            </rect>
            {b && (
              <rect className="bar-friend" x={x0 + barW + slot * 0.04} y={y(b[h])} width={barW} height={Math.max(0, top + plotH - y(b[h]))} rx={1.5}>
                <title>{`${hourLabel(h)}: ${(b[h] * 100).toFixed(1)}%`}</title>
              </rect>
            )}
          </g>
        );
      })}
      <line className="axis" x1={left} x2={W - left} y1={top + plotH} y2={top + plotH} />
      {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
        <text key={h} x={left + h * slot + slot / 2} y={H - 6} textAnchor="middle">
          {String(h).padStart(2, "0")}
        </text>
      ))}
    </svg>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WeekdayChart({ mine, theirs, label }: { mine: number[]; theirs?: number[]; label: string }) {
  // Start the week on Monday.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const a = shares(mine);
  const b = theirs ? shares(theirs) : undefined;
  const max = Math.max(...a, ...(b ?? [0]), 0.0001);
  const W = 480;
  const H = 120;
  const top = 8;
  const bottom = 20;
  const slot = W / 7;
  const plotH = H - top - bottom;
  const barW = b ? slot * 0.3 : slot * 0.5;
  const y = (v: number) => top + plotH - (v / max) * plotH;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {order.map((d, i) => {
        const x0 = i * slot + (b ? slot * 0.18 : (slot - barW) / 2);
        return (
          <g key={d}>
            <rect className={b ? "bar-you" : "bar-one"} x={x0} y={y(a[d])} width={barW} height={top + plotH - y(a[d])} rx={2} />
            {b && <rect className="bar-friend" x={x0 + barW + slot * 0.04} y={y(b[d])} width={barW} height={top + plotH - y(b[d])} rx={2} />}
            <text x={i * slot + slot / 2} y={H - 5} textAnchor="middle">
              {WEEKDAYS[d]}
            </text>
          </g>
        );
      })}
      <line className="axis" x1={0} x2={W} y1={top + plotH} y2={top + plotH} />
    </svg>
  );
}

export function YearChart({ years, label }: { years: Record<string, number>; label: string }) {
  const keys = Object.keys(years).sort();
  if (keys.length === 0) return null;
  const first = +keys[0];
  const last = +keys[keys.length - 1];
  const all: number[] = [];
  for (let y = first; y <= last; y++) all.push(y);
  const max = Math.max(...all.map((y) => years[y] ?? 0), 1);
  const W = 480;
  const H = 130;
  const top = 16;
  const bottom = 20;
  const slot = W / all.length;
  const plotH = H - top - bottom;
  const barW = Math.min(36, slot * 0.6);
  const every = Math.ceil(all.length / 10);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {all.map((yr, i) => {
        const v = years[yr] ?? 0;
        const h = (v / max) * plotH;
        return (
          <g key={yr}>
            <rect className="bar-one" x={i * slot + (slot - barW) / 2} y={top + plotH - h} width={barW} height={h} rx={2}>
              <title>{`${yr}: ${v.toLocaleString("en-US")}`}</title>
            </rect>
            {(i % every === 0 || i === all.length - 1) && (
              <text x={i * slot + slot / 2} y={H - 5} textAnchor="middle">
                {all.length > 8 ? `’${String(yr).slice(2)}` : yr}
              </text>
            )}
          </g>
        );
      })}
      <line className="axis" x1={0} x2={W} y1={top + plotH} y2={top + plotH} />
    </svg>
  );
}

/** Two circles whose overlap grows with the score. */
export function Venn({ score, myName, friendName, myTally, friendTally }: {
  score: number;
  myName: string;
  friendName: string;
  myTally: [string, string];
  friendTally: [string, string];
}) {
  const r = 110;
  const overlap = 64 + 0.76 * Math.max(0, Math.min(100, score));
  const d = 2 * r - overlap;
  const cx = 210;
  const cy = 128;
  const ax = cx - d / 2;
  const bx = cx + d / 2;
  const aMid = (ax - r + (bx - r)) / 2;
  const bMid = (ax + r + (bx + r)) / 2;
  const short = (s: string) => (s.length > 9 ? s.slice(0, 8) + "…" : s);
  return (
    <svg className="venn" viewBox="0 0 420 256" role="img" aria-label={`${myName} and ${friendName}: ${score} out of 100 in common`}>
      <defs>
        <clipPath id="venn-a">
          <circle cx={ax} cy={cy} r={r} />
        </clipPath>
      </defs>
      <circle className="a" cx={ax} cy={cy} r={r} />
      <circle className="b" cx={bx} cy={cy} r={r} />
      <circle className="ab" cx={bx} cy={cy} r={r} clipPath="url(#venn-a)" />
      <text className="name a-name" x={aMid} y={cy - 8} textAnchor="middle">
        {short(myName)}
      </text>
      <text className="tally" x={aMid} y={cy + 10} textAnchor="middle">
        {myTally[0]}
      </text>
      <text className="tally" x={aMid} y={cy + 24} textAnchor="middle">
        {myTally[1]}
      </text>
      <text className="name b-name" x={bMid} y={cy - 8} textAnchor="middle">
        {short(friendName)}
      </text>
      <text className="tally" x={bMid} y={cy + 10} textAnchor="middle">
        {friendTally[0]}
      </text>
      <text className="tally" x={bMid} y={cy + 24} textAnchor="middle">
        {friendTally[1]}
      </text>
      <text className="score" x={cx} y={cy + 12} textAnchor="middle">
        {score}
      </text>
      <text className="score-sub" x={cx} y={cy + 32} textAnchor="middle">
        IN COMMON
      </text>
    </svg>
  );
}
