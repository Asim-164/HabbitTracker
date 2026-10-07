(function () {
    if (!Auth.isLoggedIn()) {
        window.location.href = "/pages/login.html";
        return;
    }

    const user = Auth.getUser();
    if (user && user.name) {
        document.getElementById("user-name").textContent = user.name;
    }

    document.getElementById("logout-btn").addEventListener("click", () => {
        Auth.clear();
        window.location.href = "/pages/login.html";
    });

    const summaryBlock = document.getElementById("summary-block");
    const reportBlock = document.getElementById("report-block");
    const tableBlock = document.getElementById("table-block");
    const periodsSelect = document.getElementById("periods-select");
    const groupTabs = document.querySelectorAll("[data-group]");

    let groupBy = "week";

    function pct(v) {
        if (v === null || v === undefined) return "—";
        return Math.round(v * 100) + "%";
    }

    function card(label, value) {
        return `
            <div class="card">
                <div class="card__label">${label}</div>
                <div class="card__value">${value}</div>
            </div>
        `;
    }

    async function loadSummary() {
        try {
            const data = await api.get("/stats/summary");
            const o = data.overall;
            summaryBlock.innerHTML = [
                card("Active Habits", o.habitsTracked),
                card("Completion Rate", pct(o.completionRate)),
                card("Consistency Rate", pct(o.consistencyRate)),
                card("Logs in range", o.totalLogs)
            ].join("");
        } catch (err) {
            summaryBlock.innerHTML = `<p class="muted small">Could not load summary: ${err.message}</p>`;
        }
    }

    async function loadReport() {
        reportBlock.innerHTML = `<p class="muted small">Loading…</p>`;
        try {
            const periods = periodsSelect.value;
            const data = await api.get(`/stats/report?groupBy=${groupBy}&periods=${periods}`);
            const rows = data.rows || [];

            if (!rows.length) {
                reportBlock.innerHTML = `<p class="muted small">No data.</p>`;
                return;
            }

            reportBlock.innerHTML = `<div class="report">` + rows.map((r) => {
                const p = r.completionRate === null ? 0 : Math.round(r.completionRate * 100);
                return `
                    <div class="report__row">
                        <div class="report__label">${r.periodLabel}</div>
                        <div class="report__bar">
                            <div class="report__bar-fill" style="width:${p}%"></div>
                        </div>
                        <div class="report__value">${r.completionRate === null ? "—" : p + "%"}</div>
                    </div>
                `;
            }).join("") + `</div>`;
        } catch (err) {
            reportBlock.innerHTML = `<p class="muted small">Could not load report: ${err.message}</p>`;
        }
    }

    async function loadTable() {
        try {
            const habits = await api.get("/habits");
            const active = habits.filter((h) => h.Status === "Active");

            if (!active.length) {
                tableBlock.innerHTML = `<p class="muted small">No active habits.</p>`;
                return;
            }

            const perHabit = await Promise.all(active.map(async (h) => {
                try {
                    const stats = await api.get(`/habits/${h.HabitID}/stats`);
                    return { habit: h, stats };
                } catch (_) {
                    return { habit: h, stats: null };
                }
            }));

            const rows = perHabit.map(({ habit, stats }) => {
                const r = stats ? stats.range : null;
                return `
                    <tr>
                        <td>${habit.Name}</td>
                        <td class="num">${r ? r.logsInRange : "—"}</td>
                        <td class="num">${r ? r.completedCount : "—"}</td>
                        <td class="num">${r ? r.partialCount : "—"}</td>
                        <td class="num">${r ? r.missedCount : "—"}</td>
                        <td class="num">${r ? `${r.totalActual} / ${r.totalTarget ?? "—"}` : "—"}</td>
                        <td class="num">${r ? pct(r.completionRate) : "—"}</td>
                        <td class="num">${r ? pct(r.consistencyRate) : "—"}</td>
                    </tr>
                `;
            }).join("");

            tableBlock.innerHTML = `
                <div class="stats-table__wrap">
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>Habit</th>
                                <th class="num">Logs</th>
                                <th class="num">Completed</th>
                                <th class="num">Partial</th>
                                <th class="num">Missed</th>
                                <th class="num">Actual / Target</th>
                                <th class="num">Completion</th>
                                <th class="num">Consistency</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        } catch (err) {
            tableBlock.innerHTML = `<p class="muted small">Could not load table: ${err.message}</p>`;
        }
    }

    groupTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            groupTabs.forEach((t) => t.classList.remove("is-active"));
            tab.classList.add("is-active");
            groupBy = tab.dataset.group;
            loadReport();
        });
    });

    periodsSelect.addEventListener("change", loadReport);

    loadSummary();
    loadReport();
    loadTable();
})();