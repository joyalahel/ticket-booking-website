const applyMsg = document.getElementById("organizerApplyMessage");
const applyForm = document.getElementById("organizerApplyForm");

const setApplyMsg = (text, variant = "warning") => {
  if (!applyMsg) return;
  applyMsg.textContent = text;
  applyMsg.className = `alert alert-${variant}`;
  applyMsg.classList.remove("d-none");
};

const clearApplyMsg = () => applyMsg && applyMsg.classList.add("d-none");

const ensureToken = () => {
  const t = localStorage.getItem("authToken");
  if (!t) {
    setApplyMsg("Please sign in to submit a request.", "info");
    setTimeout(() => (window.location.href = "/login?redirect=/organizer-apply"), 500);
  }
  return t;
};

async function submitOrganizerRequest(notes) {
  const token = ensureToken();
  if (!token) return;
  try {
    const res = await fetch("/api/organizers/apply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ notes }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      setApplyMsg(data.error || "Could not submit request.", "danger");
      return;
    }
    setApplyMsg("Request submitted. We will review soon.", "success");
    applyForm.reset();
  } catch (err) {
    console.error("Organizer apply error:", err);
    setApplyMsg("Server error. Please try again.", "danger");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!applyForm) return;
  applyForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearApplyMsg();
    const notes = (applyForm.querySelector('[name="notes"]')?.value || "").trim();
    submitOrganizerRequest(notes);
  });
});
