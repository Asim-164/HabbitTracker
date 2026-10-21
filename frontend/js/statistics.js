(function () {
    if (!Auth.isLoggedIn()) {
        window.location.href = "/pages/login.html";
        return;
    }

    const user = Auth.getUser();
    if (user && user.name) {
        const userNameEl = document.getElementById("user-name");
        if (userNameEl) userNameEl.textContent = user.name;
    }

    document.getElementById("logout-btn").addEventListener("click", () => {
        Auth.clear();
        window.location.replace("/pages/login.html");
    });

        // Compute last week (Mon–Sun) — the previous completed week
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - daysSinceMonday);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);

    function fmtDate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    const lastWeekFrom = fmtDate(lastMonday);
    const lastWeekTo = fmtDate(lastSunday);

    const summaryBlock = document.getElementById("summary-block");
    const reportBlock = document.getElementById("report-block");
    const tableBlock = document.getElementById("table-block");
    const periodsSelect = document.getElementById("periods-select");
    const groupTabs = document.querySelectorAll("[data-group]");

    let groupBy = "week";

        function pct(v) {
        if (v === null || v === undefined) return "0%";
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

        const titleEl = document.getElementById("summary-title");
        if (titleEl) {
            const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            titleEl.textContent = `Last Week (${fmt(lastMonday)} – ${fmt(lastSunday)})`;
        }

        try {
            const data = await api.get(`/stats/summary?from=${lastWeekFrom}&to=${lastWeekTo}`);
            const o = data.overall;
            const possibleDays = o.habitsTracked * 7;
            summaryBlock.innerHTML = [
                card("Active Habits", o.habitsTracked),
                card("Completion Rate", pct(o.completionRate)),
                card("Consistency Rate", pct(o.consistencyRate)),
                card("Days Expected", o.totalLogs + `<div class="card__sub">of ${possibleDays} possible</div>`)
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
                const isInProgress = r.inProgress === true;
                const label = isInProgress ? r.periodLabel + " (in progress)" : r.periodLabel;
                const rowClass = isInProgress ? "report__row is-in-progress" : "report__row";
                return `
                    <div class="${rowClass}">
                        <div class="report__label">${label}</div>
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

            const res = await api.get(`/stats/habit-breakdown?from=${lastWeekFrom}&to=${lastWeekTo}`);
            const breakdown = res.habits || [];

            const rows = breakdown.map((h) => {
                const targetPct = (h.totalTarget && h.totalTarget > 0)
                    ? Math.round((h.totalActual / h.totalTarget) * 100)
                    : "—";

                return `
                    <tr>
                        <td>${h.name}</td>
                        <td class="num">${h.completed}</td>
                        <td class="num">${h.partial}</td>
                        <td class="num">${h.missed}</td>
                        <td class="num">${h.totalActual} / ${h.totalTarget ?? "—"}</td>
                        <td class="num">${targetPct === "—" ? "—" : targetPct + "%"}</td>
                        <td class="num">${h.completionRate === null ? "—" : Math.round(h.completionRate * 100) + "%"}</td>
                    </tr>
                `;
            }).join("");

            tableBlock.innerHTML = `
                <div class="stats-table__wrap">
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>Habit</th>
                                <th class="num">Completed</th>
                                <th class="num">Partial</th>
                                <th class="num">Missed</th>
                                <th class="num">Actual / Target</th>
                                <th class="num">% of Target</th>
                                <th class="num">Completion</th>
                            </tr>
                        </thead>
                        <tbody>${rows || '<tr><td colspan="7" class="muted">No habits.</td></tr>'}</tbody>
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