const connectDatabase = require("../database/db");

async function createHabitLog(req, res) {
    try {
        const pool = await connectDatabase();

        const {
            habitId,
            date,
            status,
            actualValue,
            notes
        } = req.body;

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

        await pool.request()
            .input("HabitID", habitId)
            .input("Date", date)
            .input("Status", status)
            .input("ActualValue", actualValue)
            .input("Notes", notes)
            .query(`
                INSERT INTO HabitLogs
                (
                    HabitID,
                    Date,
                    Status,
                    ActualValue,
                    Notes
                )
                VALUES
                (
                    @HabitID,
                    @Date,
                    @Status,
                    @ActualValue,
                    @Notes
                )
            `);

        res.status(201).json({
            message: "Habit log created successfully!"
        });

    } catch (error) {
        console.log("Error creating habit log:", error);

        res.status(500).json({
            message: "Failed to create habit log"
        });
    }
}

async function getHabitLogs(req, res) {
    try {
        const pool = await connectDatabase();

        const habitId = req.query.habitId;
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

        const result = await pool.request()
            .input("HabitID", habitId)
            .query(`
                SELECT *
                FROM HabitLogs
                WHERE HabitID = @HabitID
                ORDER BY Date DESC
            `);

        res.json(result.recordset);

    } catch (error) {
        console.log("Error getting habit logs:", error);

        res.status(500).json({
            message: "Failed to get habit logs"
        });
    }
}

async function updateHabitLog(req, res) {
    try {
        const pool = await connectDatabase();

        const logId = req.params.id;
        const userId = req.user.userId;

        const {
            date,
            status,
            actualValue,
            notes
        } = req.body;

        const ownership = await pool.request()
            .input("LogID", logId)
            .input("UserID", userId)
            .query(`
                SELECT hl.LogID
                FROM HabitLogs hl
                JOIN Habits h ON h.HabitID = hl.HabitID
                WHERE hl.LogID = @LogID AND h.UserID = @UserID
            `);

        if (ownership.recordset.length === 0) {
            return res.status(403).json({
                message: "You do not have access to this habit log"
            });
        }

        await pool.request()
            .input("LogID", logId)
            .input("Date", date)
            .input("Status", status)
            .input("ActualValue", actualValue)
            .input("Notes", notes)
            .query(`
                UPDATE HabitLogs
                SET
                    Date = @Date,
                    Status = @Status,
                    ActualValue = @ActualValue,
                    Notes = @Notes
                WHERE LogID = @LogID
            `);

        res.json({
            message: "Habit log updated successfully!"
        });

    } catch (error) {
        console.log("Error updating habit log:", error);

        res.status(500).json({
            message: "Failed to update habit log"
        });
    }
}

async function deleteHabitLog(req, res) {
    try {
        const pool = await connectDatabase();

        const logId = req.params.id;
        const userId = req.user.userId;

        const ownership = await pool.request()
            .input("LogID", logId)
            .input("UserID", userId)
            .query(`
                SELECT hl.LogID
                FROM HabitLogs hl
                JOIN Habits h ON h.HabitID = hl.HabitID
                WHERE hl.LogID = @LogID AND h.UserID = @UserID
            `);

        if (ownership.recordset.length === 0) {
            return res.status(403).json({
                message: "You do not have access to this habit log"
            });
        }

        await pool.request()
            .input("LogID", logId)
            .query(`
                DELETE FROM HabitLogs
                WHERE LogID = @LogID
            `);

        res.json({
            message: "Habit log deleted successfully!"
        });

    } catch (error) {
        console.log("Error deleting habit log:", error);

        res.status(500).json({
            message: "Failed to delete habit log"
        });
    }
}


module.exports = {
    createHabitLog,
    getHabitLogs,
    updateHabitLog,
    deleteHabitLog
};