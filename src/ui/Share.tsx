import { useEffect, useMemo, useState } from "react";
import type { MatchFile, Namespace, Profile } from "../core/types";
import { encodeMatchFile, matchFileName, normalizeCodeWord, shareableItems, type ShareOptions } from "../core/matchfile";
import type { Progress } from "../worker/protocol";
import { canShareFiles, formatBytes, saveFile, shareFile } from "./files";
import { fmt, suggestCodeWord } from "./format";

const CATEGORIES: { ns: Namespace; label: string; hint: string }[] = [
  { ns: "q", label: "Google searches", hint: "Exact searches, like “sourdough hydration calculator”." },
  { ns: "w", label: "Search words", hint: "Single words and two-word phrases from your searches. Finds shared topics even when the wording differs." },
  { ns: "yq", label: "YouTube searches", hint: "" },
  { ns: "ch", label: "YouTube channels", hint: "Channels you watched." },
  { ns: "sub", label: "YouTube subscriptions", hint: "" },
  { ns: "v", label: "YouTube videos", hint: "Individual videos you watched." },
  { ns: "site", label: "Websites", hint: "Site names only, like wikipedia.org, never full addresses." },
  { ns: "mq", label: "Maps searches", hint: "" },
];

export function Share({ profile, opts, setOpts, onMake, busy, progress, error, made, onNext }: {
  profile: Profile;
  opts: ShareOptions;
  setOpts: (o: ShareOptions) => void;
  onMake: () => void;
  busy: boolean;
  progress?: Progress;
  error?: string;
  made?: MatchFile;
  onNext: () => void;
}) {
  const [hideText, setHideText] = useState(opts.hideWords.join("\n"));
  const [blob, setBlob] = useState<Blob>();
  const [status, setStatus] = useState<string>();
  const shareable = useMemo(() => canShareFiles(), []);

  useEffect(() => {
    setStatus(undefined);
    if (made) void encodeMatchFile(made).then(setBlob);
    else setBlob(undefined);
  }, [made]);

  const counts = useMemo(() => {
    const c: Partial<Record<Namespace, number>> = {};
    for (const [ns] of shareableItems(profile, { include: opts.include, hideWords: opts.hideWords })) c[ns] = (c[ns] ?? 0) + 1;
    return c;
  }, [profile, opts.include, opts.hideWords]);

  const codeOk = normalizeCodeWord(opts.codeWord).length >= 4;
  const filename = matchFileName(opts.name || "me");

  const toggle = (ns: Namespace) => {
    const include = opts.include.includes(ns) ? opts.include.filter((x) => x !== ns) : [...opts.include, ns];
    setOpts({ ...opts, include });
  };

  const save = async () => {
    if (!blob) return;
    const outcome = await saveFile(filename, blob);
    setStatus(
      outcome === "saved"
        ? `Saved ${filename}. Send it to your friend however you like: chat, email, AirDrop.`
        : outcome === "declined"
          ? "Not saved."
          : "This page can't save files here. Open InCommon in a regular browser tab to save the file.",
    );
  };

  const send = async () => {
    if (!blob) return;
    const ok = await shareFile(filename, blob, "Here is my InCommon match file. Load it in step 4 and use our code word.");
    if (ok) setStatus("Sent.");
  };

  return (
    <div className="stack" style={{ gap: "2rem" }}>
      <div className="stack prose">
        <h1>Make your match file</h1>
        <p className="muted">
          This is the file you send your friend. It holds scrambled codes, not your history, so their app can only spot the things
          you both have. You'll need the same code word on both sides.
        </p>
      </div>

      <form
        className="stack panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (codeOk && !busy) onMake();
        }}
      >
        <div className="grid-2">
          <label className="field">
            <span>Your name, as your friend will see it</span>
            <input id="share-name" className="input" value={opts.name} maxLength={40} onChange={(e) => setOpts({ ...opts, name: e.target.value })} placeholder="e.g. Kim" />
          </label>
          <label className="field">
            <span>Code word you both agreed on</span>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input
                id="share-code"
                className="input mono"
                value={opts.codeWord}
                onChange={(e) => setOpts({ ...opts, codeWord: e.target.value })}
                placeholder="e.g. otter maple comet"
                autoComplete="off"
                spellCheck={false}
              />
              <button className="btn quiet small" type="button" onClick={() => setOpts({ ...opts, codeWord: suggestCodeWord() })}>
                Suggest
              </button>
            </div>
            <span className="small muted">
              Tell it to your friend in person or in a different chat from the one you send the file in. Capitals and punctuation
              don't matter.
            </span>
          </label>
        </div>

        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: "0.25rem" }}>What to compare</legend>
          <div className="grid-2" style={{ gap: "0 2rem" }}>
            {CATEGORIES.map((c) => (
              <label key={c.ns} className="check">
                <input id={`inc-${c.ns}`} type="checkbox" checked={opts.include.includes(c.ns)} onChange={() => toggle(c.ns)} />
                <span>
                  {c.label} <span className="muted small num">({fmt(counts[c.ns] ?? 0)})</span>
                  {c.hint && (
                    <>
                      <br />
                      <span className="small muted">{c.hint}</span>
                    </>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span>Never share anything that mentions</span>
          <textarea
            id="share-hide"
            className="input"
            value={hideText}
            onChange={(e) => setHideText(e.target.value)}
            onBlur={() => setOpts({ ...opts, hideWords: splitHide(hideText) })}
            placeholder={"One word or phrase per line, e.g.\nsymptoms\nmy ex's name"}
          />
          <span className="small muted">These are left out of your file and out of what you see when you compare, so both of you see the same thing.</span>
        </label>

        <div className="row">
          <button
            className="btn"
            type="submit"
            disabled={!codeOk || busy || opts.include.length === 0}
            onClick={() => setOpts({ ...opts, hideWords: splitHide(hideText) })}
          >
            {busy ? "Making the file…" : made ? "Make it again" : "Make my match file"}
          </button>
          {!codeOk && <span className="small muted">Enter a code word of at least 4 letters first.</span>}
        </div>
        {busy && (
          <div className="progress" aria-hidden="true">
            <i style={{ width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }} />
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </form>

      {made && blob && (
        <div className="stack panel" aria-live="polite">
          <h2>Your file is ready</h2>
          <p>
            <span className="mono">{filename}</span> <span className="muted">· {formatBytes(blob.size)} · {fmt(Object.values(made.uniques).reduce((s, n) => s + (n ?? 0), 0))} scrambled items</span>
          </p>
          <div className="row">
            <button className="btn" type="button" onClick={save}>
              Save file
            </button>
            {shareable && (
              <button className="btn secondary" type="button" onClick={send}>
                Send…
              </button>
            )}
            <button className="btn secondary" type="button" onClick={onNext}>
              I have my friend's file
            </button>
          </div>
          {status && <p className="small">{status}</p>}
          <details className="more">
            <summary>What exactly is in the file?</summary>
            <div className="stack-sm small muted prose" style={{ marginTop: "0.5rem" }}>
              <p>
                Your name, how many searches, videos and visits you have in total, your activity by hour, weekday and year, and for
                each item a scrambled code, how many times you did it, and up to 48 dates on which you did it.
              </p>
              <p>
                The codes are made with your code word (HMAC-SHA-256). Without the code word they can't be matched to anything.
                With it, someone could still test guesses, such as "did they ever search for X?". Share the code word only with
                this friend, and use the list above for anything you'd rather keep out.
              </p>
              <p>It's plain text: open it in any text editor to check.</p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function splitHide(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
