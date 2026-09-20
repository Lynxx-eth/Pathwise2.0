// Direct messages — Telegram/WhatsApp-style layout (UX update):
// desktop = two fixed panes (conversation list left, live chat right,
// composer pinned to the bottom); mobile = full-screen list, and opening a
// chat takes over the whole screen with its own header + back button.
// Near-real-time via a 3s silent poll + optimistic sends; swipe a bubble
// left to quote-reply; "@pathwise" summons the AI companion.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import AppShell from "../components/AppShell";
import { api, ApiError } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useAuth } from "../lib/auth";
import { Avatar } from "../components/Avatar";
import { Prose } from "../components/Prose";
import {
  ArrowLeftIcon,
  MailIcon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
} from "../components/icons";
import { UserActions } from "../components/UserActions";
import {
  EmptyState,
  ErrorState,
  InlineError,
  InlineNotice,
  Loading,
  SkeletonRows,
  Spinner,
} from "../components/states";

interface ConversationRow {
  id: string;
  with: string;
  withId: string;
  withAvatarUrl: string | null;
  withAvatarFrame: string;
  status: string;
  incomingRequest: boolean;
  muted: boolean;
  unread: number;
  lastMessage: string | null;
  lastMessageAt: string;
}

interface ThreadMessage {
  id: string;
  mine: boolean;
  fromAi: boolean;
  body: string;
  replyTo: { id: string; body: string; mine: boolean; fromAi: boolean } | null;
  createdAt: string;
}

interface ThreadResponse {
  conversation: {
    id: string;
    with: string;
    withId: string;
    withAvatarUrl: string | null;
    withAvatarFrame: string;
    status: string;
    incomingRequest: boolean;
    muted: boolean;
    messages: ThreadMessage[];
  };
}

interface FoundUser {
  userId: string;
  name: string;
  avatarUrl: string | null;
  avatarFrame: string;
}

function timeShort(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** One chat bubble. Drag it left to quote-reply. */
function Bubble({
  m,
  withName,
  onReply,
  onReport,
}: {
  m: ThreadMessage;
  withName: string;
  onReply: (m: ThreadMessage) => void;
  onReport: (id: string) => void;
}) {
  const side = m.mine ? "mine" : m.fromAi ? "ai" : "theirs";
  return (
    <motion.div
      className={`dm-row ${side} bubble-in`}
      drag="x"
      dragConstraints={{ left: -56, right: 0 }}
      dragElastic={0.12}
      dragSnapToOrigin
      onDragEnd={(_, info) => {
        if (info.offset.x < -40) onReply(m);
      }}
    >
      <div className="dm-bubble">
        {m.fromAi && (
          <div className="dm-ai-tag">
            <SparklesIcon cls="icon-sm" /> Pathwise
          </div>
        )}
        {m.replyTo && (
          <div className="dm-quote">
            <strong>{m.replyTo.mine ? "You" : m.replyTo.fromAi ? "Pathwise" : withName}</strong>
            <br />
            {m.replyTo.body}
          </div>
        )}
        {m.fromAi ? <Prose text={m.body} compact /> : m.body}
        {!m.mine && !m.fromAi && (
          <button
            className="dm-report"
            onClick={() => onReport(m.id)}
            title="Report this message"
          >
            Report
          </button>
        )}
      </div>
      <span className="dm-meta">{timeShort(m.createdAt)}</span>
    </motion.div>
  );
}

/** The open chat: header + scrolling body + pinned composer (fills the pane). */
function Thread({
  id,
  onChanged,
}: {
  id: string;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data, loading, error: loadError, reload, refresh, setData } =
    useApi<ThreadResponse>(`/api/dms/${id}`);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const messageCount = data?.conversation.messages.length ?? 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messageCount, loading]);

  async function send() {
    const body = draft.trim();
    if (body.length === 0 || busy || !data) return;
    setBusy(true);
    setError(null);
    const quoted = replyTo;
    const optimistic: ThreadMessage = {
      id: `tmp-${Date.now()}`,
      mine: true,
      fromAi: false,
      body,
      replyTo: quoted
        ? {
            id: quoted.id,
            body: quoted.body.slice(0, 140),
            mine: quoted.mine,
            fromAi: quoted.fromAi,
          }
        : null,
      createdAt: new Date().toISOString(),
    };
    setData({
      conversation: {
        ...data.conversation,
        messages: [...data.conversation.messages, optimistic],
      },
    });
    setDraft("");
    setReplyTo(null);
    try {
      await api.post(`/api/dms/${id}/messages`, { body, replyToId: quoted?.id });
      await refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Send failed");
      setDraft(body);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function respond(action: "accept" | "decline") {
    setBusy(true);
    try {
      await api.post(`/api/dms/${id}/respond`, { action });
      if (action === "decline") {
        navigate("/messages");
      } else {
        reload();
      }
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMute() {
    if (!data) return;
    try {
      await api.post(`/api/dms/${id}/mute`, { on: !data.conversation.muted });
      reload();
    } catch {
      // Non-critical.
    }
  }

  async function report(messageId: string) {
    try {
      await api.post(`/api/dms/messages/${messageId}/report`, { reason: "other" });
      setError(null);
      setNotice("Reported — a human will review it.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Report failed");
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 20, flex: 1 }}>
        <SkeletonRows rows={5} height={44} />
      </div>
    );
  }
  if (loadError || !data) {
    return (
      <div style={{ padding: 20, flex: 1 }}>
        <ErrorState message={loadError ?? "Conversation not found"} onRetry={reload} />
      </div>
    );
  }
  const c = data.conversation;

  return (
    <>
      {/* Chat header — like Telegram: back (mobile), identity, actions. */}
      <div className="chat-header">
        <button
          className="icon-btn chat-back"
          onClick={() => navigate("/messages")}
          aria-label="Back to conversations"
        >
          <ArrowLeftIcon cls="icon" />
        </button>
        <Avatar name={c.with} url={c.withAvatarUrl} frame={c.withAvatarFrame} size={38} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.with}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
            {c.muted ? "Muted" : c.status === "pending" ? "Message request" : "Study buddy chat"}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={toggleMute}>
          {c.muted ? "Unmute" : "Mute"}
        </button>
        <UserActions
          userId={c.withId}
          name={c.with}
          onNotice={(m) => {
            setError(null);
            setNotice(m);
          }}
          onError={setError}
          onBlocked={() => {
            onChanged();
            navigate("/messages");
          }}
        />
      </div>

      {/* Scrolling message area on the chat wallpaper. */}
      <div className="chat-body" ref={scrollRef}>
        {c.incomingRequest && (
          <div className="form-notice" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span>Message request — reply only if you want to.</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => respond("accept")}>
                Accept
              </button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => respond("decline")}>
                Decline
              </button>
            </span>
          </div>
        )}
        {c.messages.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--ink-faint)", textAlign: "center", padding: "26px 0" }}>
            Say hi — or mention <strong>@pathwise</strong> to bring the AI study
            companion into the chat.
          </p>
        )}
        {c.messages.map((m) => (
          <Bubble key={m.id} m={m} withName={c.with} onReply={setReplyTo} onReport={report} />
        ))}
      </div>

      {/* Pinned composer. */}
      <div className="chat-composer-wrap">
        <InlineError message={error} />
        <InlineNotice message={notice} />
        {replyTo && (
          <div className="reply-bar" style={{ marginBottom: 8 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Replying to <strong>{replyTo.mine ? "yourself" : replyTo.fromAi ? "Pathwise" : c.with}</strong>: {replyTo.body}
            </span>
            <button
              className="icon-btn"
              style={{ width: 28, height: 28 }}
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
            >
              ✕
            </button>
          </div>
        )}
        {(c.status === "active" || !c.incomingRequest) && (
          <div className="chat-composer">
            <label className="sr-only" htmlFor="dm-draft">Message</label>
            <textarea
              id="dm-draft"
              className="input"
              rows={1}
              placeholder="Message… (@pathwise asks the AI)"
              value={draft}
              maxLength={3000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              className="btn btn-primary chat-send"
              onClick={send}
              disabled={busy || draft.trim().length === 0}
              aria-label="Send"
            >
              {busy ? <Spinner /> : <SendIcon cls="icon" />}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** "New message" — search learners by username and start a request. */
function NewChat({ onStarted }: { onStarted: (conversationId: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<FoundUser | null>(null);
  const [firstMessage, setFirstMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      api
        .get<{ users: FoundUser[] }>(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then((res) => setResults(res.users))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function start() {
    if (!target || firstMessage.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ conversation: { id: string } }>("/api/dms", {
        toId: target.userId,
        body: firstMessage.trim(),
      });
      onStarted(res.conversation.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the chat.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
      <div className="field" style={{ marginBottom: 8 }}>
        <label htmlFor="user-search" className="sr-only">Find someone by username</label>
        <input
          id="user-search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setTarget(null);
          }}
          placeholder="Search a username…"
          autoComplete="off"
        />
      </div>
      <InlineError message={error} />
      {searching && <Loading label="Searching…" />}
      {!target &&
        results.map((u) => (
          <button key={u.userId} className="member-row" onClick={() => setTarget(u)}>
            <Avatar name={u.name} url={u.avatarUrl} frame={u.avatarFrame} size={32} />
            <span style={{ fontWeight: 650, fontSize: 13.5 }}>{u.name}</span>
            <span className="pill pill-muted" style={{ marginLeft: "auto" }}>Message</span>
          </button>
        ))}
      {!target && !searching && query.trim().length >= 2 && results.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: 0 }}>
          No one matches that — usernames are set on the profile page.
        </p>
      )}
      {target && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar name={target.name} url={target.avatarUrl} frame={target.avatarFrame} size={32} />
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{target.name}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Say hi — this arrives as a message request"
              value={firstMessage}
              maxLength={3000}
              onChange={(e) => setFirstMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void start();
              }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={start}
              disabled={busy || firstMessage.trim().length === 0}
            >
              {busy ? <Spinner /> : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Messages() {
  const { user } = useAuth();
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const { data, loading, error, reload, refresh } = useApi<{ conversations: ConversationRow[] }>(
    user?.isGuest ? null : "/api/dms"
  );

  useEffect(() => {
    if (user?.isGuest) return;
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [refresh, user?.isGuest]);

  if (user?.isGuest) {
    return (
      <AppShell>
        <h1 className="page-title">Messages</h1>
        <EmptyState
          icon={<MailIcon cls="icon-lg" />}
          title="Messages need an account"
          body="Private conversations stay with your identity — create a free account to message other learners."
          action={
            <Link to="/signup" className="btn btn-primary">
              Create my account
            </Link>
          }
        />
      </AppShell>
    );
  }

  const rows = data?.conversations ?? [];

  return (
    <AppShell>
      <div className={`chat-shell ${conversationId ? "thread-open" : ""}`}>
        {/* Left pane: conversation list (Telegram-style rows). */}
        <aside className="chat-list">
          <div className="chat-list-head">
            <span style={{ fontWeight: 800, fontSize: 16.5 }}>Messages</span>
            <button
              className="icon-btn"
              onClick={() => setShowNew((s) => !s)}
              aria-label="New message"
              aria-expanded={showNew}
              title="New message"
            >
              <PlusIcon cls="icon" />
            </button>
          </div>

          {showNew && (
            <NewChat
              onStarted={(id) => {
                setShowNew(false);
                reload();
                navigate(`/messages/${id}`);
              }}
            />
          )}

          <div className="chat-rows">
            {loading ? (
              <div style={{ padding: 14 }}>
                <SkeletonRows rows={6} height={60} />
              </div>
            ) : error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<MailIcon cls="icon-lg" />}
                title="No conversations yet"
                body="Find a study buddy, or search someone by username with +."
                action={
                  <Link to="/buddies" className="btn btn-primary btn-sm">
                    Find study buddies
                  </Link>
                }
              />
            ) : (
              rows.map((c) => (
                <button
                  key={c.id}
                  className={`chat-row ${c.id === conversationId ? "active" : ""}`}
                  onClick={() => navigate(`/messages/${c.id}`)}
                >
                  <Avatar name={c.with} url={c.withAvatarUrl} frame={c.withAvatarFrame} size={46} />
                  <span className="chat-row-main">
                    <span className="chat-row-top">
                      <span className="chat-row-name">
                        {c.with}
                        {c.muted ? " 🔕" : ""}
                      </span>
                      <span className="chat-row-time">{timeShort(c.lastMessageAt)}</span>
                    </span>
                    <span className="chat-row-bottom">
                      <span className="chat-row-snippet">
                        {c.incomingRequest
                          ? "Message request"
                          : c.lastMessage ?? "Say hi — start the conversation"}
                      </span>
                      {c.unread > 0 && (
                        <span className="chat-row-unread">{c.unread > 9 ? "9+" : c.unread}</span>
                      )}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Right pane: the open chat, or a friendly empty state. */}
        <section className="chat-pane">
          {conversationId ? (
            <Thread id={conversationId} onChanged={reload} />
          ) : (
            <div className="chat-empty">
              <MailIcon cls="icon-lg" />
              <p>Select a conversation, or start one with +</p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
