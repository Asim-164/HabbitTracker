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