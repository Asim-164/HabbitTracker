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

        } catch (err) {
            container.innerHTML = `<p class="muted small">Could not load habits: ${err.message}</p>`;
        }
    }

    loadTodayHabits();
})();