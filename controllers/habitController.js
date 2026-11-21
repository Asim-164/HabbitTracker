const connectDatabase = require("../database/db");
const { isConsecutiveDay } = require("../utils/dateHelpers");

async function createHabit(req, res) {
    try {
        const pool = await connectDatabase();
        const { name, description, categoryId, targetValue, unit, frequency, difficulty, startDate } = req.body;
        const userId = req.user.userId;

        // Added RETURNING to get the ID back (PostgreSQL specific)
        const result = await pool.query(`
                INSERT INTO Habits
                (UserID, Name, Description, CategoryID, TargetValue, Unit, Frequency, Difficulty, StartDate)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING habitid AS "HabitID"
            `, [userId, name, description, categoryId, targetValue, unit, frequency, difficulty, startDate]);

        res.status(201).json({
            message: "Habit created successfully!",
            habitId: result.rows[0].HabitID // So the frontend knows the new ID
        });

    } catch (error) {
        console.log("Error creating habit:", error);
        res.status(500).json({ message: "Failed to create habit" });
    }
}

async function getHabits(req, res) {
    try {
        const pool = await connectDatabase();
        const userId = req.user.userId;

        const result = await pool.query(`
                SELECT 
                    habitid AS "HabitID", 
                    userid AS "UserID", 
                    name AS "Name", 
                    description AS "Description", 
                    categoryid AS "CategoryID", 
                    targetvalue AS "TargetValue", 
                    unit AS "Unit", 
                    frequency AS "Frequency", 
                    difficulty AS "Difficulty", 
                    startdate AS "StartDate", 
                    status AS "Status", 
                    createdat AS "CreatedAt"
                FROM Habits
                WHERE userid = $1
            `, [userId]);

        res.json(result.rows);

    } catch (error) {
        console.log("Error getting habits:", error);
        res.status(500).json({ message: "Failed to get habits" });
    }
}

async function updateHabit(req, res) {
    try {
        const pool = await connectDatabase();
        const habitId = req.params.id;
        const userId = req.user.userId;

        const { name, description, categoryId, targetValue, unit, frequency, difficulty, startDate, status } = req.body;

        await pool.query(`
                UPDATE Habits
                SET
                    name = $1,
                    description = $2,
                    categoryid = $3,
                    targetvalue = $4,
                    unit = $5,
                    frequency = $6,
                    difficulty = $7,
                    startdate = $8,
                    status = $9
                WHERE habitid = $10 AND userid = $11
            `, [name, description, categoryId, targetValue, unit, frequency, difficulty, startDate, status, habitId, userId]);

        res.json({ message: "Habit updated successfully!" });

    } catch (error) {
        console.log("Error updating habit:", error);
        res.status(500).json({ message: "Failed to update habit" });
    }
}

async function deleteHabit(req, res) {
    try {
        const pool = await connectDatabase();
        const habitId = req.params.id;
        const userId = req.user.userId;

        await pool.query(`
                DELETE FROM Habits
                WHERE habitid = $1 AND userid = $2
            `, [habitId, userId]);

        res.json({ message: "Habit deleted successfully!" });

    } catch (error) {
        console.log("Error deleting habit:", error);
        res.status(500).json({ message: "Failed to delete habit" });
    }
}

async function getHabitStreak(req, res) {
    try {
        const pool = await connectDatabase();
        const habitId = req.params.id;
        const userId = req.user.userId;

        const ownership = await pool.query(`
                SELECT habitid AS "HabitID"
                FROM Habits
                WHERE habitid = $1 AND userid = $2
            `, [habitId, userId]);

        if (ownership.rows.length === 0) {
            return res.status(403).json({ message: "You do not have access to this habit" });
        }

        const asOf = req.query.asOf || new Date().toISOString().slice(0, 10);

        // Fixed column names here to return them capitalized for the frontend
        const logs = await pool.query(`
                SELECT date AS "Date", status AS "Status"
                FROM HabitLogs
                WHERE habitid = $1 AND date <= $2
                ORDER BY date ASC
            `, [habitId, asOf]);

        const rows = logs.rows;

        let longestStreak = 0;
        let runningStreak = 0;
        let lastLoggedDate = null;
        let totalCompletedDays = 0;
        let previousDate = null;

        for (const row of rows) {
            const isMissed = row.Status === "Missed";

            if (row.Status === "Completed") {
                totalCompletedDays += 1;
            }

            if (!isMissed) {
                lastLoggedDate = row.Date;

                // We use new Date() to ensure Postgres date strings are parsed correctly
                if (previousDate !== null && isConsecutiveDay(new Date(previousDate), new Date(row.Date))) {
                    runningStreak += 1;
                } else {
                    runningStreak = 1;
                }
            } else {
                runningStreak = 0;
            }

            if (runningStreak > longestStreak) {
                longestStreak = runningStreak;
            }

            previousDate = row.Date;
        }

        let currentStreak = runningStreak;

        res.json({
            habitId: Number(habitId),
            asOf,
            currentStreak,
            longestStreak,
            lastLoggedDate,
            totalCompletedDays
        });

    } catch (error) {
        console.log("Error getting habit streak:", error);
        res.status(500).json({ message: "Failed to get habit streak" });
    }
}

module.exports = {
    createHabit,
    getHabits,
    updateHabit,
    deleteHabit,
    getHabitStreak
};