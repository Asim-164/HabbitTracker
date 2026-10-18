const API_BASE = "/api";

const Auth = {
    getToken() {
        return sessionStorage.getItem("token");
    },
    getUser() {
        const raw = sessionStorage.getItem("user");
        return raw ? JSON.parse(raw) : null;
    },
    save(token, user) {
        sessionStorage.setItem("token", token);
        sessionStorage.setItem("user", JSON.stringify(user));
    },
    clear() {
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("user");
    },
    isLoggedIn() {
        return !!this.getToken();
    },
    requireLogin() {
        if (!this.isLoggedIn()) {
            window.location.href = "/pages/login.html";
        }
    }
};

async function apiRequest(path, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    const token = Auth.getToken();
    if (token) {
        headers["Authorization"] = "Bearer " + token;
    }

    const response = await fetch(API_BASE + path, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    let data = null;
    try {
        data = await response.json();
    } catch (_) {
        // no JSON body
    }

    if (!response.ok) {
        const message = (data && data.message) || "Request failed";
        const error = new Error(message);
        error.status = response.status;
        error.data = data;
        throw error;
    }

    return data;
}

const api = {
    get:    (path)        => apiRequest(path, { method: "GET" }),
    post:   (path, body)  => apiRequest(path, { method: "POST", body }),
    put:    (path, body)  => apiRequest(path, { method: "PUT", body }),
    delete: (path)        => apiRequest(path, { method: "DELETE" })
};

function confirmDialog({ title, message, confirmLabel }) {
    return new Promise((resolve) => {
        const modal = document.getElementById("confirm-modal");
        if (!modal) {
            // Fallback to native confirm if modal not on this page
            resolve(window.confirm(message || title || "Are you sure?"));
            return;
        }

        document.getElementById("confirm-title").textContent = title || "Are you sure?";
        document.getElementById("confirm-message").textContent = message || "";
        document.getElementById("confirm-ok").textContent = confirmLabel || "Delete";

        modal.removeAttribute("hidden");

        function cleanup() {
            modal.setAttribute("hidden", "");
            ok.removeEventListener("click", onOk);
            cancelEls.forEach((el) => el.removeEventListener("click", onCancel));
        }
        function onOk() { cleanup(); resolve(true); }
        function onCancel() { cleanup(); resolve(false); }

        const ok = document.getElementById("confirm-ok");
        const cancelEls = modal.querySelectorAll("[data-confirm-cancel]");

        ok.addEventListener("click", onOk);
        cancelEls.forEach((el) => el.addEventListener("click", onCancel));
    });
}

// ---------- Global Header Search ----------
document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("search-input");
    const resultsBox = document.getElementById("search-results");
    if (!searchInput || !resultsBox) return;

    let debounceTimer = null;

    searchInput.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        const q = searchInput.value.trim();

        if (q.length < 2) {
            resultsBox.setAttribute("hidden", "");
            resultsBox.innerHTML = "";
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const data = await api.get("/stats/search?q=" + encodeURIComponent(q));
                renderResults(data, q);
            } catch (err) {
                resultsBox.innerHTML = `<div class="search-group-title">Error</div><div class="search-result">${err.message}</div>`;
                resultsBox.removeAttribute("hidden");
            }
        }, 300);
    });

    function renderResults(data, q) {
        const habits = data.habits || [];
        const reflections = data.reflections || [];

        if (habits.length === 0 && reflections.length === 0) {
            resultsBox.innerHTML = `<div class="search-result" style="color: var(--ink-500);">No results for "${q}"</div>`;
            resultsBox.removeAttribute("hidden");
            return;
        }

        let html = "";

        if (habits.length > 0) {
            html += `<div class="search-group-title">Habits</div>`;
            html += habits.map((h) => `
                <a href="/pages/habits.html" class="search-result">
                    <span class="search-result__icon">☑</span>
                    ${h.Name}
                    <span style="margin-left:auto; font-size:11px; color:var(--ink-500);">${h.Status}</span>
                </a>
            `).join("");
        }

        if (reflections.length > 0) {
            html += `<div class="search-group-title">Reflections</div>`;
            html += reflections.map((r) => {
                const d = new Date(r.Date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
                const preview = r.Notes ? r.Notes.slice(0, 50) + (r.Notes.length > 50 ? "…" : "") : r.Mood;
                return `
                    <a href="/pages/reflections.html" class="search-result">
                        <span class="search-result__icon">📝</span>
                        <span><strong>${d}</strong> — ${preview}</span>
                    </a>
                `;
            }).join("");
        }

        resultsBox.innerHTML = html;
        resultsBox.removeAttribute("hidden");
    }

    // Close results when clicking outside
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#app-search")) {
            resultsBox.setAttribute("hidden", "");
        }
    });
});