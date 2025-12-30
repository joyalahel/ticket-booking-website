const params = new URLSearchParams(window.location.search);
const bookingId = params.get('bookingId');
const eventId = params.get('eventId');
const reservationToken = params.get('reservation');

let selectedMethod = null;

function renderReservationInfo() {
  const infoEl = document.getElementById('reservationInfo');
  const saved = localStorage.getItem('pendingReservation');
  if (!saved) {
    infoEl.textContent = 'No reservation found. Please go back and select seats again.';
    document.getElementById('confirmPaymentBtn').disabled = true;
    return;
  }
  const data = JSON.parse(saved);
  infoEl.textContent = `Reserved ${data.seatCount || data.seatIds?.length || 0} seat(s). Reservation expires at ${data.expiresAt || 'soon'}.`;

  // Update back link to current event
  const backLink = document.getElementById('backToEvent');
  if (eventId || data.eventId) {
    backLink.href = `/pages/event-details.html?id=${encodeURIComponent(eventId || data.eventId)}`;
  }
}

async function loadPaymentMethods() {
  const list = document.getElementById('methodList');
  list.innerHTML = 'Loading payment methods...';
  try {
    const token = localStorage.getItem('authToken');
    const res = await fetch('/api/payments/methods', {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      list.innerHTML = '<p class="tzk-alert error">Could not load payment methods.</p>';
      return;
    }
    const methods = data.payment_methods || [];
    if (!methods.length) {
      list.innerHTML = '<p class="tzk-alert error">No payment methods available.</p>';
      return;
    }
    list.innerHTML = '';
    methods.forEach((m) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'tzk-method';
      item.dataset.code = m.code;
      item.innerHTML = `
        <div>
          <h4>${m.name || m.code}</h4>
          <p>${m.description || ''}</p>
        </div>
        <span>${m.category || ''}</span>
      `;
      item.addEventListener('click', () => selectMethod(m.code, item));
      list.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    list.innerHTML = '<p class="tzk-alert error">Server error loading methods.</p>';
  }
}

function selectMethod(code, element) {
  selectedMethod = code;
  document.querySelectorAll('.tzk-method').forEach((el) => el.classList.remove('active'));
  element.classList.add('active');
  document.getElementById('confirmPaymentBtn').disabled = false;
}

async function confirmPayment() {
  const msg = document.getElementById('paymentMessage');
  msg.textContent = '';
  msg.className = 'tzk-alert';
  if (!selectedMethod) {
    msg.textContent = 'Please select a payment method.';
    msg.classList.add('error');
    return;
  }

  // If we have a bookingId, process payment; otherwise just store selection and inform user
  if (!bookingId) {
    localStorage.setItem('selectedPaymentMethod', selectedMethod);
    msg.textContent = `Payment method "${selectedMethod}" selected. Continue to checkout to complete payment.`;
    msg.classList.add('success');
    return;
  }

  const token = localStorage.getItem('authToken');
  try {
    const res = await fetch('/api/payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        booking_id: bookingId,
        method: selectedMethod,
        reservationToken: reservationToken || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      msg.textContent = data.error || 'Payment failed.';
      msg.classList.add('error');
      return;
    }
    msg.textContent = data.message || 'Payment completed.';
    msg.classList.add('success');
    // Clear reservation cache
    localStorage.removeItem('pendingReservation');
  } catch (err) {
    console.error(err);
    msg.textContent = 'Server error. Please try again.';
    msg.classList.add('error');
  }
}

function init() {
  renderReservationInfo();
  loadPaymentMethods();
  document.getElementById('confirmPaymentBtn').addEventListener('click', confirmPayment);
}

document.addEventListener('DOMContentLoaded', init);
