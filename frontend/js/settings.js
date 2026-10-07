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