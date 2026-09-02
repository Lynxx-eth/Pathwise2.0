// Mock AI provider — deterministic, free, no API key. Lets the whole app work
// end-to-end during development. Swap to OpenAI by setting AI_PROVIDER=openai.
import type {
  AIProvider,
  AIResult,
  ChatMessage,
  ExtractedTopic,
  ImageInput,
  MaterialVerdict,
  QuizQuestion,
  QuizTopicInput,
  TokenUsage,
} from "./types.js";

// The mock costs nothing, so it reports zero tokens. The usage row is still
// written, which keeps the metering path exercised in development.
function freeUsage(): TokenUsage {
  return { model: "mock", promptTokens: 0, completionTokens: 0 };
}

function wrap<T>(value: T): AIResult<T> {
  return { value, usage: freeUsage() };
}

// Pull candidate topic phrases out of text using simple heuristics so the
// mock still produces course-specific output instead of fixed placeholders.
function candidatePhrases(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3 && l.length < 80);

  // Prefer bullet/heading-ish lines; fall back to capitalized phrases.
  const headingish = lines.filter((l) =>
    /^(chapter|topic|unit|week|module|\d+[.)]|[-*•])/i.test(l)
  );
  const source = headingish.length >= 3 ? headingish : lines;

  const cleaned = source
    .map((l) =>
      l
        // Drop a leading structural label ("Chapter", "Week 3:", "1)", bullets…)
        .replace(/^(chapter|topic|unit|week|module|section|lecture)\b/i, "")
        .replace(/^[\s:.)\-*•\d]+/, "")
        // Drop a leading "objective/goal:" style lead-in.
        .replace(/^(learning objective|objective|goal)s?\s*:?\s*/i, "")
        .trim()
    )
    // Keep phrases that read like topics (a few words, not a full sentence).
    .filter((l) => l.length >= 3 && l.split(" ").length <= 7);

  return Array.from(new Set(cleaned)).slice(0, 12);
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async extractTopics(
    courseName: string,
    materialText: string
  ): Promise<AIResult<ExtractedTopic[]>> {
    const phrases = candidatePhrases(materialText);
    const base =
      phrases.length > 0
        ? phrases
        : [
            "Core Concepts",
            "Key Definitions",
            "Fundamental Principles",
            "Applications",
            "Common Pitfalls",
          ];

    // Weight by (fake) repetition: earlier + more-frequent phrases weigh more.
    // Knowledge Layer 2.0 fields are filled deterministically so the whole
    // enriched pipeline (objectives, misconceptions, prerequisites, source
    // refs) is exercisable in development.
    const topics = base.map((name, i) => {
      const occurrences =
        (materialText.match(new RegExp(escapeRegExp(name), "gi")) || []).length ||
        1;
      const weight = Math.min(1, 0.35 + occurrences * 0.12 + (base.length - i) * 0.02);
      return {
        name,
        summary: `Key ideas around "${name}" as covered in ${courseName}.`,
        weight: Number(weight.toFixed(2)),
        difficulty: Number(Math.min(1, 0.2 + i * 0.08).toFixed(2)),
        objectives: [
          `Explain ${name.toLowerCase()} in your own words`,
          `Apply ${name.toLowerCase()} to a simple example`,
        ],
        misconceptions:
          i % 2 === 0
            ? [`A common mix-up: confusing ${name.toLowerCase()} with a related idea`]
            : [],
        prerequisites: i > 0 ? [base[i - 1]] : [],
        sourceHint: `Section ${i + 1}`,
      };
    });

    return wrap(topics);
  }

  async generateQuiz(
    courseName: string,
    topics: QuizTopicInput[],
    count: number
  ): Promise<AIResult<QuizQuestion[]>> {
    const sorted = [...topics].sort((a, b) => b.weight - a.weight);
    const out: QuizQuestion[] = [];
    for (let i = 0; i < count; i++) {
      const t = sorted[i % Math.max(1, sorted.length)] ?? {
        name: "Core Concepts",
        weight: 0.5,
      };
      const correct = i % 4;
      const options = [0, 1, 2, 3].map((n) =>
        n === correct
          ? `The concept most central to ${t.name}`
          : `A plausible-but-incorrect idea about ${t.name} (${n + 1})`
      );
      out.push({
        topicName: t.name,
        question: `In ${courseName}, which of the following best describes ${t.name}?`,
        options,
        correctIndex: correct,
        explanation: `This checks understanding of ${t.name}. (Mock question — enable a real AI provider for authored questions.)`,
      });
    }
    return wrap(out);
  }

  async socraticReply(
    courseName: string,
    topicName: string | null,
    history: ChatMessage[]
  ): Promise<AIResult<string>> {
    void courseName;
    const lastUser = [...history].reverse().find((m) => m.role === "user");
    const focus = topicName ? ` about ${topicName}` : "";
    const probe = lastUser?.content
      ? `You said: "${lastUser.content.slice(0, 80)}". `
      : "";
    // Never a direct answer — always a guiding question.
    return wrap(
      `${probe}What do you already know${focus} that might point you toward the answer? What would happen if you tried the simplest case first?`
    );
  }

  async transcribeImage(
    courseName: string,
    image: ImageInput
  ): Promise<AIResult<string>> {
    // No vision without a real provider — produce deterministic pseudo-notes
    // so the full image path (upload -> transcribe -> screen -> topics) is
    // exercisable in development. Varies with the bytes so two different
    // images don't merge into identical topics.
    const seed = image.data.length % 5;
    const themes = [
      ["Study Notes Overview", "Definitions and Terms", "Worked Example"],
      ["Lecture Summary", "Key Formula Sheet", "Practice Checklist"],
      ["Diagram Walkthrough", "Process Steps", "Common Mistakes"],
      ["Chapter Highlights", "Important Dates", "Review Questions"],
      ["Whiteboard Snapshot", "Core Argument", "Supporting Evidence"],
    ][seed];
    const lines = themes.map(
      (t, i) =>
        `${i + 1}. ${t}\n- Main idea of ${t.toLowerCase()} for ${courseName}\n- Detail worth remembering about ${t.toLowerCase()}`
    );
    return wrap(
      `Mock transcription (${image.mimeType}, ${image.data.length} bytes)\n${lines.join("\n")}`
    );
  }

  async classifyMaterial(
    courseName: string,
    materialText: string
  ): Promise<AIResult<MaterialVerdict>> {
    void courseName;
    // Keyword screen only — enough to exercise the reject path in dev without
    // pretending to be real moderation.
    const lowered = materialText.toLowerCase();
    const banned = ["explicit sexual", "how to build a bomb", "child abuse"];
    const hit = banned.find((b) => lowered.includes(b));
    if (hit) {
      return wrap({
        verdict: "inappropriate" as const,
        reason: `Matched a blocked phrase (${hit}).`,
      });
    }
    if (materialText.trim().length < 120) {
      return wrap({
        verdict: "off_topic" as const,
        reason: "Too little readable text to be course material.",
      });
    }
    return wrap({ verdict: "clean" as const, reason: "Looks like course material." });
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
