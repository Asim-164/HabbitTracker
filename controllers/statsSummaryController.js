const connectDatabase = require("../database/db");
const { toDateString, daysBetweenInclusive, isConsecutiveDay, parseRange } = require("../utils/dateHelpers");
const { isoWeekLabel } = require("../utils/statsHelpers");

async function getSummary(req, res) {
    try {
        const range = parseRange(req.query);

        if (range.error) {
            return res.status(400).json({ message: range.error });
        }

        const { from, to, daysInRange } = range;

        const pool = await connectDatabase();
        const userId = req.user.userId;

        const habitsResult = await pool.request()
            .input("UserID", userId)
            .query(`
                SELECT HabitID, Name, Unit, TargetValue, Frequency, Status, StartDate
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
            if (!logsByHabit.has(log.HabitID)) logsByHabit.set(log.HabitID, []);
            logsByHabit.get(log.HabitID).push(log);
        }

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

        const habits = [];
        let overallCompleted = 0;
        let overallPartial = 0;
        let overallMissed = 0;
        let overallActual = 0;
        let overallDaysExpected = 0;

        for (const habit of habitsResult.recordset) {
            const logs = logsByHabit.get(habit.HabitID) || [];
            const habitStartDate = habit.StartDate ? toDateString(new Date(habit.StartDate)) : from;
            const walkStart = habitStartDate > from ? habitStartDate : from;

            if (walkStart > to) {
                habits.push({
                    habitId: habit.HabitID,
                    name: habit.Name,
                    unit: habit.Unit,
                    targetValue: habit.TargetValue === null ? null : Number(habit.TargetValue),
                    frequency: habit.Frequency,
                    status: habit.Status,
                    logsInRange: 0,
                    completedCount: 0,
                    partialCount: 0,
                    missedCount: 0,
                    totalActual: 0,
                    totalTarget: habit.TargetValue === null ? null : 0,
                    completionRate: null,
                    consistencyRate: null
                });
                continue;
            }

            const loggedDates = new Set();
            let completed = 0;
            let partial = 0;
            let missed = 0;
            let totalActual = 0;

            for (const log of logs) {
                loggedDates.add(toDateString(new Date(log.Date)));
                if (log.Status === "Completed") completed += 1;
                else if (log.Status === "Partial") partial += 1;
                else if (log.Status === "Missed") missed += 1;
                totalActual += Number(log.ActualValue ?? 0);
            }

            const oneDay = 24 * 60 * 60 * 1000;
            let cursor = new Date(walkStart + "T00:00:00Z");
            const endDate = new Date(to + "T00:00:00Z");
            let daysExpected = 0;

            while (cursor <= endDate) {
                const dateStr = toDateString(cursor);
                if (dateStr > todayStr) {
                    cursor = new Date(cursor.getTime() + oneDay);
                    continue;
                }
                daysExpected += 1;
                if (!loggedDates.has(dateStr)) missed += 1;
                cursor = new Date(cursor.getTime() + oneDay);
            }

            const totalTarget = habit.TargetValue === null
                ? null
                : Number(habit.TargetValue) * daysExpected;

            const totalEffective = completed + partial + missed;
            const completionRate = totalEffective === 0 ? null : completed / totalEffective;
            const consistencyRate = daysExpected === 0 ? null : logs.length / daysExpected;

            habits.push({
                habitId: habit.HabitID,
                name: habit.Name,
                unit: habit.Unit,
                targetValue: habit.TargetValue === null ? null : Number(habit.TargetValue),
                frequency: habit.Frequency,
                status: habit.Status,
                logsInRange: totalEffective,
                completedCount: completed,
                partialCount: partial,
                missedCount: missed,
                totalActual,
                totalTarget,
                completionRate,
                consistencyRate
            });

            overallCompleted += completed;
            overallPartial += partial;
            overallMissed += missed;
            overallActual += totalActual;
            overallDaysExpected += daysExpected;
        }

        const overallEffective = overallCompleted + overallPartial + overallMissed;

        const overall = {
            habitsTracked: habits.length,
            totalLogs: overallEffective,
            completedCount: overallCompleted,
            partialCount: overallPartial,
            missedCount: overallMissed,
            completionRate: overallEffective === 0 ? null : overallCompleted / overallEffective,
            consistencyRate: overallDaysExpected === 0
                ? null
                : (overallCompleted + overallPartial) / overallDaysExpected
        };

        res.json({ from, to, daysInRange, overall, habits });

    } catch (error) {
        console.log("Error getting stats summary:", error);
        res.status(500).json({ message: "Failed to get stats summary" });
    }
}

async function getCalendar(req, res) {
    try {
        const habitId = req.query.habitId;

        if (!habitId) {
            return res.status(400).json({ message: "habitId is required" });
        }

        const month = req.query.month || toDateString(new Date()).slice(0, 7);

        if (!/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ message: "month must be in YYYY-MM format" });
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
                SELECT HabitID, Name, Unit, TargetValue, StartDate
                FROM Habits
                WHERE HabitID = @HabitID AND UserID = @UserID
            `);

        if (habitResult.recordset.length === 0) {
            return res.status(403).json({ message: "You do not have access to this habit" });
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

        const habitStartDate = habit.StartDate ? toDateString(new Date(habit.StartDate)) : from;

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

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
            } else if (dateStr >= habitStartDate && dateStr < todayStr) {
                days.push({ date: dateStr, status: "Missed", actualValue: 0 });
            } else {
                days.push({ date: dateStr, status: null, actualValue: null });
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
        res.status(500).json({ message: "Failed to get stats calendar" });
    }
}

async function getHabitStats(req, res) {
    try {
        const habitId = req.params.id;

        const range = parseRange(req.query);

        if (range.error) {
            return res.status(400).json({ message: range.error });
        }

        const { from, to, daysInRange } = range;
        const useBackfill = !!(req.query.from && req.query.to);

        const asOf = req.query.asOf || toDateString(new Date());

        const pool = await connectDatabase();
        const userId = req.user.userId;

        const habitResult = await pool.request()
            .input("HabitID", habitId)
            .input("UserID", userId)
            .query(`
                SELECT HabitID, Name, Unit, TargetValue, Frequency, Status, StartDate
                FROM Habits
                WHERE HabitID = @HabitID AND UserID = @UserID
            `);

        if (habitResult.recordset.length === 0) {
            return res.status(403).json({ message: "You do not have access to this habit" });
        }

        const habit = habitResult.recordset[0];

        const rangeLogs = await pool.request()
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

        let logsInRange = rangeLogs.recordset.length;

        if (useBackfill) {
            const habitStartDate = habit.StartDate ? toDateString(new Date(habit.StartDate)) : from;
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

            const loggedDates = new Set();
            for (const log of rangeLogs.recordset) {
                loggedDates.add(toDateString(new Date(log.Date)));
            }

            const walkStart = habitStartDate > from ? habitStartDate : from;
            let backfilledMisses = 0;

            if (walkStart <= to) {
                const oneDay = 24 * 60 * 60 * 1000;
                let cursor = new Date(walkStart + "T00:00:00Z");
                const endDate = new Date(to + "T00:00:00Z");

                while (cursor <= endDate) {
                    const dateStr = toDateString(cursor);
                    if (!loggedDates.has(dateStr) && dateStr < todayStr) {
                        backfilledMisses++;
                        missedCount++;
                    }
                    cursor = new Date(cursor.getTime() + oneDay);
                }
            }

            logsInRange = rangeLogs.recordset.length + backfilledMisses;
        }

        const totalTarget = habit.TargetValue === null ? null : Number(habit.TargetValue) * daysInRange;
        const completionRate = logsInRange === 0 ? null : completedCount / logsInRange;
        const consistencyRate = daysInRange === 0 ? null : logsInRange / daysInRange;

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

            if (runningStreak > longestStreak) longestStreak = runningStreak;
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
                from, to, daysInRange, logsInRange,
                completedCount, partialCount, missedCount,
                totalActual, totalTarget, completionRate, consistencyRate
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
        res.status(500).json({ message: "Failed to get habit stats" });
    }
}

async function getReport(req, res) {
    try {
        const groupBy = req.query.groupBy || "week";

        if (groupBy !== "week" && groupBy !== "month") {
            return res.status(400).json({ message: "groupBy must be 'week' or 'month'" });
        }

        const defaultPeriods = groupBy === "week" ? 8 : 6;
        const periods = req.query.periods ? Number(req.query.periods) : defaultPeriods;

        if (!Number.isInteger(periods) || periods < 1 || periods > 104) {
            return res.status(400).json({ message: "periods must be a positive integer (max 104)" });
        }

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

        const buckets = [];
        if (groupBy === "week") {
            const dayOfWeek = now.getUTCDay();
            const offsetToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offsetToMonday));

            for (let i = periods - 1; i >= 0; i -= 1) {
                const start = new Date(thisMonday);
                start.setUTCDate(start.getUTCDate() - i * 7);
                const end = new Date(start);
                end.setUTCDate(end.getUTCDate() + 6);
                buckets.push({ start: toDateString(start), end: toDateString(end), label: isoWeekLabel(start) });
            }
        } else {
            for (let i = periods - 1; i >= 0; i -= 1) {
                const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
                const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0));
                buckets.push({ start: toDateString(start), end: toDateString(end), label: toDateString(start).slice(0, 7) });
            }
        }

        const from = buckets[0].start;
        const to = buckets[buckets.length - 1].end;

        const pool = await connectDatabase();
        const userId = req.user.userId;

        const habitsResult = await pool.request()
            .input("UserID", userId)
            .query(`SELECT HabitID, TargetValue, StartDate FROM Habits WHERE UserID = @UserID AND Status = 'Active'`);

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
            `);

        const logsByHabit = new Map();
        for (const log of logsResult.recordset) {
            if (!logsByHabit.has(log.HabitID)) logsByHabit.set(log.HabitID, []);
            logsByHabit.get(log.HabitID).push(log);
        }

        const oneDay = 24 * 60 * 60 * 1000;
        const rows = [];

        for (const bucket of buckets) {
            const isInProgress = todayStr >= bucket.start && todayStr <= bucket.end;
            let totalLogs = 0, completedCount = 0, partialCount = 0, missedCount = 0, totalActual = 0, totalTarget = 0;

            for (const habit of habitsResult.recordset) {
                const habitStart = habit.StartDate ? toDateString(new Date(habit.StartDate)) : bucket.start;
                if (habitStart > bucket.end) continue;

                const walkStart = habitStart > bucket.start ? habitStart : bucket.start;
                const walkEndDate = isInProgress && todayStr < bucket.end ? todayStr : bucket.end;
                const walkEnd = walkEndDate > bucket.end ? bucket.end : walkEndDate;
                if (walkStart > walkEnd) continue;

                let daysExpected = 0;
                let cursor = new Date(walkStart + "T00:00:00Z");
                const endDate = new Date(walkEnd + "T00:00:00Z");
                while (cursor <= endDate) {
                    daysExpected += 1;
                    cursor = new Date(cursor.getTime() + oneDay);
                }
                if (daysExpected === 0) continue;

                const habitLogs = logsByHabit.get(habit.HabitID) || [];
                const bucketLogs = habitLogs.filter(l => {
                    const d = toDateString(new Date(l.Date));
                    return d >= walkStart && d <= walkEnd;
                });

                let hCompleted = 0, hPartial = 0, hMissedReal = 0, hActual = 0;
                for (const log of bucketLogs) {
                    if (log.Status === "Completed") hCompleted += 1;
                    else if (log.Status === "Partial") hPartial += 1;
                    else if (log.Status === "Missed") hMissedReal += 1;
                    hActual += Number(log.ActualValue ?? 0);
                }

                const hBackfilledMisses = Math.max(0, daysExpected - bucketLogs.length);

                completedCount += hCompleted;
                partialCount += hPartial;
                missedCount += hMissedReal + hBackfilledMisses;
                totalLogs += hCompleted + hPartial + hMissedReal + hBackfilledMisses;
                totalActual += hActual;

                if (habit.TargetValue !== null) {
                    totalTarget += Number(habit.TargetValue) * daysExpected;
                }
            }

            const completionRate = totalLogs === 0 ? null : completedCount / totalLogs;
            const consistencyRate = (() => {
                let totalDaysExpected = 0;
                for (const habit of habitsResult.recordset) {
                    const habitStart = habit.StartDate ? toDateString(new Date(habit.StartDate)) : bucket.start;
                    if (habitStart > bucket.end) continue;
                    const walkStart = habitStart > bucket.start ? habitStart : bucket.start;
                    const walkEndDate = isInProgress && todayStr < bucket.end ? todayStr : bucket.end;
                    const walkEnd = walkEndDate > bucket.end ? bucket.end : walkEndDate;
                    if (walkStart > walkEnd) continue;
                    let c = new Date(walkStart + "T00:00:00Z");
                    const e = new Date(walkEnd + "T00:00:00Z");
                    while (c <= e) { totalDaysExpected += 1; c = new Date(c.getTime() + oneDay); }
                }
                return totalDaysExpected === 0 ? null : (completedCount + partialCount) / totalDaysExpected;
            })();

            rows.push({
                periodLabel: bucket.label,
                periodStart: bucket.start,
                periodEnd: bucket.end,
                daysInPeriod: daysBetweenInclusive(bucket.start, bucket.end),
                totalLogs, completedCount, partialCount, missedCount,
                totalActual, totalTarget, completionRate, consistencyRate,
                inProgress: isInProgress
            });
        }

        res.json({ groupBy, periods, from, to, rows });

    } catch (error) {
        console.log("Error getting stats report:", error);
        res.status(500).json({ message: "Failed to get stats report" });
    }
}

async function getHabitBreakdown(req, res) {
    try {
        const from = req.query.from;
        const to = req.query.to;

        if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            return res.status(400).json({ message: "from and to are required in YYYY-MM-DD format" });
        }

        if (from > to) {
            return res.status(400).json({ message: "from must be <= to" });
        }

        const pool = await connectDatabase();
        const userId = req.user.userId;

        const habitsResult = await pool.request()
            .input("UserID", userId)
            .query(`
                SELECT HabitID, Name, Unit, TargetValue, StartDate
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
            `);

        const logsByHabit = new Map();
        for (const log of logsResult.recordset) {
            if (!logsByHabit.has(log.HabitID)) logsByHabit.set(log.HabitID, []);
            logsByHabit.get(log.HabitID).push(log);
        }

        const rows = [];
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

        for (const habit of habitsResult.recordset) {
            const logs = logsByHabit.get(habit.HabitID) || [];
            const habitStartDate = habit.StartDate ? toDateString(new Date(habit.StartDate)) : from;
            const walkStart = habitStartDate > from ? habitStartDate : from;

            if (walkStart > to) {
                rows.push({
                    habitId: habit.HabitID, name: habit.Name, unit: habit.Unit,
                    completed: 0, partial: 0, missed: 0,
                    totalActual: 0,
                    totalTarget: habit.TargetValue === null ? null : 0,
                    completionRate: null
                });
                continue;
            }

            const loggedDates = new Set();
            let completed = 0, partial = 0, missed = 0, totalActual = 0;

            for (const log of logs) {
                loggedDates.add(toDateString(new Date(log.Date)));
                if (log.Status === "Completed") completed += 1;
                else if (log.Status === "Partial") partial += 1;
                else if (log.Status === "Missed") missed += 1;
                totalActual += Number(log.ActualValue ?? 0);
            }

            const oneDay = 24 * 60 * 60 * 1000;
            let cursor = new Date(walkStart + "T00:00:00Z");
            const endDate = new Date(to + "T00:00:00Z");
            let daysExpected = 0;

            while (cursor <= endDate) {
                const dateStr = toDateString(cursor);
                if (dateStr > todayStr) {
                    cursor = new Date(cursor.getTime() + oneDay);
                    continue;
                }
                daysExpected += 1;
                if (!loggedDates.has(dateStr)) missed += 1;
                cursor = new Date(cursor.getTime() + oneDay);
            }

            const totalTarget = habit.TargetValue === null ? null : Number(habit.TargetValue) * daysExpected;
            const totalEffective = completed + partial + missed;
            const completionRate = totalEffective === 0 ? null : completed / totalEffective;

            rows.push({
                habitId: habit.HabitID, name: habit.Name, unit: habit.Unit,
                completed, partial, missed, totalActual, totalTarget, completionRate
            });
        }

        res.json({ from, to, habits: rows });

    } catch (error) {
        console.log("Error getting habit breakdown:", error);
        res.status(500).json({ message: "Failed to get habit breakdown" });
    }
}

module.exports = {
    getSummary,
    getCalendar,
    getHabitStats,
    getReport,
    getHabitBreakdown
};