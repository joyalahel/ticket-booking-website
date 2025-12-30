function showMsg(text, type = "info") {
  const box = document.getElementById("eventsMessage");
  if (!box) return;
  box.className = `alert alert-${type}`;
  box.textContent = text;
  box.classList.remove("d-none");
  setTimeout(() => box.classList.add("d-none"), 4000);
}

async function fetchMyEvents() {
  const token = localStorage.getItem("authToken");
  if (!token) return [];
  const res = await fetch("/api/events/organizer/my-events", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.events || [];
}

async function fetchVenues() {
  const res = await fetch("/api/venues");
  if (!res.ok) return [];
  const data = await res.json();
  return data.venues || data || [];
}

const venueCache = new Map();
const layoutMetaEl = document.getElementById("venueLayoutMeta");
const layoutListEl = document.getElementById("venueLayoutList");
const layoutCapBadge = document.getElementById("venueCapacityBadge");
const sectionOverrideList = document.getElementById("sectionOverrideList");
const priceInput = document.querySelector('[name="price"]');
const basePriceInput = document.querySelector('[name="base_price"]');
const sectionPricingInput = document.getElementById("sectionPricingInput");
let pendingSectionPricing = null; // used when editing to prefill section prices/seats

async function fetchVenueLayout(id) {
  try {
    const res = await fetch(`/api/venues/${id}/seating`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.venue || null;
  } catch (err) {
    console.error("Fetch venue seating error:", err);
    return null;
  }
}

function renderEvents(list) {
  const container = document.getElementById("organizerEventsList");
  if (!container) return;
  container.innerHTML = "";

  if (!list.length) {
    container.innerHTML = `<div class="col-12"><div class="alert alert-light border">No events yet. Create one on the right.</div></div>`;
    return;
  }

  list.forEach((e) => {
    const col = document.createElement("div");
    col.className = "col-md-6";
    const card = document.createElement("div");
    card.className = "card h-100 shadow-sm";
    const body = document.createElement("div");
    body.className = "card-body";

    const title = document.createElement("h5");
    title.className = "card-title mb-1";
    title.textContent = e.title || "Event";

    const meta = document.createElement("div");
    meta.className = "text-muted small mb-2";
    meta.textContent = `${formatDate(e.event_date)} • ${e.venue || ""}`;

    const analytics = document.createElement("div");
    analytics.className = "d-flex flex-wrap gap-2 mb-2 small text-muted";
    const capacity = Number(e.capacity || 0);
    const available = Number(e.available_tickets || 0);
    const paid = Number(e.paid_tickets || 0); // only paid counts as sold
    const sold = capacity ? Math.max(Math.min(paid, capacity), 0) : Math.max(paid, 0);
    const revenue = sold * Number(e.price || 0);
    analytics.innerHTML = `
      <span class="badge bg-light text-dark">Sold: ${sold}/${capacity || "?"}</span>
      <span class="badge bg-light text-dark">Revenue: $${revenue.toFixed(2)}</span>
    `;

    const status = document.createElement("span");
    const statusMap = {
      draft: "bg-secondary",
      published: "bg-success",
      sold_out: "bg-warning text-dark",
      cancelled: "bg-danger"
    };
    status.className = `badge ${statusMap[e.status] || "bg-secondary"}`;
    status.textContent = (e.status || "draft").replace('_', ' ');

    const actions = document.createElement("div");
    actions.className = "d-flex align-items-center gap-2 mt-2";

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-sm btn-outline-secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => startEditEvent(e));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-sm btn-outline-danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteEvent(e.id));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(analytics);
    body.appendChild(status);
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

async function handleCreateEvent(e) {
  e.preventDefault();
  const form = e.target;
  const token = localStorage.getItem("authToken");
  const isEditing = Boolean(form.dataset.editingId);
  if (!token) {
    showMsg("You must be signed in as organizer.", "danger");
    return;
  }

  const formData = new FormData(form);
  // Prevent past date/time submissions
  const eventDateVal = formData.get("event_date");
  const eventDate = eventDateVal ? new Date(eventDateVal) : null;
  const now = new Date();
  if (!eventDate || isNaN(eventDate.getTime())) {
    showMsg("Please choose a valid future date and time.", "danger");
    return;
  }
  if (eventDate <= now) {
    showMsg("Event date/time must be in the future.", "danger");
    return;
  }
  // derive section pricing -> hidden price/base_price
  syncDerivedPricing();
  const derivedPrice = Number(priceInput?.value || 0);
  if (derivedPrice <= 0) {
    showMsg("Please set a price for at least one section.", "danger");
    return;
  }
  formData.set("price", priceInput?.value || 0);
  formData.set("base_price", basePriceInput?.value || priceInput?.value || 0);
  // enforce venue_id and set venue text for backend validation
  const venueSelect = form.querySelector('[name="venue_id"]');
  const venueId = venueSelect?.value || '';
  const venueName = venueSelect?.selectedOptions?.[0]?.textContent?.trim() || '';
  formData.set("venue_id", venueId);
  formData.set("venue", venueName);

  try {
    const url = isEditing ? `/api/events/${form.dataset.editingId}` : "/api/events";
    const method = isEditing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false || data.error) {
      throw new Error(data.error || data.message || "Could not create event.");
    }
    showMsg(isEditing ? "Event updated successfully." : "Event created successfully.", "success");
    await loadEvents();
    resetEventForm();
  } catch (err) {
    showMsg(err.message || "Server error. Please try again.", "danger");
  }
}

async function loadEvents() {
  const events = await fetchMyEvents();
  renderEvents(events);
}

async function loadVenues() {
  const venues = await fetchVenues();
  const select = document.getElementById("venueSelect");
  if (!select) return;
  select.innerHTML = `<option value="">Select venue</option>`;
  venues.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = v.name;
    select.appendChild(opt);
    venueCache.set(String(v.id), v);
  });

  select.addEventListener("change", handleVenueChange);
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("createEventForm");
  if (form) form.addEventListener("submit", handleCreateEvent);
  const resetBtn = document.getElementById("resetEventFormBtn");
  if (resetBtn) resetBtn.addEventListener("click", resetEventForm);
  loadEvents();
  loadVenues();
});

async function handleVenueChange(e) {
  const venueId = e.target.value;
  const capacityInput = document.querySelector('[name="capacity"]');

  if (!venueId) {
    if (capacityInput) {
      capacityInput.value = "";
      capacityInput.removeAttribute("max");
      capacityInput.readOnly = false;
    }
    renderVenueLayoutSummary(null);
    return;
  }

  const cached = venueCache.get(String(venueId));
  if (capacityInput && cached?.capacity) {
    capacityInput.value = cached.capacity;
    capacityInput.readOnly = false;
    capacityInput.setAttribute("max", cached.capacity);
  }

  const venueWithLayout = await fetchVenueLayout(venueId);
  renderVenueLayoutSummary(venueWithLayout || cached || null);
  applyPendingSectionPricing();
}

function renderVenueLayoutSummary(venue) {
  if (!layoutMetaEl || !layoutListEl || !layoutCapBadge) return;

  if (!venue) {
    layoutMetaEl.textContent = "Select a venue to see sections and seats.";
    layoutListEl.textContent = "";
    layoutCapBadge.textContent = "—";
    renderSectionOverrides(null);
    return;
  }

  const capacity = venue.capacity || 0;
  layoutCapBadge.textContent = capacity ? `${capacity} seats` : "—";

  const sections = venue.sections || [];
  if (!sections.length) {
    layoutMetaEl.textContent = "No sections saved for this venue yet.";
    layoutListEl.textContent = "";
    renderSectionOverrides(null);
    return;
  }

  layoutMetaEl.textContent = `${sections.length} section(s) defined`;
  layoutListEl.innerHTML = sections
    .map(
      (s) =>
        `<div class="badge bg-dark-subtle text-dark me-1 mb-1">
            ${s.name}: ${s.total_seats ?? s.capacity ?? "0"} seats
         </div>`
    )
    .join("");

  renderSectionOverrides(venue);
  syncDerivedPricing();
}

function renderSectionOverrides(venue) {
  if (!sectionOverrideList) return;
  sectionOverrideList.innerHTML = "";
  if (!venue || !venue.sections || !venue.sections.length) return;

  const sections = [...venue.sections].sort((a, b) => {
    const capA = Number(a.total_seats ?? a.capacity ?? 0);
    const capB = Number(b.total_seats ?? b.capacity ?? 0);
    if (capA !== capB) return capA - capB;

    const priceA = Number(a.price ?? a.base_price ?? 0);
    const priceB = Number(b.price ?? b.base_price ?? 0);
    if (priceA !== priceB) return priceB - priceA; // higher price first when capacity ties

    return (a.name || "").toString().localeCompare((b.name || "").toString(), undefined, { sensitivity: "base" });
  });

  sections.forEach((s, idx) => {
    const total = s.total_seats ?? s.capacity ?? 0;
    const row = document.createElement("div");
    row.className = "row g-2 align-items-center";
    const sectionKey = (s.name || "Section").toString();

    const labelCol = document.createElement("div");
    labelCol.className = "col-3";
    const label = document.createElement("span");
    label.className = "badge bg-secondary w-100 text-wrap text-start";
    label.textContent = s.name || "Section";
    labelCol.appendChild(label);

    const seatsCol = document.createElement("div");
    seatsCol.className = "col-4";
    const seatInput = document.createElement("input");
    seatInput.type = "number";
    seatInput.className = "form-control form-control-sm";
    seatInput.min = 0;
    seatInput.max = total;
    seatInput.value = total;
    seatInput.dataset.sectionName = sectionKey;
    seatInput.dataset.sectionKey = sectionKey;
    seatInput.dataset.sectionMax = total;
    seatInput.addEventListener("input", handleSectionOverrideChange);
    seatsCol.appendChild(seatInput);

    const priceCol = document.createElement("div");
    priceCol.className = "col-5";
    const priceField = document.createElement("input");
    priceField.type = "number";
    priceField.className = "form-control form-control-sm";
    priceField.placeholder = "Price";
    priceField.min = 0;
    priceField.step = "0.01";
    priceField.dataset.sectionName = sectionKey;
    priceField.dataset.sectionKey = sectionKey;
    priceField.addEventListener("input", handleSectionPriceChange);
    priceCol.appendChild(priceField);

    row.appendChild(labelCol);
    row.appendChild(seatsCol);
    row.appendChild(priceCol);
    sectionOverrideList.appendChild(row);
  });
  recalcCapacityFromOverrides();
  recalcPriceFromOverrides();
  applyPendingSectionPricing();
  // If no pending pricing, try to backfill from cached section_pricing input (edit flow)
  if (!pendingSectionPricing && sectionPricingInput?.value) {
    try {
      pendingSectionPricing = JSON.parse(sectionPricingInput.value);
      applyPendingSectionPricing();
    } catch (err) {
      // ignore parse errors
    }
  }
}

function handleSectionOverrideChange() {
  const max = Number(this.dataset.sectionMax || 0);
  const val = Number(this.value || 0);
  if (val > max) {
    this.value = max;
  } else if (val < 0) {
    this.value = 0;
  }
  recalcCapacityFromOverrides();
}

function handleSectionPriceChange() {
  const val = Number(this.value || 0);
  if (val < 0) this.value = 0;
  recalcPriceFromOverrides();
}

function syncDerivedPricing() {
  recalcPriceFromOverrides();
  if (priceInput && !priceInput.value) priceInput.value = 0;
  if (basePriceInput && !basePriceInput.value) basePriceInput.value = priceInput ? priceInput.value : 0;
}

function recalcCapacityFromOverrides() {
  const capacityInput = document.querySelector('[name="capacity"]');
  if (!capacityInput || !sectionOverrideList) return;
  const inputs = sectionOverrideList.querySelectorAll('input[type="number"]');
  if (!inputs.length) return;

  let total = 0;
  inputs.forEach((i) => {
    if (i.dataset.sectionMax !== undefined) {
      total += Number(i.value || 0);
    }
  });

  capacityInput.value = total;
  capacityInput.setAttribute("max", total);
  updateSectionPricingPayload();
}

function recalcPriceFromOverrides() {
  if (!priceInput || !basePriceInput || !sectionOverrideList) return;
  const priceFields = sectionOverrideList.querySelectorAll('input[type="number"]:not([data-section-max])');
  let minPrice = null;
  priceFields.forEach((p) => {
    const val = Number(p.value || 0);
    if (Number.isNaN(val)) return;
    if (minPrice === null || val < minPrice) {
      minPrice = val;
    }
  });

  const effectivePrice = minPrice !== null ? minPrice : 0;
  priceInput.value = effectivePrice;
  basePriceInput.value = effectivePrice;
  updateSectionPricingPayload();
}

function updateSectionPricingPayload() {
  if (!sectionPricingInput || !sectionOverrideList) return;
  const sections = [];
  const rows = sectionOverrideList.querySelectorAll(".row");
  rows.forEach((row) => {
    const seatInput = row.querySelector('input[data-section-max]');
    const priceInputEl = row.querySelector('input:not([data-section-max])');
    if (!seatInput || !priceInputEl) return;
    const name = seatInput.dataset.sectionKey || seatInput.dataset.sectionName || "Section";
    const seats = Number(seatInput.value || 0);
    const price = Number(priceInputEl.value || 0);
    const max = Number(seatInput.dataset.sectionMax || 0);
    sections.push({
      name,
      seats,
      max,
      price
    });
  });
  sectionPricingInput.value = JSON.stringify({ sections });
}

function applyPendingSectionPricing() {
  if (!pendingSectionPricing || !sectionOverrideList) return;
  let pricingObj = pendingSectionPricing;
  if (typeof pricingObj === "string") {
    try {
      pricingObj = JSON.parse(pricingObj);
    } catch (err) {
      pricingObj = null;
    }
  }
  // Support either array or { sections: [] }
  const sections = Array.isArray(pricingObj)
    ? pricingObj
    : pricingObj?.sections || [];
  if (!sections.length) return;
  const rows = sectionOverrideList.querySelectorAll(".row");
  rows.forEach((row, idx) => {
    const seatInput = row.querySelector('input[data-section-max]');
    const priceInputEl = row.querySelector('input:not([data-section-max])');
    if (!seatInput || !priceInputEl) return;
    const name = seatInput.dataset.sectionKey || seatInput.dataset.sectionName || "";
    const norm = (v) => (v || "").toString().trim().toLowerCase();

    let match =
      sections.find((s) => norm(s.name || s.section) === norm(name)) ||
      sections[idx]; // fallback by order

    if (!match) return;

    if (match.seats !== undefined) {
      const max = Number(seatInput.dataset.sectionMax || 0);
      const desired = Number(match.seats || 0);
      seatInput.value = Math.min(Math.max(desired, 0), max);
    }
    if (match.price !== undefined) {
      const numeric = Number(match.price || 0);
      priceInputEl.value = Number.isFinite(numeric) ? numeric : 0;
    }
  });
  recalcCapacityFromOverrides();
  recalcPriceFromOverrides();
}

function startEditEvent(eventData) {
  const form = document.getElementById("createEventForm");
  if (!form) return;
  form.dataset.editingId = eventData.id;
  document.getElementById("formTitle").textContent = `Edit event: ${eventData.title || ""}`;
  const resetBtn = document.getElementById("resetEventFormBtn");
  if (resetBtn) resetBtn.classList.remove("d-none");

  // Prefill with known data from organizer feed (includes inactive)
  populateFormFields(eventData);

  // Update submit button text
  const submitBtn = document.getElementById("submitEventBtn");
  if (submitBtn) submitBtn.textContent = "Update event";

  // Ensure venue layout loads then apply pending pricing
  const venueSelectEl = form.querySelector('[name="venue_id"]');
  if (venueSelectEl) {
    handleVenueChange({ target: venueSelectEl });
    applyPendingSectionPricing();
    // If no layout/sections (no capacity recalculation), still ensure derived pricing is in sync
    if (!venueSelectEl.value) {
      applyPendingSectionPricing();
      syncDerivedPricing();
    }
  }
}

function resetEventForm() {
  const form = document.getElementById("createEventForm");
  if (!form) return;
  form.reset();
  delete form.dataset.editingId;
  document.getElementById("formTitle").textContent = "Create new event";
  const resetBtn = document.getElementById("resetEventFormBtn");
  if (resetBtn) resetBtn.classList.add("d-none");
  // Default status to draft
  const statusSelect = form.querySelector('[name="status"]');
  if (statusSelect) statusSelect.value = "draft";
  showCurrentImage(null);
  const submitBtn = document.getElementById("submitEventBtn");
  if (submitBtn) submitBtn.textContent = "Create event";
  if (priceInput) priceInput.value = 0;
  if (basePriceInput) basePriceInput.value = 0;
  pendingSectionPricing = null;
  const venueSelect = form.querySelector('[name="venue_id"]');
  if (venueSelect) venueSelect.value = "";
  renderVenueLayoutSummary(null);
}

function toInputDateTime(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => n.toString().padStart(2, "0");
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}

function showCurrentImage(url) {
  const wrap = document.getElementById("currentImageWrapper");
  const img = document.getElementById("currentImagePreview");
  if (!wrap || !img) return;
  if (url) {
    // Ensure absolute URL for preview
    img.src = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    wrap.classList.remove("d-none");
  } else {
    img.src = "";
    wrap.classList.add("d-none");
  }
}

function populateFormFields(ev) {
  const form = document.getElementById("createEventForm");
  if (!form || !ev) return;
  form.querySelector('[name="title"]').value = ev.title || "";
  form.querySelector('[name="description"]').value = ev.description || "";

  const venueSelect = form.querySelector('[name="venue_id"]');
  if (venueSelect) {
    // If the option isn't loaded yet, add it temporarily so selection works
    if (ev.venue_id && !venueSelect.querySelector(`option[value="${ev.venue_id}"]`)) {
      const opt = document.createElement("option");
      opt.value = ev.venue_id;
      opt.textContent = ev.venue || `Venue #${ev.venue_id}`;
      venueSelect.appendChild(opt);
    }
    venueSelect.value = ev.venue_id || "";
  }

  form.querySelector('[name="event_date"]').value = ev.event_date ? toInputDateTime(ev.event_date) : "";
  form.querySelector('[name="price"]').value = ev.price || "";
  form.querySelector('[name="base_price"]').value = ev.base_price || ev.price || "";
  form.querySelector('[name="capacity"]').value = ev.capacity || "";
  form.querySelector('[name="category"]').value = ev.category || "";
  form.querySelector('[name="status"]').value = ev.status || "draft";
  showCurrentImage(ev.image_url);

  // Store section pricing to apply after layout renders
  if (ev.section_pricing) {
    pendingSectionPricing = ev.section_pricing;
    if (sectionPricingInput) {
      sectionPricingInput.value = JSON.stringify(ev.section_pricing);
    }
  }

  // trigger venue change to render layout + apply pending pricing
  const venueSelectEl = form.querySelector('[name="venue_id"]');
  if (venueSelectEl) {
    handleVenueChange({ target: venueSelectEl });
    // If no layout/sections (no capacity recalculation), still ensure derived pricing is in sync
    if (!venueSelectEl.value) {
      applyPendingSectionPricing();
      syncDerivedPricing();
    }
  }
}

async function deleteEvent(eventId) {
  const confirmed = window.confirm("Delete this event? (soft delete)");
  if (!confirmed) return;

  const token = localStorage.getItem("authToken");
  if (!token) {
    showMsg("You must be signed in as organizer.", "danger");
    return;
  }

  try {
    const res = await fetch(`/api/events/${eventId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Could not delete event.");
    }
    showMsg("Event deleted successfully.", "success");
    loadEvents();
  } catch (err) {
    showMsg(err.message || "Server error. Please try again.", "danger");
  }
}

// auto-set minimum date/time to a few minutes in the future
document.addEventListener("DOMContentLoaded", () => {
  const dt = document.querySelector('[name="event_date"]');
  if (!dt) return;
  const min = new Date();
  min.setMinutes(min.getMinutes() + 5);
  const minStr = toInputDateTime(min);
  if (minStr) dt.min = minStr;
});

