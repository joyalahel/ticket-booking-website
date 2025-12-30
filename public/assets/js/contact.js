const contactMsg = document.getElementById("organizerApplyMessage") || document.getElementById("contactFormMessage");

const setContactMsg = (text, variant = "warning") => {
  if (!contactMsg) return;
  contactMsg.textContent = text;
  contactMsg.className = `alert alert-${variant}`;
  contactMsg.classList.remove("d-none");
};

const clearContactMsg = () => contactMsg && contactMsg.classList.add("d-none");

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contactForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearContactMsg();

    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.name || !data.email || !data.message) {
      setContactMsg("Name, email, and message are required.", "danger");
      return;
    }

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setContactMsg(json.error || "Could not submit inquiry.", "danger");
        return;
      }
      setContactMsg("Inquiry sent. We will get back to you soon.", "success");
      form.reset();
    } catch (err) {
      console.error("Contact submit error:", err);
      setContactMsg("Server error. Please try again.", "danger");
    }
  });
});
