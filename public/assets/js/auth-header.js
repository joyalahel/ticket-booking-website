async function getCurrentUser() {
  const cached = localStorage.getItem("currentUser");
  if (cached) return JSON.parse(cached);

  const token = localStorage.getItem("authToken");
  if (!token) return null;

  const res = await fetch("/api/auth/profile", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;

  const data = await res.json();
  if (data?.user) localStorage.setItem("currentUser", JSON.stringify(data.user));
  return data.user || null;
}

function renderUserLink(user) {
  const buildMenuLink = (href, title, description) => {
    const link = document.createElement("a");
    link.href = href;

    if (description) {
      link.classList.add("tzk-user-menu-rich");

      const titleEl = document.createElement("span");
      titleEl.className = "tzk-user-menu-title";
      titleEl.textContent = title;

      const descEl = document.createElement("small");
      descEl.className = "tzk-user-menu-desc";
      descEl.textContent = description;

      link.appendChild(titleEl);
      link.appendChild(descEl);
    } else {
      link.textContent = title;
    }

    return link;
  };

  const link = document.querySelector(".tzk-signin-btn, .tz-nav-auth");
  if (!link || !user) return;

  const fullName = user.name || user.email || "Profile";
  const userRole = (user.role || "").toLowerCase();
  const initial =
    (fullName && fullName.trim().charAt(0).toUpperCase()) || "U";

  // Build dropdown
  const container = link.parentElement;
  if (!container) return;
  const dropdown = document.createElement("div");
  dropdown.className = "tzk-user-dropdown";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "tzk-user-trigger";

  const avatar = document.createElement("span");
  avatar.className = "tzk-user-avatar tz-user-avatar";
  avatar.textContent = initial;

  const nameSpan = document.createElement("span");
  nameSpan.className = "tzk-user-name tz-user-name";
  nameSpan.textContent = fullName;

  const caret = document.createElement("span");
  caret.className = "tzk-user-caret";
  caret.textContent = "▼";

  trigger.appendChild(avatar);
  trigger.appendChild(nameSpan);
  trigger.appendChild(caret);

  const menu = document.createElement("div");
  menu.className = "tzk-user-menu";

  const profileLink = buildMenuLink("/profile", "Profile");
  const dashboardLink = buildMenuLink("/admin/dashboard", "Dashboard");
  const payLink = buildMenuLink("/pages/pay.html", "Pay pending bookings");
  const wishlistLink = buildMenuLink("/pages/wishlist.html", "Wishlist");
  const bookingsLink = buildMenuLink("/pages/bookings.html", "My bookings");
  const organizerLink = buildMenuLink("/pages/organizer-events.html", "My events");

  const logout = document.createElement("a");
  logout.href = "#";
  logout.textContent = "Sign out";
  logout.setAttribute("data-logout-btn", "true");
  logout.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("authToken");
    localStorage.removeItem("currentUser");
    window.location.href = "/";
  });

  menu.appendChild(profileLink);
  if (userRole === "admin") {
    menu.appendChild(dashboardLink);
  }
  menu.appendChild(payLink);
  menu.appendChild(wishlistLink);
  menu.appendChild(bookingsLink);
  if (userRole === "organizer" || userRole === "admin") {
    menu.appendChild(organizerLink);
  }
  menu.appendChild(logout);

  dropdown.appendChild(trigger);
  dropdown.appendChild(menu);

  // Replace existing sign-in button
  container.innerHTML = "";
  container.appendChild(dropdown);

  const closeMenus = (ev) => {
    if (!dropdown.contains(ev.target)) {
      dropdown.classList.remove("open");
    }
  };

  trigger.addEventListener("click", () => {
    dropdown.classList.toggle("open");
  });
  document.addEventListener("click", closeMenus);
}

function buildHeaderIfMissing() {
  if (document.querySelector(".tzk-header")) return;
  const header = document.createElement("header");
  header.className = "tzk-header";
  header.innerHTML = `
    <div class="container-fluid tzk-header-row d-flex align-items-center justify-content-between">
      <div class="tzk-header-left d-flex align-items-center">
        <a href="/"><img src="/assets/logo/tazkirati-logo.png" alt="Tazkirati Logo" class="tzk-logo"></a>
      </div>
      <div class="tzk-header-center d-flex flex-column align-items-center flex-grow-1">
        <nav>
          <ul class="nav tzk-nav-menu justify-content-center gap-4">
            <li class="nav-item"><a href="/" class="nav-link">Home</a></li>
            <li class="nav-item"><a href="/events" class="nav-link">Events</a></li>
            <li class="nav-item"><a href="/contact" class="nav-link">Contact</a></li>
            <li class="nav-item"><a href="/faq" class="nav-link">FAQ</a></li>
          </ul>
        </nav>
        <form class="tzk-search-bar" role="search">
          <input type="text" id="globalSearchInput" class="tzk-search-input" placeholder="Search..." aria-label="Search">
          <button type="submit" class="tzk-search-icon-btn">
            <i class="bi bi-search"></i>
          </button>
        </form>
      </div>
      <div class="tzk-header-right d-flex align-items-center gap-3">
        <a href="/login" class="btn tzk-signin-btn px-3">Sign in</a>
      </div>
    </div>
  `;
  document.body.prepend(header);
}

function buildFooterIfMissing() {
  if (document.querySelector(".tzk-footer")) return;
  const footer = document.createElement("footer");
  footer.className = "tzk-footer";
  footer.innerHTML = `
    <div class="tzk-footer-inner">
      <div>
        <img src="/assets/logo/tazkirati-logo.png" alt="Tazkirati" class="tzk-footer-logo">
        <p class="tzk-footer-text">Tickets for concerts, sports, theater, and more.</p>
      </div>
      <div class="tzk-footer-links">
        <a href="/events">Events</a>
        <a href="/login">Sign in</a>
        <a href="/register">Create account</a>
        <a href="/organizer-apply">Become an organizer</a>
        <a href="/contact">Contact</a>
        <a href="/faq">FAQ</a>
      </div>
      <div class="tzk-footer-meta">
        <p>&copy; <span id="tzkFooterYear"></span> Tazkirati. All rights reserved.</p>
      </div>
    </div>
  `;
  document.body.appendChild(footer);
}

document.addEventListener("DOMContentLoaded", async () => {
  buildHeaderIfMissing();
  buildFooterIfMissing();
  normalizeNav();
  normalizeFooter();
  const user = await getCurrentUser();
  if (user) renderUserLink(user);
  ensureHeaderSearch();
});

function normalizeNav() {
  const nav = document.querySelector(".tzk-nav-menu");
  if (!nav) return;
  nav.innerHTML = `
    <li class="nav-item"><a href="/" class="nav-link">Home</a></li>
    <li class="nav-item"><a href="/events" class="nav-link">Events</a></li>
    <li class="nav-item"><a href="/contact" class="nav-link">Contact</a></li>
    <li class="nav-item"><a href="/faq" class="nav-link">FAQ</a></li>
  `;
}

function normalizeFooter() {
  const links = document.querySelector(".tzk-footer-links");
  if (!links) return;
  links.innerHTML = `
    <a href="/events">Events</a>
    <a href="/login">Sign in</a>
    <a href="/register">Create account</a>
    <a href="/organizer-apply">Become an organizer</a>
    <a href="/contact">Contact</a>
    <a href="/faq">FAQ</a>
  `;
}

function ensureHeaderSearch() {
  const headerCenter = document.querySelector(".tzk-header-center");
  if (!headerCenter) return;

  // If a search bar already exists, just wire it
  let form = headerCenter.querySelector(".tzk-search-bar");
  if (!form) {
    form = document.createElement("form");
    form.className = "tzk-search-bar";
    form.innerHTML = `
      <input type="text" id="globalSearchInput" class="tzk-search-input" placeholder="Search..." aria-label="Search">
      <button type="submit" class="tzk-search-icon-btn">
        <i class="bi bi-search"></i>
      </button>
    `;
    headerCenter.appendChild(form);
  } else {
    // ensure ids for consistency
    const input = form.querySelector("input");
    const btn = form.querySelector("button[type=\"submit\"], button");
    if (input && !input.id) input.id = "globalSearchInput";
    if (btn) btn.type = "submit";
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = form.querySelector("input");
    const term = (input?.value || "").trim();
    if (term) {
      const qs = new URLSearchParams({ search: term });
      window.location.href = `/events?${qs.toString()}`;
    } else {
      window.location.href = "/events";
    }
  });
}
