const express = require("express");

const router = express.Router();

const authenticateToken = require("../middleware/authMiddleware");

const { getSummary } = require("../controllers/statsController");

router.get("/summary", authenticateToken, getSummary);

module.exports = router;