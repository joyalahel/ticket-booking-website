const form = document.getElementById("loginForm");
const msg = document.getElementById("loginMessage");
const loginBtn = document.getElementById("loginBtn");

function showMessage(text, type = "info") {
  msg.textContent = text;
  msg.className = "form-message " + type; // info | success | error
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    showMessage("Please fill in both fields.", "error");
    return;
  }

  try {
    loginBtn.disabled = true;
    showMessage("Logging in...", "info");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    let data = {};
    try {
      data = await res.json();
    } catch (err) {
      // ignore JSON errors, keep data as {}
    }

    const success =
      data.success === true || (res.ok && data.error !== true);

    if (!success) {
      const message =
        data.message ||
        data.error ||
        "Login failed. Please check your email and password.";
      showMessage(message, "error");
      loginBtn.disabled = false;
      return;
    }

    // Try to read token from common property names
    const token = data.token || data.accessToken || data.jwt;

    if (token) {
      localStorage.setItem("authToken", token);
    }

    if (data.user) {
      localStorage.setItem("currentUser", JSON.stringify(data.user));
    }

    showMessage("Login successful! Redirecting...", "success");

    // Redirect – you can change this to / if you want
    setTimeout(() => {
      window.location.href = "/";
    }, 800);
  } catch (error) {
    console.error("Login error:", error);
    showMessage("Server error. Please try again later.", "error");
    loginBtn.disabled = false;
  }
});
