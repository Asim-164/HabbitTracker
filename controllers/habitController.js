const connectDatabase = require("../database/db");

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

module.exports = {
    createHabit,
    getHabits,
    updateHabit,
    deleteHabit
};