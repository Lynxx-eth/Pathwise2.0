// The AI provider interface. Every feature that needs AI goes through this,
// so we can swap "mock" <-> "openai" (or add Claude later) in one place.
//
// Every method returns its token usage alongside the result. Cost metering
// (lib/aiMeter.ts) depends on that being reported per call, not tracked in a
// module-level global — concurrent requests would corrupt a shared counter.

export interface TokenUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface AIResult<T> {
  value: T;
  usage: TokenUsage;
}

export interface ExtractedTopic {
  name: string;
  summary: string;
  weight: number; // 0..1 emphasis
  // --- Knowledge Layer 2.0 (Phase 6) — optional, all grounded in material.
  difficulty?: number; // 0 (intro) .. 1 (advanced)
  objectives?: string[]; // what the student should be able to DO
  misconceptions?: string[]; // wrong ideas worth probing/distracting with
  prerequisites?: string[]; // NAMES of other topics to learn first
  sourceHint?: string; // where in the material, e.g. "Week 3"
}

export interface QuizQuestion {
  topicName: string;
  question: string;
  options: string[]; // multiple choice
  correctIndex: number;
  explanation: string;
}

/** What quiz generation knows about each topic (Knowledge Layer 2.0 enriched). */
export interface QuizTopicInput {
  name: string;
  weight: number;
  difficulty?: number;
  misconceptions?: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** An uploaded image handed to a vision-capable provider (2.0 Phase 5). */
export interface ImageInput {
  data: Buffer;
  // "image/png" | "image/jpeg" | "image/webp"
  mimeType: string;
}

/** Step 15: verdict on whether uploaded material belongs in a study app. */
export interface MaterialVerdict {
  // "clean" — course material. "off_topic" — not study material at all.
  // "inappropriate" — content we won't process.
  verdict: "clean" | "off_topic" | "inappropriate";
  reason: string;
}

export interface AIProvider {
  readonly name: string;

  /** Step 2: pull weighted topics out of raw course material text. */
  extractTopics(
    courseName: string,
    materialText: string
  ): Promise<AIResult<ExtractedTopic[]>>;

  /** Step 5: generate practice questions weighted toward emphasized topics. */
  generateQuiz(
    courseName: string,
    topics: QuizTopicInput[],
    count: number
  ): Promise<AIResult<QuizQuestion[]>>;

  /**
   * Step 7: Socratic tutor turn. MUST return a guiding question, never a
   * direct answer. The system prompt enforces this; providers must honor it,
   * and lib/socraticGuard.ts checks the output regardless.
   */
  socraticReply(
    courseName: string,
    topicName: string | null,
    history: ChatMessage[]
  ): Promise<AIResult<string>>;

  /** Step 15: screen uploaded material before it becomes a knowledge map. */
  classifyMaterial(
    courseName: string,
    materialText: string
  ): Promise<AIResult<MaterialVerdict>>;

  /**
   * PATHWISE 2.0 Phase 5: turn a photo/screenshot of study material (notes,
   * whiteboard, textbook page, slide, diagram) into clean structured text.
   * The result feeds the SAME text pipeline as documents — screening, topic
   * extraction, the knowledge map — so downstream code never knows the
   * material arrived as pixels. Returns "" when nothing educational is
   * legible in the image.
   */
  transcribeImage(
    courseName: string,
    image: ImageInput
  ): Promise<AIResult<string>>;
}
