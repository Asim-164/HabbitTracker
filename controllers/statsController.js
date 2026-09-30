const connectDatabase = require("../database/db");
const { toDateString, daysBetweenInclusive, isConsecutiveDay, parseRange } = require("../utils/dateHelpers");

async function getSummary(req, res) {
    try {
        const range = parseRange(req.query);

        if (range.error) {
            return res.status(400).json({
                message: range.error
            });
        }

        const { from, to, daysInRange } = range;

        const pool = await connectDatabase();
        const userId = req.user.userId;

        const habitsResult = await pool.request()
            .input("UserID", userId)
            .query(`
                SELECT HabitID, Name, Unit, TargetValue, Frequency, Status
                FROM Habits
                WHERE UserID = @UserID AND Status = 'Active'
                ORDER BY HabitID ASC
            `);

        const logsResult = await pool.request()
            .input("UserID", userId)
            .input("From", from)
            .input("To", to)
            .query(`
                SELECT hl.HabitID, hl.Date, hl.Status, hl.ActualValue
                FROM HabitLogs hl
                JOIN Habits h ON h.HabitID = hl.HabitID
                WHERE h.UserID = @UserID
                    AND hl.Date >= @From
                    AND hl.Date <= @To
                ORDER BY hl.HabitID ASC, hl.Date ASC
            `);

        const logsByHabit = new Map();
        for (const log of logsResult.recordset) {
            if (!logsByHabit.has(log.HabitID)) {
                logsByHabit.set(log.HabitID, []);
            }
            logsByHabit.get(log.HabitID).push(log);
        }

        const habits = [];
        let overallLogs = 0;
        let overallCompleted = 0;
        let overallPartial = 0;
        let overallMissed = 0;

        for (const habit of habitsResult.recordset) {
            const logs = logsByHabit.get(habit.HabitID) || [];

            let completedCount = 0;
            let partialCount = 0;
            let missedCount = 0;
            let totalActual = 0;

            for (const log of logs) {
                if (log.Status === "Completed") completedCount += 1;
                else if (log.Status === "Partial") partialCount += 1;
                else if (log.Status === "Missed") missedCount += 1;

                totalActual += Number(log.ActualValue ?? 0);
            }

            const logsInRange = logs.length;
            const totalTarget = habit.TargetValue === null
                ? null
                : Number(habit.TargetValue) * daysInRange;

            const completionRate = logsInRange === 0
                ? null
                : completedCount / logsInRange;

            const consistencyRate = daysInRange === 0
                ? null
                : logsInRange / daysInRange;

            habits.push({
                habitId: habit.HabitID,
                name: habit.Name,
                unit: habit.Unit,
                targetValue: habit.TargetValue === null ? null : Number(habit.TargetValue),
                frequency: habit.Frequency,
                status: habit.Status,
                logsInRange,
                completedCount,
                partialCount,
                missedCount,
                totalActual,
                totalTarget,
                completionRate,
                consistencyRate
            });

            overallLogs += logsInRange;
            overallCompleted += completedCount;
            overallPartial += partialCount;
            overallMissed += missedCount;
        }

        const overall = {
            habitsTracked: habits.length,
            totalLogs: overallLogs,
            completedCount: overallCompleted,
            partialCount: overallPartial,
            missedCount: overallMissed,
            completionRate: overallLogs === 0
                ? null
                : overallCompleted / overallLogs,
            consistencyRate: daysInRange === 0
                ? null
                : overallLogs / (daysInRange * habits.length)
        };

        res.json({
            from,
            to,
            daysInRange,
            overall,
            habits
        });
        
      } catch (error) {
        console.log("Error getting stats summary:", error);

        res.status(500).json({
            message: "Failed to get stats summary"
        });
    }
}

async function getCalendar(req, res) {
    try {
        const habitId = req.query.habitId;

        if (!habitId) {
            return res.status(400).json({
                message: "habitId is required"
            });
        }

        const month = req.query.month || toDateString(new Date()).slice(0, 7);

        if (!/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({
                message: "month must be in YYYY-MM format"
            });
        }

               const [yearStr, monthStr] = month.split("-");
        const year = Number(yearStr);
        const monthIndex = Number(monthStr) - 1;

        const firstDay = new Date(Date.UTC(year, monthIndex, 1));
        const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));

        const from = toDateString(firstDay);
        const to = toDateString(lastDay);

        const pool = await connectDatabase();
        const userId = req.user.userId;

        const habitResult = await pool.request()
            .input("HabitID", habitId)
            .input("UserID", userId)
            .query(`
                SELECT HabitID, Name, Unit, TargetValue
                FROM Habits
                WHERE HabitID = @HabitID AND UserID = @UserID
            `);

        if (habitResult.recordset.length === 0) {
            return res.status(403).json({
                message: "You do not have access to this habit"
            });
        }

        const habit = habitResult.recordset[0];

        const logsResult = await pool.request()
            .input("HabitID", habitId)
            .input("From", from)
            .input("To", to)
            .query(`
                SELECT Date, Status, ActualValue
                FROM HabitLogs
                WHERE HabitID = @HabitID
                    AND Date >= @From
                    AND Date <= @To
            `);

        const logsByDate = new Map();
        for (const log of logsResult.recordset) {
            logsByDate.set(toDateString(log.Date), log);
        }

        const days = [];
        const daysInMonth = lastDay.getUTCDate();

        for (let day = 1; day <= daysInMonth; day += 1) {
            const dateObj = new Date(Date.UTC(year, monthIndex, day));
            const dateStr = toDateString(dateObj);
            const log = logsByDate.get(dateStr);

            if (log) {
                days.push({
                    date: dateStr,
                    status: log.Status,
                    actualValue: Number(log.ActualValue ?? 0)
                });
            } else {
                days.push({
                    date: dateStr,
                    status: null,
                    actualValue: null
                });
            }
        }

        res.json({
            month,
            habitId: habit.HabitID,
            habitName: habit.Name,
            unit: habit.Unit,
            targetValue: habit.TargetValue === null ? null : Number(habit.TargetValue),
            days
        });

    } catch (error) {
        console.log("Error getting stats calendar:", error);

        res.status(500).json({
            message: "Failed to get stats calendar"
        });
    }
}

async function getHabitStats(req, res) {
    try {
        const habitId = req.params.id;

        const range = parseRange(req.query);

        if (range.error) {
            return res.status(400).json({
                message: range.error
            });
        }

        const { from, to, daysInRange } = range;

        const asOf = req.query.asOf || toDateString(new Date());

        const pool = await connectDatabase();
        const userId = req.user.userId;

        const habitResult = await pool.request()
            .input("HabitID", habitId)
            .input("UserID", userId)
            .query(`
                SELECT HabitID, Name, Unit, TargetValue, Frequency, Status
                FROM Habits
                WHERE HabitID = @HabitID AND UserID = @UserID
            `);

        if (habitResult.recordset.length === 0) {
            return res.status(403).json({
                message: "You do not have access to this habit"
            });
        }

        const habit = habitResult.recordset[0];

        const rangeLogs = await pool.request()
            .input("HabitID", habitId)
            .input("From", from)
            .input("To", to)
            .query(`
                SELECT Status, ActualValue
                FROM HabitLogs
                WHERE HabitID = @HabitID
                    AND Date >= @From
                    AND Date <= @To
            `);

        let completedCount = 0;
        let partialCount = 0;
        let missedCount = 0;
        let totalActual = 0;

        for (const log of rangeLogs.recordset) {
            if (log.Status === "Completed") completedCount += 1;
            else if (log.Status === "Partial") partialCount += 1;
            else if (log.Status === "Missed") missedCount += 1;

            totalActual += Number(log.ActualValue ?? 0);
        }

        const logsInRange = rangeLogs.recordset.length;
        const totalTarget = habit.TargetValue === null
            ? null
            : Number(habit.TargetValue) * daysInRange;

        const completionRate = logsInRange === 0
            ? null
            : completedCount / logsInRange;

        const consistencyRate = daysInRange === 0
            ? null
            : logsInRange / daysInRange;

        const streakLogs = await pool.request()
            .input("HabitID", habitId)
            .input("AsOf", asOf)
            .query(`
                SELECT Date, Status
                FROM HabitLogs
                WHERE HabitID = @HabitID AND Date <= @AsOf
                ORDER BY Date ASC
            `);

        let runningStreak = 0;
        let longestStreak = 0;
        let lastLoggedDate = null;
        let previousDate = null;

        for (const row of streakLogs.recordset) {
            const isMissed = row.Status === "Missed";

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

        res.json({
            habitId: habit.HabitID,
            name: habit.Name,
            unit: habit.Unit,
            targetValue: habit.TargetValue === null ? null : Number(habit.TargetValue),
            frequency: habit.Frequency,
            status: habit.Status,
            range: {
                from,
                to,
                daysInRange,
                logsInRange,
                completedCount,
                partialCount,
                missedCount,
                totalActual,
                totalTarget,
                completionRate,
                consistencyRate
            },
            streak: {
                asOf,
                currentStreak: runningStreak,
                longestStreak,
                lastLoggedDate
            }
        });

    } catch (error) {
        console.log("Error getting habit stats:", error);

        res.status(500).json({
            message: "Failed to get habit stats"
        });
    }
}

module.exports = {
    getSummary,
    getCalendar,
    getHabitStats
};