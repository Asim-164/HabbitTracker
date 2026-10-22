const connectDatabase = require("../database/db");
const { toDateString } = require("../utils/dateHelpers");
const { localDateStr, tierFromValue } = require("../utils/statsHelpers");

async function getHealthScore(req, res) {
    try {
        const pool = await connectDatabase();
        const userId = req.user.userId;

        const habitsResult = await pool.request()
            .input("UserID", userId)
            .query(`SELECT HabitID, Name, TargetValue, Unit, StartDate FROM Habits WHERE UserID = @UserID AND Status = 'Active'`);

        const habits = habitsResult.recordset;
        if (habits.length === 0) {
            return res.json({ overallScore: 0, overallTrend: "Steady", habits: [] });
        }

        const today = new Date();
        const oneDay = 24 * 60 * 60 * 1000;

        const todayStr = localDateStr(today);
        const yesterdayStr = localDateStr(new Date(today - oneDay));

        const thisWeekDates = [];
        const lastWeekDates = [];
        for (let i = 0; i < 7; i++) thisWeekDates.push(localDateStr(new Date(today - i * oneDay)));
        for (let i = 7; i < 14; i++) lastWeekDates.push(localDateStr(new Date(today - i * oneDay)));

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
            const habitStart = habit.StartDate ? localDateStr(new Date(habit.StartDate)) : null;

            const calcScore = (dateArray) => {
                let daysExpected = 0;
                let realLogs = 0;
                let accuracySum = 0;

                for (const dateStr of dateArray) {
                    if (dateStr > todayStr) continue;
                    if (habitStart && dateStr < habitStart) continue;

                    daysExpected += 1;

                    const log = logs.find(l => localDateStr(new Date(l.Date)) === dateStr);
                    if (log) {
                        realLogs += 1;
                        if (target > 0) {
                            accuracySum += Math.min(Number(log.ActualValue || 0) / target, 1);
                        } else {
                            accuracySum += log.Status === "Completed" ? 1 : 0;
                        }
                    }
                }

                if (daysExpected === 0) return { score: 0 };

                const consistency = realLogs / daysExpected;
                const accuracy = realLogs > 0 ? (accuracySum / realLogs) : 0;

                let currentStreak = 0;
                let checkDate = new Date(today);
                const hasTodayLog = logs.some(l => localDateStr(new Date(l.Date)) === todayStr && l.Status !== "Missed");
                const hasYesterdayLog = logs.some(l => localDateStr(new Date(l.Date)) === yesterdayStr && l.Status !== "Missed");

                if (hasTodayLog) checkDate = new Date(today);
                else if (hasYesterdayLog) checkDate = new Date(today - oneDay);
                else checkDate = null;

                if (checkDate) {
                    while (true) {
                        const dStr = localDateStr(checkDate);
                        if (habitStart && dStr < habitStart) break;
                        const log = logs.find(l => localDateStr(new Date(l.Date)) === dStr);
                        if (!log || log.Status === "Missed") break;
                        currentStreak++;
                        checkDate = new Date(checkDate - oneDay);
                    }
                }

                const streakScore = Math.min(currentStreak / 7, 1);
                const healthScore = (consistency * 0.5) + (accuracy * 0.3) + (streakScore * 0.2);
                return { score: Math.round(healthScore * 100) };
            };

            const thisWeek = calcScore(thisWeekDates);
            const lastWeek = calcScore(lastWeekDates);

            let trend = "Steady";
            if (thisWeek.score - lastWeek.score > 5) trend = "Improving";
            else if (thisWeek.score - lastWeek.score < -5) trend = "Declining";

            return { habitId: habit.HabitID, name: habit.Name, score: thisWeek.score, trend };
        }));

        const overallScore = Math.round(habitScores.reduce((sum, h) => sum + h.score, 0) / habitScores.length);

        const trends = habitScores.map(h => h.trend);
        let overallTrend = "Steady";
        if (trends.filter(t => t === "Improving").length > trends.filter(t => t === "Declining").length) overallTrend = "Improving";
        else if (trends.filter(t => t === "Declining").length > trends.filter(t => t === "Improving").length) overallTrend = "Declining";

        res.json({ overallScore, overallTrend, habits: habitScores });

    } catch (error) {
        console.log("Error getting health score:", error);
        res.status(500).json({ message: "Failed to get health score" });
    }
}

async function getFailurePatterns(req, res) {
    try {
        const pool = await connectDatabase();
        const userId = req.user.userId;

        const habitsResult = await pool.request()
            .input("UserID", userId)
            .query(`SELECT HabitID, Name, StartDate FROM Habits WHERE UserID = @UserID AND Status = 'Active'`);

        const habits = habitsResult.recordset;
        if (habits.length === 0) return res.json({ patterns: [] });

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

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);
        const thirtyDaysAgoStr = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(thirtyDaysAgo.getDate()).padStart(2, "0")}`;

        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const patterns = [];
        const oneDay = 24 * 60 * 60 * 1000;

        for (const habit of habits) {
            const habitStart = habit.StartDate ? toDateString(new Date(habit.StartDate)) : thirtyDaysAgoStr;
            const walkStart = habitStart > thirtyDaysAgoStr ? habitStart : thirtyDaysAgoStr;
            if (walkStart > todayStr) continue;

            const habitLogs = logs.filter(l => l.HabitID === habit.HabitID);
            const logByDate = new Map();
            for (const log of habitLogs) {
                logByDate.set(toDateString(new Date(log.Date)), log);
            }

            const dayStats = {};
            dayNames.forEach(d => dayStats[d] = { total: 0, missed: 0 });

            let cursor = new Date(walkStart + "T00:00:00Z");
            const endDate = new Date(todayStr + "T00:00:00Z");

            while (cursor < endDate) {
                const dateStr = toDateString(cursor);
                const dateObj = new Date(dateStr + "T00:00:00Z");
                const dayName = dayNames[dateObj.getUTCDay()];

                const log = logByDate.get(dateStr);
                dayStats[dayName].total += 1;
                if (!log || log.Status === "Missed") dayStats[dayName].missed += 1;

                cursor = new Date(cursor.getTime() + oneDay);
            }

            let worstDay = null, worstRate = 0, worstTotal = 0;

            for (const day of dayNames) {
                const stats = dayStats[day];
                if (stats.total >= 3) {
                    const rate = stats.missed / stats.total;
                    if (rate > worstRate) {
                        worstRate = rate;
                        worstDay = day;
                        worstTotal = stats.total;
                    }
                }
            }

            if (worstDay && worstRate >= 0.5) {
                patterns.push({
                    habitName: habit.Name,
                    type: "struggle_day",
                    day: worstDay,
                    failureRate: Math.round(worstRate * 100),
                    totalOccurrences: worstTotal,
                    message: `You miss "${habit.Name}" ${Math.round(worstRate * 100)}% of the time on ${worstDay}s.`
                });
            }
        }

        patterns.sort((a, b) => b.failureRate - a.failureRate);
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

        const refResult = await pool.request()
            .input("UserID", userId)
            .query(`SELECT COUNT(ReflectionID) AS TotalReflections FROM Reflections WHERE UserID = @UserID`);
        const totalReflections = refResult.recordset[0].TotalReflections || 0;

        const habitsResult = await pool.request()
            .input("UserID", userId)
            .query(`SELECT HabitID, Name FROM Habits WHERE UserID = @UserID AND Status = 'Active'`);
        const habits = habitsResult.recordset;

        let currentMaxStreak = 0;
        let longestMaxStreak = 0;

        for (const h of habits) {
            const logs = await pool.request()
                .input("HabitID", h.HabitID)
                .query(`SELECT Date, Status FROM HabitLogs WHERE HabitID = @HabitID ORDER BY Date ASC`);

            let run = 0, max = 0, prevDate = null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            let currentStreak = 0;
            let reachedTodayOrYesterday = false;

            for (const l of logs.recordset) {
                if (l.Status !== "Missed") {
                    const thisDate = new Date(l.Date);
                    if (prevDate && (thisDate - prevDate) === 86400000) run++;
                    else run = 1;
                    if (run > max) max = run;
                    prevDate = thisDate;

                    const diff = Math.floor((today - thisDate) / 86400000);
                    if (diff === 0 || diff === 1) {
                        if (!reachedTodayOrYesterday) {
                            currentStreak = run;
                            reachedTodayOrYesterday = true;
                        }
                    }
                } else {
                    run = 0;
                    prevDate = null;
                }
            }

            if (currentStreak > currentMaxStreak) currentMaxStreak = currentStreak;
            if (max > longestMaxStreak) longestMaxStreak = max;
        }

        let perfectDays = 0;
        if (habits.length > 0) {
            const perfectResult = await pool.request()
                .input("UserID", userId)
                .query(`
                    SELECT hl.Date, COUNT(CASE WHEN hl.Status = 'Completed' THEN 1 END) AS CompletedCount
                    FROM HabitLogs hl
                    JOIN Habits h ON h.HabitID = hl.HabitID
                    WHERE h.UserID = @UserID
                    GROUP BY hl.Date
                    HAVING COUNT(CASE WHEN hl.Status = 'Completed' THEN 1 END) = 
                        (SELECT COUNT(*) FROM Habits WHERE UserID = @UserID AND Status = 'Active')
                `);
            perfectDays = perfectResult.recordset.length;
        }

        const achievements = [];

        achievements.push({
            id: "first_step", title: "First Steps", description: "Log your first habit.", icon: "🌱",
            unlocked: totalLogs >= 1, tier: totalLogs >= 1 ? "single" : null,
            progressValue: totalLogs >= 1 ? null : totalLogs, nextThreshold: totalLogs >= 1 ? null : 1
        });

        const gg = tierFromValue(totalLogs, [10, 50, 100]);
        achievements.push({
            id: "getting_going", title: "Getting Going", description: "Log habits over time.", icon: "🚀",
            unlocked: gg.currentTier !== null, tier: gg.currentTier,
            progressValue: gg.progressValue, nextThreshold: gg.nextThreshold, nextTier: gg.nextTier
        });

        achievements.push({
            id: "century", title: "Century Club", description: "Complete 100 habits.", icon: "💯",
            unlocked: totalCompleted >= 100, tier: totalCompleted >= 100 ? "single" : null,
            progressValue: totalCompleted >= 100 ? null : totalCompleted, nextThreshold: totalCompleted >= 100 ? null : 100
        });

        const ck = tierFromValue(currentMaxStreak, [7, 14, 30]);
        achievements.push({
            id: "consistency_king", title: "Consistency King", description: "Maintain a streak.", icon: "👑",
            unlocked: ck.currentTier !== null, tier: ck.currentTier,
            progressValue: ck.progressValue, nextThreshold: ck.nextThreshold, nextTier: ck.nextTier,
            resettable: true
        });

        const pf = tierFromValue(perfectDays, [1, 5, 20]);
        achievements.push({
            id: "perfectionist", title: "Perfectionist", description: "Complete all active habits in one day.", icon: "✨",
            unlocked: pf.currentTier !== null, tier: pf.currentTier,
            progressValue: pf.progressValue, nextThreshold: pf.nextThreshold, nextTier: pf.nextTier
        });

        const hm = tierFromValue(totalLogs, [50, 200, 500]);
        achievements.push({
            id: "habit_master", title: "Habit Master", description: "Log habits consistently.", icon: "🏋️",
            unlocked: hm.currentTier !== null, tier: hm.currentTier,
            progressValue: hm.progressValue, nextThreshold: hm.nextThreshold, nextTier: hm.nextTier
        });

        const us = tierFromValue(currentMaxStreak, [30, 60, 100]);
        achievements.push({
            id: "unstoppable", title: "Unstoppable", description: "Maintain a long streak.", icon: "🌟",
            unlocked: us.currentTier !== null, tier: us.currentTier,
            progressValue: us.progressValue, nextThreshold: us.nextThreshold, nextTier: us.nextTier,
            resettable: true
        });

        achievements.push({
            id: "reflective", title: "Reflective", description: "Write 10 reflections.", icon: "📝",
            unlocked: totalReflections >= 10, tier: totalReflections >= 10 ? "single" : null,
            progressValue: totalReflections >= 10 ? null : totalReflections, nextThreshold: totalReflections >= 10 ? null : 10
        });

        // Persist highest tier
        const TIER_ORDER = { bronze: 1, silver: 2, gold: 3, single: 1 };
        const existingResult = await pool.request()
            .input("UserID", userId)
            .query(`SELECT AchievementID, HighestTier FROM UserAchievements WHERE UserID = @UserID`);
        const existing = new Map();
        for (const row of existingResult.recordset) existing.set(row.AchievementID, row.HighestTier);

        for (const a of achievements) {
            const current = a.tier;
            const stored = existing.get(a.id);
            const currentRank = current ? (TIER_ORDER[current] || 0) : 0;
            const storedRank = stored ? (TIER_ORDER[stored] || 0) : 0;

            if (currentRank > storedRank) {
                if (stored !== undefined) {
                    await pool.request()
                        .input("UserID", userId)
                        .input("AchievementID", a.id)
                        .input("HighestTier", current)
                        .query(`UPDATE UserAchievements SET HighestTier = @HighestTier, UpdatedAt = GETDATE() WHERE UserID = @UserID AND AchievementID = @AchievementID`);
                } else {
                    await pool.request()
                        .input("UserID", userId)
                        .input("AchievementID", a.id)
                        .input("HighestTier", current)
                        .query(`INSERT INTO UserAchievements (UserID, AchievementID, HighestTier) VALUES (@UserID, @AchievementID, @HighestTier)`);
                }
                existing.set(a.id, current);
            }
            a.highestTier = existing.get(a.id) || null;
        }

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

        const habitsResult = await pool.request()
            .input("UserID", userId)
            .query(`SELECT HabitID, Name, TargetValue, Unit, Frequency FROM Habits WHERE UserID = @UserID AND Status = 'Active'`);

        const habits = habitsResult.recordset;
        const suggestions = [];

        const today = new Date();
        const oneDay = 24 * 60 * 60 * 1000;

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

            let logged = 0;
            let accSum = 0;
            for (const dateStr of last7) {
                const log = logs.find(l => localDateStr(new Date(l.Date)) === dateStr);
                if (log) {
                    logged++;
                    if (target > 0) accSum += Math.min(Number(log.ActualValue || 0) / target, 1);
                    else accSum += log.Status === "Completed" ? 1 : 0;
                }
            }

            let consistency;
            if (habit.Frequency === "Weekly") consistency = Math.min(logged / 1, 1);
            else consistency = logged / 7;

            const accuracy = logged > 0 ? accSum / logged : 0;
            const score = Math.round((consistency * 0.5 + accuracy * 0.3) * 100);

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

            if (score >= 70) title = "Ready to Level Up";
            else if (score >= 40) title = "Keep the Momentum";
            else if (score > 0) title = "Lower the Target";
            else title = "Get Back on Track";

            if (message) {
                suggestions.push({
                    habitId: habit.HabitID,
                    habitName: habit.Name,
                    score, type, title, message
                });
            }
        }

        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        for (const habit of habits) {
            if (habit.Frequency === "Weekly") continue;

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
                    score: null, type: "warning",
                    title: "Watch Out for " + worstDay + "s",
                    message: `You tend to miss "${habit.Name}" on ${worstDay}s. Try setting a reminder for ${worstDay} evening.`
                });
            }
        }

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
        if (habits.length < 2) return res.json({ relationships: [] });

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

        const completedDates = {};
        habits.forEach(h => completedDates[h.HabitID] = new Set());

        logs.forEach(log => {
            completedDates[log.HabitID].add(localDateStr(new Date(log.Date)));
        });

        const relationships = [];

        for (let i = 0; i < habits.length; i++) {
            for (let j = i + 1; j < habits.length; j++) {
                const a = habits[i];
                const b = habits[j];
                const datesA = completedDates[a.HabitID];
                const datesB = completedDates[b.HabitID];

                if (datesA.size < 3 || datesB.size < 3) continue;

                let shared = 0;
                for (const d of datesA) {
                    if (datesB.has(d)) shared++;
                }

                if (shared < 3) continue;

                const confidenceAB = Math.round((shared / datesA.size) * 100);
                const confidenceBA = Math.round((shared / datesB.size) * 100);

                relationships.push({
                    habitA: a.Name, habitB: b.Name,
                    sharedDays: shared,
                    confidenceAB, confidenceBA
                });
            }
        }

        relationships.sort((a, b) => b.sharedDays - a.sharedDays);
        res.json({ relationships: relationships.slice(0, 3) });

    } catch (error) {
        console.log("Error getting relationships:", error);
        res.status(500).json({ message: "Failed to get relationships" });
    }
}

async function getWeeklyReview(req, res) {
    try {
        const pool = await connectDatabase();
        const userId = req.user.userId;

        const offset = parseInt(req.query.weekOffset || "0", 10);
        const today = new Date();

        const dayOfWeek = today.getDay();
        const daysSinceMonday = (dayOfWeek + 6) % 7;
        const monday = new Date(today);
        monday.setDate(today.getDate() - daysSinceMonday - (offset * 7));

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const from = localDateStr(monday);
        const to = localDateStr(sunday);

        const todayStr = localDateStr(today);
        const isCompleteWeek = offset > 0;

        const habitsResult = await pool.request()
            .input("UserID", userId)
            .query(`SELECT HabitID, Name, TargetValue, Unit, StartDate FROM Habits WHERE UserID = @UserID AND Status = 'Active'`);
        const habits = habitsResult.recordset;

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
        const logs = logsResult.recordset;

        const logsByHabit = new Map();
        for (const log of logs) {
            if (!logsByHabit.has(log.HabitID)) logsByHabit.set(log.HabitID, []);
            logsByHabit.get(log.HabitID).push(log);
        }

        const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const perDay = {};
        dayNames.forEach(d => perDay[d] = { total: 0, completed: 0, missed: 0, realLogs: 0 });

        const perHabit = new Map();
        for (const h of habits) {
            perHabit.set(h.HabitID, { name: h.Name, completed: 0, partial: 0, missed: 0, realLogs: 0 });
        }

        let completedCount = 0, partialCount = 0, missedCount = 0;
        const oneDay = 24 * 60 * 60 * 1000;

        for (const habit of habits) {
            const habitStart = habit.StartDate ? toDateString(new Date(habit.StartDate)) : from;
            const walkStart = habitStart > from ? habitStart : from;
            const walkEnd = isCompleteWeek ? to : (todayStr < to ? todayStr : to);
            if (walkStart > walkEnd) continue;

            const habitLogs = logsByHabit.get(habit.HabitID) || [];
            const stats = perHabit.get(habit.HabitID);

            let cursor = new Date(walkStart + "T00:00:00Z");
            const endDate = new Date(walkEnd + "T00:00:00Z");

            while (cursor <= endDate) {
                const dateStr = toDateString(cursor);
                const dateObj = new Date(dateStr + "T00:00:00Z");
                const dayName = dayNames[(dateObj.getUTCDay() + 6) % 7];

                perDay[dayName].total += 1;

                const log = habitLogs.find(l => toDateString(new Date(l.Date)) === dateStr);

                if (log) {
                    stats.realLogs += 1;
                    perDay[dayName].realLogs += 1;

                    if (log.Status === "Completed") {
                        stats.completed += 1;
                        completedCount += 1;
                        perDay[dayName].completed += 1;
                    } else if (log.Status === "Partial") {
                        stats.partial += 1;
                        partialCount += 1;
                    } else if (log.Status === "Missed") {
                        stats.missed += 1;
                        missedCount += 1;
                        perDay[dayName].missed += 1;
                    }
                } else {
                    stats.missed += 1;
                    missedCount += 1;
                    perDay[dayName].missed += 1;
                }

                cursor = new Date(cursor.getTime() + oneDay);
            }
        }

        const effectiveLogs = completedCount + partialCount + missedCount;
        const completionRate = effectiveLogs > 0 ? Math.round((completedCount / effectiveLogs) * 100) : null;

        const daysWithRealLogs = dayNames.filter(d => perDay[d].realLogs > 0);
        let bestDay = null;
        let worstDay = null;

        if (isCompleteWeek && daysWithRealLogs.length >= 2) {
            let maxMissed = -1, minMissed = Infinity;
            let worstName = null, bestName = null;
            let worstRealLogs = 0, bestRealLogs = 0;

            daysWithRealLogs.forEach(d => {
                const stats = perDay[d];
                if (stats.missed > maxMissed || (stats.missed === maxMissed && stats.realLogs > worstRealLogs)) {
                    maxMissed = stats.missed; worstName = d; worstRealLogs = stats.realLogs;
                }
                if (stats.missed < minMissed || (stats.missed === minMissed && stats.realLogs > bestRealLogs)) {
                    minMissed = stats.missed; bestName = d; bestRealLogs = stats.realLogs;
                }
            });

            if (worstName) worstDay = { name: worstName, missed: maxMissed, realLogs: worstRealLogs };
            if (bestName) bestDay = { name: bestName, missed: minMissed, realLogs: bestRealLogs };
            if (maxMissed === 0) worstDay = null;
        }

        let bestHabit = null, weakestHabit = null;
        const habitRates = [];
        for (const [id, stats] of perHabit) {
            const effective = stats.completed + stats.partial + stats.missed;
            if (effective === 0) continue;
            habitRates.push({ name: stats.name, rate: stats.completed / effective, realLogs: stats.realLogs });
        }

        if (habitRates.length > 1) {
            let bestVal = -1, worstVal = 101;
            for (const h of habitRates) {
                if (h.rate > bestVal) bestVal = h.rate;
                if (h.rate < worstVal) worstVal = h.rate;
            }
            const bestMatches = habitRates.filter(h => h.rate === bestVal);
            const worstMatches = habitRates.filter(h => h.rate === worstVal);
            if (bestMatches.length === 1) bestHabit = { name: bestMatches[0].name, rate: Math.round(bestVal * 100), realLogs: bestMatches[0].realLogs };
            if (worstMatches.length === 1 && worstVal < bestVal) weakestHabit = { name: worstMatches[0].name, rate: Math.round(worstVal * 100), realLogs: worstMatches[0].realLogs };
        }

        res.json({
            from, to,
            weekOffset: offset,
            isCompleteWeek,
            totalLogs: effectiveLogs,
            realLogs: logs.length,
            completedCount, partialCount, missedCount,
            completionRate,
            activeHabits: habits.length,
            bestDay, worstDay, bestHabit, weakestHabit
        });

    } catch (error) {
        console.log("Error getting weekly review:", error);
        res.status(500).json({ message: "Failed to get weekly review" });
    }
}

module.exports = {
    getHealthScore,
    getFailurePatterns,
    getAchievements,
    getSuggestions,
    getRelationships,
    getWeeklyReview
};