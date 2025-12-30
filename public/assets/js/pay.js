const params = new URLSearchParams(window.location.search);
const methodLogos = {
  paypal: '/assets/logo/Paypal.png',
  stripe: '/assets/logo/Stripe.png',
  checkout: '/assets/logo/checkout.jpg',
  card: '/assets/logo/Visa.png',
  bank_transfer: '/assets/logo/bankTransfer.png',
  whish: '/assets/logo/Whish.jpg',
  omt: '/assets/logo/OMT.png',
  bob_finance: '/assets/logo/Bob.png'
};
const LEBANON_TZ = 'Asia/Beirut';

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

let bookings = [];
let selectedBookingId = null;
let selectedMethod = null;
let refreshTimer = null;
let isLoadingBookings = false;
let messageTimer = null;

function setMessage(text, type = '') {
  const msg = document.getElementById('payMessage');
  msg.textContent = text || '';
  msg.className = `tzk-payment-msg${type ? ' ' + type : ''}`;
  if (messageTimer) {
    clearTimeout(messageTimer);
    messageTimer = null;
  }
  if (text && type === 'success') {
    messageTimer = setTimeout(() => {
      msg.textContent = '';
      msg.className = 'tzk-payment-msg';
    }, 4000);
  }
}

function clearBookingDetail() {
  document.getElementById('detailTitle').textContent = 'Select a booking';
  document.getElementById('detailMeta').textContent = '';
  document.getElementById('detailSeats').innerHTML = '';
  const badge = document.getElementById('detailMethod');
  if (badge) badge.hidden = true;
  document.getElementById('confirmPayBtn').disabled = true;
  document.getElementById('rejectPayBtn').disabled = true;
}

function renderBookings() {
  const list = document.getElementById('bookingList');
  list.innerHTML = '';
  if (!bookings.length) {
    list.innerHTML = '<p>No pending bookings.</p>';
    clearBookingDetail();
    return;
  }
  bookings.forEach((b) => {
    const card = document.createElement('div');
    card.className = 'tzk-booking-card';
    card.dataset.id = b.id;
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <div>
          <div style="font-weight:800;">${b.event_title || 'Event'}</div>
          <div style="color:#5c0a0f; font-size:0.9rem;">Qty: ${b.quantity} | Status: ${b.payment_status}</div>
          <div style="color:#777; font-size:0.85rem;">Reference: ${b.booking_reference || '-'}</div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
          <div style="font-weight:700; color:#d82331;">$${Number(b.total_price || 0).toFixed(2)}</div>
          <span class="tzk-method-badge">
            <span class="tzk-method-logo" style="${methodLogos[b.payment_method] ? `background-image:url(${methodLogos[b.payment_method]}); background-size:contain; background-repeat:no-repeat; background-position:center;` : ''}">${methodLogos[b.payment_method] ? '' : (b.payment_method || 'CARD').substring(0,2).toUpperCase()}</span>
            ${b.payment_method || 'card'}
          </span>
        </div>
      </div>
    `;
    card.addEventListener('click', () => selectBooking(b.id));
    list.appendChild(card);
  });
  if (bookings.length) selectBooking(bookings[0].id);
}

function selectBooking(id) {
  selectedBookingId = id;
  document.querySelectorAll('.tzk-booking-card').forEach((el) => el.classList.toggle('active', el.dataset.id == id));
  const b = bookings.find((x) => x.id == id);
  if (!b) return;
  document.getElementById('detailTitle').textContent = b.event_title || 'Booking details';
  document.getElementById('detailMeta').textContent = `Reference: ${b.booking_reference || '-'} | Qty: ${b.quantity || 0}`;
  const seatsWrap = document.getElementById('detailSeats');
  seatsWrap.innerHTML = '';
  try {
    const seats = b.seat_data ? JSON.parse(b.seat_data) : [];
    seats.forEach((s) => {
      const chip = document.createElement('span');
      chip.className = 'tzk-seat-chip';
      chip.textContent = `${s.row_label || ''}${s.seat_number || ''}`;
      seatsWrap.appendChild(chip);
    });
  } catch (e) {
    seatsWrap.textContent = 'No seat data';
  }

  const methodBadge = document.getElementById('detailMethod');
  const methodName = document.getElementById('detailMethodName');
  const methodLogo = document.getElementById('detailMethodLogo');
  const bookingMethod = b.payment_method || 'card';
  selectedMethod = bookingMethod;
  methodName.textContent = bookingMethod;
  methodLogo.style.backgroundImage = methodLogos[bookingMethod] ? `url(${methodLogos[bookingMethod]})` : 'none';
  methodLogo.textContent = methodLogos[bookingMethod] ? '' : bookingMethod.substring(0,2).toUpperCase();
  methodBadge.hidden = false;

  document.getElementById('confirmPayBtn').disabled = false;
  document.getElementById('rejectPayBtn').disabled = false;
  setMessage('');
}

async function loadBookings(silent = false) {
  if (isLoadingBookings) return;
  isLoadingBookings = true;
  const token = localStorage.getItem('authToken');
  if (!token) {
    if (!silent) setMessage('Sign in to view bookings.', 'error');
    isLoadingBookings = false;
    return;
  }
  try {
    const res = await fetch('/api/bookings/my-bookings', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) {
      if (!silent) setMessage(data.error || 'Could not load bookings.', 'error');
      isLoadingBookings = false;
      return;
    }
    bookings = (data.bookings || []).filter((b) => b.payment_status === 'pending');
    renderBookings();
  } catch (err) {
    console.error(err);
    if (!silent) setMessage('Server error loading bookings.', 'error');
  }
  isLoadingBookings = false;
}

async function confirmBooking() {
  if (!selectedBookingId) return setMessage('Select a booking.', 'error');
  const token = localStorage.getItem('authToken');
  if (!token) return setMessage('Sign in to confirm.', 'error');
  const methodToUse = selectedMethod || 'card';
  setMessage('');
  try {
    const res = await fetch(`/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        booking_id: selectedBookingId,
        method: methodToUse
      })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      return setMessage(data.error || 'Could not confirm booking.', 'error');
    }
    setMessage(data.message || 'Booking confirmed. Check your email for tickets.', 'success');
    await loadBookings();
  } catch (err) {
    console.error(err);
    setMessage('Server error confirming booking.', 'error');
  }
}

async function cancelBooking() {
  if (!selectedBookingId) return setMessage('Select a booking.', 'error');
  const token = localStorage.getItem('authToken');
  if (!token) return setMessage('Sign in to cancel.', 'error');
  setMessage('');
  try {
    const res = await fetch(`/api/bookings/${encodeURIComponent(selectedBookingId)}/cancel`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      return setMessage(data.error || 'Could not cancel booking.', 'error');
    }
    setMessage(data.message || 'Booking cancelled.', 'success');
    await loadBookings();
  } catch (err) {
    console.error(err);
    setMessage('Server error cancelling booking.', 'error');
  }
}

function init() {
  loadBookings();
  document.getElementById('confirmPayBtn').addEventListener('click', confirmBooking);
  document.getElementById('rejectPayBtn').addEventListener('click', cancelBooking);
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadBookings(true), 15000);
}

document.addEventListener('DOMContentLoaded', init);
