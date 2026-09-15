export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

/** One basic/calibration question the user answered during onboarding. */
export interface AssessmentAnswerInput {
  topic: string;
  difficulty: string;
  correct: boolean;
}

export interface OnboardingInput {
  experienceLevel: ExperienceLevel;
  goals: string;
  preferredTopics: string[];
  /** Per-question results for the basic questions — used to compute assessedLevel. */
  testAnswers?: AssessmentAnswerInput[];
  /** Legacy/back-compat: a raw correct-count, used only if testAnswers isn't provided. */
  testScore?: number;
  timeCommitment?: string;
}

/** Per-topic knowledge derived from the basic-question assessment. */
export interface TopicKnowledge {
  correct: number;
  total: number;
  level: "weak" | "moderate" | "strong";
}

export interface OnboardingAssessment {
  selfReportedLevel: ExperienceLevel;
  assessedLevel: ExperienceLevel;
  overallAssessmentScore: number | null; // 0-100, null if no questions were answered
  topicKnowledge: Record<string, TopicKnowledge>;
}

export interface RoadmapDay {
  day: number;
  topic: string;
  subtopic?: string;
  reason?: string;
  tasks: string[];
  difficulty: string;
  completed?: boolean;
  isLocked?: boolean;
}

export interface OnboardingResponse {
  success: true;
  personalizedRoadmap: RoadmapDay[];
  recommendedTopics: string[];
  assessedLevel: ExperienceLevel;
  overallAssessmentScore: number | null;
}

export interface OnboardingStatusResponse {
  onboardingCompleted: boolean;
  experienceLevel?: ExperienceLevel;
  assessedLevel?: ExperienceLevel;
}

export interface CompleteDayInput {
  day: number;
}