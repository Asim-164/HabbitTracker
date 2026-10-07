const express = require("express");

const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

const { registerUser, loginUser, updateMe, updatePassword } = require("../controllers/userController");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.put("/me", authenticateToken, updateMe);
router.put("/password", authenticateToken, updatePassword);

module.exports = router;