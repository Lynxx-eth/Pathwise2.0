// Prose — renders AI-written text the way Claude/ChatGPT present theirs:
// real paragraphs, bulleted/numbered lists, THICK bold highlights, inline
// code and small headings. It parses a safe subset of markdown into React
// elements (never innerHTML, so user/AI text can't inject anything).
import type { ReactNode } from "react";

const INLINE_RE = /(\*\*([^*]+)\*\*|`([^`\n]+)`|\*([^*\n]+)\*)/g;

/** Bold / italic / inline-code within one line of text. */
export function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={`${keyBase}b${i}`}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<code key={`${keyBase}c${i}`}>{m[3]}</code>);
    } else if (m[4] !== undefined) {
      nodes.push(<em key={`${keyBase}i${i}`}>{m[4]}</em>);
    }
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let current: Block | null = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      flush();
      continue;
    }
    const h = trimmed.match(/^#{1,4}\s+(.*)$/);
    const ul = trimmed.match(/^[-•*]\s+(.*)$/);
    const ol = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (h) {
      flush();
      blocks.push({ kind: "h", text: h[1] });
    } else if (ul) {
      if (current?.kind !== "ul") {
        flush();
        current = { kind: "ul", items: [] };
      }
      current.items.push(ul[1]);
    } else if (ol) {
      if (current?.kind !== "ol") {
        flush();
        current = { kind: "ol", items: [] };
      }
      current.items.push(ol[1]);
    } else {
      if (current?.kind !== "p") {
        flush();
        current = { kind: "p", lines: [] };
      }
      current.lines.push(trimmed);
    }
  }
  flush();
  return blocks;
}

export function Prose({
  text,
  className,
  compact = false,
}: {
  text: string;
  /** Extra classes alongside .prose (e.g. "prose-invert" inside a green bubble). */
  className?: string;
  /** Tighter spacing for chat bubbles. */
  compact?: boolean;
}) {
  const blocks = parseBlocks(text);
  return (
    <div className={`prose${compact ? " prose-compact" : ""}${className ? ` ${className}` : ""}`}>
      {blocks.map((b, i) => {
        if (b.kind === "h") return <h4 key={i}>{renderInline(b.text, `h${i}`)}</h4>;
        if (b.kind === "ul") {
          return (
            <ul key={i}>
              {b.items.map((item, j) => (
                <li key={j}>{renderInline(item, `u${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        if (b.kind === "ol") {
          return (
            <ol key={i}>
              {b.items.map((item, j) => (
                <li key={j}>{renderInline(item, `o${i}-${j}`)}</li>
              ))}
            </ol>
          );
        }
        return <p key={i}>{renderInline(b.lines.join(" "), `p${i}`)}</p>;
      })}
    </div>
  );
}
