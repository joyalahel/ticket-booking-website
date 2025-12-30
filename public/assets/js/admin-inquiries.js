const inqMsg = document.getElementById("adminInquiriesMessage");
const inqBody = document.querySelector("#adminInquiriesTable tbody");

const setInqMsg = (text, variant = "warning") => {
  if (!inqMsg) return;
  inqMsg.textContent = text;
  inqMsg.className = `alert alert-${variant}`;
  inqMsg.classList.remove("d-none");
};

const clearInqMsg = () => inqMsg && inqMsg.classList.add("d-none");

const ensureToken = () => {
  const t = localStorage.getItem("authToken");
  if (!t) {
    setInqMsg("Redirecting to sign in...", "info");
    setTimeout(() => (window.location.href = "/login?redirect=/admin/inquiries"), 500);
  }
  return t;
};

async function fetchInquiries() {
  const token = ensureToken();
  if (!token) return;
  try {
    const res = await fetch("/api/admin/inquiries", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    renderInquiries(data.inquiries || []);
    clearInqMsg();
  } catch (err) {
    console.error("Inquiries load error:", err);
    setInqMsg("Could not load inquiries.", "danger");
  }
}

function renderInquiries(list) {
  if (!inqBody) return;
  inqBody.innerHTML = "";
  if (!list.length) {
    inqBody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-3">No inquiries.</td></tr>`;
    return;
  }
  list.forEach((q) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${q.id || ""}</td>
      <td>${q.name || ""}</td>
      <td>${q.email || ""}</td>
      <td>${q.phone || ""}</td>
      <td>${q.country || ""}</td>
      <td>${q.event || ""}</td>
      <td class="small">${q.message || ""}</td>
      <td>${q.created_at ? new Date(q.created_at).toLocaleString() : ""}</td>
    `;
    inqBody.appendChild(tr);
  });
}

document.addEventListener("DOMContentLoaded", fetchInquiries);
