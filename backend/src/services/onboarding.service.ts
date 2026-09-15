import {
  replaceRoadmapDays,
  getRoadmapByUserId,
  markRoadmapDayCompleted,
  upsertOnboardingProfile,
  replaceAssessmentAnswers,
  getOnboardingStatus as getOnboardingStatusFromDb,
} from "../repositories/onboarding.repository";
import {
  ExperienceLevel,
  OnboardingAssessment,
  OnboardingInput,
  OnboardingResponse,
  OnboardingStatusResponse,
  RoadmapDay,
  TopicKnowledge,
} from "../types/onboarding.types";
import { buildTopicOrder, TOPIC_GRAPH } from "../data/topicTaxonomy";
import prisma from "../utils/prisma";

const LEVEL_ORDER: ExperienceLevel[] = ["beginner", "intermediate", "advanced"];
const LEVEL_INDEX: Record<ExperienceLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };

const normalizeToUtcMidnight = (date: Date | string | number) => {
  const parsedDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Invalid date passed to normalizeToUtcMidnight");
  }

  return new Date(Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate()));
};

export const getRoadmapMeta = async (userId: string, roadmapLength: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      onboardingProfile: {
        select: {
          createdAt: true,
        },
      },
    },
  });

  const startDate = user?.onboardingProfile?.createdAt ?? user?.createdAt;
  if (!startDate) {
    return {
      startDate: null,
      daysSinceStart: 0,
      currentRoadmapDay: 1,
      roadmapLength,
      unlockedDays: 0,
      lockedDays: roadmapLength,
      unlockedDayNumbers: [],
      lockedDayNumbers: Array.from({ length: roadmapLength }, (_, idx) => idx + 1),
    };
  }

  const parsedStartDate = startDate instanceof Date ? startDate : new Date(startDate);
  if (Number.isNaN(parsedStartDate.getTime())) {
    throw new Error("Invalid startDate value in onboarding metadata");
  }

  const today = normalizeToUtcMidnight(new Date());
  const startedAt = normalizeToUtcMidnight(parsedStartDate);
  let daysSinceStart = Math.floor((today.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceStart < 0) {
    daysSinceStart = 0;
  }

  const maxRoadmapDays = roadmapLength > 0 ? Math.min(roadmapLength, 15) : 0;
  const unlockedDays = Math.max(Math.min(daysSinceStart + 1, maxRoadmapDays), 0);
  const lockedDays = Math.max(maxRoadmapDays - unlockedDays, 0);
  const unlockedDayNumbers = Array.from({ length: unlockedDays }, (_, idx) => idx + 1);
  const lockedDayNumbers = Array.from({ length: lockedDays }, (_, idx) => unlockedDays + idx + 1);
  const currentRoadmapDay = maxRoadmapDays > 0 ? Math.min(daysSinceStart + 1, maxRoadmapDays) : 1;

  return {
    startDate: parsedStartDate.toISOString(),
    daysSinceStart,
    currentRoadmapDay,
    roadmapLength: maxRoadmapDays,
    unlockedDays,
    lockedDays,
    unlockedDayNumbers,
    lockedDayNumbers,
  };
};

// ─── Part 1/2: evaluate the basic questions into a real assessment ────────

/**
 * Combines self-reported experience with demonstrated performance on the
 * basic questions. A confident self-report backed by a poor score is
 * downgraded; a modest self-report backed by a strong score is upgraded.
 * A middling score just trusts what the user said about themselves.
 *
 * Thresholds are a documented judgment call, not a precise science —
 * >=70% demonstrated strong knowledge, <=30% demonstrated weak knowledge,
 * anything between is treated as "consistent with self-report".
 */
const reconcileLevel = (
  selfReported: ExperienceLevel,
  scorePercent: number | null,
): ExperienceLevel => {
  if (scorePercent === null) return selfReported;

  const selfIdx = LEVEL_INDEX[selfReported];

  if (scorePercent >= 70 && selfIdx < 2) {
    return LEVEL_ORDER[selfIdx + 1];
  }
  if (scorePercent <= 30 && selfIdx > 0) {
    return LEVEL_ORDER[selfIdx - 1];
  }
  return selfReported;
};

export const buildAssessment = (input: OnboardingInput): OnboardingAssessment => {
  const answers = input.testAnswers ?? [];

  const topicKnowledge: Record<string, TopicKnowledge> = {};
  answers.forEach((a) => {
    const bucket = topicKnowledge[a.topic] ?? { correct: 0, total: 0, level: "weak" };
    bucket.total += 1;
    if (a.correct) bucket.correct += 1;
    topicKnowledge[a.topic] = bucket;
  });

  Object.keys(topicKnowledge).forEach((topic) => {
    const { correct, total } = topicKnowledge[topic];
    const ratio = total > 0 ? correct / total : 0;
    topicKnowledge[topic].level = ratio >= 0.7 ? "strong" : ratio <= 0.3 ? "weak" : "moderate";
  });

  let overallAssessmentScore: number | null = null;
  if (answers.length > 0) {
    const correctCount = answers.filter((a) => a.correct).length;
    overallAssessmentScore = Math.round((correctCount / answers.length) * 100);
  } else if (typeof input.testScore === "number") {
    // Legacy fallback: a raw score with no per-question topic/difficulty data.
    overallAssessmentScore = input.testScore;
  }

  const assessedLevel = reconcileLevel(input.experienceLevel, overallAssessmentScore);

  console.log(
    `[onboarding] assessment: self=${input.experienceLevel} score=${overallAssessmentScore} -> assessed=${assessedLevel}`,
    topicKnowledge,
  );

  return {
    selfReportedLevel: input.experienceLevel,
    assessedLevel,
    overallAssessmentScore,
    topicKnowledge,
  };
};

// ─── Part 3/4/5: prerequisite-aware, difficulty-progressive roadmap ────────

const ROADMAP_LENGTH_BY_LEVEL: Record<ExperienceLevel, number> = {
  beginner: 14,
  intermediate: 10,
  advanced: 7,
};

const DIFFICULTY_LABELS = ["easy", "medium", "hard"] as const;
const LEVEL_BASE_INDEX: Record<ExperienceLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 1,
};

const computeDayDifficulty = (opts: {
  level: ExperienceLevel;
  topicScorePercent: number | null;
  dayIndexInTopic: number;
  topicSubtopicCount: number;
  globalDayIndex: number;
  totalRoadmapDays: number;
}): string => {
  let base = LEVEL_BASE_INDEX[opts.level];

  // Per-topic override (Part 8): strong demonstrated knowledge in THIS topic
  // bumps the starting point up a tier; weak knowledge forces it back down
  // to easy regardless of overall level.
  if (opts.topicScorePercent !== null) {
    if (opts.topicScorePercent >= 75) base = Math.min(2, base + 1);
    else if (opts.topicScorePercent < 35) base = 0;
  }

  // Progress within this topic's own subtopic sequence.
  const withinTopicBump =
    opts.topicSubtopicCount > 1
      ? Math.round((opts.dayIndexInTopic / (opts.topicSubtopicCount - 1)) * 1)
      : 0;

  // Gentle whole-roadmap progression so day 1 is never harder than the end.
  const globalRatio = opts.totalRoadmapDays > 1 ? opts.globalDayIndex / (opts.totalRoadmapDays - 1) : 0;
  const globalBump = globalRatio > 0.66 ? 1 : 0;

  const index = Math.max(0, Math.min(2, base + withinTopicBump + globalBump));
  return DIFFICULTY_LABELS[index];
};

const buildPersonalizedRoadmap = (
  input: OnboardingInput,
  assessment: OnboardingAssessment,
): RoadmapDay[] => {
  const topicOrder = buildTopicOrder(input.preferredTopics);
  const maxDays = ROADMAP_LENGTH_BY_LEVEL[assessment.assessedLevel];

  const days: RoadmapDay[] = [];

  outer: for (const topicId of topicOrder) {
    const node = TOPIC_GRAPH[topicId];
    if (!node) continue;

    const subtopics = node.subtopics.length ? node.subtopics : [`${node.label} Fundamentals`];
    const knowledge = assessment.topicKnowledge[topicId];
    const topicScorePercent = knowledge ? Math.round((knowledge.correct / knowledge.total) * 100) : null;
    const isPreferred = input.preferredTopics.includes(topicId);

    for (let i = 0; i < subtopics.length; i++) {
      if (days.length >= maxDays) break outer;

      const difficulty = computeDayDifficulty({
        level: assessment.assessedLevel,
        topicScorePercent,
        dayIndexInTopic: i,
        topicSubtopicCount: subtopics.length,
        globalDayIndex: days.length,
        totalRoadmapDays: maxDays,
      });

      const prereqLabels = node.prerequisites.map((p) => TOPIC_GRAPH[p]?.label).filter(Boolean);
      const reason = isPreferred
        ? prereqLabels.length
          ? `One of your selected topics — builds on ${prereqLabels.join(", ")}.`
          : "One of your selected topics."
        : `Prerequisite groundwork for a topic you selected.`;

      days.push({
        day: days.length + 1,
        topic: topicId,
        subtopic: subtopics[i],
        difficulty,
        reason,
        tasks: [
          `Study ${subtopics[i]} concepts for 30-45 minutes.`,
          `Solve 2 ${difficulty} ${node.label} practice problems.`,
          `Write a short reflection on mistakes and improvement points.`,
        ],
      });
    }
  }

  console.log(
    `[onboarding] generated roadmap: ${days.length} days, level=${assessment.assessedLevel}, order=${topicOrder.slice(0, 8).join(",")}...`,
  );

  return days;
};

const getRecommendedTopics = (topicOrder: string[]): string[] => topicOrder.slice(0, 12);

export const createOrUpdateOnboardingRoadmap = async (
  userId: string,
  input: OnboardingInput,
): Promise<OnboardingResponse> => {
  const assessment = buildAssessment(input);

  await upsertOnboardingProfile(userId, {
    experienceLevel: input.experienceLevel,
    goals: input.goals,
    preferredTopics: input.preferredTopics,
    assessedLevel: assessment.assessedLevel,
    overallAssessmentScore: assessment.overallAssessmentScore,
    topicKnowledge: assessment.topicKnowledge,
  });

  if (input.testAnswers?.length) {
    await replaceAssessmentAnswers(userId, input.testAnswers);
  }

  const personalizedRoadmap = buildPersonalizedRoadmap(input, assessment);
  await replaceRoadmapDays(userId, personalizedRoadmap);

  return {
    success: true,
    personalizedRoadmap,
    recommendedTopics: getRecommendedTopics(buildTopicOrder(input.preferredTopics)),
    assessedLevel: assessment.assessedLevel,
    overallAssessmentScore: assessment.overallAssessmentScore,
  };
};

export const getOnboardingStatus = async (userId: string): Promise<OnboardingStatusResponse> => {
  const profile = await getOnboardingStatusFromDb(userId);

  if (!profile) {
    return { onboardingCompleted: false };
  }

  return {
    onboardingCompleted: profile.onboardingCompleted,
    experienceLevel: profile.experienceLevel as ExperienceLevel,
    assessedLevel: (profile.assessedLevel as ExperienceLevel) ?? undefined,
  };
};

export const fetchRoadmap = async (userId: string): Promise<RoadmapDay[]> => {
  const rows = await getRoadmapByUserId(userId);

  return rows.map((row) => ({
    day: row.day,
    topic: row.topic,
    subtopic: row.subtopic ?? undefined,
    reason: row.reason ?? undefined,
    tasks: Array.isArray(row.tasks) ? (row.tasks as any[]).map((p) => String(p)) : [],
    difficulty: row.difficulty,
    completed: Boolean(row.completed),
  }));
};

export const completeRoadmapDay = async (
  userId: string,
  day: number,
): Promise<void> => {
  try {
    await markRoadmapDayCompleted(userId, day);
  } catch {
    const error = new Error("Roadmap day not found for this user.");
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }
};