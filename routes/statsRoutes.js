const express = require("express");

const router = express.Router();

const authenticateToken = require("../middleware/authMiddleware");

const { getSummary, getCalendar, getReport, getRecentActivity } = require("../controllers/statsController");

router.get("/summary", authenticateToken, getSummary);
router.get("/calendar", authenticateToken, getCalendar);
router.get("/report", authenticateToken, getReport);
router.get("/recent-activity", authenticateToken, getRecentActivity);

module.exports = router;