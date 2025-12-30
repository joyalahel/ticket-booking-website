async function fetchFeaturedEvents(limit = 5) {
  try {
    const res = await fetch("/api/events", { cache: "no-store" });
    const data = await res.json();
    if (!Array.isArray(data.events)) return [];

    // For now just take the first few; could filter by a "featured" flag later
    return data.events.slice(0, limit);
  } catch (err) {
    console.error("Featured events fetch error:", err);
    return [];
  }
}

async function fetchAllEvents() {
  try {
    const res = await fetch("/api/events", { cache: "no-store" });
    const data = await res.json();
    if (Array.isArray(data.events)) return data.events;
    return [];
  } catch (err) {
    console.error("Events fetch error:", err);
    return [];
  }
}

async function fetchCategories() {
  try {
    const res = await fetch("/api/events/categories", { cache: "no-store" });
    const data = await res.json();
    if (Array.isArray(data.categories)) return data.categories;
    return [];
  } catch (err) {
    console.error("Categories fetch error:", err);
    return [];
  }
}

const DEFAULT_POP_CATEGORIES = [
  {
    name: "Concert",
    slug: "concert",
    image: "/assets/images/categories/concert.jpg",
  },
  {
    name: "Sports",
    slug: "sports",
    image: "/assets/images/categories/sports.jpg",
  },
  {
    name: "Theater",
    slug: "theater",
    image: "/assets/images/categories/theatre.jpg",
  },
];

function createFeaturedSlide(event) {
  const slide = document.createElement("div");
  slide.className = "tzk-featured-slide";

  const imageUrl =
    event.image_url ||
    event.banner_url ||
    "https://images.unsplash.com/photo-1464375117522-1311d6a5b81f?auto=format&fit=crop&w=1600&q=80";

  slide.innerHTML = `
    <div class="tzk-featured-left">
      <p class="tzk-featured-label">Featured</p>
      <h2>${event.title || "Upcoming Event"}</h2>
      <p class="tzk-featured-venue">
        ${event.venue || event.organizer_name || "Tickets available"}
      </p>
      <button class="tzk-featured-btn" data-event-id="${event.id}">
        See Tickets
      </button>
    </div>
    <div class="tzk-featured-right" style="background-image:url('${imageUrl}');">
      <div class="tzk-featured-badge">
        ${event.available_tickets ?? event.capacity ?? "Live"}
      </div>
    </div>
  `;

  const btn = slide.querySelector(".tzk-featured-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      saveRecentEvent(event);
      window.location.href = `/event-details?id=${event.id}`;
    });
  }

  return slide;
}

function updateFeaturedActive(slides, activeIndex) {
  slides.forEach((slide, idx) => {
    slide.classList.toggle("active", idx === activeIndex);
  });
}

async function initFeaturedCarousel() {
  const carousel = document.getElementById("tzkFeaturedCarousel");
  if (!carousel) return;

  const events = await fetchFeaturedEvents(5);
  const slides = [];
  let autoTimer = null;

  const scheduleAuto = () => {
    clearInterval(autoTimer);
    autoTimer = setInterval(() => {
      currentIndex = (currentIndex + 1) % slides.length;
      updateFeaturedActive(slides, currentIndex);
    }, 5500);
  };

  if (!events.length) {
    const placeholder = createFeaturedSlide({
      title: "Discover tickets on Tazkirati",
      venue: "Concerts, sports, theater and more",
      id: "",
    });
    carousel.appendChild(placeholder);
    placeholder.classList.add("active");
    return;
  }

  events.forEach((ev, idx) => {
    const slide = createFeaturedSlide(ev);
    carousel.appendChild(slide);
    slides.push(slide);
  });

  let currentIndex = 0;
  updateFeaturedActive(slides, currentIndex);
  scheduleAuto();
}

// ----- Filters below carousel -----

let homeEvents = [];
let homeCategories = [];
let hasFilterInteraction = false;
const RECENT_BASE_KEY = "tzk_recent_events";
let recentStorageKey = `${RECENT_BASE_KEY}_guest`;
let popcatIndex = 0;

function deriveRecentKey(user) {
  if (!user) return `${RECENT_BASE_KEY}_guest`;
  const identifier = user.id || user.user_id || user.email || "user";
  return `${RECENT_BASE_KEY}_${identifier}`;
}

async function initRecentContext() {
  try {
    if (typeof getCurrentUser === "function") {
      const user = await getCurrentUser();
      if (user) {
        recentStorageKey = deriveRecentKey(user);
        return;
      }
    }
  } catch (err) {
    console.warn("Recent user detection failed", err);
  }
  recentStorageKey = `${RECENT_BASE_KEY}_guest`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function renderCategorySelect(categories) {
  const select = document.getElementById("filterCategory");
  if (!select) return;
  select.innerHTML = `<option value="all">Categories</option>`;

  const seen = new Set();

  categories.forEach((c) => {
    const value = (c.slug || c.name || c).toString();
    if (seen.has(value.toLowerCase())) return;
    seen.add(value.toLowerCase());

    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = c.name || c.label || c;
    select.appendChild(opt);
  });
}

function renderPopularCategories(categories) {
  const track = document.getElementById("tzkPopTrack");
  if (!track) return;
  track.innerHTML = "";

  const fallbackImg =
    "https://images.unsplash.com/photo-1464375117522-1311d6a5b81f?auto=format&fit=crop&w=1200&q=80";

  categories.forEach((c) => {
    const name = c.name || c.label || c.slug || c;
    const image =
      c.image ||
      c.banner ||
      c.cover ||
      (typeof c === "string" ? null : null) ||
      fallbackImg;

    const card = document.createElement("div");
    card.className = "tzk-popcats-card";
    card.innerHTML = `
      <img src="${image}" alt="${name}">
      <div class="tzk-popcats-title">${name}</div>
    `;
    card.addEventListener("click", () => {
      const select = document.getElementById("filterCategory");
      if (select) {
        const match = [...select.options].find(
          (opt) => opt.value.toLowerCase() === (c.slug || c.name || c).toString().toLowerCase()
        );
        if (match) {
          select.value = match.value;
          hasFilterInteraction = true;
          applyHomeFilters();
        }
      }
      document.getElementById("filterSearch")?.focus();
    });
    track.appendChild(card);
  });

  setupPopcatNav();
}

function matchesDateFilter(event, dateValue) {
  if (!dateValue || dateValue === "all") return true;
  const now = new Date();
  const d = new Date(event.event_date);
  if (isNaN(d.getTime())) return true;

  const selected = new Date(dateValue);
  if (isNaN(selected.getTime())) return true;

  // Only match if same day (local)
  return (
    d.getFullYear() === selected.getFullYear() &&
    d.getMonth() === selected.getMonth() &&
    d.getDate() === selected.getDate()
  );
}

function createResultCard(ev) {
  const card = document.createElement("div");
  card.className = "tzk-event-card";

  const image =
    ev.image_url ||
    ev.banner_url ||
    "https://images.unsplash.com/photo-1464375117522-1311d6a5b81f?auto=format&fit=crop&w=1200&q=80";

  const date = formatDate(ev.event_date);
  const venueText = ev.venue || ev.city || "Venue TBA";
  const hasCategory = Boolean(ev.category);
  const needsPipe = hasCategory || venueText;
  card.innerHTML = `
    <div class="tzk-event-thumb" style="background-image:url('${image}')"></div>
    <div class="tzk-event-body">
      <h3 class="tzk-event-title">${ev.title || "Event"}</h3>
      <p class="tzk-event-line">
        <span>${date || ""}</span>
        ${
          needsPipe ? ` <span class="tzk-event-dot">|</span>` : ""
        }
        ${
          hasCategory
            ? ` <span>${ev.category}</span>`
            : ""
        }
      </p>
      <p class="tzk-event-line">
        ${venueText}
      </p>
      ${
        ev.base_price || ev.price
          ? `<p class="tzk-event-line"><strong>From $${Number(
              ev.base_price || ev.price
            ).toFixed(2)}</strong></p>`
          : ""
      }
      <button class="tzk-event-btn" data-id="${ev.id}">See tickets</button>
    </div>
  `;

  const btn = card.querySelector(".tzk-event-btn");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    saveRecentEvent(ev);
    window.location.href = `/event-details?id=${ev.id}`;
  });
  card.addEventListener("click", () => {
    saveRecentEvent(ev);
    window.location.href = `/event-details?id=${ev.id}`;
  });

  return card;
}

function renderFilterResults(list) {
  const wrap = document.getElementById("tzkFilterResults");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (!hasFilterInteraction) {
    return;
  }

  if (!list.length) {
    wrap.innerHTML = `<p class="tz-empty-state">No events match your filters.</p>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "tzk-filter-grid";
  list.slice(0, 12).forEach((ev) => {
    grid.appendChild(createResultCard(ev));
  });
  wrap.appendChild(grid);
}

function applyHomeFilters() {
  if (!hasFilterInteraction) return;

  const search = (document.getElementById("filterSearch")?.value || "")
    .toLowerCase()
    .trim();
  const location = (document.getElementById("filterLocation")?.value || "")
    .toLowerCase()
    .trim();
  const dateValue =
    document.getElementById("filterDate")?.value.toLowerCase() || "all";
  const categoryValue =
    document.getElementById("filterCategory")?.value.toLowerCase() || "all";

  let filtered = [...homeEvents];

  if (search) {
    filtered = filtered.filter((ev) => {
      const text = `${ev.title} ${ev.description || ""} ${ev.venue || ""}`.toLowerCase();
      return text.includes(search);
    });
  }

  if (location) {
    filtered = filtered.filter((ev) => {
      const text = `${ev.city || ""} ${ev.location || ""} ${ev.venue || ""}`.toLowerCase();
      return text.includes(location);
    });
  }

  if (categoryValue && categoryValue !== "all") {
    filtered = filtered.filter((ev) => {
      const cat = (ev.category || ev.type || "").toLowerCase();
      return cat === categoryValue;
    });
  }

  filtered = filtered.filter((ev) => matchesDateFilter(ev, dateValue));

  renderFilterResults(filtered);
}

function setupFilterInteractions() {
  const searchBtn = document.getElementById("filterSearchBtn");
  const searchInput = document.getElementById("filterSearch");
  const dateSelect = document.getElementById("filterDate");
  const locationInput = document.getElementById("filterLocation");
  const categorySelect = document.getElementById("filterCategory");

  if (searchBtn)
    searchBtn.addEventListener("click", () => {
      hasFilterInteraction = true;
      applyHomeFilters();
    });
  if (searchInput)
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        hasFilterInteraction = true;
        applyHomeFilters();
      }
    });
  if (dateSelect)
    dateSelect.addEventListener("change", () => {
      hasFilterInteraction = true;
      applyHomeFilters();
    });
  if (locationInput)
    locationInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        hasFilterInteraction = true;
        applyHomeFilters();
      }
    });
  if (categorySelect)
    categorySelect.addEventListener("change", () => {
      hasFilterInteraction = true;
      applyHomeFilters();
    });
}

// ----- Recently viewed -----
function loadRecentEvents() {
  try {
    const stored = localStorage.getItem(recentStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Recent parse error", err);
    return [];
  }
}

function saveRecentEvent(ev) {
  if (!ev || !ev.id) return;
  const recent = loadRecentEvents().filter((item) => item.id !== ev.id);
  const entry = {
    id: ev.id,
    title: ev.title,
    venue: ev.venue || ev.city || "Venue",
    image:
      ev.image_url ||
      ev.banner_url ||
      "https://images.unsplash.com/photo-1464375117522-1311d6a5b81f?auto=format&fit=crop&w=1200&q=80",
  };
  recent.unshift(entry);
  const trimmed = recent.slice(0, 8);
  localStorage.setItem(recentStorageKey, JSON.stringify(trimmed));
  renderRecent(trimmed);
}

function createRecentCard(item) {
  const card = document.createElement("div");
  card.className = "tzk-recent-card";
  card.innerHTML = `
    <div class="tzk-recent-image" style="background-image:url('${item.image}')"></div>
    <div class="tzk-recent-body">
      <h3>${item.title}</h3>
      <p>${item.venue}</p>
    </div>
    <button class="tzk-recent-remove" aria-label="Remove recently viewed">&times;</button>
  `;
  const removeBtn = card.querySelector(".tzk-recent-remove");
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeRecent(item.id);
  });
  card.addEventListener("click", () => {
    window.location.href = `/event-details?id=${item.id}`;
  });
  return card;
}

function renderRecent(list = loadRecentEvents()) {
  const grid = document.getElementById("tzkRecentGrid");
  if (!grid) return;
  grid.innerHTML = "";
  if (!list.length) {
    grid.innerHTML = `<p class="tz-empty-state">No recently viewed events yet.</p>`;
    return;
  }
  list.forEach((item) => grid.appendChild(createRecentCard(item)));
}

function removeRecent(id) {
  if (!id) return;
  const remaining = loadRecentEvents().filter((item) => item.id !== id);
  localStorage.setItem(recentStorageKey, JSON.stringify(remaining));
  renderRecent(remaining);
}

// Popular categories nav
function setupPopcatNav() {
  // Nav removed
}

async function initHomePage() {
  await initRecentContext();
  initFeaturedCarousel();

  homeEvents = await fetchAllEvents();
  const apiCategories = await fetchCategories();
  homeCategories = [
    ...DEFAULT_POP_CATEGORIES,
    ...(Array.isArray(apiCategories) ? apiCategories : []),
  ];
  renderCategorySelect(homeCategories);
  renderPopularCategories(DEFAULT_POP_CATEGORIES);
  setupFilterInteractions();

  // Set min date to today for date picker
  const dateInput = document.getElementById("filterDate");
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.min = today;
  }

  renderRecent();
}

document.addEventListener("DOMContentLoaded", initHomePage);
