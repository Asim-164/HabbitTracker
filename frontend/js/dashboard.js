(function () {
    if (!Auth.isLoggedIn()) {
        window.location.href = "/pages/login.html";
        return;
    }

    const user = Auth.getUser();
    if (user && user.name) {
        const userNameEl = document.getElementById("user-name");
        if (userNameEl) userNameEl.textContent = user.name;
        
        const welcomeEl = document.getElementById("welcome");
        if (welcomeEl) welcomeEl.textContent = "Welcome back, " + user.name;
    }

    document.getElementById("logout-btn").addEventListener("click", () => {
        Auth.clear();
        window.location.replace("/pages/login.html");
    });

    function todayString() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    function statusInfo(log, targetValue) {
        if (!log) {
            return { cls: "is-empty", icon: "◯", label: "Not logged today", fill: 0 };
        }
        if (log.Status === "Completed") return { cls: "is-completed", icon: "✓", label: "Completed", fill: 100 };
        if (log.Status === "Missed")    return { cls: "is-missed",    icon: "✕", label: "Missed",    fill: 0 };
        if (log.Status === "Partial") {
            const pct = targetValue > 0
                ? Math.min(100, Math.round((Number(log.ActualValue || 0) / Number(targetValue)) * 100))
                : 0;
            return { cls: "is-partial", icon: "◐", label: "Partial", fill: pct };
        }
        return { cls: "is-empty", icon: "◯", label: "Not logged today", fill: 0 };
    }

    function renderHabitCard(habit, log, streak, health) {
        const isMeasurable = habit.TargetValue !== null && Number(habit.TargetValue) > 0;
        const target = isMeasurable ? Number(habit.TargetValue) : 0;
        const actual = log ? Number(log.ActualValue || 0) : 0;

        const info = statusInfo(log, target);

        const numbersText = isMeasurable
            ? `${actual} / ${target} ${habit.Unit || ""}`.trim()
            : (log ? "Logged" : "Not logged");

        const meta = [habit.Frequency || "Daily", isMeasurable ? `${target} ${habit.Unit || ""}`.trim() : null]
            .filter(Boolean).join(" • ");

        const streakDays = streak ? streak.currentStreak : 0;

        const el = document.createElement("div");
        el.className = "habit-card " + info.cls;
        el.innerHTML = `
            <div class="habit-card__top">
                <div class="habit-card__name">${habit.Name}</div>
                <div style="display:flex; align-items:center; gap:12px;">
                    ${health ? `<span class="health-trend ${health.trend === "Improving" ? "is-improving" : health.trend === "Declining" ? "is-declining" : "is-steady"}">
                        <span class="health-trend__icon">${health.trend === "Improving" ? "↗" : health.trend === "Declining" ? "↘" : "→"}</span>
                        ${health.score}
                    </span>` : ""}
                    <div class="habit-card__streak">🔥 ${streakDays} ${streakDays === 1 ? "day" : "days"}</div>
                </div>
            </div>
            <div class="habit-card__meta">${meta}</div>
            <div class="habit-card__bar">
                <div class="habit-card__bar-fill" style="width: ${info.fill}%"></div>
            </div>
            <div class="habit-card__bottom">
                <div class="habit-card__numbers">${numbersText}</div>
                <div class="habit-card__status ${info.cls}">${info.icon} ${info.label}</div>
            </div>
        `;
        return el;
    }

    function fillSummary(activeHabits, todayLogs, maxStreak) {
        document.getElementById("stat-active").textContent = activeHabits.length;

        const logged = todayLogs.filter(Boolean);
        const completed = logged.filter((l) => l.Status === "Completed").length;
        document.getElementById("stat-today").textContent =
            activeHabits.length === 0 ? "—" : `${completed}/${activeHabits.length}`;

        document.getElementById("stat-streak").textContent =
            maxStreak > 0 ? `🔥 ${maxStreak} ${maxStreak === 1 ? "day" : "days"}` : "—";

    }

        async function loadThisWeek() {
        const el = document.getElementById("stat-week");
        try {
            const report = await api.get("/stats/report?groupBy=week&periods=1");
            const row = report.rows && report.rows[0];
            if (!row || row.totalLogs === 0) {
                el.textContent = "0/7 days";
                return;
            }
            el.textContent = `${row.totalLogs}/7 days`;
        } catch (_) {
            el.textContent = "—";
        }
    }

    function dateLabelFromISO(iso) {
        const d = new Date(iso + "T00:00:00Z");
        return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    }

    async function loadWeeklyChart() {
        const el = document.getElementById("weekly-chart");
        if (!el) return;
        el.innerHTML = `<p class="muted small">Loading…</p>`;

        try {
            const report = await api.get("/stats/report?groupBy=week&periods=1");
            const row = report.rows && report.rows[0];
            if (!row) {
                el.innerHTML = `<p class="muted small">No data.</p>`;
                return;
            }

            // Reconstruct the 7 days of the current week from periodStart
            const start = new Date(row.periodStart + "T00:00:00Z");
            const days = [];
            for (let i = 0; i < 7; i += 1) {
                const d = new Date(start);
                d.setUTCDate(d.getUTCDate() + i);
                const iso = d.toISOString().slice(0, 10);
                days.push({ date: iso, label: dateLabelFromISO(iso) });
            }

            // Fetch each habit's logs once; build per-day completion
            const habits = await api.get("/habits");
            const active = habits.filter((h) => h.Status === "Active");
            const allLogs = [];
            for (const h of active) {
                try {
                    const logs = await api.get(`/habit-logs?habitId=${h.HabitID}`);
                    logs.forEach((l) => allLogs.push({
                        date: (l.Date || "").slice(0, 10),
                        status: l.Status,
                        actual: Number(l.ActualValue || 0),
                        target: h.TargetValue !== null ? Number(h.TargetValue) : 0
                    }));
                } catch (_) {}
            }

            // For each day: average of (min(actual, target) / target) across logged habits that day
            const bars = days.map((d) => {
                const dayLogs = allLogs.filter((l) => l.date === d.date);
                if (dayLogs.length === 0) {
                    return { label: d.label, rate: 0, empty: true };
                }
                let sum = 0;
                for (const log of dayLogs) {
                    const target = log.target;
                    if (!target || target <= 0) {
                        // Non-measurable habit: Completed = 1, else 0
                        sum += log.status === "Completed" ? 1 : 0;
                    } else {
                        sum += Math.min((log.actual || 0) / target, 1);
                    }
                }
                const rate = sum / dayLogs.length;
                return { label: d.label, rate, empty: false };
            });

            el.innerHTML = bars.map((b) => `
                <div class="chart__bar-wrap">
                    <div class="chart__value">${b.empty ? "—" : Math.round(b.rate * 100) + "%"}</div>
                    <div class="chart__bar ${b.empty ? "is-empty" : ""}" style="height:${Math.max(2, b.rate * 100)}%"></div>
                    <div class="chart__label">${b.label}</div>
                </div>
            `).join("");
        } catch (err) {
            el.innerHTML = `<p class="muted small">Could not load chart: ${err.message}</p>`;
        }
    }
        async function loadHabitPerformance(active) {
        const el = document.getElementById("habit-performance");
        if (!el) return;
        if (!active.length) {
            el.innerHTML = `<p class="muted small">No active habits.</p>`;
            return;
        }

        el.innerHTML = `<p class="muted small">Loading…</p>`;

        try {
            const rows = await Promise.all(active.map(async (habit) => {
                try {
                    const stats = await api.get(`/habits/${habit.HabitID}/stats`);
                    return { habit, stats };
                } catch (_) {
                    return { habit, stats: null };
                }
            }));

            el.innerHTML = "";
            el.className = "perf";

            rows.forEach(({ habit, stats }) => {
                const r = stats ? stats.range : null;
                const s = stats ? stats.streak : null;
                const isMeasurable = habit.TargetValue !== null && Number(habit.TargetValue) > 0;
                const pct = r && r.completionRate !== null ? Math.round(r.completionRate * 100) : 0;
                const actualText = isMeasurable
                    ? `${r ? r.totalActual : 0} / ${r ? r.totalTarget : 0} ${habit.Unit || ""}`.trim()
                    : "—";

                const target = habit.TargetValue !== null ? Number(habit.TargetValue) : 0;
                const targetPct = (() => {
                    if (!r || target <= 0 || r.logsInRange === 0) return null;
                    // Average of (min(actual, target) / target) across logged days
                    // We approximate using totalActual / (target × logsInRange), capped at 1
                    const ratio = Math.min(r.totalActual / (target * r.logsInRange), 1);
                    return Math.round(ratio * 100);
                })();

                const row = document.createElement("div");
                row.className = "perf__row";
                row.innerHTML = `
                    <div class="perf__head">
                        <div class="perf__name">${habit.Name}</div>
                        <div class="perf__pct">
                            ${targetPct !== null ? targetPct + "% of target" : "—"}
                        </div>
                    </div>
                    <div class="perf__bar">
                        <div class="perf__bar-fill" style="width:${targetPct !== null ? targetPct : 0}%"></div>
                    </div>
                    <div class="perf__meta">
                        <span>${actualText}</span>
                        <span>🔥 ${s ? s.currentStreak : 0} day${s && s.currentStreak === 1 ? "" : "s"} · 🏆 ${s ? s.longestStreak : 0}</span>
                    </div>
                `;
                el.appendChild(row);
            });
        } catch (err) {
            el.innerHTML = `<p class="muted small">Could not load performance: ${err.message}</p>`;
        }
    }
    async function loadRecentActivity() {
        const el = document.getElementById("recent-activity");
        if (!el) return;
        el.innerHTML = `<p class="muted small">Loading…</p>`;

        try {
            const recent = await api.get("/stats/recent-activity");

            if (!recent || recent.length === 0) {
                el.innerHTML = `<p class="muted small">No logs yet.</p>`;
                return;
            }

            const iconFor = (status) => {
                if (status === "Completed") return { icon: "✓", cls: "is-completed" };
                if (status === "Partial")   return { icon: "◐", cls: "is-partial" };
                if (status === "Missed")    return { icon: "✕", cls: "is-missed" };
                return { icon: "•", cls: "" };
            };

            const todayISO = (() => {
                const d = new Date();
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            })();

            el.innerHTML = `<div class="activity">` + recent.map((l) => {
                const info = iconFor(l.Status);
                const dateStr = (l.Date || "").slice(0, 10);
                const dateLabel = dateStr === todayISO ? "Today" : dateStr;
                return `
                    <div class="activity__row">
                        <div class="activity__icon ${info.cls}">${info.icon}</div>
                        <div class="activity__label">${l.HabitName} — ${l.Status}</div>
                        <div class="activity__date">${dateLabel}</div>
                    </div>
                `;
            }).join("") + `</div>`;
        } catch (err) {
            el.innerHTML = `<p class="muted small">Could not load activity: ${err.message}</p>`;
        }
    }

    async function loadTodayHabits() {
        const container = document.getElementById("today-habits");
        container.innerHTML = ` <p class="muted small">Loading…</p>`;

        try {
            const habits = await api.get("/habits");
            const active = habits.filter((h) => h.Status === "Active");

            // Fetch health scores alongside habits
            let healthData = {};
            try {
                const healthRes = await api.get("/stats/health-score");
                healthRes.habits.forEach(h => healthData[h.habitId] = h);
            } catch (_) {}

            if (active.length === 0) {
                container.innerHTML = `<p class="muted small">No active habits yet.</p>`;
                fillSummary([], [], 0);
                return;
            }

            const today = todayString();
            const todayLogs = [];
            let maxStreak = 0;

            const cards = await Promise.all(active.map(async (habit) => {
                let log = null;
                let streak = null;
                try {
                    const logs = await api.get(`/habit-logs?habitId=${habit.HabitID}`);
                    log = logs.find((l) => (l.Date || "").slice(0, 10) === today) || null;
                } catch (_) {}
                try {
                    streak = await api.get(`/habits/${habit.HabitID}/streak`);
                    if (streak && streak.currentStreak > maxStreak) {
                        maxStreak = streak.currentStreak;
                    }
                } catch (_) {}
                todayLogs.push(log);
                return renderHabitCard(habit, log, streak, healthData[habit.HabitID]);
            }));

            container.innerHTML = "";
            cards.forEach((c) => container.appendChild(c));

            fillSummary(active, todayLogs, maxStreak);
            loadThisWeek();
            loadWeeklyChart();
            loadHabitPerformance(active);
            loadRecentActivity();
            loadHealthScore();
            loadPatterns();
            loadAchievements();       
            loadSuggestions();     
            loadRelationships();

        } catch (err) {
            container.innerHTML = `<p class="muted small">Could not load habits: ${err.message}</p>`;
        }
    }

    async function loadHealthScore() {
        const scoreEl = document.getElementById("stat-health");
        const trendEl = document.getElementById("stat-health-trend");
        if (!scoreEl || !trendEl) return;

        try {
            const data = await api.get("/stats/health-score");

            scoreEl.textContent = data.overallScore + " / 100";

            const trendMap = {
                "Improving": { label: "Improving", cls: "is-improving", icon: "↗" },
                "Declining": { label: "Declining", cls: "is-declining", icon: "↘" },
                "Steady":    { label: "Steady",    cls: "is-steady",    icon: "→" }
            };

            const trend = trendMap[data.overallTrend] || trendMap["Steady"];

            trendEl.innerHTML = `
                <span class="health-trend ${trend.cls}">
                    <span class="health-trend__icon">${trend.icon}</span>
                    ${trend.label}
                </span>
            `;

        } catch (err) {
            scoreEl.textContent = "—";
            trendEl.textContent = "—";
        }
    }   

    async function loadPatterns() {
        const panel = document.getElementById("patterns-panel");
        const el = document.getElementById("patterns");
        if (!panel || !el) return;

        try {
            const data = await api.get("/stats/patterns");
            const patterns = data.patterns || [];

            if (patterns.length === 0) {
                panel.hidden = true;
                return;
            }

            // Show the first pattern (we limit to top 3 in backend, but display the most severe one)
            el.innerHTML = patterns[0].message;
            panel.hidden = false; // Show the panel

        } catch (err) {
            panel.hidden = true;
        }
    }

        async function loadAchievements() {
        const el = document.getElementById("achievements");
        if (!el) return;
        el.innerHTML = `<p class="muted small">Loading achievements…</p>`;

        try {
            const data = await api.get("/stats/achievements");
            const list = data.achievements || [];

            if (list.length === 0) {
                el.innerHTML = `<p class="muted small">No achievements yet.</p>`;
                return;
            }

            el.innerHTML = list.map(a => `
                <div class="achievement-card ${a.unlocked ? 'is-unlocked' : 'is-locked'}">
                    <div class="achievement-icon">${a.icon}</div>
                    <div class="achievement-title">${a.title}</div>
                    <div class="achievement-desc">${a.description}</div>
                </div>
            `).join("");

        } catch (err) {
            el.innerHTML = `<p class="muted small">Could not load achievements: ${err.message}</p>`;
        }
    }

    async function loadSuggestions() {
        const panel = document.getElementById("suggestions-panel");
        const el = document.getElementById("suggestions");
        if (!panel || !el) return;

        try {
            const data = await api.get("/stats/suggestions");
            let suggestions = data.suggestions || [];

            // Filter out dismissed suggestions (stored in sessionStorage by habitId + type)
            const dismissed = JSON.parse(sessionStorage.getItem("dismissedSuggestions") || "[]");
            suggestions = suggestions.filter(s => {
                const key = (s.habitId || "") + "_" + s.type;
                return !dismissed.includes(key);
            });

            if (suggestions.length === 0) {
                panel.hidden = true;
                return;
            }

            const iconMap = {
                positive: "🌟",
                info: "💡",
                warning: "⚠️"
            };

            el.innerHTML = `<div class="suggestions-list">` + suggestions.map((s, i) => `
                <div class="suggestion-item is-${s.type}" data-suggestion-key="${(s.habitId || "")}_${s.type}">
                    <div class="suggestion-item__icon">${iconMap[s.type] || "💡"}</div>
                    <div class="suggestion-item__content">
                        <div class="suggestion-item__title">${s.title || "Suggestion"}</div>
                        <div class="suggestion-item__message">${s.message}</div>
                    </div>
                    <button type="button" class="suggestion-dismiss" aria-label="Dismiss suggestion">×</button>
                </div>
            `).join("") + `</div>`;

            // Wire up dismiss buttons
            el.querySelectorAll(".suggestion-dismiss").forEach((btn) => {
                btn.addEventListener("click", (e) => {
                    const item = e.target.closest(".suggestion-item");
                    const key = item.dataset.suggestionKey;

                    // Add to dismissed list
                    const dismissedNow = JSON.parse(sessionStorage.getItem("dismissedSuggestions") || "[]");
                    if (!dismissedNow.includes(key)) dismissedNow.push(key);
                    sessionStorage.setItem("dismissedSuggestions", JSON.stringify(dismissedNow));

                    // Hide the card
                    item.remove();

                    // If no cards left, hide the panel
                    if (el.querySelectorAll(".suggestion-item").length === 0) {
                        panel.hidden = true;
                    }
                });
            });

            panel.hidden = false;
        } catch (err) {
            panel.hidden = true;
        }
    }

        async function loadRelationships() {
        const panel = document.getElementById("relationships-panel");
        const el = document.getElementById("relationships");
        if (!panel || !el) return;

        try {
            const data = await api.get("/stats/relationships");
            const relationships = data.relationships || [];

            if (relationships.length === 0) {
                panel.hidden = true;
                return;
            }

            function getConfClass(pct) {
                if (pct >= 75) return "is-high";
                if (pct >= 40) return "is-medium";
                return "is-low";
            }

            el.innerHTML = relationships.map(r => `
                <div class="relationship-card">
                    <div class="relationship-stat ${getConfClass(r.confidenceAB)}">
                        <div class="relationship-stat__value">${r.confidenceAB}%</div>
                        <div class="relationship-stat__label">do ${r.habitB}</div>
                    </div>
                    <div class="relationship-visual">
                        <div class="relationship-node">${r.habitA}</div>
                        <div class="relationship-connector">
                            <div class="relationship-line"></div>
                            <div class="relationship-dot"></div>
                            <div class="relationship-line"></div>
                        </div>
                        <div class="relationship-node">${r.habitB}</div>
                    </div>
                    <div class="relationship-stat ${getConfClass(r.confidenceBA)}">
                        <div class="relationship-stat__value">${r.confidenceBA}%</div>
                        <div class="relationship-stat__label">do ${r.habitA}</div>
                    </div>
                </div>
            `).join("");
            
            panel.hidden = false;
        } catch (err) {
            panel.hidden = true;
        }
    }

    loadTodayHabits();
})();