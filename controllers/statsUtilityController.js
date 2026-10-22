const connectDatabase = require("../database/db");

async function getRecentActivity(req, res) {
    try {
        const pool = await connectDatabase();
        const userId = req.user.userId;

        const result = await pool.request()
            .input("UserID", userId)
            .query(`
                SELECT TOP 5
                    hl.LogID,
                    hl.Date,
                    hl.Status,
                    hl.ActualValue,
                    h.Name AS HabitName
                FROM HabitLogs hl
                JOIN Habits h ON h.HabitID = hl.HabitID
                WHERE h.UserID = @UserID
                ORDER BY hl.Date DESC, hl.LogID DESC
            `);

        res.json(result.recordset);
    } catch (error) {
        console.log("Error getting recent activity:", error);
        res.status(500).json({ message: "Failed to get recent activity" });
    }
}

async function searchAll(req, res) {
    try {
        const pool = await connectDatabase();
        const userId = req.user.userId;
        const q = (req.query.q || "").trim();

        if (q.length < 2) {
            return res.json({ habits: [], reflections: [] });
        }

        const searchTerm = `%${q}%`;

        const habitsResult = await pool.request()
            .input("UserID", userId)
            .input("Q", searchTerm)
            .query(`
                SELECT TOP 5 HabitID, Name, Status
                FROM Habits
                WHERE UserID = @UserID AND Name LIKE @Q
                ORDER BY HabitID DESC
            `);

        const reflectionsResult = await pool.request()
            .input("UserID", userId)
            .input("Q", searchTerm)
            .query(`
                SELECT TOP 5 ReflectionID, Date, Mood, Notes
                FROM Reflections
                WHERE UserID = @UserID 
                  AND (
                      Notes LIKE @Q 
                      OR Mood LIKE @Q 
                      OR CONVERT(VARCHAR(10), Date, 120) LIKE @Q
                  )
                ORDER BY Date DESC
            `);

        res.json({
            habits: habitsResult.recordset,
            reflections: reflectionsResult.recordset
        });

    } catch (error) {
        console.log("Error searching:", error);
        res.status(500).json({ message: "Search failed" });
    }
}

module.exports = {
    getRecentActivity,
    searchAll
};