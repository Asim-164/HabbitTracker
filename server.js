require("dotenv").config();

const express = require("express");

const app = express();

const path = require("path");

const habitRoutes = require("./routes/habitRoutes");
const userRoutes = require("./routes/userRoutes");
const habitLogRoutes = require("./routes/habitLogRoutes");
const reflectionRoutes = require("./routes/reflectionRoutes");
const statsRoutes = require("./routes/statsRoutes");

app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend")));

app.use("/api/habits", habitRoutes);
app.use("/api/users", userRoutes);
app.use("/api/habit-logs", habitLogRoutes);
app.use("/api/reflections", reflectionRoutes);
app.use("/api/stats", statsRoutes);

app.listen(3002, () => {
    console.log("Habbit Tracker Server is running on port 3002");
});