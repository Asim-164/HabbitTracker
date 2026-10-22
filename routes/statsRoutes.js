const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/authMiddleware");

const {
    getSummary,
    getCalendar,
    getReport,
    getHabitBreakdown
} = require("../controllers/statsSummaryController");

const {
    getHealthScore,
    getFailurePatterns,
    getAchievements,
    getSuggestions,
    getRelationships,
    getWeeklyReview
} = require("../controllers/statsInsightsController");

const {
    getRecentActivity,
    searchAll
} = require("../controllers/statsUtilityController");

router.get("/summary", authenticateToken, getSummary);
router.get("/calendar", authenticateToken, getCalendar);
router.get("/report", authenticateToken, getReport);
router.get("/habit-breakdown", authenticateToken, getHabitBreakdown);
router.get("/health-score", authenticateToken, getHealthScore);
router.get("/patterns", authenticateToken, getFailurePatterns);
router.get("/achievements", authenticateToken, getAchievements);
router.get("/suggestions", authenticateToken, getSuggestions);
router.get("/relationships", authenticateToken, getRelationships);
router.get("/weekly-review", authenticateToken, getWeeklyReview);
router.get("/recent-activity", authenticateToken, getRecentActivity);
router.get("/search", authenticateToken, searchAll);

module.exports = router;