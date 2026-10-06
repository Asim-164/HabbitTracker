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