import { useCallback, useEffect, useRef, useState } from "react";
import type { Comparison } from "./core/compare";
import { compare } from "./core/compare";
import { DEMO_CODE_WORD, demoProfile } from "./core/demo";
import { buildMatchFile, DEFAULT_INCLUDE, type ShareOptions } from "./core/matchfile";
import { mergeProfiles, profileEventTotal, upgradeProfile } from "./core/profile";
import type { MatchFile, Profile } from "./core/types";
import { compareWith, importFiles, makeMatchFile, TaskError } from "./worker/client";
import type { Progress } from "./worker/protocol";
import { Compare } from "./ui/Compare";
import { Load } from "./ui/Load";
import { MyHistory } from "./ui/MyHistory";
import { Share } from "./ui/Share";
import { clearPrefs, forgetProfile, getPref, loadProfile, saveProfile, setPref } from "./ui/storage";
import { warmUpDownloads } from "./ui/files";

type Step = "load" | "history" | "share" | "compare";

const STEPS: { id: Step; label: string }[] = [
  { id: "load", label: "Load" },
  { id: "history", label: "Your history" },
  { id: "share", label: "Match file" },
  { id: "compare", label: "Compare" },
];

const DEMO_OPTS: ShareOptions = { name: "Alex", codeWord: DEMO_CODE_WORD, include: DEFAULT_INCLUDE, hideWords: [] };

interface Demo {
  alex: Profile;
  samFile: MatchFile;
  comparison: Comparison;
}

async function buildDemo(): Promise<Demo> {
  const alex = demoProfile("Alex", 0.6);
  const sam = demoProfile("Sam", 0.6);
  const samFile = await buildMatchFile(sam, { ...DEMO_OPTS, name: "Sam" });
  const comparison = await compare(alex, DEMO_OPTS, samFile);
  return { alex, samFile, comparison };
}

interface Job {
  kind: "import" | "share" | "compare";
  progress?: Progress;
  cancel?: () => void;
}

export function App() {
  const [own, setOwn] = useState<Profile>();
  const [demo, setDemo] = useState<Demo>();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>("compare");

  const [opts, setOptsState] = useState<ShareOptions>(() => ({
    name: getPref("name", ""),
    codeWord: "",
    // Stored as what you left out, so categories added later are included by default.
    include: DEFAULT_INCLUDE.filter((ns) => !getPref("exclude", [] as string[]).includes(ns)),
    hideWords: getPref("hide", [] as string[]),
  }));
  const [demoOpts, setDemoOpts] = useState<ShareOptions>(DEMO_OPTS);
  const [made, setMade] = useState<MatchFile>();
  const [friend, setFriend] = useState<MatchFile>();
  const [result, setResult] = useState<Comparison>();
  const [job, setJob] = useState<Job>();
  const [errors, setErrors] = useState<{ import?: string; share?: string; compare?: string; codeWord?: boolean }>({});
  const top = useRef<HTMLDivElement>(null);

  const isDemo = !own;
  const profile = own ?? demo?.alex;
  const activeOpts = isDemo ? demoOpts : opts;

  const setOpts = (o: ShareOptions) => {
    if (isDemo) {
      setDemoOpts(o);
      return;
    }
    setOptsState(o);
    setPref("name", o.name);
    setPref("exclude", DEFAULT_INCLUDE.filter((ns) => !o.include.includes(ns)));
    setPref("hide", o.hideWords);
  };

  useEffect(() => {
    warmUpDownloads();
    let alive = true;
    void (async () => {
      const saved = await loadProfile();
      const stored = saved && upgradeProfile(saved);
      if (!alive) return;
      if (stored) {
        setOwn(stored);
        setStep("history");
      }
      try {
        const d = await buildDemo();
        if (!alive) return;
        setDemo(d);
        if (!stored) {
          setFriend(d.samFile);
          setResult(d.comparison);
        }
      } catch (err) {
        console.warn("Demo unavailable", err);
        if (!stored) setStep("load");
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const go = useCallback((s: Step) => {
    setStep(s);
    top.current?.scrollIntoView({ block: "start" });
    window.scrollTo({ top: 0 });
  }, []);

  const onFiles = (files: File[], mode: "add" | "replace") => {
    setErrors({});
    const run = importFiles(files, (progress) => setJob((j) => (j ? { ...j, progress } : j)));
    setJob({ kind: "import", cancel: run.cancel });
    run.promise.then(
      async (p) => {
        setJob(undefined);
        if (profileEventTotal(p) === 0) {
          setErrors({
            import:
              "No history found in these files. In Takeout, make sure My Activity or YouTube history is selected, then load the zip it gives you.",
          });
          return;
        }
        const next = mode === "add" && own ? mergeProfiles(own, p) : p;
        setOwn(next);
        setMade(undefined);
        setFriend(undefined);
        setResult(undefined);
        const stored = await saveProfile(next);
        if (!stored) console.info("This browser would not keep the summary; it lasts until you close the tab.");
        go("history");
      },
      (err: unknown) => {
        setJob(undefined);
        const msg = err instanceof Error ? err.message : String(err);
        setErrors({ import: msg === "Import cancelled" ? undefined : msg });
      },
    );
  };

  const onMake = () => {
    if (!profile) return;
    setErrors({});
    const run = makeMatchFile(profile, activeOpts, (progress) => setJob((j) => (j ? { ...j, progress } : j)));
    setJob({ kind: "share" });
    run.promise.then(
      (mf) => {
        setJob(undefined);
        setMade(mf);
      },
      (err: unknown) => {
        setJob(undefined);
        setErrors({ share: err instanceof Error ? err.message : String(err) });
      },
    );
  };

  const onCompare = () => {
    if (!profile || !friend) return;
    setErrors({});
    const run = compareWith(profile, activeOpts, friend, (progress) => setJob((j) => (j ? { ...j, progress } : j)));
    setJob({ kind: "compare" });
    run.promise.then(
      (c) => {
        setJob(undefined);
        setResult(c);
      },
      (err: unknown) => {
        setJob(undefined);
        setErrors({ compare: err instanceof Error ? err.message : String(err), codeWord: err instanceof TaskError && err.code === "code-word" });
      },
    );
  };

  const onForget = async () => {
    await forgetProfile();
    clearPrefs();
    setOwn(undefined);
    setMade(undefined);
    setOptsState({ name: "", codeWord: "", include: DEFAULT_INCLUDE, hideWords: [] });
    setFriend(demo?.samFile);
    setResult(demo?.comparison);
    go("load");
  };

  const startOwn = () => go("load");

  return (
    <>
      <header className="topbar" ref={top}>
        <div className="topbar-inner">
          <div className="brand">
            <Logo />
            InCommon
          </div>
          <nav className="steps" aria-label="Steps">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className="step"
                aria-current={step === s.id ? "step" : undefined}
                disabled={s.id !== "load" && !profile}
                onClick={() => go(s.id)}
              >
                <span className="n">{i + 1}</span>
                <span className="lbl">{s.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="page">
        {isDemo && ready && step !== "load" && (
          <div className="banner" style={{ marginBottom: "1.5rem" }}>
            <p>
              <b>This is a demo.</b> Alex and Sam are made-up people. Load your own Google history to compare with a real friend.
            </p>
            <button className="btn small" type="button" onClick={startOwn}>
              Start with my data
            </button>
          </div>
        )}

        {!ready && step !== "load" ? (
          <p className="muted" aria-live="polite">
            Getting the demo ready…
          </p>
        ) : step === "load" ? (
          <Load
            onFiles={onFiles}
            busy={job?.kind === "import"}
            progress={job?.kind === "import" ? job.progress : undefined}
            error={errors.import}
            onCancel={() => job?.cancel?.()}
            hasOwnData={!!own}
          />
        ) : step === "history" && profile ? (
          <MyHistory profile={profile} isDemo={isDemo} name={activeOpts.name} onForget={onForget} onNext={() => go("share")} />
        ) : step === "share" && profile ? (
          <Share
            profile={profile}
            opts={activeOpts}
            setOpts={setOpts}
            onMake={onMake}
            busy={job?.kind === "share"}
            progress={job?.kind === "share" ? job.progress : undefined}
            error={errors.share}
            made={made}
            onNext={() => go("compare")}
          />
        ) : step === "compare" && profile ? (
          <Compare
            friend={friend}
            setFriend={(f) => {
              setFriend(f);
              setResult(undefined);
            }}
            codeWord={activeOpts.codeWord}
            setCodeWord={(codeWord) => setOpts({ ...activeOpts, codeWord })}
            onCompare={onCompare}
            busy={job?.kind === "compare"}
            progress={job?.kind === "compare" ? job.progress : undefined}
            error={errors.compare}
            codeWordError={errors.codeWord}
            result={result}
            isDemo={isDemo}
          />
        ) : null}

        <footer className="footer stack-sm">
          <p>
            InCommon reads your Google export inside this browser tab. There is no account and no server, and nothing you load is
            uploaded.
          </p>
        </footer>
      </main>
    </>
  );
}

function Logo() {
  return (
    <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden="true">
      <defs>
        <clipPath id="logo-a">
          <circle cx="10" cy="10" r="8.5" />
        </clipPath>
      </defs>
      <circle cx="10" cy="10" r="8.5" fill="var(--you-soft)" stroke="var(--you)" strokeWidth="1.8" />
      <circle cx="18" cy="10" r="8.5" fill="var(--friend-soft)" stroke="var(--friend)" strokeWidth="1.8" />
      <circle cx="18" cy="10" r="8.5" fill="var(--both)" clipPath="url(#logo-a)" />
    </svg>
  );
}
