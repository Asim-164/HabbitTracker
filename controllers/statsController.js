const connectDatabase = require("../database/db");
const { toDateString, daysBetweenInclusive, isConsecutiveDay, parseRange } = require("../utils/dateHelpers");

function isoWeekLabel(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

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

async function getReport(req, res) {
    try {
        const groupBy = req.query.groupBy || "week";

        if (groupBy !== "week" && groupBy !== "month") {
            return res.status(400).json({
                message: "groupBy must be 'week' or 'month'"
            });
        }

        const defaultPeriods = groupBy === "week" ? 8 : 6;
        const periods = req.query.periods ? Number(req.query.periods) : defaultPeriods;

        if (!Number.isInteger(periods) || periods < 1 || periods > 104) {
            return res.status(400).json({
                message: "periods must be a positive integer (max 104)"
            });
        }

        const now = new Date();

        const buckets = [];
        if (groupBy === "week") {
            const dayOfWeek = now.getUTCDay();
            const offsetToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            const thisMonday = new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() - offsetToMonday
            ));

            for (let i = periods - 1; i >= 0; i -= 1) {
                const start = new Date(thisMonday);
                start.setUTCDate(start.getUTCDate() - i * 7);
                const end = new Date(start);
                end.setUTCDate(end.getUTCDate() + 6);

                buckets.push({
                    start: toDateString(start),
                    end: toDateString(end)
                });
            }
        } else {
            for (let i = periods - 1; i >= 0; i -= 1) {
                const start = new Date(Date.UTC(
                    now.getUTCFullYear(),
                    now.getUTCMonth() - i,
                    1
                ));
                const end = new Date(Date.UTC(
                    now.getUTCFullYear(),
                    now.getUTCMonth() - i + 1,
                    0
                ));

                buckets.push({
                    start: toDateString(start),
                    end: toDateString(end)
                });
            }
        }

        const from = buckets[0].start;
        const to = buckets[buckets.length - 1].end;

        const pool = await connectDatabase();
        const userId = req.user.userId;

        const logsResult = await pool.request()
            .input("UserID", userId)
            .input("From", from)
            .input("To", to)
            .query(`
                SELECT hl.HabitID, hl.Date, hl.Status, hl.ActualValue
                FROM HabitLogs hl
                JOIN Habits h ON h.HabitID = hl.HabitID
                WHERE h.UserID = @UserID
                    AND h.Status = 'Active'
                    AND hl.Date >= @From
                    AND hl.Date <= @To
                ORDER BY hl.Date ASC
            `);

        const rows = buckets.map((bucket) => ({
            periodLabel: null,
            periodStart: bucket.start,
            periodEnd: bucket.end,
            daysInPeriod: daysBetweenInclusive(bucket.start, bucket.end),
            totalLogs: 0,
            completedCount: 0,
            partialCount: 0,
            missedCount: 0,
            totalActual: 0,
            totalTarget: 0,
            completionRate: null,
            consistencyRate: null,
            _habitsWithLogs: new Set()
        }));

        const habitsResult = await pool.request()
            .input("UserID", userId)
            .query(`
                SELECT HabitID, TargetValue
                FROM Habits
                WHERE UserID = @UserID AND Status = 'Active'
            `);

        const targetByHabit = new Map();
        for (const habit of habitsResult.recordset) {
            targetByHabit.set(habit.HabitID, habit.TargetValue);
        }

        for (const log of logsResult.recordset) {
            const logDate = toDateString(log.Date);

            const row = rows.find((r) =>
                logDate >= r.periodStart && logDate <= r.periodEnd
            );

            if (!row) continue;

            row.totalLogs += 1;
            if (log.Status === "Completed") row.completedCount += 1;
            else if (log.Status === "Partial") row.partialCount += 1;
            else if (log.Status === "Missed") row.missedCount += 1;

            row.totalActual += Number(log.ActualValue ?? 0);
            row._habitsWithLogs.add(log.HabitID);
        }

        for (const row of rows) {
            const habitsWithLogs = row._habitsWithLogs.size;

            let targetSum = 0;
            for (const habitId of row._habitsWithLogs) {
                const targetValue = targetByHabit.get(habitId);
                if (targetValue !== null && targetValue !== undefined) {
                    targetSum += Number(targetValue);
                }
            }
            row.totalTarget = targetSum === 0 ? 0 : targetSum * row.daysInPeriod;

            row.completionRate = row.totalLogs === 0
                ? null
                : row.completedCount / row.totalLogs;

            row.consistencyRate = habitsWithLogs === 0
                ? null
                : row.totalLogs / (row.daysInPeriod * habitsWithLogs);

            if (groupBy === "week") {
                row.periodLabel = isoWeekLabel(new Date(row.periodStart));
            } else {
                row.periodLabel = row.periodStart.slice(0, 7);
            }

            delete row._habitsWithLogs;
        }

        res.json({
            groupBy,
            periods,
            from,
            to,
            rows
        });

    } catch (error) {
        console.log("Error getting stats report:", error);

        res.status(500).json({
            message: "Failed to get stats report"
        });
    }
}

module.exports = {
    getSummary,
    getCalendar,
    getHabitStats,
    getReport
};
