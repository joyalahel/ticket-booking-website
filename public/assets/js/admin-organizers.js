const orgMsg = document.getElementById("adminOrgMessage");
const orgBody = document.querySelector("#adminOrgTable tbody");

const setOrgMsg = (text, variant = "warning") => {
  if (!orgMsg) return;
  orgMsg.textContent = text;
  orgMsg.className = `alert alert-${variant}`;
  orgMsg.classList.remove("d-none");
};

const clearOrgMsg = () => orgMsg && orgMsg.classList.add("d-none");

const ensureToken = () => {
  const t = localStorage.getItem("authToken");
  if (!t) {
    setOrgMsg("Redirecting to sign in...", "info");
    setTimeout(() => (window.location.href = "/login?redirect=/admin/organizers"), 500);
  }
  return t;
};

async function fetchRequests() {
  const token = ensureToken();
  if (!token) return;
  try {
    const res = await fetch("/api/organizers/requests", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    renderRequests(data.requests || []);
    clearOrgMsg();
  } catch (err) {
    console.error("Organizer requests load error:", err);
    setOrgMsg("Could not load organizer requests.", "danger");
  }
}

function renderRequests(list) {
  if (!orgBody) return;
  orgBody.innerHTML = "";
  if (!list.length) {
    orgBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No pending requests.</td></tr>`;
    return;
  }
  list.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${r.name || ""}</td>
      <td>${r.email || ""}</td>
      <td class="small text-muted">${r.notes || "-"}</td>
      <td>${r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td>
      <td class="text-end d-flex gap-2 justify-content-end">
        <button class="btn btn-sm btn-outline-success" data-action="approve" data-id="${r.id}">Approve</button>
        <button class="btn btn-sm btn-outline-danger" data-action="reject" data-id="${r.id}">Reject</button>
      </td>
    `;
    orgBody.appendChild(tr);
  });
  orgBody.querySelectorAll("button[data-action]").forEach((btn) =>
    btn.addEventListener("click", () => decide(btn.dataset.id, btn.dataset.action === "approve"))
  );
}

async function decide(requestId, approve) {
  const token = ensureToken();
  if (!token) return;
  try {
    const res = await fetch(`/api/organizers/requests/${requestId}/decision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ approve }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      setOrgMsg(data.error || "Could not process request.", "danger");
      return;
    }
    setOrgMsg(data.message || "Request processed.", "success");
    fetchRequests();
  } catch (err) {
    console.error("Organizer decide error:", err);
    setOrgMsg("Server error.", "danger");
  }
}

document.addEventListener("DOMContentLoaded", fetchRequests);
