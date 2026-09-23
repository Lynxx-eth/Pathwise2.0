// Videos (PATHWISE 2.0 Phases 14-15, rebuilt as a TikTok-style feed in the
// UX overhaul Phase 6): full-screen vertical slides, swipe/scroll to move,
// overlay actions. "For you" keeps the FYP ranking (mastery gaps, course
// topics, taste); categories filter the curated catalog; the search sheet
// covers AI-refined YouTube search. Full credit + source links always.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import { api, ApiError } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useAuth } from "../lib/auth";
import {
  BookmarkIcon,
  ExternalIcon,
  HeartIcon,
  PlayIcon,
  PuzzleIcon,
  SearchIcon,
  SparklesIcon,
} from "../components/icons";
import { InlineError, Spinner } from "../components/states";

interface YouTubeRow {
  videoId: string;
  title: string;
  channel: string;
  thumbnailUrl: string | null;
  url: string;
}

interface VideoRow {
  id: string;
  title: string;
  creator: string;
  url: string;
  thumbnailUrl: string | null;
  subject: string;
  topics: string[];
  difficulty?: number | null;
  durationSec: number | null;
  reason: string | null;
  likedByMe: boolean;
  savedByMe: boolean;
  likeCount: number;
  saveCount: number;
  action?: { topicId: string; courseId: string; topicName: string } | null;
}

/** 1.2k-style compact tallies under the action icons. */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function embedUrlOf(url: string): string | null {
  let e = url;
  if (e.includes("youtube.com/watch?v=")) {
    e = e.replace("youtube.com/watch?v=", "youtube.com/embed/");
    if (e.includes("&")) e = e.split("&")[0];
  } else if (e.includes("youtu.be/")) {
    e = e.replace("youtu.be/", "youtube.com/embed/");
    if (e.includes("?")) e = e.split("?")[0];
  } else {
    return null;
  }
  return `${e}?autoplay=1&rel=0&playsinline=1`;
}

/** One full-height slide. Only the active slide mounts its player; tapping
 *  an inactive slide's thumbnail activates it (plays IN the app). */
function Slide({
  v,
  active,
  isGuest,
  onEngage,
  onQuiz,
  onActivate,
}: {
  v: VideoRow;
  active: boolean;
  isGuest: boolean;
  onEngage: (v: VideoRow, kind: "like" | "save") => void;
  onQuiz: (v: VideoRow) => void;
  onActivate: () => void;
}) {
  const embed = embedUrlOf(v.url);
  return (
    <section className="feed-slide">
      <div className="feed-media">
        {active && embed ? (
          <iframe
            src={embed}
            title={v.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            style={{ border: 0, width: "100%", height: "100%" }}
          />
        ) : (
          <button
            className="feed-thumb-btn"
            onClick={onActivate}
            aria-label={`Play ${v.title}`}
          >
            {v.thumbnailUrl ? (
              <img src={v.thumbnailUrl} alt="" className="feed-thumb" />
            ) : (
              <div className="feed-thumb feed-thumb-empty">{v.subject}</div>
            )}
            <span className="feed-play" aria-hidden="true">
              <PlayIcon cls="icon-lg" />
            </span>
          </button>
        )}
      </div>

      {/* Right action rail — system vectors, not emojis. */}
      <div className="feed-actions">
        {!isGuest && (
          <>
            <button
              className={`feed-action ${v.likedByMe ? "on" : ""}`}
              onClick={() => onEngage(v, "like")}
              aria-pressed={v.likedByMe}
              aria-label={`${v.likedByMe ? "Unlike" : "Like"} — ${v.likeCount} likes`}
            >
              <HeartIcon cls="icon" filled={v.likedByMe} />
              <small>{compact(v.likeCount)}</small>
            </button>
            <button
              className={`feed-action ${v.savedByMe ? "on" : ""}`}
              onClick={() => onEngage(v, "save")}
              aria-pressed={v.savedByMe}
              aria-label={`${v.savedByMe ? "Unsave" : "Save"} — ${v.saveCount} saves`}
            >
              <BookmarkIcon cls="icon" filled={v.savedByMe} />
              <small>{compact(v.saveCount)}</small>
            </button>
          </>
        )}
        {v.action && (
          <button
            className="feed-action"
            onClick={() => onQuiz(v)}
            aria-label={`Quiz yourself on ${v.action.topicName}`}
            title={`Quiz yourself on ${v.action.topicName}`}
          >
            <PuzzleIcon cls="icon" />
            <small>Quiz</small>
          </button>
        )}
        <a
          className="feed-action"
          href={v.url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Watch at the source"
          title="Watch on YouTube"
        >
          <ExternalIcon cls="icon" />
          <small>Source</small>
        </a>
      </div>

      {/* Bottom-left info overlay. */}
      <div className="feed-info">
        <div className="feed-title">{v.title}</div>
        <div className="feed-meta">
          {v.creator} · {v.subject}
        </div>
        {v.reason && <span className="pill pill-coral feed-reason">{v.reason}</span>}
      </div>
    </section>
  );
}

export default function Videos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [subject, setSubject] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // In-app player for SEARCH results — external only via the Source link.
  const [player, setPlayer] = useState<YouTubeRow | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function activateSlide(index: number) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: index * el.clientHeight, behavior: "smooth" });
    setActiveIndex(index);
  }

  const shelf = useApi<{ videos: VideoRow[]; subjects: string[] }>(
    subject ? `/api/videos?subject=${encodeURIComponent(subject)}` : "/api/videos",
    [subject]
  );
  const fyp = useApi<{ feed: VideoRow[] }>("/api/fyp");

  const [searchDraft, setSearchDraft] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    query: string;
    refinedQuery: string;
    results: YouTubeRow[];
    youtubeConfigured: boolean;
  } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const showingFeed = subject === null;
  const { loading, error, reload } = showingFeed ? fyp : shelf;
  const rows = showingFeed ? fyp.data?.feed ?? [] : shelf.data?.videos ?? [];

  // Track which slide fills the viewport; report a view when it changes.
  useEffect(() => {
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [subject]);

  useEffect(() => {
    const v = rows[activeIndex];
    if (v && !user?.isGuest) {
      void api.post(`/api/videos/${v.id}/engage`, { kind: "view" }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, rows[activeIndex]?.id]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el || el.clientHeight === 0) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    if (idx !== activeIndex) setActiveIndex(idx);
  }

  async function engage(v: VideoRow, kind: "like" | "save") {
    try {
      const res = await api.post<{ kind: string; active: boolean; count: number }>(
        `/api/videos/${v.id}/engage`,
        { kind }
      );
      const patch = (row: VideoRow) =>
        row.id === v.id
          ? {
              ...row,
              likedByMe: kind === "like" ? res.active : row.likedByMe,
              savedByMe: kind === "save" ? res.active : row.savedByMe,
              likeCount: kind === "like" ? res.count : row.likeCount,
              saveCount: kind === "save" ? res.count : row.saveCount,
            }
          : row;
      if (shelf.data) {
        shelf.setData({ ...shelf.data, videos: shelf.data.videos.map(patch) });
      }
      if (fyp.data) {
        fyp.setData({ feed: fyp.data.feed.map(patch) });
      }
    } catch {
      // Guests get a 403 — the buttons are hidden for them anyway.
    }
  }

  async function quizFrom(v: VideoRow) {
    if (!v.action) return;
    setActionError(null);
    try {
      const res = await api.post<{ sessionId: string }>("/api/quiz/sessions", {
        courseId: v.action.courseId,
        kind: "practice",
        topicId: v.action.topicId,
      });
      navigate(`/quiz/${res.sessionId}`);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Couldn't start a quiz."
      );
    }
  }

  async function runSearch(e: FormEvent) {
    e.preventDefault();
    const q = searchDraft.trim();
    if (q.length < 2 || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await api.get<{
        query: string;
        refinedQuery: string;
        results: YouTubeRow[];
        youtubeConfigured: boolean;
      }>(`/api/videos/search?q=${encodeURIComponent(q)}`);
      setSearchResult(res);
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  const subjects = shelf.data?.subjects ?? [];

  return (
    <AppShell>
      <div className="feed-shell">
        {/* Top overlay: category label + search trigger. */}
        <div className="feed-top">
          <span className="feed-top-label">
            {subject ?? "For you"}
          </span>
          <button
            className="icon-btn feed-top-btn"
            onClick={() => setSheetOpen(true)}
            aria-label="Search and categories"
            title="Search and categories"
          >
            <SearchIcon cls="icon" />
          </button>
        </div>

        {loading ? (
          <div className="feed-center">
            <Spinner size={22} /> Loading your feed…
          </div>
        ) : error ? (
          <div className="feed-center">
            <p>{error}</p>
            <button className="btn btn-ghost btn-sm" onClick={reload}>
              Try again
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="feed-center">
            <SparklesIcon cls="icon-lg" />
            <p>
              {subject
                ? "Nothing in this category yet — try another."
                : "Your feed fills in as the catalog grows and you study more."}
            </p>
          </div>
        ) : (
          <div className="feed-scroll" ref={scrollRef} onScroll={onScroll}>
            {rows.map((v, i) => (
              <Slide
                key={v.id}
                v={v}
                active={i === activeIndex}
                isGuest={Boolean(user?.isGuest)}
                onEngage={engage}
                onQuiz={quizFrom}
                onActivate={() => activateSlide(i)}
              />
            ))}
          </div>
        )}

        {actionError && (
          <div className="feed-error">
            <InlineError message={actionError} />
          </div>
        )}

        {/* In-app player for search results — full screen, plays here; the
            only way out to YouTube is the explicit Source button. */}
        {player && (
          <div className="video-modal" role="dialog" aria-label={player.title}>
            <div className="video-modal-head">
              <span style={{ fontWeight: 700, fontSize: 14.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {player.title}
              </span>
              <button
                className="icon-btn"
                onClick={() => setPlayer(null)}
                aria-label="Close player"
              >
                ✕
              </button>
            </div>
            {embedUrlOf(player.url) ? (
              <div className="video-modal-frame">
                <iframe
                  src={embedUrlOf(player.url)!}
                  title={player.title}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  style={{ border: 0, width: "100%", height: "100%", display: "block" }}
                />
              </div>
            ) : (
              <div className="feed-center">
                <p>This one can't be embedded — open it at the source below.</p>
              </div>
            )}
            <div className="video-modal-foot">
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.8)" }}>
                {player.channel} · YouTube
              </span>
              <a
                className="btn btn-ghost btn-sm"
                href={player.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ExternalIcon cls="icon-sm" /> Source
              </a>
            </div>
          </div>
        )}

        {/* Search + categories sheet. */}
        {sheetOpen && (
          <>
            <div className="feed-sheet-backdrop" onClick={() => setSheetOpen(false)} />
            <div className="feed-sheet" role="dialog" aria-label="Search and categories">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h2 style={{ fontSize: 15.5 }}>Find something to watch</h2>
                <button
                  className="icon-btn"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={runSearch} role="search" className="toolbar" style={{ marginBottom: 12 }}>
                <label className="sr-only" htmlFor="video-search">Search for videos</label>
                <input
                  id="video-search"
                  className="input"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="e.g. thermodynamics past paper walkthrough"
                  maxLength={200}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={searching || searchDraft.trim().length < 2}
                >
                  {searching ? <Spinner /> : "Search"}
                </button>
              </form>
              <InlineError message={searchError} />

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                <button
                  className={subject === null ? "pill pill-coral" : "pill pill-muted"}
                  style={{ cursor: "pointer", border: "none" }}
                  onClick={() => {
                    setSubject(null);
                    setSheetOpen(false);
                    setSearchResult(null);
                  }}
                >
                  For you
                </button>
                {subjects.map((s) => (
                  <button
                    key={s}
                    className={subject === s ? "pill pill-coral" : "pill pill-muted"}
                    style={{ cursor: "pointer", border: "none" }}
                    onClick={() => {
                      setSubject(s);
                      setSheetOpen(false);
                      setSearchResult(null);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {searchResult && (
                <>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>
                    Results for “{searchResult.query}”
                    {searchResult.refinedQuery !== searchResult.query
                      ? ` · searched as “${searchResult.refinedQuery}”`
                      : ""}
                  </div>
                  {!searchResult.youtubeConfigured ? (
                    <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                      Video search needs the server's YouTube key — the feed
                      and categories still work.
                    </p>
                  ) : searchResult.results.length === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                      Nothing found — try naming the subject and topic.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* Tapping PLAYS IN THE APP — YouTube only via Source. */}
                      {searchResult.results.map((v) => (
                        <button
                          key={v.videoId}
                          className="member-row"
                          onClick={() => {
                            setPlayer(v);
                            setSheetOpen(false);
                          }}
                        >
                          {v.thumbnailUrl ? (
                            <img src={v.thumbnailUrl} alt="" style={{ width: 92, borderRadius: 8, flexShrink: 0 }} />
                          ) : null}
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ display: "block", fontWeight: 650, fontSize: 13, lineHeight: 1.35 }}>
                              {v.title}
                            </span>
                            <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                              {v.channel} · YouTube
                            </span>
                          </span>
                          <PlayIcon cls="icon-sm" style={{ color: "var(--primary)", flexShrink: 0 }} />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
