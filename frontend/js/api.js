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