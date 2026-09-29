const connectDatabase = require("../database/db");

function toDateString(date) {
    return date.toISOString().slice(0, 10);
}

function daysBetweenInclusive(fromStr, toStr) {
    const from = new Date(fromStr);
    const to = new Date(toStr);
    const oneDay = 24 * 60 * 60 * 1000;

    return Math.round((to - from) / oneDay) + 1;
}

async function getSummary(req, res) {
    try {
        const today = toDateString(new Date());

        const to = req.query.to || today;
        const from = req.query.from || toDateString(
            new Date(new Date(to).getTime() - 6 * 24 * 60 * 60 * 1000)
        );

        if (from > to) {
            return res.status(400).json({
                message: "from must be <= to"
            });
        }

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

        const daysInRange = daysBetweenInclusive(from, to);

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

module.exports = {
    getSummary,
    getCalendar
};