/**
 * A tiny Markdown renderer for AI answers: headings, bullet and numbered
 * lists, paragraphs, **bold**, *italic* and `code`. It builds React elements,
 * never HTML strings, so nothing in the text can run as markup.
 */
import { Fragment, type ReactNode } from "react";

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**") || tok.startsWith("__")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { type: "h"; level: number; text: string } | { type: "ul" | "ol"; items: string[] } | { type: "p"; text: string };

export function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = line.match(/^\s*(#{1,4})\s+(.*)$/);
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (!line.trim()) {
      flush();
    } else if (h) {
      flush();
      blocks.push({ type: "h", level: h[1].length, text: h[2].replace(/#+\s*$/, "") });
    } else if (ul || ol) {
      flush();
      const type = ul ? "ul" : "ol";
      const prev = blocks[blocks.length - 1];
      const text = (ul ?? ol)![1];
      if (prev && prev.type === type) prev.items.push(text);
      else blocks.push({ type, items: [text] });
    } else if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flush();
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      {parseBlocks(text).map((b, i) => {
        const k = `b${i}`;
        if (b.type === "h") return b.level <= 2 ? <h3 key={k}>{inline(b.text, k)}</h3> : <h4 key={k}>{inline(b.text, k)}</h4>;
        if (b.type === "p") return <p key={k}>{inline(b.text, k)}</p>;
        const items = b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>);
        return <Fragment key={k}>{b.type === "ul" ? <ul>{items}</ul> : <ol>{items}</ol>}</Fragment>;
      })}
    </div>
  );
}
