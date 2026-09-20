// The learning layer (Ask PATHWISE phase): a lecturer-grade breakdown of
// one topic, generated from the course's own material, with an in-page
// tutor that MAY explain directly — this is the teaching surface. The flow:
// read the breakdown → ask what's unclear → quiz yourself with confidence.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import { api, ApiError } from "../lib/api";
import { useApi } from "../lib/useApi";
import { PuzzleIcon, SendIcon, SparklesIcon } from "../components/icons";
import { Prose } from "../components/Prose";
import { ErrorState, InlineError, Loading } from "../components/states";

interface BreakdownSection {
  heading: string;
  body: string;
  example?: string;
}

interface BreakdownResponse {
  breakdown: {
    overview: string;
    sections: BreakdownSection[];
    misconceptions: { myth: string; truth: string }[];
    summary: string;
  };
  cached: boolean;
  topicName: string;
  courseId: string;
  courseName: string;
}

interface AskMessage {
  role: "user" | "assistant";
  content: string;
}

function AskPanel({ topicId, topicName }: { topicId: string; topicName: string }) {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const content = draft.trim();
    if (content.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    try {
      const res = await api.post<{ reply: string }>(`/api/topics/${topicId}/ask`, {
        // Only the recent window travels — long chats get expensive.
        messages: next.slice(-10),
      });
      setMessages([...next, { role: "assistant", content: res.reply }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't get an answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <SparklesIcon cls="icon" style={{ color: "var(--accent)" }} />
        <div style={{ fontWeight: 700, fontSize: 14 }}>Ask PATHWISE</div>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>
        Anything unclear in {topicName}? Ask here — unlike the Socratic tutor,
        I'll explain directly.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "88%",
            }}
          >
            <div
              className="card"
              style={{
                padding: "10px 14px",
                fontSize: 15,
                ...(m.role === "assistant"
                  ? { borderColor: "var(--accent)" }
                  : { background: "var(--accent-light, var(--surface))" }),
              }}
            >
              {m.role === "assistant" ? (
                <Prose text={m.content} compact />
              ) : (
                <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Thinking…</div>
        )}
      </div>

      <InlineError message={error} />

      <div style={{ display: "flex", gap: 8 }}>
        <label className="sr-only" htmlFor="ask-draft">Your question</label>
        <textarea
          id="ask-draft"
          className="input"
          rows={2}
          style={{ flex: 1 }}
          placeholder="e.g. I don't get the part about…"
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          className="btn btn-primary"
          onClick={send}
          disabled={busy || draft.trim().length === 0}
          aria-label="Send question"
        >
          <SendIcon cls="icon" />
        </button>
      </div>
    </div>
  );
}

export default function TopicView() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const [quizError, setQuizError] = useState<string | null>(null);

  const { data, loading, error, reload } = useApi<BreakdownResponse>(
    topicId ? `/api/topics/${topicId}/breakdown` : null
  );

  async function startQuiz() {
    if (!data || !topicId) return;
    setQuizError(null);
    try {
      const res = await api.post<{ sessionId: string }>("/api/quiz/sessions", {
        courseId: data.courseId,
        kind: "practice",
        topicId,
      });
      navigate(`/quiz/${res.sessionId}`);
    } catch (err) {
      setQuizError(err instanceof ApiError ? err.message : "Couldn't start a quiz.");
    }
  }

  if (loading) {
    return (
      <AppShell>
        <Loading label="Preparing your breakdown — the first visit takes a moment while it's written for you…" />
      </AppShell>
    );
  }
  if (error || !data) {
    return (
      <AppShell>
        <ErrorState message={error ?? "Topic not found"} onRetry={reload} />
      </AppShell>
    );
  }

  const { breakdown } = data;

  return (
    <AppShell>
      <div className="reading-col">
        <Link
          to={`/courses/${data.courseId}`}
          style={{ fontSize: 13, color: "var(--ink-soft)" }}
        >
          ← {data.courseName}
        </Link>

        <div className="page-head" style={{ marginTop: 6, flexWrap: "wrap", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="page-title">{data.topicName}</h1>
          </div>
          <button className="btn btn-primary" onClick={startQuiz} style={{ flexShrink: 0 }}>
            <PuzzleIcon cls="icon" /> Quiz me on this
          </button>
        </div>

        <InlineError message={quizError} />

        {/* The breakdown reads like a Claude answer: one flowing article,
            real reading typography, thick bold highlights, callouts. */}
        <article>
          {breakdown.overview && (
            <div className="reading-section">
              <Prose text={breakdown.overview} />
            </div>
          )}

          {breakdown.sections.map((s, i) => (
            <section key={i} className="reading-section">
              <h2>{s.heading}</h2>
              <Prose text={s.body} />
              {s.example && (
                <div className="callout">
                  <span className="callout-label">Worked example</span>
                  <Prose text={s.example} />
                </div>
              )}
            </section>
          ))}

          {breakdown.misconceptions.length > 0 && (
            <section className="reading-section">
              <h2>Watch out for these</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {breakdown.misconceptions.map((m, i) => (
                  <div key={i} style={{ fontSize: 15, lineHeight: 1.65 }}>
                    <div style={{ color: "var(--danger)", fontWeight: 800 }}>
                      ✗ {m.myth}
                    </div>
                    <div style={{ color: "var(--success)", marginTop: 3, fontWeight: 600 }}>
                      ✓ {m.truth}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {breakdown.summary && (
            <section className="reading-section">
              <div className="callout callout-primary" style={{ marginTop: 0 }}>
                <span className="callout-label">Before your exam, remember</span>
                <Prose text={breakdown.summary} />
              </div>
            </section>
          )}
        </article>

        {topicId && <AskPanel topicId={topicId} topicName={data.topicName} />}

        <div style={{ marginTop: 24, textAlign: "center" }}>
          <button className="btn btn-primary" onClick={startQuiz}>
            <PuzzleIcon cls="icon" /> Feeling ready? Quiz yourself
          </button>
        </div>
      </div>
    </AppShell>
  );
}
