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
    
    const habitSelect = document.getElementById("habit-select");
    const monthLabel = document.getElementById("month-label");
    const calendar = document.getElementById("calendar");
    const prevBtn = document.getElementById("prev-btn");
    const nextBtn = document.getElementById("next-btn");
    const todayBtn = document.getElementById("today-btn");

    const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    let currentMonth = ""; // "YYYY-MM"

    function todayMonth() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    function shiftMonth(delta) {
        const [y, m] = currentMonth.split("-").map(Number);
        const d = new Date(Date.UTC(y, m - 1 + delta, 1));
        currentMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    }

    function monthLabelText(monthStr) {
        const [y, m] = monthStr.split("-").map(Number);
        const d = new Date(Date.UTC(y, m - 1, 1));
        return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    }

    function statusClass(status) {
        if (status === "Completed") return "is-completed";
        if (status === "Partial")   return "is-partial";
        if (status === "Missed")    return "is-missed";
        return "";
    }

    function renderGrid(monthStr, days) {
        calendar.innerHTML = "";

        DOW.forEach((d) => {
            const el = document.createElement("div");
            el.className = "cal__dow";
            el.textContent = d;
            calendar.appendChild(el);
        });

        const [y, m] = monthStr.split("-").map(Number);
        const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=Sun
        // Convert to Monday-first index: Mon=0, Sun=6
        const blankCount = (firstDow + 6) % 7;

        for (let i = 0; i < blankCount; i += 1) {
            const el = document.createElement("div");
            el.className = "cal__day is-blank";
            calendar.appendChild(el);
        }

        const today = (() => {
            const t = new Date();
            return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
        })();

        days.forEach((day) => {
            const el = document.createElement("div");
            el.className = "cal__day " + statusClass(day.status);
            if (day.date === today) el.classList.add("is-today");
            el.textContent = Number(day.date.slice(8, 10));
            el.addEventListener("click", () => {
                window.location.href = `/pages/tracking.html?date=${day.date}`;
            });
            calendar.appendChild(el);
        });
        
    }

    function fillStats(days, streakData) {
        const logged = days.filter((d) => d.status !== null);
        const completed = days.filter((d) => d.status === "Completed").length;
        const rate = logged.length === 0 ? 0 : Math.round((completed / logged.length) * 100);

        document.getElementById("month-logged").textContent =
            `${logged.length} / ${days.length}`;

        document.getElementById("month-completed").textContent = completed;

        document.getElementById("month-rate").textContent = `${rate}%`;

        document.getElementById("month-streak").textContent =
            streakData && streakData.currentStreak !== undefined
                ? `🔥 ${streakData.currentStreak} ${streakData.currentStreak === 1 ? "day" : "days"}`
                : "—";
    }

    function clearStats() {
        ["month-logged", "month-completed", "month-rate", "month-streak"]
            .forEach((id) => document.getElementById(id).textContent = "—");
    }

    async function load() {
        const habitId = habitSelect.value;
        if (!habitId) {
            calendar.innerHTML = "";
            monthLabel.textContent = "—";
            clearStats();
            return;
        }

        monthLabel.textContent = monthLabelText(currentMonth);
        calendar.innerHTML = `<p class="muted small">Loading…</p>`;
        clearStats();

        try {
            const data = await api.get(`/stats/calendar?habitId=${habitId}&month=${currentMonth}`);
            renderGrid(currentMonth, data.days);

            let streakData = null;
            try {
                streakData = await api.get(`/habits/${habitId}/streak`);
            } catch (_) {}

            fillStats(data.days, streakData);
        } catch (err) {
            calendar.innerHTML = `<p class="muted small">Could not load calendar: ${err.message}</p>`;
        }
    }

    prevBtn.addEventListener("click", () => { shiftMonth(-1); load(); });
    nextBtn.addEventListener("click", () => { shiftMonth(1); load(); });
    todayBtn.addEventListener("click", () => { currentMonth = todayMonth(); load(); });
    habitSelect.addEventListener("change", load);

    async function init() {
        currentMonth = todayMonth();

        try {
            const habits = await api.get("/habits");
            const active = habits.filter((h) => h.Status === "Active");

            if (active.length === 0) {
                habitSelect.innerHTML = `<option value="">No active habits</option>`;
                calendar.innerHTML = `<p class="muted small">No active habits yet.</p>`;
                return;
            }

            habitSelect.innerHTML = active
                .map((h) => `<option value="${h.HabitID}">${h.Name}</option>`)
                .join("");

            await load();
        } catch (err) {
            habitSelect.innerHTML = `<option value="">Error loading habits</option>`;
            calendar.innerHTML = `<p class="muted small">Could not load habits: ${err.message}</p>`;
        }
    }

    init();
})();