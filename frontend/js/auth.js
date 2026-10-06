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

        setMsg(loginMsg, "Signing in…");
        try {
            const data = await api.post("/users/login", { email, password });
            Auth.save(data.token, {
                userId: data.userId,
                name: data.name,
                email: data.email
            });
            window.location.href = "/pages/dashboard.html";
        } catch (err) {
            setMsg(loginMsg, err.message || "Sign in failed");
        }
    });

    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = registerForm.name.value.trim();
        const email = registerForm.email.value.trim();
        const password = registerForm.password.value;

        setMsg(registerMsg, "Creating account…");
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
        }
    });

    render();
})();