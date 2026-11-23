import { useEffect, useRef, useState } from "react";
import { findLocalAi, servedLocally, streamChat, visibleText, type AiServer } from "../ai/localAi";
import { asPlainPrompt, type ChatMessage } from "../ai/prompts";
import { Markdown } from "./Markdown";
import { getPref, setPref } from "./storage";

type Phase = "idle" | "searching" | "missing" | "ready" | "writing" | "done" | "error";

/**
 * Asks an AI model on this PC to write something from the data. The model's
 * answer stays on this device too.
 */
export function AiPanel({ id, title, intro, build, demo }: {
  /** Distinguishes panels for remembered output. */
  id: string;
  title: string;
  intro: string;
  build: (language: string) => ChatMessage[];
  demo?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [server, setServer] = useState<AiServer>();
  const [model, setModel] = useState<string>(() => getPref("aiModel", ""));
  const [language, setLanguage] = useState<string>(() => getPref("aiLanguage", "English"));
  const [custom, setCustom] = useState<string>(() => getPref("aiCustom", ""));
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState<string>();
  const [showPrompt, setShowPrompt] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const connect = async () => {
    setPhase("searching");
    setError(undefined);
    const found = await findLocalAi(custom);
    if (!found) {
      setPhase("missing");
      return;
    }
    setServer(found);
    setPref("aiConnected", true);
    if (found.models.length === 0) {
      setError(
        found.kind === "ollama"
          ? "Ollama is running but has no models yet. In a terminal, run: ollama pull llama3.2"
          : "The AI server is running but has no model loaded. Load one in LM Studio first.",
      );
      setPhase("error");
      return;
    }
    if (!found.models.includes(model)) setModel(found.models[0]);
    setPhase("ready");
  };

  // Reconnect quietly if this browser found a local AI before.
  useEffect(() => {
    if (getPref("aiConnected", false) && servedLocally()) void connect();
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const write = async () => {
    if (!server || !model) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setRaw("");
    setError(undefined);
    setPhase("writing");
    setPref("aiModel", model);
    setPref("aiLanguage", language);
    let acc = "";
    try {
      for await (const piece of streamChat(server, model, build(language), ctrl.signal)) {
        acc += piece;
        setRaw(acc);
      }
      setPhase("done");
    } catch (err) {
      if (ctrl.signal.aborted) {
        setPhase(acc ? "done" : "ready");
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setShowPrompt(true);
      setCopied(undefined);
    }
  };

  const { text, thinking } = visibleText(raw);
  const busy = phase === "searching" || phase === "writing";

  return (
    <div className="ai" id={`ai-${id}`}>
      <div className="stack-sm">
        <h2>{title}</h2>
        <p className="muted prose">{intro}</p>
      </div>

      {(phase === "idle" || phase === "searching" || phase === "missing") && (
        <div className="stack-sm">
          <div className="row">
            <button className="btn" type="button" onClick={connect} disabled={phase === "searching"}>
              {phase === "searching" ? "Looking for an AI on this PC…" : "Connect to the AI on this PC"}
            </button>
            <button className="btn quiet small" type="button" onClick={() => copy(asPlainPrompt(build(language)), "prompt")}>
              Copy the prompt instead
            </button>
          </div>
          {phase === "missing" && (
            <div className="stack-sm prose">
              {servedLocally() ? (
                <p className="error">
                  No AI found on this PC. Start Ollama, or the server in LM Studio, and try again.
                </p>
              ) : (
                <p className="error">
                  This copy of InCommon is a web page, and web pages can't reach programs on your PC. To use a local AI, run InCommon
                  on your PC with start.bat (see below).
                </p>
              )}
            </div>
          )}
          <details className="more">
            <summary>How to set up an AI on your PC</summary>
            <ol className="howto small" style={{ marginTop: "0.5rem" }}>
              <li>
                Install{" "}
                <a href="https://ollama.com/download" target="_blank" rel="noreferrer">
                  Ollama
                </a>{" "}
                (free). Then open a terminal and download a model, for example <code>ollama pull llama3.2</code>. A bigger model, such
                as <code>ollama pull gemma3:12b</code>, writes better if your PC has a graphics card with 12 GB of memory or more.
              </li>
              <li>
                Install{" "}
                <a href="https://nodejs.org/" target="_blank" rel="noreferrer">
                  Node.js
                </a>{" "}
                (the LTS version), then double-click <b>start.bat</b> in the InCommon folder. It opens InCommon in your browser,
                running from your PC.
              </li>
              <li>Press <b>Connect to the AI on this PC</b>. Your data and the AI's answer never leave your computer.</li>
              <li>
                Using LM Studio instead? Load a model and start its server (Developer tab); InCommon finds it on port 1234.
              </li>
            </ol>
            <label className="field small" style={{ marginTop: "0.75rem" }}>
              <span>Other AI server address (optional)</span>
              <input
                id={`ai-custom-${id}`}
                className="input mono"
                placeholder="http://localhost:11434"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setPref("aiCustom", e.target.value);
                }}
              />
            </label>
          </details>
          {copied === "prompt" && (
            <p className="small">
              Copied. If you paste it into an online AI chat, this summary{demo ? "" : " of your history"} goes to that company.
            </p>
          )}
          {showPrompt && <textarea className="input prompt-copy" readOnly value={asPlainPrompt(build(language))} onFocus={(e) => e.target.select()} />}
        </div>
      )}

      {server && phase !== "idle" && phase !== "searching" && phase !== "missing" && (
        <div className="stack-sm">
          <div className="ai-status">
            <span className="dot" aria-hidden="true" />
            <span>{server.label} on this PC</span>
            {server.models.length > 0 && (
              <label className="row" style={{ gap: "0.4rem" }}>
                <span>Model</span>
                <select id={`ai-model-${id}`} value={model} onChange={(e) => setModel(e.target.value)} disabled={busy}>
                  {server.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="row" style={{ gap: "0.4rem" }}>
              <span>Language</span>
              <input
                id={`ai-lang-${id}`}
                className="input"
                style={{ minHeight: "2.1rem", width: "9rem", padding: "0.2rem 0.5rem" }}
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>
          <div className="row">
            {phase === "writing" ? (
              <button className="btn secondary" type="button" onClick={() => abort.current?.abort()}>
                Stop
              </button>
            ) : (
              <button className="btn" type="button" onClick={write} disabled={!model}>
                {phase === "done" ? "Write it again" : "Write it"}
              </button>
            )}
            {phase === "done" && text && (
              <button className="btn quiet small" type="button" onClick={() => copy(text, "answer")}>
                Copy text
              </button>
            )}
            {copied === "answer" && <span className="small muted">Copied.</span>}
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {(phase === "writing" || phase === "done" || (phase === "error" && text)) && (
        <div className="ai-out" aria-live="polite" aria-busy={phase === "writing"}>
          {thinking && !text && <p className="muted">The model is thinking…</p>}
          {!thinking && !text && phase === "writing" && <p className="muted">Reading your data… Small models start writing in a few seconds; big ones can take a minute.</p>}
          {text && <Markdown text={text} />}
          {phase === "writing" && text && <span className="caret" aria-hidden="true" />}
        </div>
      )}
    </div>
  );
}
