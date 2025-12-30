let allEvents = [];
let heroSlides = [];
let heroIndex = 0;
let heroTimer = null;

async function fetchEvents() {
  try {
    const res = await fetch('/api/events', { cache: 'no-store' });
    const data = await res.json();
    if (Array.isArray(data.events)) return data.events;
    console.error('Expected data.events array but got:', data);
    return [];
  } catch (err) {
    console.error('Error fetching events:', err);
    return [];
  }
}

async function fetchCategories() {
  try {
    const res = await fetch('/api/events/categories', { cache: 'no-store' });
    const data = await res.json();
    if (Array.isArray(data.categories)) return data.categories;
    return [];
  } catch (err) {
    console.warn('Error fetching categories:', err);
    return [];
  }
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

function createHeroSlide(event) {
  const slide = document.createElement('div');
  slide.className = 'tzk-events-hero-slide';

  const imageUrl =
    event.image_url ||
    event.banner_url ||
    'https://images.unsplash.com/photo-1464375117522-1311d6a5b81f?auto=format&fit=crop&w=1600&q=80';

  slide.innerHTML = `
    <div class="tzk-events-hero-bg" style="background-image:url('${imageUrl}')"></div>
    <div class="tzk-events-hero-overlay"></div>
    <div class="tzk-events-hero-content">
      <p class="tzk-featured-label">Featured</p>
      <h1>${event.title || 'Upcoming Event'}</h1>
      <p>${event.venue || event.organizer_name || 'Tickets available'}</p>
      <p>${formatDate(event.event_date)}</p>
      <button class="tzk-featured-btn" data-id="${event.id}">See tickets</button>
    </div>
  `;

  slide.querySelector('.tzk-featured-btn').addEventListener('click', () => {
    goToEventDetails(event.id);
  });

  return slide;
}

function updateHeroActive() {
  heroSlides.forEach((slide, idx) => {
    slide.classList.toggle('active', idx === heroIndex);
  });
}

function setupHeroCarousel(events) {
  const track = document.getElementById('eventsHeroTrack');
  if (!track) return;

  const featured = events.slice(0, 5);
  if (!featured.length) {
    const placeholder = createHeroSlide({
      title: 'Discover tickets on Tazkirati',
      venue: 'Concerts, sports, theater and more',
      id: '',
    });
    track.appendChild(placeholder);
    heroSlides = [placeholder];
    heroIndex = 0;
    updateHeroActive();
    return;
  }

  heroSlides = featured.map((ev) => {
    const slide = createHeroSlide(ev);
    track.appendChild(slide);
    return slide;
  });

  heroIndex = 0;
  updateHeroActive();

  clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    heroIndex = (heroIndex + 1) % heroSlides.length;
    updateHeroActive();
  }, 6000);
}

function renderCategoriesSelect(categories) {
  const select = document.getElementById('categoryFilter');
  if (!select) return;
  // keep default
  categories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = (cat.slug || cat.name || cat).toString();
    opt.textContent = cat.name || cat.label || cat;
    select.appendChild(opt);
  });
}

function createEventCard(event) {
  const card = document.createElement('div');
  card.className = 'tzk-event-card';

  const date = formatDate(event.event_date);
  const price = event.base_price || event.price;
  const venueText = event.venue || event.location || event.city || '';
  const hasCategory = Boolean(event.category);
  const needsPipe = hasCategory || venueText;
  const imageUrl =
    event.image_url ||
    event.banner_url ||
    'https://images.unsplash.com/photo-1464375117522-1311d6a5b81f?auto=format&fit=crop&w=800&q=80';

  card.innerHTML = `
    <div class="tzk-event-thumb" style="background-image:url('${imageUrl}')"></div>
    <div class="tzk-event-body">
      <h3 class="tzk-event-title">${event.title}</h3>
      <p class="tzk-event-line">
        <span>${date || ''}</span>
        ${
          needsPipe ? ` <span class="tzk-event-dot">|</span>` : ''
        }
        ${
          hasCategory
            ? ` <span>${event.category}</span>`
            : ''
        }
      </p>
      <p class="tzk-event-line">
        ${venueText}
      </p>
      ${
        price
          ? `<p class="tzk-event-line"><strong>From $${Number(price).toFixed(2)}</strong></p>`
          : ''
      }
      <button class="tzk-event-btn" data-id="${event.id}">Buy tickets</button>
    </div>
  `;

  card.querySelector('.tzk-event-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    goToEventDetails(event.id);
  });

  card.addEventListener('click', () => goToEventDetails(event.id));

  return card;
}

function goToEventDetails(id) {
  window.location.href = `/event-details?id=${id}`;
}

function renderEventsList(events) {
  const list = document.getElementById('eventsList');
  if (!list) return;
  list.innerHTML = '';

  if (!events.length) {
    list.innerHTML = '<p class="tz-empty-state">No events match your filters.</p>';
    return;
  }

  events.forEach((ev) => list.appendChild(createEventCard(ev)));
}

function applyFilters() {
  const searchValue = (document.getElementById('searchInput')?.value || '')
    .toLowerCase()
    .trim();
  const venueValue = (document.getElementById('venueFilter')?.value || '')
    .toLowerCase()
    .trim();
  const categoryValue = (document.getElementById('categoryFilter')?.value || 'all')
    .toLowerCase();
  const dateValue = (document.getElementById('dateFilter')?.value || '').toLowerCase();

  let filtered = [...allEvents];

  if (searchValue) {
    filtered = filtered.filter((ev) => {
      const text = `${ev.title} ${ev.description || ''} ${ev.venue || ''}`.toLowerCase();
      return text.includes(searchValue);
    });
  }

  if (venueValue) {
    filtered = filtered.filter((ev) => {
      const text = `${ev.venue || ''} ${ev.location || ''} ${ev.city || ''}`.toLowerCase();
      return text.includes(venueValue);
    });
  }

  if (categoryValue !== 'all') {
    filtered = filtered.filter(
      (ev) =>
        (ev.category && ev.category.toLowerCase() === categoryValue) ||
        (ev.type && ev.type.toLowerCase() === categoryValue)
    );
  }

  if (dateValue) {
    filtered = filtered.filter((ev) => {
      const d = new Date(ev.event_date);
      if (isNaN(d.getTime())) return true;
      const selected = new Date(dateValue);
      if (isNaN(selected.getTime())) return true;
      return (
        d.getFullYear() === selected.getFullYear() &&
        d.getMonth() === selected.getMonth() &&
        d.getDate() === selected.getDate()
      );
    });
  }

  renderEventsList(filtered);
}

function setupInteractions() {
  document.getElementById('searchBtn')?.addEventListener('click', applyFilters);

  document.getElementById('searchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyFilters();
    }
  });

  document.getElementById('categoryFilter')?.addEventListener('change', applyFilters);
  document.getElementById('dateFilter')?.addEventListener('change', applyFilters);
  document.getElementById('venueFilter')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyFilters();
    }
  });
}

async function init() {
  allEvents = await fetchEvents();
  if (allEvents.length) {
    setupHeroCarousel(allEvents);
    renderEventsList(allEvents);
  } else {
    setupHeroCarousel([]);
    renderEventsList([]);
  }

  const categories = await fetchCategories();
  if (categories.length) {
    renderCategoriesSelect(categories);
  }

  // Apply search from query params if present
  const params = new URLSearchParams(window.location.search);
  const q = params.get('search') || params.get('q') || '';
  if (q) {
    const input = document.getElementById('searchInput');
    if (input) {
      input.value = q;
    }
  }

  setupInteractions();

  // If search prefilled, run filters
  const searchInputVal = document.getElementById('searchInput')?.value;
  if (searchInputVal) applyFilters();

  const yearEl = document.getElementById('tzkFooterYear');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  const dateInput = document.getElementById('dateFilter');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
  }
}

document.addEventListener('DOMContentLoaded', init);
