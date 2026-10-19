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

async function getHealthScore(req, res) {
    try {
        const pool = await connectDatabase();
        const userId = req.user.userId;

        const habitsResult = await pool.request()
            .input("UserID", userId)
            .query(`SELECT HabitID, Name, TargetValue, Unit FROM Habits WHERE UserID = @UserID AND Status = 'Active'`);

        const habits = habitsResult.recordset;
        if (habits.length === 0) {
            return res.json({ overallScore: 0, overallTrend: "Steady", habits: [] });
        }

        const today = new Date();
        const oneDay = 24 * 60 * 60 * 1000;
        
        // Helper to format a date as YYYY-MM-DD in local time
        function localDateStr(d) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            return `${y}-${m}-${day}`;
        }
        
        // Calculate dates for last 14 days (this week + previous week)
        const dates = [];
        for (let i = 0; i < 14; i++) {
            const d = new Date(today - i * oneDay);
            dates.push(localDateStr(d));
        }

        const thisWeekDates = dates.slice(0, 7);
        const lastWeekDates = dates.slice(7, 14);

        const habitScores = await Promise.all(habits.map(async (habit) => {
            const logsResult = await pool.request()
                .input("HabitID", habit.HabitID)
                .query(`
                    SELECT Date, Status, ActualValue 
                    FROM HabitLogs 
                    WHERE HabitID = @HabitID 
                    AND Date >= DATEADD(day, -14, GETDATE())
                `);

            const logs = logsResult.recordset;
            const target = habit.TargetValue ? Number(habit.TargetValue) : 0;

            // Calculate score for a specific date range
            const calcScore = (dateArray) => {
                let logsCount = 0;
                let accuracySum = 0;

                dateArray.forEach(dateStr => {
                    const log = logs.find(l => localDateStr(new Date(l.Date)) === dateStr);
                    if (log) {
                        logsCount++;
                        if (target > 0) {
                            accuracySum += Math.min(Number(log.ActualValue || 0) / target, 1);
                        } else {
                            accuracySum += log.Status === "Completed" ? 1 : 0;
                        }
                    }
                });

                const consistency = logsCount / 7;
                const accuracy = logsCount > 0 ? (accuracySum / logsCount) : 0;
                
                // Calculate current streak: consecutive non-missed days ending today or yesterday
                let currentStreak = 0;
                let checkDate = new Date(today);
                const todayStr = localDateStr(checkDate);
                const yesterdayStr = localDateStr(new Date(today - oneDay));

                // Allow the streak to start from today or yesterday
                const hasTodayLog = logs.some(l => localDateStr(new Date(l.Date)) === todayStr && l.Status !== "Missed");
                const hasYesterdayLog = logs.some(l => localDateStr(new Date(l.Date)) === yesterdayStr && l.Status !== "Missed");
                
                if (hasTodayLog) {
                    checkDate = new Date(today);
                } else if (hasYesterdayLog) {
                    checkDate = new Date(today - oneDay);
                } else {
                    checkDate = null;
                }

                if (checkDate) {
                    while (true) {
                        const dateStr = localDateStr(checkDate);
                        const log = logs.find(l => localDateStr(new Date(l.Date)) === dateStr);
                        if (!log || log.Status === "Missed") break;
                        currentStreak++;
                        checkDate = new Date(checkDate - oneDay);
                    }
                }

                const streakScore = Math.min(currentStreak / 7, 1);
                const healthScore = (consistency * 0.5) + (accuracy * 0.3) + (streakScore * 0.2);
                return Math.round(healthScore * 100);
            };

            const thisWeekScore = calcScore(thisWeekDates);
            const lastWeekScore = calcScore(lastWeekDates);

            let trend = "Steady";
            if (thisWeekScore - lastWeekScore > 5) trend = "Improving";
            else if (thisWeekScore - lastWeekScore < -5) trend = "Declining";

            return {
                habitId: habit.HabitID,
                name: habit.Name,
                score: thisWeekScore,
                trend: trend
            };
        }));

        const overallScore = Math.round(habitScores.reduce((sum, h) => sum + h.score, 0) / habitScores.length);
        
        // Determine overall trend based on majority of habits
        const trends = habitScores.map(h => h.trend);
        let overallTrend = "Steady";
        if (trends.filter(t => t === "Improving").length > trends.filter(t => t === "Declining").length) overallTrend = "Improving";
        else if (trends.filter(t => t === "Declining").length > trends.filter(t => t === "Improving").length) overallTrend = "Declining";

        res.json({
            overallScore,
            overallTrend,
            habits: habitScores
        });

    } catch (error) {
        console.log("Error getting health score:", error);
        res.status(500).json({ message: "Failed to get health score" });
    }
}

async function getFailurePatterns(req, res) {
    try {
        const pool = await connectDatabase();
        const userId = req.user.userId;

        // Get all active habits
        const habitsResult = await pool.request()
            .input("UserID", userId)
            .query(`SELECT HabitID, Name FROM Habits WHERE UserID = @UserID AND Status = 'Active'`);
        
        const habits = habitsResult.recordset;
        if (habits.length === 0) return res.json({ patterns: [] });

        // Get all logs from the last 30 days
        const logsResult = await pool.request()
            .input("UserID", userId)
            .query(`
                SELECT hl.HabitID, hl.Date, hl.Status 
                FROM HabitLogs hl
                JOIN Habits h ON h.HabitID = hl.HabitID
                WHERE h.UserID = @UserID 
                  AND hl.Date >= DATEADD(day, -30, GETDATE())
            `);

        const logs = logsResult.recordset;
        const patterns = [];

        // Days of the week: 0=Sunday, 1=Monday, ... 6=Saturday
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

        for (const habit of habits) {
            const habitLogs = logs.filter(l => l.HabitID === habit.HabitID);
            if (habitLogs.length < 3) continue; // Need a few logs to find a pattern

            // Group by day of week
            const dayStats = {};
            dayNames.forEach(d => dayStats[d] = { total: 0, missed: 0 });

            habitLogs.forEach(log => {
                const logDate = new Date(log.Date);
                const dayName = dayNames[logDate.getDay()];
                dayStats[dayName].total++;
                if (log.Status === "Missed") {
                    dayStats[dayName].missed++;
                }
            });

            // Find the day with the highest failure rate
            let worstDay = null;
            let worstRate = 0;

            for (const day of dayNames) {
                const stats = dayStats[day];
                if (stats.total >= 2) { // Only count days with at least 2 logged entries
                    const rate = stats.missed / stats.total;
                    if (rate > worstRate) {
                        worstRate = rate;
                        worstDay = day;
                    }
                }
            }

            if (worstDay && worstRate >= 0.5) {
                patterns.push({
                    habitName: habit.Name,
                    type: "struggle_day",
                    day: worstDay,
                    failureRate: Math.round(worstRate * 100),
                    message: `You miss "${habit.Name}" ${Math.round(worstRate * 100)}% of the time on ${worstDay}s.`
                });
            }
        }

        // Sort so the most severe pattern is first
        patterns.sort((a, b) => b.failureRate - a.failureRate);

        // Only send the top 3 insights so the dashboard isn't cluttered
        res.json({ patterns: patterns.slice(0, 3) });

    } catch (error) {
        console.log("Error getting patterns:", error);
        res.status(500).json({ message: "Failed to get patterns" });
    }
}

async function getAchievements(req, res) {
    try {
        const pool = await connectDatabase();
        const userId = req.user.userId;

        // 1. Total logs and total completed logs
        const statsResult = await pool.request()
            .input("UserID", userId)
            .query(`
                SELECT 
                    COUNT(hl.LogID) AS TotalLogs,
                    SUM(CASE WHEN hl.Status = 'Completed' THEN 1 ELSE 0 END) AS TotalCompleted
                FROM HabitLogs hl
                JOIN Habits h ON h.HabitID = hl.HabitID
                WHERE h.UserID = @UserID
            `);
        
        const totalLogs = statsResult.recordset[0].TotalLogs || 0;
        const totalCompleted = statsResult.recordset[0].TotalCompleted || 0;

         // NEW: Count total reflections
        const refResult = await pool.request()
            .input("UserID", userId)
            .query(`SELECT COUNT(ReflectionID) AS TotalReflections FROM Reflections WHERE UserID = @UserID`);
        const totalReflections = refResult.recordset[0].TotalReflections || 0;

        // 2. Max Streak (using a simpler logic: longest sequence of non-missed logs)
        // For performance, we just check if they have a 7-day streak using the existing streak endpoint logic
        // Or we can do a quick query for consecutive days.
        // Let's do a simple check: Do they have any habit with a currentStreak >= 7?
        // We can call the internal streak logic, but it's easier to just query the logs.
        const habitsResult = await pool.request()
            .input("UserID", userId)
            .query(`SELECT HabitID, Name FROM Habits WHERE UserID = @UserID AND Status = 'Active'`);
        
        const habits = habitsResult.recordset;
        let maxStreak = 0;
        
        // (Simplified streak check for achievements)
        for (const h of habits) {
            const logs = await pool.request()
                .input("HabitID", h.HabitID)
                .query(`SELECT Date, Status FROM HabitLogs WHERE HabitID = @HabitID ORDER BY Date ASC`);
            
            let current = 0;
            let max = 0;
            let prevDate = null;
            
            for (const l of logs.recordset) {
                if (l.Status !== "Missed") {
                    const thisDate = new Date(l.Date);
                    if (prevDate && (thisDate - prevDate) === 86400000) {
                        current++;
                    } else {
                        current = 1;
                    }
                    if (current > max) max = current;
                    prevDate = thisDate;
                } else {
                    current = 0;
                    prevDate = null;
                }
            }
            if (max > maxStreak) maxStreak = max;
        }

        // 3. Perfect Day (Completed all active habits on a single date)
        let hasPerfectDay = false;
        if (habits.length > 0) {
            const perfectDayResult = await pool.request()
                .input("UserID", userId)
                .query(`
                    SELECT hl.Date, 
                           COUNT(CASE WHEN hl.Status = 'Completed' THEN 1 END) as CompletedCount,
                           (SELECT COUNT(*) FROM Habits WHERE UserID = @UserID AND Status = 'Active') as ActiveHabits
                    FROM HabitLogs hl
                    JOIN Habits h ON h.HabitID = hl.HabitID
                    WHERE h.UserID = @UserID
                    GROUP BY hl.Date
                    HAVING COUNT(CASE WHEN hl.Status = 'Completed' THEN 1 END) = 
                           (SELECT COUNT(*) FROM Habits WHERE UserID = @UserID AND Status = 'Active')
                `);
            if (perfectDayResult.recordset.length > 0) {
                hasPerfectDay = true;
            }
        }

        // Build the achievements list
        const achievements = [
            {
                id: "first_step",
                title: "First Steps",
                description: "Log your first habit.",
                icon: "🌱",
                unlocked: totalLogs >= 1
            },
            {
                id: "getting_going",
                title: "Getting Going",
                description: "Log 10 habits.",
                icon: "🚀",
                unlocked: totalLogs >= 10
            },
            {
                id: "century",
                title: "Century Club",
                description: "Log 100 habits.",
                icon: "💯",
                unlocked: totalLogs >= 100
            },
            {
                id: "consistency_king",
                title: "Consistency King",
                description: "Maintain a 7-day streak on any habit.",
                icon: "👑",
                unlocked: maxStreak >= 7
            },
            {
                id: "perfectionist",
                title: "Perfectionist",
                description: "Complete all active habits in a single day.",
                icon: "✨",
                unlocked: hasPerfectDay
            },
            {
                id: "habit_master",
                title: "Habit Master",
                description: "Log 500 habits.",
                icon: "🏋️",
                unlocked: totalLogs >= 500
            },
            {
                id: "unstoppable",
                title: "Unstoppable",
                description: "Maintain a 30-day streak.",
                icon: "🌟",
                unlocked: maxStreak >= 30
            },
            {
                id: "reflective",
                title: "Reflective",
                description: "Write 10 reflections.",
                icon: "📝",
                unlocked: totalReflections >= 10
            }
        ];

        res.json({ achievements });
    } catch (error) {
        console.log("Error getting achievements:", error);
        res.status(500).json({ message: "Failed to get achievements" });
    }
}

async function getSuggestions(req, res) {
    try {
        const pool = await connectDatabase();
        const userId = req.user.userId;

        // Reuse the health score logic (lightweight inline version)
        const habitsResult = await pool.request()
            .input("UserID", userId)
            .query(`SELECT HabitID, Name, TargetValue, Unit, Frequency FROM Habits WHERE UserID = @UserID AND Status = 'Active'`);

        const habits = habitsResult.recordset;
        const suggestions = [];

        const today = new Date();
        const oneDay = 24 * 60 * 60 * 1000;

        function localDateStr(d) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            return `${y}-${m}-${day}`;
        }

        const last7 = [];
        for (let i = 0; i < 7; i++) {
            last7.push(localDateStr(new Date(today - i * oneDay)));
        }

        for (const habit of habits) {
            const logsResult = await pool.request()
                .input("HabitID", habit.HabitID)
                .query(`SELECT Date, Status, ActualValue FROM HabitLogs WHERE HabitID = @HabitID AND Date >= DATEADD(day, -14, GETDATE())`);

            const logs = logsResult.recordset;
            const target = habit.TargetValue ? Number(habit.TargetValue) : 0;

            // Health score (last 7 days)
            let logged = 0;
            let accSum = 0;
            for (const dateStr of last7) {
                const log = logs.find(l => localDateStr(new Date(l.Date)) === dateStr);
                if (log) {
                    logged++;
                    if (target > 0) {
                        accSum += Math.min(Number(log.ActualValue || 0) / target, 1);
                    } else {
                        accSum += log.Status === "Completed" ? 1 : 0;
                    }
                }
            }

            // Frequency-aware consistency
            let consistency;
            if (habit.Frequency === "Weekly") {
                // For weekly habits, logging at least once in 7 days = 100% consistency
                consistency = Math.min(logged / 1, 1);
            } else {
                // For daily habits, logging every day = 100% consistency
                consistency = logged / 7;
            }

            const accuracy = logged > 0 ? accSum / logged : 0;
            const score = Math.round((consistency * 0.5 + accuracy * 0.3) * 100);

            // Generate suggestion based on score
            let message = null;
            let type = "info";

            if (score >= 70) {
                message = `"${habit.Name}" is going great! Consider raising your target to push yourself further.`;
                type = "positive";
            } else if (score >= 40) {
                message = `"${habit.Name}" is making solid progress. Keep showing up consistently.`;
                type = "info";
            } else if (score > 0) {
                message = `"${habit.Name}" is struggling. Try lowering the target or switching to "Weekly" frequency to build momentum.`;
                type = "warning";
            } else {
                message = `You haven't logged "${habit.Name}" this week. Try logging it today to get back on track.`;
                type = "warning";
            }

            let title = "Insight";
            if (type === "warning") title = "Action Needed";
            if (type === "positive") title = "Great Job!";
            if (type === "info") title = "On Track";

            if (score >= 70) {
                title = "Ready to Level Up";
            } else if (score >= 40) {
                title = "Keep the Momentum";
            } else if (score > 0) {
                title = "Lower the Target";
            } else {
                title = "Get Back on Track";
            }

            if (message) {
                suggestions.push({
                    habitId: habit.HabitID,
                    habitName: habit.Name,
                    score: score,
                    type: type,
                    title: title,
                    message: message
                });
            }
        }

        // Also check for failure patterns to add those suggestions
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        for (const habit of habits) {
            if (habit.Frequency === "Weekly") continue; // Weekly habits don't have daily failure patterns

            const logsResult = await pool.request()
                .input("HabitID", habit.HabitID)
                .query(`SELECT Date, Status FROM HabitLogs WHERE HabitID = @HabitID AND Date >= DATEADD(day, -30, GETDATE())`);

            const logs = logsResult.recordset;
            if (logs.length < 3) continue;

            const dayStats = {};
            dayNames.forEach(d => dayStats[d] = { total: 0, missed: 0 });
            logs.forEach(log => {
                const d = dayNames[new Date(log.Date).getDay()];
                dayStats[d].total++;
                if (log.Status === "Missed") dayStats[d].missed++;
            });

            let worstDay = null, worstRate = 0;
            for (const day of dayNames) {
                const s = dayStats[day];
                if (s.total >= 2) {
                    const rate = s.missed / s.total;
                    if (rate > worstRate) { worstRate = rate; worstDay = day; }
                }
            }

            if (worstDay && worstRate >= 0.5) {
                suggestions.push({
                    habitId: habit.HabitID,
                    habitName: habit.Name,
                    score: null,
                    type: "warning",
                    title: "Watch Out for " + worstDay + "s",
                    message: `You tend to miss "${habit.Name}" on ${worstDay}s. Try setting a reminder for ${worstDay} evening.`
                });
            }
        }

        // Sort so warnings come first, then info, then positive
        const order = { warning: 0, info: 1, positive: 2 };
        suggestions.sort((a, b) => order[a.type] - order[b.type]);

        res.json({ suggestions: suggestions.slice(0, 4) });

    } catch (error) {
        console.log("Error getting suggestions:", error);
        res.status(500).json({ message: "Failed to get suggestions" });
    }
}

async function getRelationships(req, res) {
    try {
        const pool = await connectDatabase();
        const userId = req.user.userId;

        const habitsResult = await pool.request()
            .input("UserID", userId)
            .query(`SELECT HabitID, Name FROM Habits WHERE UserID = @UserID AND Status = 'Active'`);

        const habits = habitsResult.recordset;
        if (habits.length < 2) {
            return res.json({ relationships: [] });
        }

        // Get logs from the last 30 days
        const logsResult = await pool.request()
            .input("UserID", userId)
            .query(`
                SELECT hl.HabitID, hl.Date, hl.Status
                FROM HabitLogs hl
                JOIN Habits h ON h.HabitID = hl.HabitID
                WHERE h.UserID = @UserID
                  AND hl.Date >= DATEADD(day, -30, GETDATE())
                  AND hl.Status = 'Completed'
            `);

        const logs = logsResult.recordset;

        function localDateStr(d) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            return `${y}-${m}-${day}`;
        }

        // Build a Set of completed dates per habit
        const completedDates = {};
        habits.forEach(h => completedDates[h.HabitID] = new Set());

        logs.forEach(log => {
            completedDates[log.HabitID].add(localDateStr(new Date(log.Date)));
        });

        // Compare every pair
        const relationships = [];

        for (let i = 0; i < habits.length; i++) {
            for (let j = i + 1; j < habits.length; j++) {
                const a = habits[i];
                const b = habits[j];
                const datesA = completedDates[a.HabitID];
                const datesB = completedDates[b.HabitID];

                if (datesA.size < 3 || datesB.size < 3) continue;

                // Count shared days
                let shared = 0;
                for (const d of datesA) {
                    if (datesB.has(d)) shared++;
                }

                if (shared < 3) continue; // Need at least 3 shared days to call it a relationship

                // Calculate confidence: how often B happens when A happens
                const confidenceAB = Math.round((shared / datesA.size) * 100);
                const confidenceBA = Math.round((shared / datesB.size) * 100);

                relationships.push({
                    habitA: a.Name,
                    habitB: b.Name,
                    sharedDays: shared,
                    confidenceAB: confidenceAB,
                    confidenceBA: confidenceBA
                });
            }
        }

        // Sort by shared days, best first
        relationships.sort((a, b) => b.sharedDays - a.sharedDays);

        res.json({ relationships: relationships.slice(0, 3) });

    } catch (error) {
        console.log("Error getting relationships:", error);
        res.status(500).json({ message: "Failed to get relationships" });
    }
}

module.exports = {
    getSummary,
    getCalendar,
    getHabitStats,
    getReport,
    getRecentActivity,
    searchAll,
    getHealthScore,
    getFailurePatterns,
    getAchievements,
    getSuggestions,
    getRelationships
};