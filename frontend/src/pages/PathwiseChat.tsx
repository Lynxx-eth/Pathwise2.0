// Chat with Pathwise — modelled on Claude's interface: a quiet centered
// reading column, no bubble around the AI's answer (just prose with a small
// avatar beside it), the user's turn in a soft rounded block, a greeting
// screen with starter prompts, and a floating rounded composer that grows
// with the text. Attach a PDF/DOC/photo with + and talk about it.
import { useEffect, useRef, useState } from "react";
import AppShell from "../components/AppShell";
import { api, ApiError } from "../lib/api";
import { LogoMark } from "../components/Logo";
import { PaperclipIcon, SendIcon, SparklesIcon } from "../components/icons";
import { Prose } from "../components/Prose";
import { SpeakButton } from "../components/speech";
import { InlineError, Spinner } from "../components/states";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface Attachment {
  filename: string;
  text: string;
  chars: number;
  truncated: boolean;
}

const STORE_KEY = "pathwise_home_chat";

const STARTERS = [
  "Explain a concept I keep getting wrong",
  "Quiz me on what I studied this week",
  "Turn my notes into a revision plan",
  "What should I study first for my exam?",
];

function loadStored(): { turns: ChatTurn[]; attachment: Attachment | null } {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Fresh start on any storage weirdness.
  }
  return { turns: [], attachment: null };
}

export default function PathwiseChat() {
  const initial = loadStored();
  const [turns, setTurns] = useState<ChatTurn[]>(initial.turns);
  const [attachment, setAttachment] = useState<Attachment | null>(initial.attachment);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ turns, attachment }));
    } catch {
      // Storage full/blocked — the chat still works, it just won't survive refresh.
    }
  }, [turns, attachment]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, busy]);

  /** Grow the composer with the text, up to a cap — Claude's behavior. */
  function autoGrow() {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  async function attach(file: File | undefined) {
    if (!file) return;
    setAttaching(true);
    setError(null);
    try {
      const res = await api.upload<Attachment>("/api/chat/attach", file);
      setAttachment(res);
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          content: `Got it — **${res.filename}** (${Math.round(res.chars / 1000)}k characters${res.truncated ? ", working from the first part" : ""}).\n\nAsk me anything about it, or tell me what you're trying to learn from it.`,
        },
      ]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't read that file.");
    } finally {
      setAttaching(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function send(text?: string) {
    const content = (text ?? draft).trim();
    if (content.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    const next: ChatTurn[] = [...turns, { role: "user", content }];
    setTurns(next);
    setDraft("");
    if (boxRef.current) boxRef.current.style.height = "auto";
    try {
      const res = await api.post<{ reply: string }>("/api/chat", {
        messages: next.slice(-20),
        attachmentText: attachment?.text,
        attachmentName: attachment?.filename,
      });
      setTurns((t) => [...t, { role: "assistant", content: res.reply }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Pathwise couldn't answer just now.");
      setDraft(content);
      setTurns(next.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    if (!window.confirm("Start a fresh chat? This clears the conversation and the attached file.")) return;
    setTurns([]);
    setAttachment(null);
    setError(null);
  }

  const empty = turns.length === 0;

  return (
    <AppShell>
      <div className="ai-chat">
        {/* Slim header — identity left, new-chat right. */}
        <div className="ai-chat-head">
          <span className="ai-chat-id">
            <LogoMark size={22} />
            Pathwise
          </span>
          {(turns.length > 0 || attachment) && (
            <button className="btn btn-ghost btn-sm" onClick={reset}>
              New chat
            </button>
          )}
        </div>

        <div className="ai-chat-scroll">
          <div className="ai-chat-col">
            {empty ? (
              <div className="ai-greeting">
                <LogoMark size={54} />
                <h1>What are we figuring out?</h1>
                <p>
                  I'll be straight with you about what you haven't understood yet
                  — that's the point. Attach a document with <strong>+</strong> and
                  we'll work through it together.
                </p>
                <div className="ai-starters">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => void send(s)} disabled={busy}>
                      <SparklesIcon cls="icon-sm" /> {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((t, i) =>
                t.role === "user" ? (
                  <div key={i} className="ai-turn user">
                    <div className="ai-user-block">{t.content}</div>
                  </div>
                ) : (
                  <div key={i} className="ai-turn assistant">
                    <span className="ai-avatar" aria-hidden="true">
                      <LogoMark size={26} />
                    </span>
                    <div className="ai-answer">
                      <Prose text={t.content} />
                      <div className="ai-answer-tools">
                        <SpeakButton text={t.content} iconOnly />
                      </div>
                    </div>
                  </div>
                )
              )
            )}

            {busy && (
              <div className="ai-turn assistant">
                <span className="ai-avatar" aria-hidden="true">
                  <LogoMark size={26} />
                </span>
                <div className="ai-answer ai-thinking">
                  <span /><span /><span />
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>
        </div>

        {/* Floating composer. */}
        <div className="ai-composer-wrap">
          <div className="ai-chat-col">
            <InlineError message={error} />
            {attachment && (
              <div className="reply-bar" style={{ marginBottom: 8 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  📄 <strong>{attachment.filename}</strong> attached
                  {attachment.truncated ? " (long file — using the first part)" : ""}
                </span>
                <button
                  className="icon-btn"
                  style={{ width: 28, height: 28 }}
                  onClick={() => setAttachment(null)}
                  aria-label="Remove attachment"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="ai-composer">
              <button
                className="icon-btn"
                onClick={() => fileRef.current?.click()}
                disabled={attaching || busy}
                aria-label="Attach a document"
                title="Attach a PDF, DOCX, PPTX or photo"
              >
                {attaching ? <Spinner size={16} /> : <PaperclipIcon cls="icon" />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={(e) => attach(e.target.files?.[0])}
                aria-label="Attach a document to chat about"
              />
              <label className="sr-only" htmlFor="pw-chat-draft">Message Pathwise</label>
              <textarea
                id="pw-chat-draft"
                ref={boxRef}
                rows={1}
                placeholder={attachment ? `Ask about ${attachment.filename}…` : "Ask Pathwise anything…"}
                value={draft}
                maxLength={4000}
                onChange={(e) => {
                  setDraft(e.target.value);
                  autoGrow();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                className="ai-send"
                onClick={() => void send()}
                disabled={busy || draft.trim().length === 0}
                aria-label="Send"
              >
                {busy ? <Spinner size={16} /> : <SendIcon cls="icon-sm" />}
              </button>
            </div>
            <p className="ai-disclaimer">
              Pathwise can be wrong — check anything that matters against your material.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
