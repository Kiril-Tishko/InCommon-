import { useRef, useState } from "react";
import type { Progress } from "../worker/protocol";
import { formatBytes } from "./files";

export function Load({ onFiles, busy, progress, error, onCancel, hasOwnData }: {
  onFiles: (files: File[]) => void;
  busy: boolean;
  progress?: Progress;
  error?: string;
  onCancel: () => void;
  hasOwnData: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [picked, setPicked] = useState<File[]>([]);

  const take = (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (files.length === 0) return;
    setPicked(files);
    onFiles(files);
  };

  return (
    <div className="stack" style={{ gap: "2rem" }}>
      <div className="stack prose">
        <h1>Load your Google history</h1>
        <p className="muted">
          Google lets you download everything it has kept about your activity: every search, every YouTube video, every site you
          opened from a search. Load that download here. It is read inside this browser tab, and nothing is uploaded anywhere.
        </p>
      </div>

      <div
        className={over ? "dropzone over" : "dropzone"}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!busy) take(e.dataTransfer.files);
        }}
      >
        {busy ? (
          <div className="stack-sm" style={{ width: "min(100%, 30rem)" }} aria-live="polite">
            <b>Reading {picked.length === 1 ? picked[0].name : `${picked.length} files`}…</b>
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress?.fraction ?? 0) * 100)}>
              <i style={{ width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }} />
            </div>
            <span className="small muted">
              {progress?.step ?? "Starting"} · {(progress?.events ?? 0).toLocaleString("en-US")} things found
            </span>
            <div>
              <button className="btn quiet small" type="button" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <b style={{ fontSize: "var(--step-1)" }}>Drop your Takeout .zip here</b>
            <span className="muted small">Several parts are fine (takeout-…-001.zip, -002.zip). Loose .json or .html files work too.</span>
            <button className="btn" type="button" onClick={() => input.current?.click()}>
              Choose files
            </button>
            <input
              ref={input}
              id="takeout-files"
              className="visually-hidden"
              type="file"
              multiple
              accept=".zip,.json,.html,.htm,.csv,application/zip,application/json,text/html,text/csv"
              onChange={(e) => {
                take(e.target.files);
                e.target.value = "";
              }}
            />
            {picked.length > 0 && !error && (
              <span className="small muted">
                Last loaded: {picked.map((f) => `${f.name} (${formatBytes(f.size)})`).join(", ")}
              </span>
            )}
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      {hasOwnData && (
        <p className="muted small">
          Loading another export replaces the history you loaded before. Load all the parts of one export together.
        </p>
      )}

      <div className="grid-2">
        <div className="stack">
          <h2>Get your download from Google</h2>
          <ol className="howto">
            <li>
              Open{" "}
              <a href="https://takeout.google.com/" target="_blank" rel="noreferrer">
                takeout.google.com
              </a>{" "}
              and sign in. It works on a phone too.
            </li>
            <li>
              Press <b>Deselect all</b>, then tick only:
              <ul>
                <li>
                  <b>My Activity</b>. Press <b>Multiple formats</b> and choose <b>JSON</b>. HTML also works, but it is slower to read.
                </li>
                <li>
                  <b>YouTube and YouTube Music</b>. Press <b>All YouTube data included</b> and keep only <b>history</b> and{" "}
                  <b>subscriptions</b>. Your own uploaded videos can be huge. Under <b>Multiple formats</b>, set history to <b>JSON</b>.
                </li>
                <li>
                  <b>Chrome</b> (optional): adds sites you visited in Chrome.
                </li>
              </ul>
            </li>
            <li>
              Choose <b>Export once</b>, <b>.zip</b>, and the largest file size so you get fewer parts.
            </li>
            <li>Google emails you a link, usually within minutes to a few hours. Download the zip, then load it above.</li>
          </ol>
        </div>
        <div className="stack">
          <h2>What stays private</h2>
          <ul className="stack-sm" style={{ paddingLeft: "1.1rem", margin: 0 }}>
            <li>Your export is read in this tab. It never leaves this device.</li>
            <li>
              The summary is kept in this browser so you don't have to load the export again. <b>Forget my data</b> on the next
              screen deletes it.
            </li>
            <li>
              Your friend gets a <i>match file</i>, not your history. Every item in it is scrambled with a code word you both pick,
              so their copy of this app can only recognise things they have too.
            </li>
            <li>You can list words that must never be shared, such as a health topic, and every item mentioning them is left out.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
