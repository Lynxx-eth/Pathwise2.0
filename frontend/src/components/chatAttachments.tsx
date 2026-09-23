// Chat attachments UI — photos, documents and voice notes, styled after
// WhatsApp/Telegram: image bubbles that open full-screen, document rows with
// name + size, and a voice player with a waveform, scrubber, duration and a
// speed toggle (the pattern modern messengers converged on).
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "./Avatar";
import { getToken } from "../lib/api";
import {
  FileIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
} from "./icons";

export interface Attachment {
  kind: "image" | "file" | "voice";
  url: string;
  name: string | null;
  mime: string | null;
  sizeBytes: number | null;
  seconds: number | null;
}

export function prettyBytes(n: number | null): string {
  if (!n) return "";
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function clock(total: number): string {
  const s = Math.max(0, Math.round(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Attachments are private, so their routes need the bearer token — an <img>
 * or <audio> tag can't send one. Fetch as a blob and hand back an object URL.
 */
function useAuthedBlob(url: string | null): string | null {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let revoked: string | null = null;
    let active = true;
    fetch(`${API_BASE}${url}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("failed"))))
      .then((blob) => {
        if (!active) return;
        revoked = URL.createObjectURL(blob);
        setHref(revoked);
      })
      .catch(() => {
        // A missing attachment just renders its fallback.
      });
    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [url]);
  return href;
}

/** Deterministic bar heights — a real waveform needs decoding the clip; this
 *  reads as one and costs nothing. Seeded by the url so it never reshuffles. */
function bars(seed: string, count = 34): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: count }, (_, i) => {
    h = (h * 1664525 + 1013904223) >>> 0;
    const base = 0.25 + ((h >>> 8) % 1000) / 1000 * 0.75;
    // Gentle envelope so it tapers at both ends like a real recording.
    const envelope = Math.sin((Math.PI * (i + 0.5)) / count) * 0.4 + 0.6;
    return Math.max(0.16, base * envelope);
  });
}

/** WhatsApp-style voice note: play/pause, waveform scrubber, timer, speed. */
export function VoiceBubble({ attachment }: { attachment: Attachment }) {
  const src = useAuthedBlob(attachment.url);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [duration, setDuration] = useState(attachment.seconds ?? 0);
  const [rate, setRate] = useState(1);
  const shape = bars(attachment.url);
  const progress = duration > 0 ? Math.min(1, at / duration) : 0;

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.playbackRate = rate;
      void el.play();
    }
  }

  function cycleRate() {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  function seekTo(fraction: number) {
    const el = audioRef.current;
    if (!el || !duration) return;
    el.currentTime = Math.max(0, Math.min(duration, fraction * duration));
    setAt(el.currentTime);
  }

  return (
    <div className="voice-note">
      <button
        className="voice-play"
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        disabled={!src}
      >
        {playing ? <PauseIcon cls="icon-sm" /> : <PlayIcon cls="icon-sm" />}
      </button>

      <div
        className="voice-wave"
        role="slider"
        tabIndex={0}
        aria-label="Seek voice message"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          seekTo((e.clientX - box.left) / box.width);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") seekTo(Math.min(1, progress + 0.05));
          if (e.key === "ArrowLeft") seekTo(Math.max(0, progress - 0.05));
        }}
      >
        {shape.map((height, i) => (
          <span
            key={i}
            className={i / shape.length <= progress ? "on" : ""}
            style={{ height: `${Math.round(height * 100)}%` }}
          />
        ))}
      </div>

      <div className="voice-meta">
        <span className="mono">{clock(playing || at > 0 ? at : duration)}</span>
        <button className="voice-rate" onClick={cycleRate} aria-label="Playback speed">
          {rate}×
        </button>
      </div>

      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setAt(0);
          }}
          onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            // Chrome reports Infinity for MediaRecorder webm until seeked.
            if (Number.isFinite(d) && d > 0) setDuration(d);
          }}
        />
      )}
    </div>
  );
}

/** Photo bubble — tap to open full-screen. */
export function ImageBubble({ attachment }: { attachment: Attachment }) {
  const src = useAuthedBlob(attachment.url);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="image-attach"
        onClick={() => src && setOpen(true)}
        aria-label="Open photo"
      >
        {src ? <img src={src} alt={attachment.name ?? "Photo"} /> : <span className="image-attach-loading" />}
      </button>
      {open && src && (
        <div className="lightbox" onClick={() => setOpen(false)} role="dialog" aria-label="Photo">
          <img src={src} alt={attachment.name ?? "Photo"} />
          <button className="lightbox-close" aria-label="Close photo">✕</button>
        </div>
      )}
    </>
  );
}

/** Document bubble — icon, name, size, tap to download. */
export function FileBubble({ attachment }: { attachment: Attachment }) {
  const src = useAuthedBlob(attachment.url);
  return (
    <a
      className="file-attach"
      href={src ?? undefined}
      download={attachment.name ?? "document"}
      aria-label={`Download ${attachment.name ?? "document"}`}
    >
      <span className="file-attach-icon">
        <FileIcon cls="icon" />
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="file-attach-name">{attachment.name ?? "Document"}</span>
        <span className="file-attach-meta">
          {prettyBytes(attachment.sizeBytes)}
          {src ? " · tap to download" : " · loading…"}
        </span>
      </span>
    </a>
  );
}

export function AttachmentView({ attachment }: { attachment: Attachment }) {
  if (attachment.kind === "image") return <ImageBubble attachment={attachment} />;
  if (attachment.kind === "voice") return <VoiceBubble attachment={attachment} />;
  return <FileBubble attachment={attachment} />;
}

/**
 * Hold-to-record voice notes. Returns the recorder UI when active; the
 * parent supplies the mic button. Uses MediaRecorder with whatever container
 * the browser supports (webm on Chrome/Android, mp4 on iOS Safari).
 */
export function useVoiceRecorder(onDone: (blob: Blob, seconds: number) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedRef = useRef(0);
  const cancelledRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const supported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined";

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    if (!supported || recording) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) window.clearInterval(timerRef.current);
        setRecording(false);
        const seconds = (Date.now() - startedRef.current) / 1000;
        setElapsed(0);
        if (cancelledRef.current) return;
        if (seconds < 0.7) return; // an accidental tap isn't a voice note
        onDone(new Blob(chunksRef.current, { type: recorder.mimeType }), seconds);
      };
      recorderRef.current = recorder;
      startedRef.current = Date.now();
      recorder.start();
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const s = (Date.now() - startedRef.current) / 1000;
        setElapsed(s);
        // Hard stop at five minutes so nothing runs away.
        if (s > 300) stop();
      }, 200);
    } catch {
      setError("Microphone permission is needed to record a voice note.");
    }
  }

  function stop() {
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
  }

  function cancel() {
    cancelledRef.current = true;
    stop();
  }

  return { supported, recording, elapsed, error, start, stop, cancel, setError };
}

/** The recording strip that replaces the composer while recording. */
export function RecordingBar({
  elapsed,
  onCancel,
  onSend,
}: {
  elapsed: number;
  onCancel: () => void;
  onSend: () => void;
}) {
  return (
    <div className="recording-bar">
      <button className="icon-btn" onClick={onCancel} aria-label="Cancel recording">
        <TrashIcon cls="icon" />
      </button>
      <span className="rec-dot" aria-hidden="true" />
      <span className="mono rec-time">{clock(elapsed)}</span>
      <span className="rec-hint">Recording… tap ■ to send</span>
      <button className="btn btn-primary chat-send" onClick={onSend} aria-label="Send voice note">
        <StopIcon cls="icon" />
      </button>
    </div>
  );
}

export { MicIcon };
