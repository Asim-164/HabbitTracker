const connectDatabase = require("../database/db");
const { isConsecutiveDay } = require("../utils/dateHelpers");

async function createHabit(req, res) {
    try {
        const pool = await connectDatabase();

        const { name, description, categoryId, targetValue, unit, frequency, difficulty, startDate } = req.body;

        const userId = req.user.userId;

        const result = await pool.request()
            .input("UserID", userId)
            .input("Name", name)
            .input("Description", description)
            .input("CategoryID", categoryId)
            .input("TargetValue", targetValue)
            .input("Unit", unit)
            .input("Frequency", frequency)
            .input("Difficulty", difficulty)
            .input("StartDate", startDate)
            .query(`
                INSERT INTO Habits
                (
                    UserID,
                    Name,
                    Description,
                    CategoryID,
                    TargetValue,
                    Unit,
                    Frequency,
                    Difficulty,
                    StartDate
                )
                VALUES
                (
                    @UserID,
                    @Name,
                    @Description,
                    @CategoryID,
                    @TargetValue,
                    @Unit,
                    @Frequency,
                    @Difficulty,
                    @StartDate
                )
            `);

        res.status(201).json({
            message: "Habit created successfully!"
        });

    } catch (error) {
        console.log("Error creating habit:", error);

        res.status(500).json({
            message: "Failed to create habit"
        });
    }
}

async function getHabits(req, res) {
    try {
        const pool = await connectDatabase();

        const userId = req.user.userId;

        const result = await pool.request()
            .input("UserID", userId)
            .query(`
                SELECT *
                FROM Habits
                WHERE UserID = @UserID
            `);

        res.json(result.recordset);

    } catch (error) {
        console.log("Error getting habits:", error);

        res.status(500).json({
            message: "Failed to get habits"
        });
    }
}

async function updateHabit(req, res) {
    try {
        const pool = await connectDatabase();

        const habitId = req.params.id;
        const userId = req.user.userId;

        const {
            name,
            description,
            categoryId,
            targetValue,
            unit,
            frequency,
            difficulty,
            startDate,
            status
        } = req.body;

        await pool.request()
            .input("HabitID", habitId)
            .input("UserID", userId)
            .input("Name", name)
            .input("Description", description)
            .input("CategoryID", categoryId)
            .input("TargetValue", targetValue)
            .input("Unit", unit)
            .input("Frequency", frequency)
            .input("Difficulty", difficulty)
            .input("StartDate", startDate)
            .input("Status", status)
            .query(`
                UPDATE Habits
                SET
                    Name = @Name,
                    Description = @Description,
                    CategoryID = @CategoryID,
                    TargetValue = @TargetValue,
                    Unit = @Unit,
                    Frequency = @Frequency,
                    Difficulty = @Difficulty,
                    StartDate = @StartDate,
                    Status = @Status
                    WHERE HabitID = @HabitID AND UserID = @UserID
            `);

        res.json({
            message: "Habit updated successfully!"
        });

    } catch (error) {
        console.log("Error updating habit:", error);

        res.status(500).json({
            message: "Failed to update habit"
        });
    }
}

async function deleteHabit(req, res) {
    try {
        const pool = await connectDatabase();
        
        const habitId = req.params.id;
        const userId = req.user.userId;

        await pool.request()
            .input("HabitID", habitId)
            .input("UserID", userId)
            .query(`
                DELETE FROM Habits
                WHERE HabitID = @HabitID AND UserID = @UserID
            `);

        res.json({
            message: "Habit deleted successfully!"
        });

    } catch (error) {
        console.log("Error deleting habit:", error);

        res.status(500).json({
            message: "Failed to delete habit"
        });
    }
}

async function getHabitStreak(req, res) {
    try {
        const pool = await connectDatabase();

        const habitId = req.params.id;
        const userId = req.user.userId;

        const ownership = await pool.request()
            .input("HabitID", habitId)
            .input("UserID", userId)
            .query(`
                SELECT HabitID
                FROM Habits
                WHERE HabitID = @HabitID AND UserID = @UserID
            `);

        if (ownership.recordset.length === 0) {
            return res.status(403).json({
                message: "You do not have access to this habit"
            });
        }

        const asOf = req.query.asOf || new Date().toISOString().slice(0, 10);

        const logs = await pool.request()
            .input("HabitID", habitId)
            .input("AsOf", asOf)
            .query(`
                SELECT Date, Status
                FROM HabitLogs
                WHERE HabitID = @HabitID AND Date <= @AsOf
                ORDER BY Date ASC
            `);

        const rows = logs.recordset;

        let currentStreak = 0;
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

                if (previousDate !== null && isConsecutiveDay(previousDate, row.Date)) {
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

        currentStreak = runningStreak;

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

        res.status(500).json({
            message: "Failed to get habit streak"
        });
    }
}

module.exports = {
    createHabit,
    getHabits,
    updateHabit,
    deleteHabit,
    getHabitStreak
};
