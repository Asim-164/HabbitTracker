const connectDatabase = require("../database/db");

function deriveStatus (targetValue, actualValue, clientStatus) {
    if (targetValue === null || targetValue === undefined || Number(targetValue) === 0) {
        return clientStatus;
    }

    const actual = Number(actualValue ?? 0);
    const target = Number(targetValue);

    if(actual <= 0) {
        return "Missed"
    }

    if (actual >= target) {
        return "Completed"
    }

    return "Partial";
}

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

        // 1. Check ownership
        const ownership = await pool.query(`
                SELECT habitid AS "HabitID", targetvalue AS "TargetValue"
                FROM Habits
                WHERE habitid = $1 AND userid = $2
            `, [habitId, userId]);

        if (ownership.rows.length === 0) {
            return res.status(403).json({
                message: "You do not have access to this habit"
            });
        }

        const targetValue = ownership.rows[0].TargetValue;
        const finalStatus = deriveStatus(targetValue, actualValue, status);

        // 2. Insert log
        await pool.query(`
                INSERT INTO HabitLogs
                (
                    habitid,
                    date,
                    status,
                    actualvalue,
                    notes
                )
                VALUES
                (
                    $1, $2, $3, $4, $5
                )
            `, [habitId, date, finalStatus, actualValue, notes]);

        res.status(201).json({
            message: "Habit log created successfully!"
        });

    } catch (error) {
        console.log("Error creating habit log:", error);

        // 3. PostgreSQL unique violation error code is 23505 (not 2627)
        if (error.code === '23505') {
            const { habitId, date } = req.body;
            
            try {
                const existing = await connectDatabase().then((pool) => 
                    pool.query(`
                        SELECT logid AS "LogID"
                        FROM HabitLogs
                        WHERE habitid = $1 AND date = $2
                    `, [habitId, date])
                );

                return res.status(409).json({
                    message: "This habit already has a log for that date",
                    existingLogId: existing.rows[0]?.LogID ?? null
                });
            } catch (dbError) {
                console.log("Error fetching existing log:", dbError);
            }
        }

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

        // 1. Check ownership
        const ownership = await pool.query(`
                SELECT habitid
                FROM Habits
                WHERE habitid = $1 AND userid = $2
            `, [habitId, userId]);

        if (ownership.rows.length === 0) {
            return res.status(403).json({
                message: "You do not have access to this habit"
            });
        }

        // 2. Fetch logs and alias the dates safely
        const result = await pool.query(`
                SELECT 
                    logid AS "LogID",
                    habitid AS "HabitID",
                    TO_CHAR(date, 'YYYY-MM-DD') AS "Date",
                    status AS "Status",
                    actualvalue AS "ActualValue",
                    notes AS "Notes",
                    createdat AS "CreatedAt"
                FROM HabitLogs
                WHERE habitid = $1
                ORDER BY date DESC
            `, [habitId]);

        res.json(result.rows);

    } catch (error) {
        console.log("Error getting habit logs:", error);
        res.status(500).json({ message: "Failed to get habit logs" });
    }
}

async function updateHabitLog(req, res) {
    try {
        const pool = await connectDatabase();

        const logId = req.params.id;
        const userId = req.user.userId;

        const { date, status, actualValue, notes } = req.body;

        // 1. Check ownership (using JOIN)
        const ownership = await pool.query(`
                SELECT hl.logid, h.targetvalue
                FROM HabitLogs hl
                JOIN Habits h ON h.habitid = hl.habitid
                WHERE hl.logid = $1 AND h.userid = $2
            `, [logId, userId]);

        if (ownership.rows.length === 0) {
            return res.status(403).json({
                message: "You do not have access to this habit log"
            });
        }

        const targetValue = ownership.rows[0].targetvalue;
        const finalStatus = deriveStatus(targetValue, actualValue, status);

        // 2. Update log
        await pool.query(`
                UPDATE HabitLogs
                SET
                    date = $1,
                    status = $2,
                    actualvalue = $3,
                    notes = $4
                WHERE logid = $5
            `, [date, finalStatus, actualValue, notes, logId]);

        res.json({
            message: "Habit log updated successfully!"
        });

    } catch (error) {
        console.log("Error updating habit log:", error);
        res.status(500).json({ message: "Failed to update habit log" });
    }
}

async function deleteHabitLog(req, res) {
    try {
        const pool = await connectDatabase();

        const logId = req.params.id;
        const userId = req.user.userId;

        // 1. Check ownership
        const ownership = await pool.query(`
                SELECT hl.logid
                FROM HabitLogs hl
                JOIN Habits h ON h.habitid = hl.habitid
                WHERE hl.logid = $1 AND h.userid = $2
            `, [logId, userId]);

        if (ownership.rows.length === 0) {
            return res.status(403).json({
                message: "You do not have access to this habit log"
            });
        }

        // 2. Delete
        await pool.query(`
                DELETE FROM HabitLogs
                WHERE logid = $1
            `, [logId]);

        res.json({
            message: "Habit log deleted successfully!"
        });

    } catch (error) {
        console.log("Error deleting habit log:", error);
        res.status(500).json({ message: "Failed to delete habit log" });
    }
}

module.exports = {
    createHabitLog,
    getHabitLogs,
    updateHabitLog,
    deleteHabitLog
};