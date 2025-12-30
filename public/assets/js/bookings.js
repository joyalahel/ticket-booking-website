async function fetchBookings() {
  const token = localStorage.getItem("authToken");
  if (!token) return null;

  const res = await fetch("/api/bookings/my-bookings", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data || null;
}

function renderBookings(list) {
  const container = document.getElementById("bookingsList");
  if (!container) return;

  container.innerHTML = "";

  if (!list || !list.length) {
    container.innerHTML = `<div class="col-12"><div class="alert alert-light border">No paid bookings found.</div></div>`;
    return;
  }

  list.forEach((b) => {
    const col = document.createElement("div");
    col.className = "col-md-6";

    const card = document.createElement("div");
    card.className = "card h-100 shadow-sm";

    const body = document.createElement("div");
    body.className = "card-body";

    const title = document.createElement("h5");
    title.className = "card-title mb-2";
    title.textContent = b.title || "Event";

    const meta = document.createElement("div");
    meta.className = "text-muted small mb-2";
    meta.textContent = `${formatDate(b.event_date)} · ${b.venue || ""}`;

    const qty = document.createElement("div");
    qty.textContent = `Tickets: ${b.quantity || 0}`;

    const price = document.createElement("div");
    price.textContent = `Total: $${Number(b.total_price || 0).toFixed(2)}`;

    const ref = document.createElement("div");
    ref.className = "small text-muted";
    ref.textContent = `Ref: ${b.booking_reference || "-"}`;

    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(qty);
    body.appendChild(price);
    body.appendChild(ref);

    const actions = document.createElement("div");
    actions.className = "d-flex gap-2 mt-2";

    const refundBtn = document.createElement("button");
    refundBtn.className = "btn btn-sm btn-outline-danger";
    refundBtn.textContent = b.refund_status === "requested" ? "Requested" : "Request refund";
    refundBtn.disabled = b.refund_status === "requested" || b.refund_status === "processed" || b.refund_status === "approved";
    refundBtn.addEventListener("click", () => requestRefund(b.id));

    actions.appendChild(refundBtn);
    body.appendChild(actions);

    card.appendChild(body);
    col.appendChild(card);
    container.appendChild(col);
  });
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function showMsg(text, type = "info") {
  const box = document.getElementById("bookingsMessage");
  if (!box) return;
  box.className = `alert alert-${type}`;
  box.textContent = text;
  box.classList.remove("d-none");
  setTimeout(() => box.classList.add("d-none"), 4000);
}

document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("authToken");
  if (!token) {
    window.location.href = "/login";
    return;
  }

  const data = await fetchBookings();
  if (!data || !data.bookings) {
    showMsg("Could not load bookings.", "danger");
    return;
  }

  // Filter paid and completed
  const paid = (data.bookings || []).filter(
    (b) => b.payment_status === "paid" || b.booking_status === "confirmed"
  );
  renderBookings(paid);
});

async function requestRefund(bookingId) {
  const reason = prompt("Reason for refund (optional):", "");
  const token = localStorage.getItem("authToken");
  if (!token) return;
  try {
    const res = await fetch("/api/refunds/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ booking_id: bookingId, reason: reason || "" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      showMsg(data.error || "Could not submit refund request.", "danger");
      return;
    }
    showMsg("Refund requested. We'll notify you once processed.", "success");
    const fresh = await fetchBookings();
    if (fresh?.bookings) renderBookings(fresh.bookings);
  } catch (err) {
    console.error("Refund request error:", err);
    showMsg("Server error. Please try again.", "danger");
  }
}
