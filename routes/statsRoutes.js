const express = require("express");

const router = express.Router();

const authenticateToken = require("../middleware/authMiddleware");

const { getSummary, getCalendar, getReport, getRecentActivity, searchAll, getHealthScore, getFailurePatterns, getAchievements, getSuggestions, getRelationships } = require("../controllers/statsController");

router.get("/summary", authenticateToken, getSummary);
router.get("/calendar", authenticateToken, getCalendar);
router.get("/report", authenticateToken, getReport);
router.get("/recent-activity", authenticateToken, getRecentActivity);
router.get("/search", authenticateToken, searchAll);
router.get("/health-score", authenticateToken, getHealthScore);
router.get("/patterns", authenticateToken, getFailurePatterns);
router.get("/achievements", authenticateToken, getAchievements);
router.get("/suggestions", authenticateToken, getSuggestions);
router.get("/relationships", authenticateToken, getRelationships);

module.exports = router;