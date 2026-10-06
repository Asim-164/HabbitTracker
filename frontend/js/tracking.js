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

    const dateInput = document.getElementById("tracking-date");
    const list = document.getElementById("tracking-list");

    function todayString() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    dateInput.value = todayString();

    function statusText(log) {
        if (!log) return { cls: "is-empty", icon: "◯", label: "Not logged" };
        if (log.Status === "Completed") return { cls: "is-completed", icon: "✓", label: "Completed" };
        if (log.Status === "Partial")   return { cls: "is-partial",   icon: "◐", label: "Partial" };
        if (log.Status === "Missed")    return { cls: "is-missed",    icon: "✕", label: "Missed" };
        return { cls: "is-empty", icon: "◯", label: "Not logged" };
    }

    function renderRow(habit, log) {
        const isMeasurable = habit.TargetValue !== null && Number(habit.TargetValue) > 0;
        const target = isMeasurable ? Number(habit.TargetValue) : 0;
        const actual = log ? Number(log.ActualValue || 0) : 0;
        const info = statusText(log);

        const row = document.createElement("div");
        row.className = "track-row";
        row.dataset.habitId = habit.HabitID;
        row.dataset.logId = log ? log.LogID : "";
        row.dataset.measurable = isMeasurable ? "1" : "0";
        row.dataset.target = target;
        row.dataset.unit = habit.Unit || "";

        const valueField = isMeasurable
            ? `<input type="number" min="0" step="1" class="track-row__input" value="${actual}" placeholder="0">
               <span class="track-row__unit">${habit.Unit || ""}</span>`
            : `<div class="track-row__yesno">
                   <label><input type="radio" name="status-${habit.HabitID}" value="Completed" ${log && log.Status === "Completed" ? "checked" : ""}> Done</label>
                   <label><input type="radio" name="status-${habit.HabitID}" value="Missed" ${log && log.Status === "Missed" ? "checked" : ""}> Missed</label>
               </div>`;

        row.innerHTML = `
            <div class="track-row__head">
                <div>
                    <div class="track-row__name">${habit.Name}</div>
                    <div class="track-row__meta">${habit.Frequency || "Daily"}${isMeasurable ? ` • ${target} ${habit.Unit || ""}`.trim() : ""}</div>
                </div>
                <div class="track-row__status ${info.cls}">${info.icon} ${info.label}</div>
            </div>
            <div class="track-row__body">
                <div class="track-row__inputs">${valueField}</div>
                <div class="track-row__actions">
                    <button type="button" class="track-row__save">Save</button>
                </div>
            </div>
            <div class="track-row__note">
                <input type="text" class="track-row__notes" placeholder="Notes (optional)" value="${log && log.Notes ? log.Notes : ""}">
            </div>
        `;

        row.querySelector(".track-row__save").addEventListener("click", () => saveRow(row, habit));
        return row;
    }

    async function saveRow(row, habit) {
        const date = dateInput.value;
        const isMeasurable = row.dataset.measurable === "1";
        const logId = row.dataset.logId;
        const notes = row.querySelector(".track-row__notes").value.trim();

        let body;
        if (isMeasurable) {
            const actual = Number(row.querySelector(".track-row__input").value || 0);
            body = { habitId: habit.HabitID, date, actualValue: actual, status: "Completed", notes };
        } else {
            const checked = row.querySelector(`input[name="status-${habit.HabitID}"]:checked`);
            body = { habitId: habit.HabitID, date, actualValue: 0, status: checked ? checked.value : "Completed", notes };
        }

        try {
            if (logId) {
                await api.put(`/habit-logs/${logId}`, body);
            } else {
                await api.post("/habit-logs", body);
            }
            await load();
        } catch (err) {
            alert("Failed to save: " + err.message);
        }
    }

    async function load() {
        list.innerHTML = `<p class="muted small">Loading…</p>`;

        try {
            const habits = await api.get("/habits");
            const active = habits.filter((h) => h.Status === "Active");

            if (active.length === 0) {
                list.innerHTML = `<p class="muted small">No active habits yet.</p>`;
                return;
            }

            const date = dateInput.value;
            const rows = await Promise.all(active.map(async (habit) => {
                let log = null;
                try {
                    const logs = await api.get(`/habit-logs?habitId=${habit.HabitID}`);
                    log = logs.find((l) => (l.Date || "").slice(0, 10) === date) || null;
                } catch (_) {}
                return renderRow(habit, log);
            }));

            list.innerHTML = "";
            rows.forEach((r) => list.appendChild(r));
        } catch (err) {
            list.innerHTML = `<p class="muted small">Could not load habits: ${err.message}</p>`;
        }
    }

    dateInput.addEventListener("change", load);
    load();
})();