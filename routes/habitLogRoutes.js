const express = require("express");

const router = express.Router();

const authenticateToken = require("../middleware/authMiddleware");

const { createHabitLog, getHabitLogs, updateHabitLog, deleteHabitLog } = require("../controllers/habitLogController");

router.post("/", authenticateToken, createHabitLog);
router.get("/", authenticateToken, getHabitLogs);
router.put("/:id", authenticateToken, updateHabitLog);
router.delete("/:id", authenticateToken, deleteHabitLog);

module.exports = router;