import { Router } from "express";
import { optionalAuth, withAuth } from "../utils/auth";
import { getTopicDifficulty } from "../controllers/topicDifficulty.controller";

const router = Router();

/**
 * @route   GET /api/topic-difficulty
 * @desc    Per-topic difficulty gating for the Problems section
 * @access  Public/Private
 */
router.get("/", optionalAuth, withAuth(getTopicDifficulty));

export default router;