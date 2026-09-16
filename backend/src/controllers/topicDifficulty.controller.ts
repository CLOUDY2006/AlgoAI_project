import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/express";
import { getTopicDifficultyMap } from "../services/topicDifficulty.service";
import { getUserIdFromRequest } from "./onboarding.controller";

/**
 * @route   GET /api/topic-difficulty
 * @desc    Per-topic recommended/unlocked difficulty for the Problems
 *          section (Part 6/7/8) — combines live submission performance with
 *          the onboarding assessment as a fallback for untouched topics.
 * @access  Public/Private (guests supported via x-user-id, same as onboarding status)
 */
export const getTopicDifficulty = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      // No identifiable user — return an empty map rather than erroring;
      // the frontend treats a missing topic entry as "no restriction".
      res.status(200).json({ status: "success", data: {} });
      return;
    }

    const data = await getTopicDifficultyMap(userId);
    res.status(200).json({ status: "success", data });
  } catch (error) {
    next(error);
  }
};