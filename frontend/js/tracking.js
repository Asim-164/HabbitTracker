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
        window.location.replace("/pages/login.html");
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

    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get("date");

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        dateInput.value = dateParam;
    } else {
        dateInput.value = todayString();
    }
    const dateBtn = document.getElementById("date-btn");
    if (dateBtn) {
        dateBtn.addEventListener("click", () => {
            // Temporarily position the invisible input exactly under the button
            // so the native calendar pop-up anchors correctly
            const rect = dateBtn.getBoundingClientRect();
            dateInput.style.position = "fixed";
            dateInput.style.top = rect.bottom + "px";
            dateInput.style.left = rect.left + "px";
            dateInput.style.width = rect.width + "px";
            dateInput.style.height = "1px";

            try {
                dateInput.showPicker();
            } catch (err) {
                dateInput.focus();
            }
        });
    }
        function updateDateDisplay() {
        const el = document.getElementById("date-display");
        if (!el) return;
        const d = new Date(dateInput.value + "T00:00:00");
        const label = d.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric"
        });
        el.textContent = label;
    }

    dateInput.addEventListener("change", updateDateDisplay);
    updateDateDisplay();

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

        const progressPct = isMeasurable && target > 0
            ? Math.min(100, Math.round((actual / target) * 100))
            : (log && log.Status === "Completed" ? 100 : 0);

        const progressClass =
            log && log.Status === "Completed" ? "is-completed" :
            log && log.Status === "Partial"   ? "is-partial"   :
            log && log.Status === "Missed"    ? "is-missed"    : "is-empty";

        const valueField = isMeasurable
            ? `<div class="track-input-wrap">
                   <input type="number" min="0" step="1" class="track-input" value="${actual}" placeholder="0">
                   <span class="track-input__unit">${habit.Unit || "units"}</span>
               </div>`
            : `<div class="track-radio">
                   <label><input type="radio" name="status-${habit.HabitID}" value="Completed" ${log && log.Status === "Completed" ? "checked" : ""}> <span>Done</span></label>
                   <label><input type="radio" name="status-${habit.HabitID}" value="Missed" ${log && log.Status === "Missed" ? "checked" : ""}> <span>Missed</span></label>
               </div>`;

        const hasNotes = log && log.Notes;
        const notesExpanded = hasNotes ? "is-open" : "";

        const row = document.createElement("div");
        row.className = "track-row";
        row.dataset.habitId = habit.HabitID;
        row.dataset.logId = log ? log.LogID : "";
        row.dataset.measurable = isMeasurable ? "1" : "0";
        row.dataset.target = target;
        row.dataset.unit = habit.Unit || "";

        row.innerHTML = `
            <div class="track-row__head">
                <div class="track-row__title-wrap">
                    <div class="track-row__name">${habit.Name}</div>
                    <div class="track-row__meta">${habit.Frequency || "Daily"}${isMeasurable ? ` • ${target} ${habit.Unit || ""}`.trim() : ""}</div>
                </div>
                <div class="track-badge ${info.cls}">${info.icon} ${info.label}</div>
            </div>

            <div class="track-progress ${progressClass}">
                <div class="track-progress__fill" style="width:${progressPct}%"></div>
            </div>

            <div class="track-row__body">
                <div class="track-row__inputs">${valueField}</div>
                <div class="track-row__actions">
                    <button type="button" class="track-note-toggle ${notesExpanded}">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                        <span>Note</span>
                    </button>
                    <button type="button" class="track-save">Save</button>
                </div>
            </div>

            <div class="track-row__note ${notesExpanded}">
                <textarea class="track-notes" rows="2" placeholder="Add a note…">${log && log.Notes ? log.Notes : ""}</textarea>
            </div>
        `;

        const noteToggle = row.querySelector(".track-note-toggle");
        const noteArea = row.querySelector(".track-row__note");
        noteToggle.addEventListener("click", () => {
            noteArea.classList.toggle("is-open");
            noteToggle.classList.toggle("is-open");
            if (noteArea.classList.contains("is-open")) {
                row.querySelector(".track-notes").focus();
            }
        });

        row.querySelector(".track-save").addEventListener("click", () => saveRow(row, habit));

        // If the selected date is not today, make the row read-only
        const selectedDate = dateInput.value;
        const todayStr = todayString();
        if (selectedDate !== todayStr) {
            const input = row.querySelector(".track-input");
            if (input) input.disabled = true;

            row.querySelectorAll("input[type='radio']").forEach((r) => r.disabled = true);

            row.querySelector(".track-save").style.display = "none";
            noteToggle.style.display = "none";

            const notes = row.querySelector(".track-notes");
            if (notes) notes.readOnly = true;

            // If a note exists for a past date, open it so the user can read it
            if (notes && notes.value.trim()) {
                noteArea.classList.add("is-open");
            }
        }

        return row;
    }

    async function saveRow(row, habit) {
        const date = dateInput.value;
        const isMeasurable = row.dataset.measurable === "1";
        const logId = row.dataset.logId;
        const notes = row.querySelector(".track-notes").value.trim();

        let body;
        if (isMeasurable) {
            const actual = Number(row.querySelector(".track-input").value || 0);
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