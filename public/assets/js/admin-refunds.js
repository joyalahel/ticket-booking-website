const refundsMsg = document.getElementById("adminRefundsMessage");
const refundsBody = document.querySelector("#adminRefundsTable tbody");

const setRefundMsg = (text, variant = "warning") => {
  if (!refundsMsg) return;
  refundsMsg.textContent = text;
  refundsMsg.className = `alert alert-${variant}`;
  refundsMsg.classList.remove("d-none");
};

const clearRefundMsg = () => refundsMsg && refundsMsg.classList.add("d-none");

const ensureToken = () => {
  const t = localStorage.getItem("authToken");
  if (!t) {
    setRefundMsg("Redirecting to sign in...", "info");
    setTimeout(() => (window.location.href = "/login?redirect=/admin/dashboard"), 500);
  }
  return t;
};

async function fetchRefunds() {
  const token = ensureToken();
  if (!token) return;
  try {
    const res = await fetch("/api/refunds/pending", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    renderRefunds(data.pending || data.refunds || []);
    clearRefundMsg();
  } catch (err) {
    console.error("Refunds load error:", err);
    setRefundMsg("Could not load pending refunds.", "danger");
  }
}

function renderRefunds(list) {
  if (!refundsBody) return;
  refundsBody.innerHTML = "";
  if (!list.length) {
    refundsBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">No pending refunds.</td></tr>`;
    return;
  }
  list.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.id || r.booking_id || "-"}</td>
      <td>${r.user_name || r.user_email || "User"}</td>
      <td>${r.event_title || ""}</td>
      <td>${r.total_price ? `$${Number(r.total_price).toFixed(2)}` : "-"}</td>
      <td>${r.refund_status || r.status || "requested"}</td>
      <td>${r.cancellation_reason || r.refund_reason || "-"}</td>
      <td class="text-end d-flex gap-2 justify-content-end">
        <button class="btn btn-sm btn-outline-success" data-action="approve" data-id="${r.id || r.booking_id}">Approve</button>
        <button class="btn btn-sm btn-outline-danger" data-action="reject" data-id="${r.id || r.booking_id}">Reject</button>
      </td>
    `;
    refundsBody.appendChild(tr);
  });

  refundsBody.querySelectorAll("button[data-action]").forEach((btn) =>
    btn.addEventListener("click", () => processRefund(btn.dataset.id, btn.dataset.action === "approve"))
  );
}

async function processRefund(bookingId, approve) {
  const token = ensureToken();
  if (!token) return;
  try {
    const res = await fetch("/api/refunds/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ booking_id: bookingId, approve }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      setRefundMsg(data.error || "Could not process refund.", "danger");
      return;
    }
    setRefundMsg(data.message || "Processed.", "success");
    fetchRefunds();
  } catch (err) {
    console.error("Process refund error:", err);
    setRefundMsg("Server error.", "danger");
  }
}

document.addEventListener("DOMContentLoaded", fetchRefunds);
