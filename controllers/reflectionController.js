const connectDatabase = require("../database/db");

async function createReflection(req, res) {
    try {
        const pool = await connectDatabase();

                const {
            date,
            mood,
            notes
        } = req.body;

        const userId = req.user.userId;

        await pool.request()
            .input("UserID", userId)
            .input("Date", date)
            .input("Mood", mood)
            .input("Notes", notes)
            .query(`
                INSERT INTO Reflections
                (
                    UserID,
                    Date,
                    Mood,
                    Notes
                )
                VALUES
                (
                    @UserID,
                    @Date,
                    @Mood,
                    @Notes
                )
            `);

        res.status(201).json({
            message: "Reflection created successfully!"
        });

    } catch (error) {
        console.log("Error creating reflection:", error);

        res.status(500).json({
            message: "Failed to create reflection"
        });
    }
}

async function getReflections(req, res) {
    try {
        const pool = await connectDatabase();

        const userId = req.user.userId;

        const result = await pool.request()
            .input("UserID", userId)
            .query(`
                SELECT *
                FROM Reflections
                WHERE UserID = @UserID
                ORDER BY Date DESC
            `);

        res.json(result.recordset);

    } catch (error) {
        console.log("Error getting reflections:", error);

        res.status(500).json({
            message: "Failed to get reflections"
        });
    }
}

async function updateReflection(req, res) {
    try {
        const pool = await connectDatabase();

        const reflectionId = req.params.id;
        const userId = req.user.userId;

        const {
            date,
            mood,
            notes
        } = req.body;

        await pool.request()
            .input("ReflectionID", reflectionId)
            .input("UserID", userId)
            .input("Date", date)
            .input("Mood", mood)
            .input("Notes", notes)
            .query(`
                UPDATE Reflections
                SET
                    Date = @Date,
                    Mood = @Mood,
                    Notes = @Notes
                WHERE ReflectionID = @ReflectionID AND UserID = @UserID
            `);

        res.json({
            message: "Reflection updated successfully!"
        });

    } catch (error) {
        console.log("Error updating reflection:", error);

        res.status(500).json({
            message: "Failed to update reflection"
        });
    }
}

async function deleteReflection(req, res) {
    try {
        const pool = await connectDatabase();

        const reflectionId = req.params.id;
        const userId = req.user.userId;

        await pool.request()
            .input("ReflectionID", reflectionId)
            .input("UserID", userId)
            .query(`
                DELETE FROM Reflections
                WHERE ReflectionID = @ReflectionID AND UserID = @UserID
            `);

        res.json({
            message: "Reflection deleted successfully!"
        });

    } catch (error) {
        console.log("Error deleting reflection:", error);

        res.status(500).json({
            message: "Failed to delete reflection"
        });
    }
}

module.exports = {
    createReflection,
    getReflections,
    updateReflection,
    deleteReflection
};