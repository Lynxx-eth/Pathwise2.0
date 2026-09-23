// Voice narration (Claude-style "read aloud") via the browser's built-in
// speech engine — no API keys, works offline, on iOS/Android/desktop.
//
// Two things make this robust in the real world:
//   1. Markdown is stripped first, so the voice never says "asterisk".
//   2. Text is CHUNKED into sentences and queued — Chrome silently stops
//      long single utterances (~15s); a queue of short ones never hits it.
import { useEffect, useRef, useState } from "react";
import { PauseIcon, StopIcon, VolumeIcon } from "./icons";

function speakable(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/^[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sentence-ish chunks under ~220 chars each. */
function chunk(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]?|\s*[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > 220 && current) {
      out.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  return (
    // The "Natural"/"Neural"/"Online" voices sound dramatically better where
    // the OS provides them (Edge, Windows 11, newer Android).
    voices.find((v) => /^en/i.test(v.lang) && /natural|neural|online/i.test(v.name)) ??
    voices.find((v) => /^en/i.test(v.lang) && v.default) ??
    voices.find((v) => /^en/i.test(v.lang)) ??
    voices[0] ??
    null
  );
}

type SpeechState = "idle" | "speaking" | "paused";

/**
 * Play/pause/stop narration of `text`. `iconOnly` renders a compact
 * icon-button (chat bubbles); the default is a labeled pill (page headers).
 */
export function SpeakButton({
  text,
  label = "Listen",
  iconOnly = false,
  className,
}: {
  text: string;
  label?: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<SpeechState>("idle");
  const queueRef = useRef<string[]>([]);
  const activeRef = useRef(false);

  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // Leaving the page must never leave a ghost voice talking.
  useEffect(() => {
    return () => {
      if (supported) {
        activeRef.current = false;
        window.speechSynthesis.cancel();
      }
    };
  }, [supported]);

  if (!supported) return null;

  function speakNext() {
    if (!activeRef.current) return;
    const next = queueRef.current.shift();
    if (!next) {
      activeRef.current = false;
      setState("idle");
      return;
    }
    const u = new SpeechSynthesisUtterance(next);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = 1;
    u.pitch = 1;
    u.onend = speakNext;
    u.onerror = () => {
      activeRef.current = false;
      setState("idle");
    };
    window.speechSynthesis.speak(u);
  }

  function start() {
    window.speechSynthesis.cancel();
    queueRef.current = chunk(speakable(text));
    activeRef.current = true;
    setState("speaking");
    // Some browsers load voices lazily; a tick lets getVoices() populate.
    window.setTimeout(speakNext, 60);
  }

  function toggle() {
    if (state === "idle") {
      start();
    } else if (state === "speaking") {
      window.speechSynthesis.pause();
      setState("paused");
    } else {
      window.speechSynthesis.resume();
      setState("speaking");
    }
  }

  function stop() {
    activeRef.current = false;
    queueRef.current = [];
    window.speechSynthesis.cancel();
    setState("idle");
  }

  const StateIcon = state === "speaking" ? PauseIcon : VolumeIcon;
  const stateLabel =
    state === "idle" ? label : state === "speaking" ? "Pause" : "Resume";

  if (iconOnly) {
    return (
      <span style={{ display: "inline-flex", gap: 2, verticalAlign: "middle" }}>
        <button
          className={`icon-btn ${state !== "idle" ? "open" : ""} ${className ?? ""}`}
          style={{ width: 30, height: 30 }}
          onClick={toggle}
          aria-label={stateLabel === label ? `${label} — read this aloud` : stateLabel}
          title={stateLabel}
        >
          <StateIcon cls="icon-sm" />
        </button>
        {state !== "idle" && (
          <button
            className="icon-btn"
            style={{ width: 30, height: 30 }}
            onClick={stop}
            aria-label="Stop reading"
            title="Stop"
          >
            <StopIcon cls="icon-sm" />
          </button>
        )}
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button
        className={`btn btn-ghost btn-sm ${state === "speaking" ? "speaking" : ""} ${className ?? ""}`}
        onClick={toggle}
        aria-pressed={state !== "idle"}
      >
        <StateIcon cls="icon-sm" /> {stateLabel}
      </button>
      {state !== "idle" && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={stop}
          aria-label="Stop reading"
        >
          <StopIcon cls="icon-sm" /> Stop
        </button>
      )}
    </span>
  );
}
