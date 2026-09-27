const express = require("express");

const router = express.Router();

const authenticateToken = require("../middleware/authMiddleware");

const { createReflection, getReflections, updateReflection, deleteReflection } = require("../controllers/reflectionController");

router.post("/", authenticateToken, createReflection);
router.get("/", authenticateToken, getReflections);
router.put("/:id", authenticateToken, updateReflection);
router.delete("/:id", authenticateToken, deleteReflection);

module.exports = router;