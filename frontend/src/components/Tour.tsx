// First-run product tour v2 — a FULL-SCREEN animated walkthrough.
//
// Built on the patterns modern onboarding uses (AnimatePresence step
// choreography, gesture-driven swiping, entrance/exit + layout animation):
// each phase gets its own gradient world with drifting glow orbs, a big
// icon that springs in inside a pulsing ring, staggered text reveal, an
// animated progress bar, swipe on mobile + arrow keys on desktop.
// Reduced-motion users get the same tour with transforms disabled (the
// app-wide MotionConfig + CSS kill-switch handle it).
//
// Visibility is self-managed: auth sets "pathwise_show_tour" on signup or
// guest-claim; finishing or skipping stamps "pathwise_tour_done" forever.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BrainIcon,
  MailIcon,
  PlayIcon,
  PuzzleIcon,
  SparklesIcon,
  UploadIcon,
} from "./icons";

const SHOW_KEY = "pathwise_show_tour";
const DONE_KEY = "pathwise_tour_done";
const EASE = [0.16, 1, 0.3, 1] as const;

interface Step {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  /** Two gradient stops that color this step's world. */
  g1: string;
  g2: string;
}

const STEPS: Step[] = [
  {
    icon: <UploadIcon cls="icon-lg" />,
    eyebrow: "Step 1 · Your material",
    title: "Drop your course in",
    body: "A syllabus, slides, even a photo of your notes. Pathwise reads it and builds your knowledge map — every topic, weighted by what your material actually emphasises.",
    g1: "#0E7A55",
    g2: "#083B2C",
  },
  {
    icon: <SparklesIcon cls="icon-lg" />,
    eyebrow: "Step 2 · Learn deeply",
    title: "Every topic, properly taught",
    body: "Tap any topic for a lecturer-grade breakdown — worked examples, common traps, even read aloud to you. Ask Pathwise anything while you read.",
    g1: "#155E8A",
    g2: "#0A2C42",
  },
  {
    icon: <PuzzleIcon cls="icon-lg" />,
    eyebrow: "Step 3 · Prove it",
    title: "Quiz until it sticks",
    body: "Multiple choice, then written answers the AI grades, then flashcards to lock it in. Your mastery map fills in with every round.",
    g1: "#B4551E",
    g2: "#4A2410",
  },
  {
    icon: <BrainIcon cls="icon-lg" />,
    eyebrow: "Step 4 · Think harder",
    title: "The Socratic tutor",
    body: "Stuck? Socratic mode asks the questions that make it click. It never hands you the answer — which is exactly why it stays learned.",
    g1: "#5B4FB0",
    g2: "#241E4A",
  },
  {
    icon: <MailIcon cls="icon-lg" />,
    eyebrow: "Step 5 · Together",
    title: "Study with real people",
    body: "Get matched with study buddies, join subject communities, chat in real time — and mention @pathwise in any conversation to summon the AI.",
    g1: "#0E7A55",
    g2: "#123B5C",
  },
  {
    icon: <PlayIcon cls="icon-lg" />,
    eyebrow: "Step 6 · Watch",
    title: "A feed that teaches",
    body: "Swipe through educational videos picked for your weakest topics — then quiz yourself right from a video. Scrolling, but it counts.",
    g1: "#8A1E5B",
    g2: "#3B0E28",
  },
];

function shouldShow(): boolean {
  try {
    return (
      localStorage.getItem(SHOW_KEY) === "1" &&
      localStorage.getItem(DONE_KEY) !== "1"
    );
  } catch {
    return false;
  }
}

export function Tour() {
  const [open, setOpen] = useState(shouldShow);
  const [[step, dir], setStep] = useState<[number, number]>([0, 0]);

  const last = step === STEPS.length - 1;

  function go(next: number) {
    if (next < 0 || next >= STEPS.length) return;
    setStep([next, next > step ? 1 : -1]);
  }

  function finish() {
    try {
      localStorage.removeItem(SHOW_KEY);
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      // Storage blocked — the tour just won't persist its dismissal.
    }
    setOpen(false);
  }

  // Desktop: arrow keys move, Escape skips.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(step + 1);
      else if (e.key === "ArrowLeft") go(step - 1);
      else if (e.key === "Escape") finish();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  if (!open) return null;

  const s = STEPS[step];

  return (
    <motion.div
      className="tour-screen"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tour"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Each step's gradient world CROSSFADES over the previous one —
          gradients can't be interpolated, so we stack and fade instead. */}
      <AnimatePresence>
        <motion.div
          key={`bg-${step}`}
          className="tour-bg"
          style={{
            background: `radial-gradient(125% 125% at 20% 0%, ${s.g1} 0%, ${s.g2} 55%, #060B09 100%)`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
        />
      </AnimatePresence>

      {/* Drifting glow orbs — each step re-tints them. */}
      <motion.span
        className="tour-orb"
        animate={{ background: s.g1 }}
        transition={{ duration: 0.8 }}
        style={{ top: "-12%", right: "-8%" }}
      />
      <motion.span
        className="tour-orb slow"
        animate={{ background: s.g2 }}
        transition={{ duration: 0.8 }}
        style={{ bottom: "-14%", left: "-10%" }}
      />

      {/* Animated progress bar. */}
      <div className="tour-progress" aria-hidden="true">
        <motion.span
          animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          transition={{ duration: 0.4, ease: EASE }}
        />
      </div>

      <button className="tour-skip" onClick={finish}>
        Skip tour
      </button>

      {/* The step itself — swipeable, direction-aware transitions. */}
      <AnimatePresence mode="wait" custom={dir}>
        <motion.div
          key={step}
          className="tour-stage"
          custom={dir}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={(_, info) => {
            if (info.offset.x < -70) go(step + 1);
            else if (info.offset.x > 70) go(step - 1);
          }}
          initial={{ opacity: 0, x: dir >= 0 ? 90 : -90, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: dir >= 0 ? -90 : 90, scale: 0.96 }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          <motion.div
            className="tour-ring"
            initial={{ scale: 0.4, rotate: -18, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.05 }}
          >
            {s.icon}
          </motion.div>

          <motion.div
            className="tour-eyebrow"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.3, ease: EASE }}
          >
            {s.eyebrow}
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.32, ease: EASE }}
          >
            {s.title}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.32, ease: EASE }}
          >
            {s.body}
          </motion.p>
        </motion.div>
      </AnimatePresence>

      {/* Bottom controls: dots + navigation. */}
      <div className="tour-bottom">
        <div className="tour-dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={i === step ? "on" : ""}
              onClick={() => go(i)}
              tabIndex={-1}
            />
          ))}
        </div>
        <div className="tour-nav">
          {step > 0 ? (
            <button className="tour-btn ghost" onClick={() => go(step - 1)}>
              Back
            </button>
          ) : (
            <span />
          )}
          <button
            className="tour-btn solid"
            onClick={() => (last ? finish() : go(step + 1))}
          >
            {last ? "Start learning 🌱" : "Next"}
          </button>
        </div>
        <p className="tour-hint">Swipe or use arrow keys</p>
      </div>
    </motion.div>
  );
}
