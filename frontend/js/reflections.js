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
                <div class="reflection__head">
                    <div>
                        <span class="reflection__date">${formatDate(r.Date)}</span>
                        <span class="reflection__mood-label"> · ${r.Mood}</span>
                    </div>
                    <div class="reflection__actions">
                        <button type="button" class="reflection__action" data-action="edit">Edit</button>
                        <button type="button" class="reflection__action is-danger" data-action="delete">Delete</button>
                    </div>
                </div>
                ${r.Notes ? `<div class="reflection__notes">${r.Notes}</div>` : ""}
            </div>
        `;

        el.querySelectorAll("[data-action]").forEach((btn) => {
            btn.addEventListener("click", async () => {
                if (btn.dataset.action === "edit") {
                    openModal(r);
                } else if (btn.dataset.action === "delete") {
                    if (confirm("Delete this reflection?")) {
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

    async function load() {
        list.innerHTML = `<p class="muted small">Loading…</p>`;
        try {
            const reflections = await api.get("/reflections");
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