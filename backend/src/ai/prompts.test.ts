// PATHWISE 2.0 Phase 3: the shared response validators every real provider
// funnels through — model output is untrusted and these are the gate.
import test from "node:test";
import assert from "node:assert/strict";
import {
  clamp01,
  extractTopicsPrompt,
  validateTopics,
  validateQuestions,
  validateVerdict,
  UNTRUSTED_INPUT_RULE,
  socraticSystemPrompt,
} from "./prompts.js";

test("clamp01 bounds weights and defaults NaN to 0.5", () => {
  assert.equal(clamp01(-3), 0);
  assert.equal(clamp01(0.4), 0.4);
  assert.equal(clamp01(7), 1);
  assert.equal(clamp01(Number("nope")), 0.5);
});

test("validateTopics dedupes case-insensitively and drops junk names", () => {
  const value = validateTopics({
    topics: [
      { name: "Mitosis", summary: "s", weight: 0.9 },
      { name: "mitosis", summary: "dupe", weight: 0.1 },
      { name: "X", summary: "too short", weight: 0.5 },
      { name: "  Meiosis ", summary: "s", weight: 2 },
    ],
  });
  assert.deepEqual(
    value.map((t) => t.name),
    ["Mitosis", "Meiosis"]
  );
  assert.equal(value[1].weight, 1); // clamped
});

test("validateTopics caps the list at 15 and handles missing field", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    name: `Topic number ${i}`,
    summary: "s",
    weight: 0.5,
  }));
  assert.equal(validateTopics({ topics: many }).length, 15);
  assert.deepEqual(validateTopics({}), []);
});

test("validateTopics bounds Knowledge Layer fields and drops self-prerequisites", () => {
  const [t] = validateTopics({
    topics: [
      {
        name: "Photosynthesis",
        summary: "s",
        weight: 0.7,
        difficulty: 3, // clamped
        objectives: ["  Explain   light reactions ", "", 42 as unknown as string],
        misconceptions: ["Plants don't respire", "m2", "m3", "m4 overflow"],
        prerequisites: ["photosynthesis", "Cell Structure"], // self dropped
        sourceHint: "  Week   4  ",
      },
    ],
  });
  assert.equal(t.difficulty, 1);
  assert.deepEqual(t.objectives, ["Explain light reactions"]);
  assert.equal(t.misconceptions?.length, 3); // capped at 3
  assert.deepEqual(t.prerequisites, ["Cell Structure"]);
  assert.equal(t.sourceHint, "Week 4");
});

test("validateTopics leaves Knowledge Layer fields empty when absent", () => {
  const [t] = validateTopics({
    topics: [{ name: "Plain Topic", summary: "s", weight: 0.5 }],
  });
  assert.equal(t.difficulty, undefined);
  assert.deepEqual(t.objectives, []);
  assert.deepEqual(t.misconceptions, []);
  assert.deepEqual(t.prerequisites, []);
  assert.equal(t.sourceHint, undefined);
});

test("validateQuestions drops malformed questions", () => {
  const good = {
    topicName: "T",
    question: "Q?",
    options: ["a", "b", "c", "d"],
    correctIndex: 2,
    explanation: "e",
  };
  const value = validateQuestions({
    questions: [
      good,
      { ...good, options: ["a", "b", "c"] }, // 3 options
      { ...good, correctIndex: 4 }, // out of range
      { ...good, correctIndex: 1.5 }, // not an integer
      { ...good, question: 42 as unknown as string },
    ],
  });
  assert.equal(value.length, 1);
});

test("validateVerdict fails open to clean on unknown verdicts", () => {
  assert.equal(validateVerdict({ verdict: "off_topic", reason: "r" }).verdict, "off_topic");
  assert.equal(validateVerdict({ verdict: "inappropriate" }).verdict, "inappropriate");
  assert.equal(
    validateVerdict({ verdict: "banana" as never, reason: "r" }).verdict,
    "clean"
  );
  assert.equal(validateVerdict({}).verdict, "clean");
});

test("prompts carry the untrusted-input rule and the anti-placeholder rule", () => {
  const { system } = extractTopicsPrompt("Bio", "material");
  assert.ok(system.includes(UNTRUSTED_INPUT_RULE));
  assert.ok(system.includes("Core Concepts")); // the named anti-pattern
  assert.ok(socraticSystemPrompt("Bio", "Cells").includes("NEVER give the final answer"));
});
