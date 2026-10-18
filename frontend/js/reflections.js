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

    const list = document.getElementById("reflections-list");
    const modal = document.getElementById("reflection-modal");
    const form = document.getElementById("reflection-form");
    const msg = document.getElementById("reflection-msg");
    const newBtn = document.getElementById("new-reflection-btn");

    const MOOD_EMOJI = {
        Bad: "😞",
        Meh: "😕",
        Okay: "😐",
        Good: "🙂",
        Great: "😄"
    };

    let editingId = null;

    function todayString() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    function formatDate(d) {
        const dt = new Date(d);
        return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
    }

    function setMsg(text, type) {
        msg.textContent = text || "";
        msg.className = "habit-form__msg" + (type ? " " + type : "");
    }

    function openModal(reflection) {
        editingId = reflection ? reflection.ReflectionID : null;
        form.date.value = reflection ? (reflection.Date || "").slice(0, 10) : todayString();
        form.mood.value = reflection ? reflection.Mood : "";
        form.notes.value = reflection ? (reflection.Notes || "") : "";
        setMsg("");
        modal.removeAttribute("hidden");
    }

    function closeModal() {
        modal.setAttribute("hidden", "");
        editingId = null;
    }

    newBtn.addEventListener("click", () => openModal(null));

    modal.querySelectorAll("[data-close]").forEach((el) => {
        el.addEventListener("click", closeModal);
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !modal.hasAttribute("hidden")) closeModal();
    });

    function renderCard(r) {
        const el = document.createElement("div");
        el.className = "reflection";
        el.innerHTML = `
            <div class="reflection__mood">${MOOD_EMOJI[r.Mood] || "•"}</div>
            <div class="reflection__body">
                <div>
                    <span class="reflection__date">${formatDate(r.Date)}</span>
                    <span class="reflection__mood-label">${r.Mood}</span>
                </div>
                ${r.Notes ? `<div class="reflection__notes">${r.Notes}</div>` : ""}
            </div>
            <div class="reflection__actions">
                <button type="button" class="reflection__action" data-action="edit" aria-label="Edit">✎</button>
                <button type="button" class="reflection__action is-danger" data-action="delete" aria-label="Delete">✕</button>
            </div>
        `;

        el.querySelectorAll("[data-action]").forEach((btn) => {
            btn.addEventListener("click", async () => {
                if (btn.dataset.action === "edit") {
                    openModal(r);
                } else if (btn.dataset.action === "delete") {
                    const yes = await confirmDialog({
                        title: "Delete this reflection?",
                        message: "This reflection will be permanently removed. This cannot be undone.",
                        confirmLabel: "Delete"
                    });
                    if (yes) {
                        try {
                            await api.delete("/reflections/" + r.ReflectionID);
                            await load();
                        } catch (err) {
                            alert("Failed to delete: " + err.message);
                        }
                    }
                }
            });
        });

        return el;
    }

    function moodClass(mood) {
        if (mood === "Great") return "is-great";
        if (mood === "Good")  return "is-good";
        if (mood === "Okay")  return "is-okay";
        if (mood === "Meh")   return "is-meh";
        if (mood === "Bad")   return "is-bad";
        return "is-none";
    }

    function renderMoodStrip(reflections) {
        const container = document.getElementById("mood-dots");
        const label = document.getElementById("mood-month");
        if (!container) return;

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = now.getDate();

        const monthName = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        label.textContent = monthName;

        const moodByDay = new Map();
        for (const r of reflections) {
            const d = new Date(r.Date);
            if (d.getFullYear() === year && d.getMonth() === month) {
                moodByDay.set(d.getDate(), r.Mood);
            }
        }

        container.innerHTML = "";
        for (let day = 1; day <= daysInMonth; day += 1) {
            const mood = moodByDay.get(day);
            const el = document.createElement("div");
            el.className = "mood-day " + (mood ? moodClass(mood) : "is-none");
            if (day === today) el.classList.add("is-today");
            el.textContent = day;
            el.title = mood ? `Day ${day}: ${mood}` : `Day ${day}: no entry`;
            container.appendChild(el);
        }
    }

    async function load() {
        list.innerHTML = `<p class="muted small">Loading…</p>`;
        try {
            const reflections = await api.get("/reflections");
            renderMoodStrip(reflections);

            if (!reflections.length) {
                list.innerHTML = `<p class="muted small">No reflections yet. Add one to get started.</p>`;
                return;
            }
            list.innerHTML = "";
            reflections.forEach((r) => list.appendChild(renderCard(r)));
        } catch (err) {
            list.innerHTML = `<p class="muted small">Could not load reflections: ${err.message}</p>`;
        }
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        setMsg("Saving…");

        const body = {
            date: form.date.value,
            mood: form.mood.value,
            notes: form.notes.value.trim()
        };

        try {
            if (editingId) {
                await api.put("/reflections/" + editingId, body);
            } else {
                await api.post("/reflections", body);
            }
            closeModal();
            await load();
        } catch (err) {
            setMsg("Could not save: " + err.message);
        }
    });

    load();
})();