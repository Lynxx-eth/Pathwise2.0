// OpenAI provider. Only used when AI_PROVIDER=openai and OPENAI_API_KEY is set.
//
// Prompts and response validation live in ./prompts.ts, shared with every
// real provider — this file is transport only (PATHWISE 2.0 Phase 3).
import OpenAI from "openai";
import type {
  AIProvider,
  AIResult,
  ChatMessage,
  ExtractedTopic,
  ImageInput,
  MaterialVerdict,
  QuizQuestion,
  QuizTopicInput,
  SocraticContext,
  TokenUsage,
} from "./types.js";
import {
  classifyMaterialPrompt,
  extractTopicsPrompt,
  generateQuizPrompt,
  SOCRATIC_FALLBACK,
  socraticSystemPrompt,
  transcribeImagePrompt,
  validateQuestions,
  validateTopics,
  validateVerdict,
} from "./prompts.js";
import { env } from "../lib/env.js";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.model = env.OPENAI_MODEL;
  }

  private usageOf(res: {
    usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  }): TokenUsage {
    return {
      model: this.model,
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
    };
  }

  private async json<T>(
    system: string,
    user: string
  ): Promise<{ parsed: T; usage: TokenUsage }> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const text = res.choices[0]?.message?.content ?? "{}";
    let parsed: T;
    try {
      parsed = JSON.parse(text) as T;
    } catch {
      // A malformed response shouldn't 500 the request — callers handle empty.
      parsed = {} as T;
    }
    return { parsed, usage: this.usageOf(res) };
  }

  async extractTopics(
    courseName: string,
    materialText: string
  ): Promise<AIResult<ExtractedTopic[]>> {
    const { system, user } = extractTopicsPrompt(courseName, materialText);
    const { parsed, usage } = await this.json<{ topics: ExtractedTopic[] }>(
      system,
      user
    );
    return { value: validateTopics(parsed), usage };
  }

  async generateQuiz(
    courseName: string,
    topics: QuizTopicInput[],
    count: number
  ): Promise<AIResult<QuizQuestion[]>> {
    const { system, user } = generateQuizPrompt(courseName, topics, count);
    const { parsed, usage } = await this.json<{ questions: QuizQuestion[] }>(
      system,
      user
    );
    return { value: validateQuestions(parsed), usage };
  }

  async socraticReply(
    courseName: string,
    topicName: string | null,
    history: ChatMessage[],
    ctx?: SocraticContext
  ): Promise<AIResult<string>> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: socraticSystemPrompt(courseName, topicName, ctx),
        },
        ...history.map((m) => ({ role: m.role, content: m.content }) as const),
      ],
    });
    const value = res.choices[0]?.message?.content ?? SOCRATIC_FALLBACK;
    return { value, usage: this.usageOf(res) };
  }

  async classifyMaterial(
    courseName: string,
    materialText: string
  ): Promise<AIResult<MaterialVerdict>> {
    const { system, user } = classifyMaterialPrompt(courseName, materialText);
    const { parsed, usage } = await this.json<Partial<MaterialVerdict>>(
      system,
      user
    );
    return { value: validateVerdict(parsed), usage };
  }

  async transcribeImage(
    courseName: string,
    image: ImageInput
  ): Promise<AIResult<string>> {
    const { system, user } = transcribeImagePrompt(courseName);
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: user },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.mimeType};base64,${image.data.toString("base64")}`,
              },
            },
          ],
        },
      ],
    });
    const value = (res.choices[0]?.message?.content ?? "").trim();
    return { value, usage: this.usageOf(res) };
  }
}
