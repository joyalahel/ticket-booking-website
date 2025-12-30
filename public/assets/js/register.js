const form = document.getElementById("registerForm");
const messageEl = document.getElementById("registerMessage");
const registerBtn = document.getElementById("registerBtn");

function showMessage(text, type = "info") {
  messageEl.textContent = text;
  messageEl.className = "form-message " + type; // info | success | error
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  // Basic client-side validation
  if (password !== confirmPassword) {
    showMessage("Passwords do not match.", "error");
    return;
  }

  if (password.length < 6) {
    showMessage("Password must be at least 6 characters.", "error");
    return;
  }

  const payload = { name, email, password, phone };

  try {
    registerBtn.disabled = true;
    showMessage("Creating your account...", "info");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    // You can adapt this depending on what AuthController.register returns
    const success = data.success ?? res.ok;

    if (!success) {
      showMessage(data.message || "Registration failed.", "error");
      registerBtn.disabled = false;
      return;
    }

    showMessage("Account created successfully! Redirecting to login...", "success");

    setTimeout(() => {
      window.location.href = "/login";
    }, 1000);
  } catch (err) {
    console.error(err);
    showMessage("Server error. Please try again.", "error");
    registerBtn.disabled = false;
  }
});
