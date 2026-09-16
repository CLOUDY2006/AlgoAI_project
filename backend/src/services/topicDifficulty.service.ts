import prisma from "../utils/prisma";
import {
  getUserProgressRecords,
  calculateTopicPerformance,
  calculateWeakness,
} from "./advanced-recommendation.service";
import { ExperienceLevel, TopicKnowledge } from "../types/onboarding.types";

export type SimpleDifficulty = "easy" | "medium" | "hard";

export interface TopicDifficultyInfo {
  recommendedDifficulty: SimpleDifficulty;
  unlockedDifficulties: SimpleDifficulty[];
  /** Where this came from — useful for debugging and for the frontend to explain itself. */
  source: "performance" | "onboarding" | "default";
}

const LEVEL_DEFAULT_UNLOCKED: Record<ExperienceLevel, SimpleDifficulty[]> = {
  beginner: ["easy"],
  intermediate: ["easy", "medium"],
  advanced: ["easy", "medium", "hard"],
};

/**
 * Used when the user hasn't attempted any problems in this topic yet, so
 * there's no live performance signal — falls back to the onboarding
 * assessment (Part 6): overall assessed level, with a per-topic override
 * from the basic-question results if this specific topic was covered
 * (Part 8 — a strength/weakness in one topic shouldn't bleed into others).
 */
const onboardingFallback = (
  assessedLevel: ExperienceLevel,
  topicKnowledge: Record<string, TopicKnowledge>,
  topic: string,
): TopicDifficultyInfo => {
  let unlocked = LEVEL_DEFAULT_UNLOCKED[assessedLevel];
  const knowledge = topicKnowledge[topic];

  if (knowledge) {
    if (knowledge.level === "strong") {
      unlocked = ["easy", "medium", "hard"];
    } else if (knowledge.level === "weak") {
      unlocked = ["easy"];
    }
  }

  return {
    recommendedDifficulty: unlocked[unlocked.length - 1],
    unlockedDifficulties: unlocked,
    source: knowledge ? "onboarding" : "default",
  };
};

/**
 * Per-topic difficulty gating for the Problems section (Part 6/7/8).
 *
 * Priority per topic:
 *   1. Live performance (calculateWeakness, already built for the
 *      recommendation engine) — once the user has real submissions in this
 *      topic, that's a stronger signal than a one-time onboarding guess and
 *      is what makes this adapt over time (Part 7).
 *   2. Onboarding assessment fallback — for topics with no submissions yet.
 */
export const getTopicDifficultyMap = async (
  userId: string,
): Promise<Record<string, TopicDifficultyInfo>> => {
  const [progressRecords, profile] = await Promise.all([
    getUserProgressRecords(userId),
    prisma.onboardingProfile.findUnique({ where: { userId } }),
  ]);

  const assessedLevel =
    (profile?.assessedLevel as ExperienceLevel) ||
    (profile?.experienceLevel as ExperienceLevel) ||
    "beginner";

  let topicKnowledge: Record<string, TopicKnowledge> = {};
  if (profile?.topicKnowledge) {
    try {
      topicKnowledge = JSON.parse(profile.topicKnowledge);
    } catch {
      topicKnowledge = {};
    }
  }

  let preferredTopics: string[] = [];
  if (profile?.preferredTopics) {
    try {
      preferredTopics = JSON.parse(profile.preferredTopics);
    } catch {
      preferredTopics = [];
    }
  }

  const performances = calculateTopicPerformance(progressRecords);
  const weaknessByTopic = new Map(performances.map((p) => [p.topic, calculateWeakness(p)]));

  const allTopics = new Set<string>([
    ...weaknessByTopic.keys(),
    ...Object.keys(topicKnowledge),
    ...preferredTopics,
  ]);

  const result: Record<string, TopicDifficultyInfo> = {};

  allTopics.forEach((topic) => {
    const weakness = weaknessByTopic.get(topic);
    const hasRealHistory = Boolean(weakness) && weakness!.reason !== "No attempts yet";

    if (hasRealHistory && weakness) {
      const rec = weakness.recommended_difficulty as SimpleDifficulty;
      const unlocked: SimpleDifficulty[] =
        rec === "easy" ? ["easy"] : rec === "medium" ? ["easy", "medium"] : ["easy", "medium", "hard"];
      result[topic] = { recommendedDifficulty: rec, unlockedDifficulties: unlocked, source: "performance" };
    } else {
      result[topic] = onboardingFallback(assessedLevel, topicKnowledge, topic);
    }
  });

  console.log(`[topicDifficulty] user=${userId} level=${assessedLevel} topics=${allTopics.size}`);

  return result;
};