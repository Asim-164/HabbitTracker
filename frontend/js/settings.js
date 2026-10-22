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

        // Show / hide password toggles
    document.querySelectorAll(".password-toggle").forEach((btn) => {
        btn.addEventListener("click", () => {
            const input = btn.parentElement.querySelector("input");
            if (!input) return;
            const isPassword = input.type === "password";
            input.type = isPassword ? "text" : "password";
            btn.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
        });
    });

        const AVATAR_PRESETS = [
        { value: "🌱", label: "Sprout" },
        { value: "🚀", label: "Rocket" },
        { value: "🎯", label: "Target" },
        { value: "🧘", label: "Zen" },
        { value: "🔥", label: "Flame" },
        { value: "⭐", label: "Star" },
        { value: "sage-circle", label: "Sage Circle" },
        { value: "amber-diamond", label: "Amber Diamond" },
        { value: "sage-triangle", label: "Sage Triangle" },
        { value: "leaf", label: "Leaf Mark" },
        { value: "wave", label: "Wave Mark" },
        { value: "initial", label: "Initial" }
    ];

    function getInitials(name) {
        if (!name) return "?";
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    function nameHashColor(name) {
        const colors = ["#5c9459", "#4a7a48", "#7cae7c", "#3a603a", "#6a9e6a"];
        let hash = 0;
        for (let i = 0; i < (name || "").length; i++) {
            hash = (hash * 31 + name.charCodeAt(i)) % colors.length;
        }
        return colors[hash];
    }

    function renderAvatarPreview(el, name, avatarURL) {
        // Preset emoji
        if (avatarURL && avatarURL.length <= 3 && /^\p{Emoji}/u.test(avatarURL)) {
            el.textContent = avatarURL;
            el.style.background = "var(--sage-50)";
            el.style.color = "inherit";
            el.classList.remove("is-initials");
            return;
        }

        // Geometric / abstract presets — fall back to initial for now
        if (avatarURL === "sage-circle") {
            el.textContent = "";
            el.style.background = "var(--sage-400)";
            el.classList.remove("is-initials");
            return;
        }
        if (avatarURL === "amber-diamond") {
            el.textContent = "◆";
            el.style.background = "#fdf3d9";
            el.style.color = "#d9b558";
            el.classList.remove("is-initials");
            return;
        }
        if (avatarURL === "sage-triangle") {
            el.textContent = "▲";
            el.style.background = "var(--sage-100)";
            el.style.color = "var(--sage-700)";
            el.classList.remove("is-initials");
            return;
        }
        if (avatarURL === "leaf") {
            el.textContent = "🌿";
            el.style.background = "var(--sage-50)";
            el.classList.remove("is-initials");
            return;
        }
        if (avatarURL === "wave") {
            el.textContent = "≈";
            el.style.background = "#e8f0f5";
            el.style.color = "#2a4d68";
            el.classList.remove("is-initials");
            return;
        }

        // Default: initials
        el.textContent = getInitials(name);
        el.style.background = nameHashColor(name);
        el.style.color = "#fff";
        el.classList.add("is-initials");
    }

    const avatarPreview = document.getElementById("avatar-preview");
    const avatarOptions = document.getElementById("avatar-options");
    const currentUser = Auth.getUser();

    if (avatarPreview && currentUser) {
        renderAvatarPreview(avatarPreview, currentUser.name, currentUser.avatarURL);
    }

    if (avatarOptions && currentUser) {
        avatarOptions.innerHTML = AVATAR_PRESETS.map(p => {
            const isActive = (currentUser.avatarURL || "") === p.value;
            const isEmoji = p.value.length <= 3 && /\p{Emoji}/u.test(p.value);
            const display = isEmoji ? p.value
                : p.value === "sage-circle" ? "●"
                : p.value === "amber-diamond" ? "◆"
                : p.value === "sage-triangle" ? "▲"
                : p.value === "leaf" ? "🌿"
                : p.value === "wave" ? "≈"
                : "A";
            const extraClass = isEmoji ? " is-emoji" : "";
            return `
                <button type="button" class="avatar-option${extraClass} ${isActive ? "is-active" : ""}" data-value="${p.value}" title="${p.label}">
                    ${display}
                </button>
            `;
        }).join("");

    avatarOptions.addEventListener("click", async (e) => {
            const btn = e.target.closest(".avatar-option");
            if (!btn) return;
            const value = btn.dataset.value;

            try {
                await api.put("/users/avatar", { avatarURL: value });
                // Update local user
                currentUser.avatarURL = value;
                Auth.save(Auth.getToken(), currentUser);
                // Update preview
                renderAvatarPreview(avatarPreview, currentUser.name, value);
                // Update active state
                avatarOptions.querySelectorAll(".avatar-option").forEach(b => b.classList.remove("is-active"));
                btn.classList.add("is-active");
            } catch (err) {
                alert("Could not update avatar: " + err.message);
            }
        });
    }

    const profileForm = document.getElementById("profile-form");
    const profileMsg = document.getElementById("profile-msg");
    const passwordForm = document.getElementById("password-form");
    const passwordMsg = document.getElementById("password-msg");

    function setMsg(el, text, type) {
        el.textContent = text || "";
        el.className = "habit-form__msg" + (type ? " " + type : "");
    }

    // Pre-fill profile form from sessionStorage
    if (user) {
        profileForm.name.value = user.name || "";
        profileForm.email.value = user.email || "";
    }

    profileForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setMsg(profileMsg, "Saving…");

        const name = profileForm.name.value.trim();
        const email = profileForm.email.value.trim();

        try {
            const result = await api.put("/users/me", { name, email });

            // Update sessionStorage so header/welcome reflects new info
            Auth.save(Auth.getToken(), {
                userId: result.user.userId,
                name: result.user.name,
                email: result.user.email
            });

            document.getElementById("user-name").textContent = result.user.name;
            setMsg(profileMsg, "Profile updated.", "success");
        } catch (err) {
            setMsg(profileMsg, err.message || "Could not update profile");
        }
    });

    passwordForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setMsg(passwordMsg, "");

        const currentPassword = passwordForm.currentPassword.value;
        const newPassword = passwordForm.newPassword.value;
        const confirmPassword = passwordForm.confirmPassword.value;

        if (newPassword !== confirmPassword) {
            setMsg(passwordMsg, "New passwords do not match");
            return;
        }

        setMsg(passwordMsg, "Updating…");

        try {
            await api.put("/users/password", { currentPassword, newPassword });
            setMsg(passwordMsg, "Password updated successfully.", "success");
            passwordForm.reset();
        } catch (err) {
            setMsg(passwordMsg, err.message || "Could not update password");
        }
    });
})();