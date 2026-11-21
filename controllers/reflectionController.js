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

        await pool.query(`
                INSERT INTO Reflections
                (
                    userid,
                    date,
                    mood,
                    notes
                )
                VALUES
                (
                    $1, $2, $3, $4
                )
            `, [userId, date, mood, notes]);

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

        const result = await pool.query(`
                SELECT 
                    reflectionid AS "ReflectionID",
                    userid AS "UserID",
                    TO_CHAR(date, 'YYYY-MM-DD') AS "Date",
                    mood AS "Mood",
                    notes AS "Notes",
                    createdat AS "CreatedAt"
                FROM Reflections
                WHERE userid = $1
                ORDER BY date DESC
            `, [userId]);

        res.json(result.rows);

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

        await pool.query(`
                UPDATE Reflections
                SET
                    date = $1,
                    mood = $2,
                    notes = $3
                WHERE reflectionid = $4 AND userid = $5
            `, [date, mood, notes, reflectionId, userId]);

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

        await pool.query(`
                DELETE FROM Reflections
                WHERE reflectionid = $1 AND userid = $2
            `, [reflectionId, userId]);

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