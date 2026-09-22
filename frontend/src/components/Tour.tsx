// First-run product tour (onboarding item 4): an animated walkthrough shown
// once, right after signup. Slides with icons + copy, spotlight-style card,
// progress dots, Back/Next/Skip. Visibility is self-managed:
// auth sets "pathwise_show_tour" on signup/claim; finishing or skipping
// clears it and stamps "pathwise_tour_done" so it never reappears.
import { useState } from "react";
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

const STEPS = [
  {
    icon: <UploadIcon cls="icon-lg" />,
    title: "Upload your course material",
    body: "Drop in a syllabus, slides, or even a photo of your notes. Pathwise reads it and builds your knowledge map — every topic, weighted by what your material emphasises.",
  },
  {
    icon: <SparklesIcon cls="icon-lg" />,
    title: "Learn every topic properly",
    body: "Tap any topic for a lecturer-grade breakdown with worked examples and common traps — and ask Pathwise anything while you read.",
  },
  {
    icon: <PuzzleIcon cls="icon-lg" />,
    title: "Prove it with quizzes",
    body: "Multiple choice first, then written answers the AI grades, then flashcards to lock it in. Your mastery map fills in as you go.",
  },
  {
    icon: <BrainIcon cls="icon-lg" />,
    title: "Think with the Socratic tutor",
    body: "Stuck? Socratic mode asks the questions that make it click — it never just hands you the answer, so it actually sticks.",
  },
  {
    icon: <MailIcon cls="icon-lg" />,
    title: "Study together",
    body: "Get matched with study buddies, join subject communities, and chat — mention @pathwise in any conversation to bring the AI in.",
  },
  {
    icon: <PlayIcon cls="icon-lg" />,
    title: "Watch your weak spots away",
    body: "A For-You feed of educational videos picked for the exact topics you're weakest on — swipe through, then quiz yourself right from a video.",
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
  const [step, setStep] = useState(0);

  if (!open) return null;

  function finish() {
    try {
      localStorage.removeItem(SHOW_KEY);
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      // Storage blocked — the tour just won't persist its dismissal.
    }
    setOpen(false);
  }

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="tour-backdrop" role="dialog" aria-modal="true" aria-label="Welcome tour">
      <motion.div
        className="tour-card"
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 26 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -26 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="tour-step"
          >
            <div className="tour-icon">{s.icon}</div>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
          </motion.div>
        </AnimatePresence>

        <div className="tour-dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? "on" : ""} />
          ))}
        </div>

        <div className="tour-actions">
          <button className="btn btn-ghost btn-sm" onClick={finish}>
            Skip
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button
              className="btn btn-primary btn-sm"
              onClick={() => (last ? finish() : setStep(step + 1))}
            >
              {last ? "Let's go 🌱" : "Next"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
