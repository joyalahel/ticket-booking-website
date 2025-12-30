// --- helpers ---
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchEvents() {
  try {
    const res = await fetch("/api/events");
    const data = await res.json();

    // Backend: { events: [...] }
    if (Array.isArray(data.events)) {
      return data.events;
    }

    console.error("Home: expected data.events array, got:", data);
    return [];
  } catch (err) {
    console.error("Home: error fetching events:", err);
    return [];
  }
}

function goToEventDetails(id) {
  window.location.href = `/event-details?id=${id}`;
}

// --- hero section ---
function buildHero(event) {
  const heroTitle = document.getElementById("heroTitle");
  const heroVenue = document.getElementById("heroVenue");
  const heroDate = document.getElementById("heroDate");
  const heroBtn = document.getElementById("heroTicketsBtn");
  const heroImage = document.getElementById("heroImage");

  if (!event) {
    heroTitle.textContent = "Discover tickets on Tazkirati";
    heroVenue.textContent = "Find concerts, sports, theater and more near you.";
    heroDate.textContent = "";
    heroBtn.onclick = () => (window.location.href = "/events");
    heroImage.style.backgroundImage = "";
    return;
  }

  heroTitle.textContent = event.title;
  heroVenue.textContent = event.venue || event.organizer_name || "";
  heroDate.textContent = formatDate(event.event_date);

  heroBtn.textContent = "See tickets";
  heroBtn.onclick = () => goToEventDetails(event.id);

  if (event.image_url) {
    heroImage.style.backgroundImage = `url(${event.image_url})`;
    heroImage.classList.add("tz-hero-image-has-img");
  } else {
    heroImage.style.backgroundImage = "";
    heroImage.classList.remove("tz-hero-image-has-img");
  }
}

// --- trending list ---
function createEventCard(event) {
  const card = document.createElement("div");
  card.className = "tz-event-card";

  const date = formatDate(event.event_date);
  const price = event.base_price || event.price;
  const available = event.available_tickets;

  card.innerHTML = `
    <div class="tz-event-card-main">
      <div class="tz-event-card-info">
        <h3 class="tz-event-title">${event.title}</h3>
        <p class="tz-event-meta">${event.venue || ""}</p>
        <p class="tz-event-meta">${date}</p>
        ${
          event.category
            ? `<span class="tz-chip tz-chip-light">${event.category}</span>`
            : ""
        }
        ${
          typeof available === "number"
            ? `<p class="tz-event-meta">${available} tickets left</p>`
            : ""
        }
      </div>
      <div class="tz-event-card-side">
        ${
          price
            ? `<span class="tz-event-price">From $${Number(price).toFixed(
                2
              )}</span>`
            : ""
        }
        <button class="tz-event-btn" data-id="${event.id}">See tickets</button>
      </div>
    </div>
  `;

  card
    .querySelector(".tz-event-btn")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      goToEventDetails(event.id);
    });

  card.addEventListener("click", () => goToEventDetails(event.id));

  return card;
}

function renderTrendingEvents(events) {
  const list = document.getElementById("homeEventsList");
  list.innerHTML = "";

  if (!events.length) {
    list.innerHTML =
      '<p class="tz-empty-state">No upcoming events yet. Check back soon!</p>';
    return;
  }

  // Show first 6 events as "trending"
  events.slice(0, 6).forEach((ev) => list.appendChild(createEventCard(ev)));
}

// --- interactions ---
function setupHomeInteractions() {
  const searchInput = document.getElementById("homeSearchInput");
  const searchBtn = document.getElementById("homeSearchBtn");

  // When search is used on home, send to /events with query in URL
  function goToSearch() {
    const q = searchInput.value.trim();
    if (!q) {
      window.location.href = "/events";
      return;
    }
    const encoded = encodeURIComponent(q);
    window.location.href = `/events?search=${encoded}`;
  }

  searchBtn.addEventListener("click", goToSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goToSearch();
    }
  });

  // Chips → we just redirect to /events with category query
  document
    .querySelectorAll("[data-goto-category]")
    .forEach((chip) => {
      chip.addEventListener("click", () => {
        const cat = chip.getAttribute("data-goto-category");
        const encoded = encodeURIComponent(cat);
        window.location.href = `/events?category=${encoded}`;
      });
    });
}

// --- init ---
async function initHome() {
  const events = await fetchEvents();

  if (events.length) {
    buildHero(events[0]);
    renderTrendingEvents(events);
  } else {
    buildHero(null);
    renderTrendingEvents([]);
  }

  setupHomeInteractions();
}

document.addEventListener("DOMContentLoaded", initHome);
