import { Prisma } from "@prisma/client";
import prisma from "../utils/prisma";
import {
  AssessmentAnswerInput,
  ExperienceLevel,
  RoadmapDay,
  TopicKnowledge,
} from "../types/onboarding.types";

export interface OnboardingProfileUpdate {
  experienceLevel: ExperienceLevel;
  goals: string;
  preferredTopics: string[];
  assessedLevel: ExperienceLevel;
  overallAssessmentScore: number | null;
  topicKnowledge: Record<string, TopicKnowledge>;
}

export const upsertOnboardingProfile = async (
  userId: string,
  assessment: OnboardingProfileUpdate,
) => {
  const shared = {
    experienceLevel: assessment.experienceLevel,
    assessedLevel: assessment.assessedLevel,
    onboardingCompleted: true,
    overallAssessmentScore: assessment.overallAssessmentScore,
    topicKnowledge: JSON.stringify(assessment.topicKnowledge),
    preferredTopics: JSON.stringify(assessment.preferredTopics), // Serialize array to string
    goals: assessment.goals,
  };

  return prisma.onboardingProfile.upsert({
    where: { userId },
    create: { userId, ...shared },
    update: shared,
  });
};

export const replaceAssessmentAnswers = async (
  userId: string,
  answers: AssessmentAnswerInput[],
) => {
  if (answers.length === 0) {
    return;
  }

  await prisma.$transaction([
    prisma.onboardingAssessmentAnswer.deleteMany({ where: { userId } }),
    prisma.onboardingAssessmentAnswer.createMany({
      data: answers.map((a) => ({
        userId,
        topic: a.topic,
        difficulty: a.difficulty,
        correct: a.correct,
      })),
    }),
  ]);
};

export const getOnboardingStatus = async (userId: string) => {
  return prisma.onboardingProfile.findUnique({
    where: { userId },
    select: {
      onboardingCompleted: true,
      experienceLevel: true,
      assessedLevel: true,
    },
  });
};

export const replaceRoadmapDays = async (
  userId: string,
  roadmap: RoadmapDay[],
) => {
  const values: Prisma.RoadmapCreateManyInput[] = roadmap.map((item) => ({
    userId,
    day: item.day,
    topic: item.topic,
    subtopic: item.subtopic ?? null,
    reason: item.reason ?? null,
    tasks: JSON.stringify(item.tasks), // Serialize array to string
    difficulty: item.difficulty,
    completed: false,
  }));

  await prisma.$transaction([
    prisma.roadmap.deleteMany({ where: { userId } }),
    prisma.roadmap.createMany({ data: values }),
  ]);
};

export const getRoadmapByUserId = async (userId: string) => {
  const roadmaps = await prisma.roadmap.findMany({
    where: { userId },
    orderBy: { day: "asc" },
  });

  // Deserialize tasks from string back to array
  return roadmaps.map(roadmap => ({
    ...roadmap,
    tasks: JSON.parse(roadmap.tasks as string),
  }));
};

export const markRoadmapDayCompleted = async (userId: string, day: number) => {
  return prisma.roadmap.update({
    where: {
      userId_day: {
        userId,
        day,
      },
    },
    data: {
      completed: true,
    },
  });
};