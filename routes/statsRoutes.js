const express = require("express");

const router = express.Router();

const authenticateToken = require("../middleware/authMiddleware");

const { getSummary, getCalendar } = require("../controllers/statsController");

router.get("/summary", authenticateToken, getSummary);
router.get("/calendar", authenticateToken, getCalendar);

module.exports = router;