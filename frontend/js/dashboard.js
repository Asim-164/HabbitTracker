(function () {
    if (!Auth.isLoggedIn()) {
        window.location.href = "/pages/login.html";
        return;
    }

    const user = Auth.getUser();
    if (user && user.name) {
        document.getElementById("user-name").textContent = user.name;
        document.getElementById("welcome").textContent = "Welcome back, " + user.name;
    }

    document.getElementById("logout-btn").addEventListener("click", () => {
        Auth.clear();
        window.location.href = "/pages/login.html";
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

    function renderHabitCard(habit, log, streak) {
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
                <div class="habit-card__streak">🔥 ${streakDays} ${streakDays === 1 ? "day" : "days"}</div>
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
                        status: l.Status
                    }));
                } catch (_) {}
            }

            // For each day: completed / totalLogs
            const today = new Date().toISOString().slice(0, 10);
            const bars = days.map((d) => {
                const dayLogs = allLogs.filter((l) => l.date === d.date);
                const completed = dayLogs.filter((l) => l.status === "Completed").length;
                const rate = dayLogs.length === 0 ? 0 : completed / dayLogs.length;
                return { label: d.label, rate, empty: dayLogs.length === 0 };
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

                const row = document.createElement("div");
                row.className = "perf__row";
                row.innerHTML = `
                    <div class="perf__head">
                        <div class="perf__name">${habit.Name}</div>
                        <div class="perf__pct">${r && r.completionRate !== null ? pct + "%" : "—"}</div>
                    </div>
                    <div class="perf__bar">
                        <div class="perf__bar-fill" style="width:${pct}%"></div>
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
        async function loadRecentActivity(active) {
        const el = document.getElementById("recent-activity");
        if (!el) return;
        if (!active.length) {
            el.innerHTML = `<p class="muted small">No activity yet.</p>`;
            return;
        }

        el.innerHTML = `<p class="muted small">Loading…</p>`;

        try {
            // Pull logs for each active habit
            const allLogs = [];
            for (const h of active) {
                try {
                    const logs = await api.get(`/habit-logs?habitId=${h.HabitID}`);
                    logs.forEach((l) => allLogs.push({
                        habitName: h.Name,
                        date: (l.Date || "").slice(0, 10),
                        status: l.Status
                    }));
                } catch (_) {}
            }

            // Sort newest first, take latest 5
            allLogs.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
            const recent = allLogs.slice(0, 5);

            if (!recent.length) {
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
                const info = iconFor(l.status);
                const dateLabel = l.date === todayISO ? "Today" : l.date;
                return `
                    <div class="activity__row">
                        <div class="activity__icon ${info.cls}">${info.icon}</div>
                        <div class="activity__label">${l.habitName} — ${l.status}</div>
                        <div class="activity__date">${dateLabel}</div>
                    </div>
                `;
            }).join("") + `</div>`;
        } catch (err) {
            el.innerHTML = `<p class="muted small">Could not load activity: ${err.message}</p>`;
        }
    }

        async function loadRecentActivity(active) {
        const el = document.getElementById("recent-activity");
        if (!el) return;
        if (!active.length) {
            el.innerHTML = `<p class="muted small">No activity yet.</p>`;
            return;
        }

        el.innerHTML = `<p class="muted small">Loading…</p>`;

        try {
            // Pull logs for each active habit
            const allLogs = [];
            for (const h of active) {
                try {
                    const logs = await api.get(`/habit-logs?habitId=${h.HabitID}`);
                    logs.forEach((l) => allLogs.push({
                        habitName: h.Name,
                        date: (l.Date || "").slice(0, 10),
                        status: l.Status
                    }));
                } catch (_) {}
            }

            // Sort newest first, take latest 5
            allLogs.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
            const recent = allLogs.slice(0, 5);

            if (!recent.length) {
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
                const info = iconFor(l.status);
                const dateLabel = l.date === todayISO ? "Today" : l.date;
                return `
                    <div class="activity__row">
                        <div class="activity__icon ${info.cls}">${info.icon}</div>
                        <div class="activity__label">${l.habitName} — ${l.status}</div>
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
        container.innerHTML = `<p class="muted small">Loading…</p>`;

        try {
            const habits = await api.get("/habits");
            const active = habits.filter((h) => h.Status === "Active");

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
                return renderHabitCard(habit, log, streak);
            }));

            container.innerHTML = "";
            cards.forEach((c) => container.appendChild(c));

            fillSummary(active, todayLogs, maxStreak);
            loadThisWeek();
            loadWeeklyChart();
            loadHabitPerformance(active);
            loadRecentActivity(active);

        } catch (err) {
            container.innerHTML = `<p class="muted small">Could not load habits: ${err.message}</p>`;
        }
    }

    loadTodayHabits();
})();