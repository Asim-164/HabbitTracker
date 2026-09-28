const express = require("express");

const router = express.Router();

const authenticateToken = require("../middleware/authMiddleware");

const { createHabit, getHabits, updateHabit, deleteHabit, getHabitStreak } = require("../controllers/habitController");

router.post("/", authenticateToken, createHabit);
router.get("/", authenticateToken, getHabits);
router.put("/:id", authenticateToken, updateHabit);
router.delete("/:id", authenticateToken, deleteHabit);
router.get("/:id/streak", authenticateToken, getHabitStreak);

module.exports = router;