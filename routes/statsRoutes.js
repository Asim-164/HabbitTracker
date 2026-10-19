const express = require("express");

const router = express.Router();

const authenticateToken = require("../middleware/authMiddleware");

const { getSummary, getCalendar, getReport, getRecentActivity, searchAll, getHealthScore } = require("../controllers/statsController");

router.get("/summary", authenticateToken, getSummary);
router.get("/calendar", authenticateToken, getCalendar);
router.get("/report", authenticateToken, getReport);
router.get("/recent-activity", authenticateToken, getRecentActivity);
router.get("/search", authenticateToken, searchAll);
router.get("/health-score", authenticateToken, getHealthScore);

module.exports = router;