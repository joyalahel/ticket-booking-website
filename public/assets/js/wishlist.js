const LEBANON_TZ = 'Asia/Beirut';

function formatLebanonDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US', {
    timeZone: LEBANON_TZ,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function setMessage(text, type = '') {
  const msg = document.getElementById('wishlistMessage');
  msg.textContent = text || '';
  msg.className = `tzk-seating-msg${type ? ' ' + type : ''}`;
}

async function loadWishlist() {
  const token = localStorage.getItem('authToken');
  if (!token) {
    setMessage('Sign in to view your wishlist.', 'error');
    return;
  }
  setMessage('');
  try {
    const res = await fetch('/api/wishlist/with-availability', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.message || 'Could not load wishlist.');
    }
    renderWishlist(data.data || []);
  } catch (err) {
    console.error('Wishlist load error', err);
    setMessage(err.message || 'Server error loading wishlist.', 'error');
  }
}

function renderWishlist(items) {
  const list = document.getElementById('wishlistList');
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = `
      <div class="tzk-empty">
        <p class="mb-2">No events in your wishlist yet.</p>
        <a class="tzk-btn-ghost" href="/events">Browse events</a>
      </div>`;
    return;
  }
  items.forEach((item) => {
    const ev = item.event || {};
    const card = document.createElement('div');
    card.className = 'tzk-wishlist-card';
    card.dataset.eventId = ev.id;
    card.innerHTML = `
      <div class="tzk-wl-thumb" style="background-image:url(${ev.image_url || '/assets/logo/tazkirati-logo.png'});"></div>
      <div class="flex-grow-1">
        <h5 class="tzk-wl-title mb-1">${ev.title || 'Event'}</h5>
        <p class="tzk-wl-meta mb-0">${ev.venue || ''} · ${formatLebanonDateTime(ev.event_date)}</p>
        <p class="tzk-wl-meta mb-0">Status: ${ev.availability_status || 'available'} · Available: ${ev.available_tickets ?? '—'}</p>
      </div>
      <div class="tzk-wl-actions">
        <a class="tzk-btn-ghost" href="/event-details?id=${encodeURIComponent(ev.id)}">View</a>
        <button class="tzk-btn-danger" data-remove-btn>Remove</button>
      </div>
    `;
    card.querySelector('[data-remove-btn]').addEventListener('click', () => removeWishlist(ev.id, card));
    list.appendChild(card);
  });
}

async function removeWishlist(eventId, cardEl) {
  const token = localStorage.getItem('authToken');
  if (!token) {
    setMessage('Sign in to update wishlist.', 'error');
    return;
  }
  try {
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/wishlist`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.message || 'Failed to remove from wishlist.');
    }
    if (cardEl?.parentElement) {
      cardEl.parentElement.removeChild(cardEl);
    }
    setMessage(data.message || 'Removed from wishlist.', 'success');
    if (!document.querySelector('.tzk-wishlist-card')) {
      renderWishlist([]);
    }
  } catch (err) {
    console.error('Remove wishlist error', err);
    setMessage(err.message || 'Server error removing item.', 'error');
  }
}

async function clearWishlist() {
  const token = localStorage.getItem('authToken');
  if (!token) {
    setMessage('Sign in to clear wishlist.', 'error');
    return;
  }
  try {
    const res = await fetch('/api/wishlist', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.message || 'Failed to clear wishlist.');
    }
    renderWishlist([]);
    setMessage(data.message || 'Wishlist cleared.', 'success');
  } catch (err) {
    console.error('Clear wishlist error', err);
    setMessage(err.message || 'Server error clearing wishlist.', 'error');
  }
}

function initFooterYear() {
  const yearEl = document.getElementById('tzkFooterYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

function init() {
  document.getElementById('clearWishlistBtn')?.addEventListener('click', clearWishlist);
  initFooterYear();
  loadWishlist();
}

document.addEventListener('DOMContentLoaded', init);
