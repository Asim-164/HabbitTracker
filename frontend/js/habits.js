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

        // ---- Route: My Habits list page ----
    if (document.getElementById("habits-list")) {
        initHabitsList();
        return;
    }

    // ---- Route: Habit form page ----
    if (!document.getElementById("habit-form")) {
        return;
    }

    const form = document.getElementById("habit-form");
    const measurableCheckbox = document.getElementById("measurable");
    const targetRow = document.getElementById("target-row");
    const msg = document.getElementById("form-msg");
    const title = document.getElementById("form-title");
    const cancelBtn = document.getElementById("cancel-btn");

    // Detect edit mode from ?id=N in URL
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("id");

    function todayString() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    function toggleTargetRow() {
        if (measurableCheckbox.checked) {
            targetRow.removeAttribute("hidden");
        } else {
            targetRow.setAttribute("hidden", "");
        }
    }

    measurableCheckbox.addEventListener("change", toggleTargetRow);

    cancelBtn.addEventListener("click", () => {
        window.location.href = "/pages/habits.html";
    });

    function setMsg(text, type) {
        msg.textContent = text || "";
        msg.className = "habit-form__msg" + (type ? " " + type : "");
    }

    async function loadForEdit(id) {
        title.textContent = "Edit Habit";
        document.title = "Edit Habit — HabbitTracker";
        try {
            const habits = await api.get("/habits");
            const habit = habits.find((h) => String(h.HabitID) === String(id));
            if (!habit) {
                setMsg("Habit not found.");
                return;
            }
            form.name.value = habit.Name || "";
            form.description.value = habit.Description || "";
            form.frequency.value = habit.Frequency || "Daily";
            form.difficulty.value = habit.Difficulty || "Medium";
            form.startDate.value = (habit.StartDate || "").slice(0, 10);

            const isMeasurable = habit.TargetValue !== null && Number(habit.TargetValue) > 0;
            measurableCheckbox.checked = isMeasurable;
            if (isMeasurable) {
                form.targetValue.value = Number(habit.TargetValue);
                form.unit.value = habit.Unit || "";
            }
            toggleTargetRow();
        } catch (err) {
            setMsg("Could not load habit: " + err.message);
        }
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        setMsg("Saving…");

        const isMeasurable = measurableCheckbox.checked;
        const targetValue = isMeasurable ? Number(form.targetValue.value || 0) : null;
        const unit = isMeasurable ? (form.unit.value || "").trim() : "";

        if (isMeasurable && (!targetValue || targetValue <= 0)) {
            setMsg("Please enter a target value greater than 0.");
            return;
        }

        const body = {
            name: form.name.value.trim(),
            description: form.description.value.trim(),
            frequency: form.frequency.value,
            difficulty: form.difficulty.value,
            startDate: form.startDate.value,
            targetValue,
            unit
        };

        try {
            if (editId) {
                await api.put("/habits/" + editId, {
                    ...body,
                    status: "Active"
                });
                setMsg("Saved.", "success");
            } else {
                await api.post("/habits", body);
                setMsg("Habit created. Redirecting…", "success");
            }
            setTimeout(() => {
                window.location.href = "/pages/habits.html";
            }, 700);
        } catch (err) {
            setMsg("Could not save: " + err.message);
        }
    });

    // Defaults
    if (!editId) {
        form.startDate.value = todayString();
    } else {
        loadForEdit(editId);
    }

    toggleTargetRow();
})();

    function initHabitsList() {
        const list = document.getElementById("habits-list");
        const tabs = document.querySelectorAll(".tab");
        let filter = "all";
        let allHabits = [];
        let logsByHabit = new Map();
        let streaksByHabit = new Map();

        tabs.forEach((tab) => {
            tab.addEventListener("click", () => {
                tabs.forEach((t) => t.classList.remove("is-active"));
                tab.classList.add("is-active");
                filter = tab.dataset.filter;
                render();
            });
        });

        function formatDate(d) {
            const dt = new Date(d);
            const y = dt.getUTCFullYear();
            const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
            const day = String(dt.getUTCDate()).padStart(2, "0");
            return `${y}-${m}-${day}`;
        }

        function lastLogDate(habitId) {
            const logs = logsByHabit.get(habitId) || [];
            if (!logs.length) return "";
            return logs
                .map((l) => formatDate(l.Date))
                .sort()
                .reverse()[0];
        }

        function render() {
            const filtered = allHabits.filter((h) => {
                if (filter === "active") return h.Status === "Active";
                if (filter === "archived") return h.Status !== "Active";
                return true;
            });

            filtered.sort((a, b) => {
                const la = lastLogDate(a.HabitID) || "";
                const lb = lastLogDate(b.HabitID) || "";
                if (la === lb) return b.HabitID - a.HabitID;
                return lb.localeCompare(la);
            });

            if (!filtered.length) {
                list.innerHTML = `<p class="muted small">No habits to show.</p>`;
                return;
            }

            list.innerHTML = "";
            filtered.forEach((habit) => list.appendChild(renderCard(habit)));
        }

        function renderCard(habit) {
            const isMeasurable = habit.TargetValue !== null && Number(habit.TargetValue) > 0;
            const target = isMeasurable ? Number(habit.TargetValue) : 0;
            const streak = streaksByHabit.get(habit.HabitID) || { currentStreak: 0, longestStreak: 0 };

            const meta = [
                habit.Frequency || "Daily",
                isMeasurable ? `${target} ${habit.Unit || ""}`.trim() : null,
                habit.Difficulty || null
            ].filter(Boolean).join(" • ");

            const card = document.createElement("div");
            card.className = "habit-card";
            card.dataset.habitId = habit.HabitID;

            card.innerHTML = `
                <div class="habit-card__head">
                    <div>
                        <div class="habit-card__name">${habit.Name}</div>
                        <div class="habit-card__meta">${meta}</div>
                        ${habit.Description ? `<div class="habit-card__meta">${habit.Description}</div>` : ""}
                    </div>
                    <div class="habit-card__menu-wrap">
                        <button type="button" class="habit-card__menu-btn" aria-label="More actions">⋯</button>
                        <div class="habit-card__menu" hidden>
                            <button type="button" data-action="edit">Edit</button>
                            <button type="button" data-action="archive">${habit.Status === "Active" ? "Archive" : "Unarchive"}</button>
                            <button type="button" data-action="delete" class="is-danger">Delete</button>
                        </div>
                    </div>
                </div>
                <div class="habit-card__top">
                    <div class="habit-card__meta">Status: ${habit.Status}</div>
                    <div class="habit-card__streak">🔥 ${streak.currentStreak} ${streak.currentStreak === 1 ? "day" : "days"} • 🏆 ${streak.longestStreak}</div>
                </div>
            `;

            const menuBtn = card.querySelector(".habit-card__menu-btn");
            const menu = card.querySelector(".habit-card__menu");

            menuBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                document.querySelectorAll(".habit-card__menu").forEach((m) => {
                    if (m !== menu) m.setAttribute("hidden", "");
                });
                menu.toggleAttribute("hidden");
            });

            menu.addEventListener("click", async (e) => {
                const action = e.target.dataset.action;
                if (!action) return;
                menu.setAttribute("hidden", "");

                if (action === "edit") {
                    window.location.href = `/pages/habit-form.html?id=${habit.HabitID}`;
                } else if (action === "archive") {
                    await toggleArchive(habit);
                } else if (action === "delete") {
                    if (confirm(`Delete "${habit.Name}"? This cannot be undone.`)) {
                        await deleteHabit(habit.HabitID);
                    }
                }
            });

            return card;
        }

        async function toggleArchive(habit) {
            try {
                const newStatus = habit.Status === "Active" ? "Archived" : "Active";
                await api.put("/habits/" + habit.HabitID, {
                    name: habit.Name,
                    description: habit.Description,
                    categoryId: habit.CategoryID,
                    targetValue: habit.TargetValue,
                    unit: habit.Unit,
                    frequency: habit.Frequency,
                    difficulty: habit.Difficulty,
                    startDate: (habit.StartDate || "").slice(0, 10),
                    status: newStatus
                });
                await load();
            } catch (err) {
                alert("Failed to update: " + err.message);
            }
        }

        async function deleteHabit(id) {
            try {
                await api.delete("/habits/" + id);
                await load();
            } catch (err) {
                alert("Failed to delete: " + err.message);
            }
        }

        async function load() {
            list.innerHTML = `<p class="muted small">Loading…</p>`;
            try {
                allHabits = await api.get("/habits");

                const results = await Promise.all(allHabits.map(async (h) => {
                    let logs = [];
                    let streak = { currentStreak: 0, longestStreak: 0 };
                    try { logs = await api.get(`/habit-logs?habitId=${h.HabitID}`); } catch (_) {}
                    try { streak = await api.get(`/habits/${h.HabitID}/streak`); } catch (_) {}
                    return { habitId: h.HabitID, logs, streak };
                }));

                logsByHabit = new Map();
                streaksByHabit = new Map();
                results.forEach((r) => {
                    logsByHabit.set(r.habitId, r.logs);
                    streaksByHabit.set(r.habitId, r.streak);
                });

                render();
            } catch (err) {
                list.innerHTML = `<p class="muted small">Could not load habits: ${err.message}</p>`;
            }
        }

        // Close menu when clicking outside
        document.addEventListener("click", () => {
            document.querySelectorAll(".habit-card__menu").forEach((m) => m.setAttribute("hidden", ""));
        });

        load();
    }