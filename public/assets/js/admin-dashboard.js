// Admin dashboard scripting
const adminMetrics = {
  events: document.getElementById("metricEvents"),
  tickets: document.getElementById("metricTickets"),
  revenue: document.getElementById("metricRevenue"),
  support: document.getElementById("metricSupport"),
};

const statsMessageBox = document.getElementById("adminStatsMessage");
const viewRawBtn = document.getElementById("viewRawStatsBtn");
const venueForm = document.getElementById("adminVenueForm");
const venueFormMessage = document.getElementById("venueFormMessage");
const layoutPresetSelect = document.getElementById("layoutPresetSelect");
const layoutConfigInput = document.getElementById("layoutConfigInput");
const venueSubmitBtn = document.getElementById("venueSubmitBtn");

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const setMessage = (text, variant = "warning") => {
  if (!statsMessageBox) return;
  statsMessageBox.className = `alert alert-${variant}`;
  statsMessageBox.textContent = text;
};

const hideMessage = () => {
  if (!statsMessageBox) return;
  statsMessageBox.classList.add("d-none");
};

const setMetric = (el, value) => {
  if (!el) return;
  el.textContent = value;
};

const setVenueMessage = (text, variant = "info") => {
  if (!venueFormMessage) return;
  venueFormMessage.className = `alert alert-${variant}`;
  venueFormMessage.textContent = text;
  venueFormMessage.classList.remove("d-none");
};

const hideVenueMessage = () => {
  if (!venueFormMessage) return;
  venueFormMessage.classList.add("d-none");
};

const ensureToken = () => {
  const token = localStorage.getItem("authToken");
  if (!token) {
    setMessage("Redirecting to sign in for admin access...", "info");
    setTimeout(() => {
      window.location.href = "/login?redirect=/admin/dashboard";
    }, 600);
  }
  return token;
};

const loadAdminStats = async () => {
  const token = ensureToken();
  if (!token) return;

  // Show loading state
  setMetric(adminMetrics.events, "0");
  setMetric(adminMetrics.tickets, "0");
  setMetric(adminMetrics.revenue, "\$ 0");
  setMetric(adminMetrics.support, "0");

  try {
    const res = await fetch("/api/admin/dashboard/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        setMessage("Session expired. Redirecting to sign in...", "info");
        setTimeout(() => {
          window.location.href = "/login?redirect=/admin/dashboard";
        }, 600);
      } else if (res.status === 403) {
        setMessage("You need admin privileges to view these metrics.", "danger");
      } else {
        setMessage("Could not load admin stats right now.", "danger");
      }
      return;
    }

    const data = await res.json();
    const stats = data.stats || {};

    setMetric(adminMetrics.events, stats.total_events ?? "0");
    setMetric(adminMetrics.tickets, stats.total_bookings ?? "0");
    setMetric(adminMetrics.revenue, formatCurrency(stats.total_revenue));
    setMetric(adminMetrics.support, stats.open_support_items ?? "0");

    hideMessage();
  } catch (err) {
    console.error("Admin dashboard stats error:", err);
    setMessage("Unexpected error loading stats. Try again shortly.", "danger");
  }
};

const openRawStats = () => {
  if (!viewRawBtn) return;

  viewRawBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    const token = ensureToken();
    if (!token) return;

    viewRawBtn.disabled = true;
    viewRawBtn.textContent = "Loading...";

    try {
      const res = await fetch("/api/admin/dashboard/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setMessage("Could not load raw stats.", "danger");
        return;
      }

      const data = await res.json();
      const popup = window.open("", "_blank");
      if (popup) {
        popup.document.write(
          `<pre style="white-space: pre-wrap; word-break: break-word; padding: 16px;">${JSON.stringify(
            data,
            null,
            2
          )}</pre>`
        );
        popup.document.close();
      } else {
        setMessage("Popup blocked. Check your browser settings.", "warning");
      }
    } catch (err) {
      console.error("Raw stats error:", err);
      setMessage("Unexpected error loading raw stats.", "danger");
    } finally {
      viewRawBtn.disabled = false;
      viewRawBtn.textContent = "View raw stats";
    }
  });
};

const presets = {
  simple: {
    sections: [
      { name: "Floor", rows: [{ label: "A", seat_count: 20 }, { label: "B", seat_count: 20 }] },
      { name: "Balcony", rows: [{ label: "C", seat_count: 15 }, { label: "D", seat_count: 15 }] }
    ]
  },
  grid: {
    sections: [
      {
        name: "Main Hall",
        rows: Array.from({ length: 5 }, (_, i) => ({
          label: String.fromCharCode(65 + i),
          seat_count: 12
        }))
      }
    ]
  },
  empty: { sections: [] }
};

function applyPreset() {
  if (!layoutPresetSelect || !layoutConfigInput) return;
  const selected = layoutPresetSelect.value || "simple";
  const preset = presets[selected] || presets.simple;
  layoutConfigInput.value = JSON.stringify(preset, null, 2);
}

function wireVenueForm() {
  if (!venueForm) return;

  if (layoutPresetSelect) {
    layoutPresetSelect.addEventListener("change", applyPreset);
  }

  venueForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = ensureToken();
    if (!token) return;

    hideVenueMessage();
    if (venueSubmitBtn) venueSubmitBtn.disabled = true;

    const formData = new FormData(venueForm);
    const payload = {
      name: formData.get("name")?.toString().trim(),
      capacity: Number(formData.get("capacity") || 0),
      address: formData.get("address")?.toString().trim(),
      layout_type: formData.get("layout_type") || "auditorium",
      layout_config: null
    };

    if (!payload.name || !payload.capacity) {
      setVenueMessage("Name and capacity are required.", "danger");
      if (venueSubmitBtn) venueSubmitBtn.disabled = false;
      return;
    }

    if (layoutConfigInput?.value?.trim()) {
      try {
        payload.layout_config = JSON.parse(layoutConfigInput.value);
      } catch (err) {
        setVenueMessage("Layout config must be valid JSON.", "danger");
        if (venueSubmitBtn) venueSubmitBtn.disabled = false;
        return;
      }
    }

    try {
      const res = await fetch("/api/venues", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        const msg = data?.error || "Could not create venue.";
        setVenueMessage(msg, "danger");
        return;
      }

      setVenueMessage(`Venue created (ID: ${data?.venue?.id || "new"})`, "success");
      venueForm.reset();
      applyPreset();
    } catch (err) {
      console.error("Create venue error:", err);
      setVenueMessage("Unexpected error creating venue.", "danger");
    } finally {
      if (venueSubmitBtn) venueSubmitBtn.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadAdminStats();
  openRawStats();
  applyPreset();
  wireVenueForm();
});

// Admin quick links with auth header
(function(){
  const openResource = async (url, label) => {
    const token = ensureToken();
    if (!token) return;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        setMessage(`${label} could not load (${res.status}).`, res.status === 403 ? 'danger' : 'warning');
        return;
      }
      const data = await res.json();
      const popup = window.open('', '_blank');
      if (popup) {
        popup.document.write(
          `<pre style="white-space: pre-wrap; word-break: break-word; padding: 16px;">${JSON.stringify(data, null, 2)}</pre>`
        );
        popup.document.close();
      } else {
        setMessage('Popup blocked. Check your browser settings.', 'warning');
      }
    } catch (err) {
      console.error(`${label} load error:`, err);
      setMessage(`Unexpected error loading ${label.toLowerCase()}.`, 'danger');
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const usersBtn = document.getElementById('adminUsersBtn');
    const bookingsBtn = document.getElementById('adminBookingsBtn');
    if (usersBtn) usersBtn.addEventListener('click', () => openResource('/api/admin/users', 'Users'));
    if (bookingsBtn) bookingsBtn.addEventListener('click', () => openResource('/api/admin/bookings', 'Bookings'));
  });
})();




