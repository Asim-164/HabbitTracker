const connectDatabase = require("../database/db");

async function getRecentActivity(req, res) {
    try {
        const pool = await connectDatabase();
        const userId = req.user.userId;

        const result = await pool.query(`
                SELECT 
                    hl.logid AS "LogID",
                    TO_CHAR(hl.date, 'YYYY-MM-DD') AS "Date",
                    hl.status AS "Status",
                    hl.actualvalue AS "ActualValue",
                    h.name AS "HabitName"
                FROM HabitLogs hl
                JOIN Habits h ON h.habitid = hl.habitid
                WHERE h.userid = $1
                ORDER BY hl.date DESC, hl.logid DESC
                LIMIT 5
            `, [userId]);

        res.json(result.rows);
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

        const habitsResult = await pool.query(`
                SELECT habitid AS "HabitID", name AS "Name", status AS "Status"
                FROM Habits
                WHERE userid = $1 AND name ILIKE $2
                ORDER BY habitid DESC
                LIMIT 5
            `, [userId, searchTerm]);

        const reflectionsResult = await pool.query(`
                SELECT 
                    reflectionid AS "ReflectionID", 
                    TO_CHAR(date, 'YYYY-MM-DD') AS "Date", 
                    mood AS "Mood", 
                    notes AS "Notes"
                FROM Reflections
                WHERE userid = $1 
                  AND (
                      notes ILIKE $2 
                      OR mood ILIKE $2 
                      OR TO_CHAR(date, 'YYYY-MM-DD') ILIKE $2
                  )
                ORDER BY date DESC
                LIMIT 5
            `, [userId, searchTerm]);

        res.json({
            habits: habitsResult.rows,
            reflections: reflectionsResult.rows
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