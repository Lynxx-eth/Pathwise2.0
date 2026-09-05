// Curated educational videos (PATHWISE 2.0 Phase 14). Editorial picks
// matched to what the learner is studying — every card says WHY it's shown.
// Links open on the source site with full attribution; likes/saves feed the
// personalized feed of the next phase.
import { useState } from "react";
import AppShell from "../components/AppShell";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useAuth } from "../lib/auth";
import { SparklesIcon } from "../components/icons";
import { EmptyState, ErrorState, SkeletonRows } from "../components/states";

interface VideoRow {
  id: string;
  title: string;
  creator: string;
  url: string;
  thumbnailUrl: string | null;
  subject: string;
  topics: string[];
  difficulty: number | null;
  durationSec: number | null;
  reason: string | null;
  likedByMe: boolean;
  savedByMe: boolean;
}

function minutes(sec: number | null): string | null {
  if (!sec) return null;
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

export default function Videos() {
  const { user } = useAuth();
  const [subject, setSubject] = useState<string | null>(null);
  const { data, loading, error, reload, setData } = useApi<{
    videos: VideoRow[];
    subjects: string[];
  }>(subject ? `/api/videos?subject=${encodeURIComponent(subject)}` : "/api/videos", [subject]);

  async function engage(v: VideoRow, kind: "like" | "save") {
    try {
      const res = await api.post<{ kind: string; active: boolean }>(
        `/api/videos/${v.id}/engage`,
        { kind }
      );
      if (data) {
        setData({
          ...data,
          videos: data.videos.map((row) =>
            row.id === v.id
              ? {
                  ...row,
                  likedByMe: kind === "like" ? res.active : row.likedByMe,
                  savedByMe: kind === "save" ? res.active : row.savedByMe,
                }
              : row
          ),
        });
      }
    } catch {
      // Guests get a 403 — the buttons are hidden for them anyway.
    }
  }

  function watched(v: VideoRow) {
    // Fire-and-forget view signal; the link itself opens via the anchor.
    if (!user?.isGuest) {
      void api.post(`/api/videos/${v.id}/engage`, { kind: "view" }).catch(() => {});
    }
  }

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1 className="page-title">Videos</h1>
          <p className="page-sub">
            Hand-picked explanations matched to your courses. Links open at
            the source — full credit to the creators.
          </p>
        </div>
      </div>

      {(data?.subjects.length ?? 0) > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <button
            className={subject === null ? "pill pill-coral" : "pill pill-muted"}
            style={{ cursor: "pointer", border: "none" }}
            onClick={() => setSubject(null)}
          >
            For you
          </button>
          {data!.subjects.map((s) => (
            <button
              key={s}
              className={subject === s ? "pill pill-coral" : "pill pill-muted"}
              style={{ cursor: "pointer", border: "none" }}
              onClick={() => setSubject(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={4} height={96} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (data?.videos.length ?? 0) === 0 ? (
        <EmptyState
          icon={<SparklesIcon cls="icon-lg" />}
          title="Nothing here yet"
          body="The catalog is curated by hand and growing — check another subject."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data!.videos.map((v) => (
            <div key={v.id} className="card" style={{ padding: 14, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <a
                href={v.url}
                target="_blank"
                rel="noreferrer noopener"
                onClick={() => watched(v)}
                style={{ flexShrink: 0 }}
                aria-label={`Watch ${v.title} on the source site`}
              >
                {v.thumbnailUrl ? (
                  <img
                    src={v.thumbnailUrl}
                    alt=""
                    style={{ width: 168, height: 94, objectFit: "cover", borderRadius: 10 }}
                    loading="lazy"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    style={{
                      width: 168,
                      height: 94,
                      borderRadius: 10,
                      background: "linear-gradient(135deg, var(--accent-light, #dce7e2), var(--surface))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12.5,
                      color: "var(--ink-soft)",
                      fontWeight: 650,
                    }}
                  >
                    {v.subject}
                  </div>
                )}
              </a>
              <div style={{ flex: 1, minWidth: 220 }}>
                <a
                  href={v.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={() => watched(v)}
                  style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink)" }}
                >
                  {v.title}
                </a>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 3 }}>
                  {[v.creator, v.subject, minutes(v.durationSec)].filter(Boolean).join(" · ")}
                </div>
                {v.reason && (
                  <span className="pill pill-coral" style={{ fontSize: 10.5, marginTop: 8, display: "inline-block" }}>
                    {v.reason}
                  </span>
                )}
                {!user?.isGuest && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      className={v.likedByMe ? "pill pill-coral" : "pill pill-muted"}
                      style={{ cursor: "pointer", border: "none", fontSize: 11.5 }}
                      onClick={() => engage(v, "like")}
                      aria-pressed={v.likedByMe}
                    >
                      👍 {v.likedByMe ? "Liked" : "Like"}
                    </button>
                    <button
                      className={v.savedByMe ? "pill pill-coral" : "pill pill-muted"}
                      style={{ cursor: "pointer", border: "none", fontSize: 11.5 }}
                      onClick={() => engage(v, "save")}
                      aria-pressed={v.savedByMe}
                    >
                      🔖 {v.savedByMe ? "Saved" : "Save"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
