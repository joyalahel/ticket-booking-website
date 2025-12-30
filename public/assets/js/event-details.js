const eventId = new URLSearchParams(window.location.search).get('id');
let seatingData = null;
let selectedSectionId = null;
let selectedSeats = new Set();
let paymentMethodsCache = null;
let selectedPaymentMethod = null;
let pendingReservation = null;
let currentBookingId = null;
let socket = null;
let pendingSeatEvents = [];
const LEBANON_TZ = 'Asia/Beirut';
let wishlistStatus = null;
let reservationCountdownTimer = null;
let availableTickets = null;
let waitingListStatus = null;
const methodLogos = {
  paypal: '/assets/logo/Paypal.png',
  stripe: '/assets/logo/Stripe.png',
  checkout: '/assets/logo/checkout.jpg',
  card: '/assets/logo/Visa.png', // merged visa + debit_card
  bank_transfer: '/assets/logo/bankTransfer.png',
  whish: '/assets/logo/Whish.jpg',
  omt: '/assets/logo/OMT.png',
  bob_finance: '/assets/logo/Bob.png'
};

function formatLebanonDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US', {
    timeZone: LEBANON_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function loadEvent() {
  const res = await fetch(`/api/events/${eventId}`);
  const data = await res.json();
  const event = data.event || data;

  // Track availability for waiting list UI
  if (event.available_tickets !== undefined && event.available_tickets !== null) {
    const parsed = Number(event.available_tickets);
    availableTickets = Number.isNaN(parsed) ? null : parsed;
  }

  document.getElementById('detailTitle').textContent = event.title || 'Event';
  document.getElementById('detailDate').textContent = formatDate(event.event_date);
  document.getElementById('detailVenue').textContent = event.venue || event.venue_name || '';
  document.getElementById('detailPrice').textContent = event.base_price
    ? `From $${Number(event.base_price).toFixed(2)}`
    : '';

  const heroImg = document.getElementById('detailImage');
  if (event.image_url) {
    heroImg.style.backgroundImage = `url(${event.image_url})`;
  }

  const btn = document.getElementById('detailBuyBtn');
  btn.onclick = () => document.querySelector('.tzk-seating')?.scrollIntoView({ behavior: 'smooth' });

  if (event.venue_name || event.venue_address) {
    document.getElementById('venueBlock').hidden = false;
    document.getElementById('venueName').textContent = event.venue_name || event.venue || '';
    document.getElementById('venueAddress').textContent = event.venue_address || '';
  }

  updateWaitlistUI();
}

function renderCategories(sections) {
  const wrap = document.getElementById('seatingCategories');
  if (!wrap) return;
  wrap.innerHTML = '';
  selectedSectionId = null;

  const sortedSections = [...sections].sort((a, b) => {
    const capA = Number(a.total_seats ?? a.available_seats ?? a.capacity ?? 0);
    const capB = Number(b.total_seats ?? b.available_seats ?? b.capacity ?? 0);
    if (capA !== capB) return capA - capB;

    const priceA = Number(a.calculated_price ?? a.price ?? 0);
    const priceB = Number(b.calculated_price ?? b.price ?? 0);
    if (priceA !== priceB) return priceB - priceA; // higher price first when capacity ties

    return (a.name || '').toString().localeCompare((b.name || '').toString(), undefined, { sensitivity: 'base' });
  });

  sortedSections.forEach((section) => {
    const seats = section.seats || [];
    const totalFromSeats = seats.length;
    const availableFromSeats = seats.filter((s) => (s.current_status || s.status) === 'available').length;
    const hasSeatList = totalFromSeats > 0;
    const totalSeats = hasSeatList
      ? totalFromSeats
      : (Number.isFinite(Number(section.total_seats)) ? Number(section.total_seats) : totalFromSeats);
    const availableSeats = hasSeatList
      ? availableFromSeats
      : (Number.isFinite(Number(section.available_seats))
        ? Number(section.available_seats)
        : (totalFromSeats ? availableFromSeats : 0));
    const safeAvailable = Math.max(0, Math.min(availableSeats, totalSeats || availableSeats));

    if (safeAvailable <= 0) return; // Hide fully booked sections

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'tzk-seat-category';
    row.dataset.id = section.id;
    row.innerHTML = `
      <span class="tzk-seat-dot" style="background:${section.color || '#d82331'}"></span>
      <span class="tzk-seat-name">${section.name}</span>
      <span class="tzk-seat-price">$${Number(section.calculated_price || section.price || 0).toFixed(2)}</span>
      <span class="tzk-seat-availability">${safeAvailable} / ${totalSeats || totalFromSeats}</span>
    `;
    row.addEventListener('click', () => {
      selectCategory(section.id);
    });
    wrap.appendChild(row);

    const shouldSelect = wrap.querySelector('.tzk-seat-category.active') === null;
    if (shouldSelect) selectCategory(section.id);
  });

  if (!wrap.querySelector('.tzk-seat-category')) {
    wrap.innerHTML = '<p class="tz-empty-state">All sections are sold out.</p>';
    const map = document.getElementById('seatingMap');
    if (map) {
      map.innerHTML = '<div class="tzk-seating-map-placeholder">No seats available. Join the waiting list to get notified.</div>';
    }
    selectedSeats.clear();
    updateSelectionSummary();
  }
}

function selectCategory(sectionId) {
  selectedSectionId = sectionId;
  selectedSeats.clear();
  document.querySelectorAll('.tzk-seat-category').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.id == sectionId);
  });
  renderSeatingMap();
  updateSelectionSummary();
}

function renderSeatingMap() {
  const map = document.getElementById('seatingMap');
  map.innerHTML = '';
  if (!seatingData || !selectedSectionId) {
    map.innerHTML = '<div class="tzk-seating-map-placeholder">Select a category to view seats.</div>';
    return;
  }
  const section = seatingData.sections.find((s) => s.id == selectedSectionId);
  if (!section || !section.seats) {
    map.innerHTML = '<div class="tzk-seating-map-placeholder">No seating data.</div>';
    return;
  }

  // Deduplicate seats by id to prevent multiple buttons for the same seat
  const seenSeatIds = new Set();
  const seats = [];
  section.seats.forEach((seat) => {
    const seatKey = String(seat.id);
    if (seenSeatIds.has(seatKey)) return;
    seenSeatIds.add(seatKey);
    seats.push(seat);
  });

  const rows = {};
  seats.forEach((seat) => {
    if (!rows[seat.row_label]) rows[seat.row_label] = [];
    rows[seat.row_label].push(seat);
  });

  const sectionColor = section.color || '#2ba34a';

  const stage = document.createElement('div');
  stage.className = 'tzk-seating-stage';
  stage.textContent = 'STAGE';
  map.appendChild(stage);

  const grid = document.createElement('div');
  grid.className = 'tzk-seat-grid';

  Object.keys(rows)
    .sort()
    .forEach((rowLabel) => {
      const row = document.createElement('div');
      row.className = 'tzk-seat-row';
      const label = document.createElement('span');
      label.className = 'tzk-seat-row-label';
      label.textContent = rowLabel;
      row.appendChild(label);

      rows[rowLabel]
        .sort((a, b) => a.seat_number - b.seat_number)
        .forEach((seat) => {
          const seatBtn = document.createElement('button');
          seatBtn.type = 'button';
          seatBtn.className = `tzk-seat-dot-btn status-${seat.current_status}`;
          seatBtn.dataset.seatId = seat.id;
          seatBtn.textContent = `${rowLabel}${seat.seat_number}`;
          seatBtn.title = `${rowLabel}${seat.seat_number} | ${seat.current_status}`;
          seatBtn.disabled = seat.current_status !== 'available';
          seatBtn.style.setProperty('--section-color', sectionColor);
          seatBtn.addEventListener('click', () => toggleSeat(seat));
          if (selectedSeats.has(String(seat.id))) seatBtn.classList.add('selected');
          row.appendChild(seatBtn);
        });

      grid.appendChild(row);
    });

  map.appendChild(grid);

  renderLegend(map, sectionColor);
}

function toggleSeat(seat) {
  const seatId = String(seat.id);
  if (selectedSeats.has(seatId)) {
    selectedSeats.delete(seatId);
  } else {
    selectedSeats.add(seatId);
  }
  renderSeatingMap();
  updateSelectionSummary();
}

function updateSelectionSummary() {
  document.getElementById('selectedCount').textContent = `${selectedSeats.size} seats selected`;
  document.getElementById('reserveSeatsBtn').disabled = selectedSeats.size === 0;
}

function renderLegend(container, sectionColor) {
  const legend = document.createElement('div');
  legend.className = 'tzk-seating-legend';
  legend.innerHTML = `
    <span><span class="legend-dot status-available"></span> Available</span>
    <span><span class="legend-dot status-reserved"></span> Reserved</span>
    <span><span class="legend-dot selected"></span> Your selection</span>
  `;
  if (sectionColor) {
    const dot = legend.querySelector('.legend-dot.status-available');
    if (dot) dot.style.background = sectionColor;
  }
  container.appendChild(legend);
}

function applySeatStatusUpdates(seatIds, status) {
  if (!seatIds || !seatIds.length) return;
  if (!seatingData?.sections?.length) {
    pendingSeatEvents.push({ seatIds, status });
    return;
  }
  const targets = new Set(seatIds.map((id) => String(id)));
  seatingData.sections.forEach((section) => {
    if (!section.seats) return;
    section.seats.forEach((seat) => {
      if (targets.has(String(seat.id))) {
        seat.current_status = status;
        if (status !== 'available' && selectedSeats.has(String(seat.id))) {
          selectedSeats.delete(String(seat.id));
        }
      }
    });
  });
  renderSeatingMap();
  updateSelectionSummary();
  recomputeAvailableFromSeating();
  updateWaitlistUI();
}

function flushPendingSeatEvents() {
  if (!pendingSeatEvents.length || !seatingData?.sections?.length) return;
  pendingSeatEvents.forEach((evt) => applySeatStatusUpdates(evt.seatIds, evt.status));
  pendingSeatEvents = [];
}

async function reserveSeats() {
  const token = localStorage.getItem('authToken');
  const seatIds = Array.from(selectedSeats);
  const msg = document.getElementById('seatingMessage');
  msg.textContent = '';

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        event_id: eventId,
        quantity: seatIds.length,
        seatIds
      }),
    });

    const data = await res.json();
    if (!res.ok || data.success === false) {
    msg.textContent = data.error || 'Could not reserve seats.';
    msg.className = 'tzk-seating-msg error';
    return;
  }

    // Hide inline success message; user will see payment panel instead
    msg.textContent = '';
    msg.className = 'tzk-seating-msg';

    // Persist reservation info then show payment selection on the same page
    const reservationInfo = {
      eventId,
      seatIds,
      reservationToken: data.reservation?.token,
      expiresAt: data.reservation?.expires_at,
      seatCount: seatIds.length,
    };
    currentBookingId = data.booking?.id || data.booking?.bookingId || null;
    pendingReservation = reservationInfo;
    localStorage.setItem('pendingReservation', JSON.stringify(reservationInfo));
    localStorage.setItem('currentBookingId', currentBookingId || '');
    showPaymentPanel(reservationInfo);
  } catch (err) {
    console.error(err);
    msg.textContent = 'Server error. Please try again.';
    msg.className = 'tzk-seating-msg error';
  }
}

function showPaymentPanel(reservationInfo) {
  const section = document.getElementById('paymentSection');
  if (!section) return;
  resetPaymentForm();
  const infoEl = document.getElementById('paymentReservationInfo');
  const expires = reservationInfo?.expiresAt
    ? `Reservation expires at ${formatLebanonDateTime(reservationInfo.expiresAt)}`
    : '';
  const seatsText = reservationInfo?.seatCount || reservationInfo?.seatIds?.length || 0;
  infoEl.textContent = `Reserved ${seatsText} seat(s). ${expires}`;
  section.hidden = false;
  startReservationCountdown(reservationInfo?.expiresAt);
  loadPaymentMethodsInline();
}

function startReservationCountdown(expiresAt) {
  if (reservationCountdownTimer) {
    clearInterval(reservationCountdownTimer);
    reservationCountdownTimer = null;
  }
  if (!expiresAt) return;
  const infoEl = document.getElementById('paymentReservationInfo');
  const msgEl = document.getElementById('seatingMessage');
  const expiryDate = new Date(expiresAt);
  const tick = () => {
    const remainingMs = expiryDate.getTime() - Date.now();
    if (remainingMs <= 0) {
      clearInterval(reservationCountdownTimer);
      reservationCountdownTimer = null;
      infoEl.textContent = 'Reservation expired. Please select seats again.';
      msgEl.textContent = '';
      pendingReservation = null;
      localStorage.removeItem('pendingReservation');
      localStorage.removeItem('currentBookingId');
      showToast('Your reservation expired after 10 minutes.', 'error');
      document.getElementById('paymentSection').hidden = true;
      resetPaymentForm();
      loadSeating();
      return;
    }
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    infoEl.textContent = `Reserved ${pendingReservation?.seatCount || pendingReservation?.seatIds?.length || 0} seat(s). Expires in ${minutes}:${seconds.toString().padStart(2, '0')} (${formatLebanonDateTime(expiresAt)})`;
  };
  tick();
  reservationCountdownTimer = setInterval(tick, 1000);
}

async function loadPaymentMethodsInline() {
  if (paymentMethodsCache) {
    renderPaymentMethods(paymentMethodsCache);
    return;
  }
  const cardsWrap = document.getElementById('paymentMethodCards');
  if (cardsWrap) cardsWrap.innerHTML = '<p class="tz-empty-state" style="margin:0;">Loading methods...</p>';
  const token = localStorage.getItem('authToken');
  try {
    const res = await fetch('/api/payments/methods', {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      if (cardsWrap) cardsWrap.innerHTML = '<p class="tzk-payment-msg error" style="margin:0;">Could not load payment methods.</p>';
      return;
    }
    paymentMethodsCache = data.payment_methods || [];
    renderPaymentMethods(paymentMethodsCache);
  } catch (err) {
    console.error('Payment methods load error', err);
    if (cardsWrap) cardsWrap.innerHTML = '<p class="tzk-payment-msg error" style="margin:0;">Server error loading methods.</p>';
  }
}

function resetPaymentForm() {
  selectedPaymentMethod = null;
  const payBtn = document.getElementById('payNowBtn');
  if (payBtn) payBtn.disabled = true;
  ['cardName', 'cardNumber', 'cardExpiry', 'cardCvc'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const cardsWrap = document.getElementById('paymentMethodCards');
  if (cardsWrap) {
    cardsWrap.querySelectorAll('.tzk-method-card').forEach((c) => c.classList.remove('active'));
  }
}

function renderPaymentMethods(methods) {
  const cardsWrap = document.getElementById('paymentMethodCards');
  if (!cardsWrap) return;
  cardsWrap.innerHTML = '';
  methods.forEach((m) => {
    // Merge visa/debit into a single card option for display and selection
    const normalizedCode = (m.code === 'visa' || m.code === 'debit_card') ? 'card' : m.code;

    const logo = m.logo || methodLogos[normalizedCode] || methodLogos[m.code] || '';
    const initials = (normalizedCode || '?').substring(0, 2).toUpperCase();
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'tzk-method-card';
    card.dataset.code = normalizedCode;
    card.dataset.logo = logo;
    card.dataset.description = m.description || '';
    card.textContent = '';
    card.innerHTML = `
      <div class="tzk-method-card-top">
        <span class="tzk-method-chip">${m.category || 'Pay'}</span>
        <span class="tzk-method-logo" style="${logo ? `background-image:url(${logo});` : ''}">${logo ? '' : initials}</span>
      </div>
      <div class="tzk-method-card-body">
        <div class="tzk-method-title">${m.name || m.code}</div>
        <div class="tzk-method-sub">${m.description || 'Secure checkout'}</div>
      </div>
    `;
    card.addEventListener('click', () => applyPaymentSelection(normalizedCode, card));
    cardsWrap.appendChild(card);
  });
}

function applyPaymentSelection(code, optionEl) {
  const payBtn = document.getElementById('payNowBtn');
  const cardsWrap = document.getElementById('paymentMethodCards');

  if (!code) {
    selectedPaymentMethod = null;
    if (payBtn) payBtn.disabled = true;
    if (cardsWrap) cardsWrap.querySelectorAll('.tzk-method-card').forEach((c) => c.classList.remove('active'));
    return;
  }

  selectedPaymentMethod = code;
  if (cardsWrap) {
    cardsWrap.querySelectorAll('.tzk-method-card').forEach((c) => {
      c.classList.toggle('active', c.dataset.code === code);
    });
  }
  if (payBtn) payBtn.disabled = false;
}

function submitPaymentDetails() {
  const msg = document.getElementById('paymentMessage');
  msg.textContent = '';
  msg.className = 'tzk-payment-msg';
  if (!selectedPaymentMethod) {
    msg.textContent = 'Please select a payment method.';
    msg.classList.add('error');
    return;
  }
  const cardName = document.getElementById('cardName').value.trim();
  const cardNumber = document.getElementById('cardNumber').value.replace(/\s+/g, '');
  const cardExpiry = document.getElementById('cardExpiry').value.trim();
  const cardCvc = document.getElementById('cardCvc').value.trim();

  if (!cardName || !cardNumber || !cardExpiry || !cardCvc) {
    msg.textContent = 'Please fill in all card details.';
    msg.classList.add('error');
    return;
  }

  const numberValid = /^\d{13,19}$/.test(cardNumber);
  const cvcValid = /^\d{3,4}$/.test(cardCvc);
  const expiryValid = /^(\d{2})\/(\d{2})$/.test(cardExpiry);
  if (!numberValid) {
    msg.textContent = 'Card number must be 13-19 digits.';
    msg.classList.add('error');
    return;
  }
  if (!cvcValid) {
    msg.textContent = 'CVC must be 3-4 digits.';
    msg.classList.add('error');
    return;
  }
  if (!expiryValid) {
    msg.textContent = 'Expiry must be in MM/YY format.';
    msg.classList.add('error');
    return;
  }
  const [expMonth, expYear] = cardExpiry.split('/');
  const monthNum = parseInt(expMonth, 10);
  const yearNum = parseInt(expYear, 10) + 2000;
  if (monthNum < 1 || monthNum > 12) {
    msg.textContent = 'Expiry month must be between 01 and 12.';
    msg.classList.add('error');
    return;
  }
  const now = new Date();
  const expDate = new Date(yearNum, monthNum - 1, 1);
  if (expDate < new Date(now.getFullYear(), now.getMonth(), 1)) {
    msg.textContent = 'Expiry date must be in the future.';
    msg.classList.add('error');
    return;
  }

  const bookingId = currentBookingId || localStorage.getItem('currentBookingId');
  if (!bookingId) {
    msg.textContent = 'Booking could not be determined. Please reserve seats again.';
    msg.classList.add('error');
    return;
  }

  const token = localStorage.getItem('authToken');
  if (!token) {
    msg.textContent = 'You must be signed in to continue to payment.';
    msg.classList.add('error');
    return;
  }

  fetch(`/api/bookings/${encodeURIComponent(bookingId)}/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      payment_method: selectedPaymentMethod,
      reservationToken: pendingReservation?.reservationToken,
      seatIds: pendingReservation?.seatIds,
    }),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Could not confirm booking.');
      }
      msg.textContent = '';
      showToast('Booking confirmed. You have 24 hours to complete payment.', 'success');
      localStorage.removeItem('pendingReservation');
      localStorage.removeItem('currentBookingId');

      // Hide payment section after successful confirmation
      const paymentSection = document.getElementById('paymentSection');
      if (paymentSection) {
        paymentSection.hidden = true;
      }
      resetPaymentForm();
    })
    .catch((err) => {
      console.error(err);
      msg.textContent = err.message || 'Server error. Please try again.';
      msg.classList.add('error');
    });
}

async function loadSeating() {
  try {
    const res = await fetch(`/api/seating/event/${eventId}`);
    const data = await res.json();
    seatingData = data.seating;
    flushPendingSeatEvents();
    recomputeAvailableFromSeating();
    updateWaitlistUI();
    if (seatingData?.sections?.length) {
      renderCategories(seatingData.sections);
    } else {
      document.getElementById('seatingCategories').innerHTML = '<p class="tz-empty-state">No seating data.</p>';
    }
  } catch (err) {
    console.error('Seating load error', err);
  }
}

function initFooterYear() {
  const yearEl = document.getElementById('tzkFooterYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

function initEvents() {
  document.getElementById('reserveSeatsBtn')?.addEventListener('click', reserveSeats);
  document.getElementById('payNowBtn')?.addEventListener('click', submitPaymentDetails);
  document.getElementById('wishlistBtn')?.addEventListener('click', addToWishlist);
  document.getElementById('joinWaitlistBtn')?.addEventListener('click', joinWaitingList);
  document.getElementById('cancelPaymentBtn')?.addEventListener('click', cancelPaymentFlow);
}

function initRealtime() {
  if (typeof io === 'undefined') return;
  socket = io();
  socket.on('connect', () => {
    socket.emit('join-event', eventId);
  });
  socket.on('seat-status', (payload) => {
    if (!payload || String(payload.eventId) !== String(eventId)) return;
    const seatIds = payload.seats || [];
    if (!seatIds.length) return;
    applySeatStatusUpdates(seatIds, payload.status || 'reserved');
    // Refresh seating to update counts and button states
    loadSeating();
  });
  socket.on('ticket-update', (payload) => {
    if (!payload || String(payload.eventId) !== String(eventId)) return;
    if (typeof payload.availableTickets === 'number') {
      availableTickets = payload.availableTickets;
      updateWaitlistUI();
    }
    loadSeating();
  });
}

async function init() {
  await loadEvent();
  await loadSeating();
  restoreReservationFromStorage();
  initRealtime();
  await loadWishlistStatus();
  await loadWaitingListStatus();
  updateWaitlistUI();
  initFooterYear();
  initEvents();
}

function recomputeAvailableFromSeating() {
  if (!seatingData?.sections?.length) return;
  const totalAvailable = seatingData.sections.reduce((sum, section) => {
    if (!section.seats) return sum;
    return sum + section.seats.filter((s) => s.current_status === 'available').length;
  }, 0);
  availableTickets = totalAvailable;
}

// Simple toast helper for transient messages
function showToast(message, type = 'info', duration = 5000) {
  let container = document.getElementById('tzkToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'tzkToastContainer';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.pointerEvents = 'auto';
  toast.style.minWidth = '260px';
  toast.style.maxWidth = '360px';
  toast.style.padding = '12px 14px';
  toast.style.borderRadius = '8px';
  toast.style.boxShadow = '0 8px 20px rgba(0,0,0,0.12)';
  toast.style.color = '#fff';
  toast.style.fontWeight = '600';
  toast.style.fontSize = '14px';
  toast.style.opacity = '0';
  toast.style.transition = 'opacity 150ms ease, transform 150ms ease';
  toast.style.transform = 'translateY(-6px)';

  const palette = {
    success: '#16a34a',
    error: '#dc2626',
    info: '#0ea5e9',
    warning: '#d97706'
  };
  toast.style.background = palette[type] || palette.info;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-4px)';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

function restoreReservationFromStorage() {
  const saved = localStorage.getItem('pendingReservation');
  if (!saved) return;

  try {
    const parsed = JSON.parse(saved);
    if (parsed.eventId && String(parsed.eventId) !== String(eventId)) {
      return;
    }
    if (!parsed.expiresAt) {
      localStorage.removeItem('pendingReservation');
      return;
    }
    const expiresAt = new Date(parsed.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      localStorage.removeItem('pendingReservation');
      localStorage.removeItem('currentBookingId');
      return;
    }

    pendingReservation = parsed;
    currentBookingId = localStorage.getItem('currentBookingId') || null;
    showPaymentPanel(parsed);
  } catch (err) {
    console.error('Restore reservation failed', err);
    localStorage.removeItem('pendingReservation');
  }
}

function cancelPaymentFlow() {
  const bookingId = currentBookingId || localStorage.getItem('currentBookingId');
  const token = localStorage.getItem('authToken');

  // Attempt to cancel server-side so seats free immediately
  if (bookingId && token) {
    fetch(`/api/bookings/${encodeURIComponent(bookingId)}/cancel`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    }).catch(err => console.error('Cancel booking failed:', err));
  }

  // Clear UI and local state for the pending reservation
  pendingReservation = null;
  currentBookingId = null;
  localStorage.removeItem('pendingReservation');
  localStorage.removeItem('currentBookingId');
  const paymentSection = document.getElementById('paymentSection');
  if (paymentSection) paymentSection.hidden = true;
  const seatingMessage = document.getElementById('seatingMessage');
  if (seatingMessage) {
    seatingMessage.textContent = '';
    seatingMessage.className = 'tzk-seating-msg';
  }
  resetPaymentForm();
  showToast('Payment canceled. Your reservation was released.', 'info');
  loadSeating();
}

function updateWishlistButton() {
  const btn = document.getElementById('wishlistBtn');
  if (!btn) return;
  if (wishlistStatus) {
    btn.textContent = 'In wishlist';
    btn.disabled = true;
    btn.style.background = '#ffe6ea';
    btn.style.color = '#d82331';
    btn.style.borderColor = '#d82331';
  } else {
    btn.textContent = 'Add to wishlist';
    btn.disabled = false;
    btn.style.background = '#fff';
    btn.style.color = '#d82331';
    btn.style.borderColor = '#d82331';
  }
}

async function loadWishlistStatus() {
  const token = localStorage.getItem('authToken');
  if (!token) {
    wishlistStatus = false;
    updateWishlistButton();
    return;
  }
  try {
    const res = await fetch(`/api/events/${eventId}/wishlist/check`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    wishlistStatus = !!data?.data?.in_wishlist;
  } catch (err) {
    console.error('Wishlist status error', err);
    wishlistStatus = false;
  }
  updateWishlistButton();
}

function updateWaitlistUI() {
  const banner = document.getElementById('waitlistBanner');
  const joinBtn = document.getElementById('joinWaitlistBtn');
  const messageEl = document.getElementById('waitlistMessage');

  const soldOut = typeof availableTickets === 'number' ? availableTickets <= 0 : false;
  const alreadyOnList = !!waitingListStatus?.on_waiting_list;
  const notified = waitingListStatus?.waiting_list_entry?.status === 'notified';
  const canJoin = !!waitingListStatus?.can_join_waiting_list || (soldOut && !alreadyOnList);

  banner.style.display = soldOut ? 'block' : 'none';
  joinBtn.style.display = canJoin ? 'inline-block' : 'none';

  if (alreadyOnList && notified) {
    joinBtn.style.display = 'none';
    messageEl.textContent = 'Seats are available for you now. Check your email to book.';
    messageEl.className = 'tzk-seating-msg success';
  } else if (alreadyOnList) {
    joinBtn.textContent = 'On waiting list';
    joinBtn.disabled = true;
    messageEl.textContent = 'You are already on the waiting list. We will email you when seats free up.';
    messageEl.className = 'tzk-seating-msg success';
  } else if (canJoin) {
    joinBtn.textContent = 'Join waiting list';
    joinBtn.disabled = false;
    // Suppress inline sold-out helper per request
    messageEl.textContent = '';
    messageEl.className = 'tzk-seating-msg';
  } else {
    joinBtn.disabled = true;
    joinBtn.textContent = 'Join waiting list';
    messageEl.textContent = '';
    messageEl.className = 'tzk-seating-msg';
  }
}

async function loadWaitingListStatus() {
  const token = localStorage.getItem('authToken');
  const fallback = {
    on_waiting_list: false,
    can_join_waiting_list: typeof availableTickets === 'number' ? availableTickets <= 0 : false,
    waiting_list_entry: null,
    available_tickets: availableTickets
  };

  if (!token) {
    waitingListStatus = fallback;
    return;
  }

  try {
    const res = await fetch(`/api/events/${eventId}/waiting-list/status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok && data.success !== false) {
      waitingListStatus = data.data || fallback;
      if (typeof data.data?.available_tickets === 'number') {
        availableTickets = data.data.available_tickets;
      }
    } else {
      waitingListStatus = fallback;
    }
  } catch (err) {
    console.error('Waiting list status error', err);
    waitingListStatus = fallback;
  }
}

async function joinWaitingList() {
  const token = localStorage.getItem('authToken');
  const messageEl = document.getElementById('waitlistMessage');

  if (!token) {
    messageEl.textContent = 'Please sign in to join the waiting list.';
    messageEl.className = 'tzk-seating-msg error';
    return;
  }

  try {
    const res = await fetch(`/api/events/${eventId}/waiting-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        quantity: selectedSeats.size || 1
      })
    });

    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.message || data.error || 'Could not join waiting list.');
    }

    waitingListStatus = {
      on_waiting_list: true,
      can_join_waiting_list: false,
      waiting_list_entry: data.data,
      available_tickets: availableTickets
    };
    updateWaitlistUI();
    messageEl.textContent = data.message || 'Added to waiting list. We will email you when seats are free.';
    messageEl.className = 'tzk-seating-msg success';
  } catch (err) {
    console.error('Join waiting list error', err);
    messageEl.textContent = err.message || 'Server error. Please try again.';
    messageEl.className = 'tzk-seating-msg error';
  }
}

async function addToWishlist() {
  const token = localStorage.getItem('authToken');
  const msg = document.getElementById('seatingMessage');
  if (!token) {
    msg.textContent = 'Please sign in to use wishlist.';
    msg.className = 'tzk-seating-msg error';
    return;
  }
  if (wishlistStatus) {
    msg.textContent = 'This event is already in your wishlist. Manage removals from the wishlist page.';
    msg.className = 'tzk-seating-msg success';
    return;
  }
  msg.textContent = '';
  try {
    const res = await fetch(`/api/events/${eventId}/wishlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.message || 'Could not update wishlist.');
    }
    wishlistStatus = true;
    updateWishlistButton();
    msg.textContent = data.message || 'Added to wishlist';
    msg.className = 'tzk-seating-msg success';
  } catch (err) {
    console.error('Toggle wishlist error', err);
    msg.textContent = err.message || 'Server error.';
    msg.className = 'tzk-seating-msg error';
  }
}

document.addEventListener('DOMContentLoaded', init);
