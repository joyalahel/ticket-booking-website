async function fetchProfile() {
  const token = localStorage.getItem("authToken");
  if (!token) return null;

  const res = await fetch("/api/auth/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 || res.status === 403) {
    return null;
  }

  const data = await res.json();
  return data?.user || null;
}

function renderProfile(user) {
  const nameEl = document.getElementById("profileName");
  const emailEl = document.getElementById("profileEmail");
  const phoneEl = document.getElementById("profilePhone");
  const roleEl = document.getElementById("profileRole");

  if (nameEl) nameEl.textContent = user.name || "No name";
  if (emailEl) emailEl.textContent = user.email || "No email";
  if (phoneEl) phoneEl.textContent = user.phone || "No phone";
  if (roleEl) roleEl.textContent = user.role || "user";
}

function redirectToLogin() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("currentUser");
  window.location.href = "/";
}

document.addEventListener("DOMContentLoaded", async () => {
  const cached = localStorage.getItem("currentUser");
  let user = cached ? JSON.parse(cached) : null;

  const signOutBtn = document.getElementById("profileSignout");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      redirectToLogin();
    });
  }

  const changePasswordBtn = document.getElementById("changePasswordBtn");
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener("click", handleChangePassword);
  }

  const deleteAccountBtn = document.getElementById("deleteAccountBtn");
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener("click", handleDeleteAccount);
  }

  // Always refresh from server so data stays current
  const fresh = await fetchProfile();
  if (fresh) {
    localStorage.setItem("currentUser", JSON.stringify(fresh));
    user = fresh;
  }

  if (!user) {
    redirectToLogin();
    return;
  }

  renderProfile(user);
});

async function handleChangePassword() {
  const currentInput = document.getElementById("currentPasswordInput");
  const newInput = document.getElementById("newPasswordInput");
  const confirmInput = document.getElementById("confirmPasswordInput");
  const msgBox = document.getElementById("passwordMessage");

  const current = currentInput.value.trim();
  const next = newInput.value.trim();
  const confirm = confirmInput.value.trim();

  if (!current || !next || !confirm) {
    showMessage(msgBox, "Please fill in all password fields.", "danger");
    return;
  }
  if (next !== confirm) {
    showMessage(msgBox, "New password and confirmation do not match.", "danger");
    return;
  }
  if (next.length < 6) {
    showMessage(msgBox, "New password must be at least 6 characters.", "danger");
    return;
  }

  try {
    const token = localStorage.getItem("authToken");
    const res = await fetch("/api/auth/account/password", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        current_password: current,
        new_password: next,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || "Could not update password.");
    }
    showMessage(msgBox, data.message || "Password updated successfully.", "success");
    currentInput.value = "";
    newInput.value = "";
    confirmInput.value = "";
  } catch (err) {
    showMessage(msgBox, err.message || "Server error. Please try again.", "danger");
  }
}

async function handleDeleteAccount() {
  const msgBox = document.getElementById("deleteMessage");
  const confirmed = window.confirm("Are you sure you want to deactivate your account? This is a soft delete; contact support to restore within 30 days.");
  if (!confirmed) return;

  try {
    const token = localStorage.getItem("authToken");
    const res = await fetch("/api/auth/account", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || "Could not delete account.");
    }
    showMessage(msgBox, data.message || "Account deleted.", "success");
    setTimeout(() => redirectToLogin(), 1200);
  } catch (err) {
    showMessage(msgBox, err.message || "Server error. Please try again.", "danger");
  }
}

function showMessage(el, text, type = "info") {
  if (!el) return;
  el.classList.remove("d-none", "alert-success", "alert-danger", "alert-info", "alert-warning");
  el.classList.add(`alert-${type}`);
  el.textContent = text;
  setTimeout(() => {
    el.classList.add("d-none");
  }, 4000);
}
