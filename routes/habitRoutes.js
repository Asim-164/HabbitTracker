const express = require("express");

const router = express.Router();

const authenticateToken = require("../middleware/authMiddleware");

const { createHabit, getHabits, updateHabit, deleteHabit, getHabitStreak } = require("../controllers/habitController");
const { getHabitStats } = require("../controllers/statsController");

router.post("/", authenticateToken, createHabit);
router.get("/", authenticateToken, getHabits);
router.put("/:id", authenticateToken, updateHabit);
router.delete("/:id", authenticateToken, deleteHabit);
router.get("/:id/streak", authenticateToken, getHabitStreak);
router.get("/:id/stats", authenticateToken, getHabitStats);

module.exports = router;