(function () {
    const card = document.querySelector(".auth__card");
    const switchBtn = document.getElementById("switch-btn");
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const brandHeadline = document.getElementById("brand-headline");
    const brandSub = document.getElementById("brand-sub");
    const loginMsg = document.getElementById("login-msg");
    const registerMsg = document.getElementById("register-msg");

    let mode = "login";
    // 1. Define the check function
    function checkAlreadyLoggedIn() {
        if (Auth.isLoggedIn()) {
            const modal = document.getElementById("logout-modal");
            if (modal) {
                modal.removeAttribute("hidden");

                document.getElementById("stay-btn").addEventListener("click", () => {
                    window.location.replace("/pages/dashboard.html");
                });

                document.getElementById("logout-btn").addEventListener("click", () => {
                    Auth.clear();
                    modal.setAttribute("hidden", "");
                    window.location.replace("/pages/login.html");
                });
            }
            return true;
        }
        return false;
    }

    // 2. Run it immediately on normal page load
    if (checkAlreadyLoggedIn()) return;

    // 3. Run it every time the page loads, from any source (Back button, direct link, cache)
    window.addEventListener("pageshow", () => {
        if (Auth.isLoggedIn()) {
            const modal = document.getElementById("logout-modal");
            if (modal && modal.hasAttribute("hidden")) {
                modal.removeAttribute("hidden");

                // Remove any old listeners by cloning buttons
                const oldStay = document.getElementById("stay-btn");
                const oldLogout = document.getElementById("logout-btn");
                const newStay = oldStay.cloneNode(true);
                const newLogout = oldLogout.cloneNode(true);
                oldStay.replaceWith(newStay);
                oldLogout.replaceWith(newLogout);

                newStay.addEventListener("click", () => {
                    window.location.href = "/pages/dashboard.html";
                });

                newLogout.addEventListener("click", () => {
                    Auth.clear();
                    modal.setAttribute("hidden", "");
                    window.location.replace("/pages/login.html");
                });
            }
        }
    });

    function render() {
        if (mode === "login") {
            loginForm.hidden = false;
            registerForm.hidden = true;
            brandHeadline.textContent = "Good to see you again";
            brandSub.textContent = "Small steps, every day. Let's keep the streak alive.";
            switchBtn.textContent = "Create Account";
            card.classList.remove("flipped");
        } else {
            loginForm.hidden = true;
            registerForm.hidden = false;
            brandHeadline.textContent = "Hi there";
            brandSub.textContent = "Don't just mark it done — track how you perform.";
            switchBtn.textContent = "Sign In";
            card.classList.add("flipped");
        }
        loginMsg.textContent = "";
        registerMsg.textContent = "";

        // Reset buttons in case of cached bfcache state
        const loginBtn = loginForm.querySelector("button[type='submit']");
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerHTML = "Sign In";
        }
        const regBtn = registerForm.querySelector("button[type='submit']");
        if (regBtn) {
            regBtn.disabled = false;
            regBtn.innerHTML = "Create Account";
        }
    }

    function setMsg(el, text, type) {
        el.textContent = text;
        el.className = "auth__msg" + (type ? " " + type : "");
    }

    switchBtn.addEventListener("click", () => {
        mode = mode === "login" ? "register" : "login";
        render();
    });

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = loginForm.email.value.trim();
        const password = loginForm.password.value;
        const submitBtn = loginForm.querySelector("button[type='submit']");

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner"></span> Signing in…`;
        setMsg(loginMsg, ""); // clear old errors

        try {
            const data = await api.post("/users/login", { email, password });
                        Auth.save(data.token, {
                userId: data.userId,
                name: data.name,
                email: data.email,
                createdAt: data.createdAt
            });
            window.location.href = "/pages/dashboard.html";
        } catch (err) {
            setMsg(loginMsg, err.message || "Sign in failed");
            submitBtn.disabled = false;
            submitBtn.innerHTML = "Sign In";
        }
    });

    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = registerForm.name.value.trim();
        const email = registerForm.email.value.trim();
        const password = registerForm.password.value;
        const submitBtn = registerForm.querySelector("button[type='submit']");

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner"></span> Creating…`;
        setMsg(registerMsg, "");
        try {
            await api.post("/users/register", { name, email, password });
            setMsg(registerMsg, "Account created. You can sign in now.", "success");
            setTimeout(() => {
                mode = "login";
                render();
                loginForm.email.value = email;
            }, 900);
        } catch (err) {
            setMsg(registerMsg, err.message || "Registration failed");
            submitBtn.disabled = false;
            submitBtn.innerHTML = "Create Account";
        }
    });

    render();
})();