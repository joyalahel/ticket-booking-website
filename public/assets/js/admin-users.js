const msgBox = document.getElementById("adminUsersMessage");
const tableBody = document.querySelector("#adminUsersTable tbody");

const setMsg = (text, variant = "warning") => {
  if (!msgBox) return;
  msgBox.textContent = text;
  msgBox.className = `alert alert-${variant}`;
  msgBox.classList.remove("d-none");
};

const clearMsg = () => {
  if (!msgBox) return;
  msgBox.classList.add("d-none");
};

const ensureToken = () => {
  const t = localStorage.getItem("authToken");
  if (!t) {
    setMsg("Redirecting to sign in...", "info");
    setTimeout(() => (window.location.href = "/login?redirect=/admin/users"), 500);
  }
  return t;
};

const roleBadge = (role) => {
  const map = { admin: "danger", organizer: "info", user: "secondary" };
  const cls = map[role] || "secondary";
  return `<span class="badge text-bg-${cls} text-uppercase">${role}</span>`;
};

const statusBadge = (active) =>
  active ? `<span class="badge text-bg-success">Active</span>` : `<span class="badge text-bg-secondary">Inactive</span>`;

async function fetchUsers() {
  const token = ensureToken();
  if (!token) return;
  try {
    const res = await fetch("/api/admin/users?limit=500", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed (${res.status})`);
    const data = await res.json();
    renderUsers(data.users || []);
    clearMsg();
  } catch (err) {
    console.error("Admin users load error:", err);
    setMsg("Could not load users.", "danger");
  }
}

function renderUsers(users) {
  if (!tableBody) return;
  tableBody.innerHTML = "";
  // Sort ascending by id
  users.sort((a, b) => (a.id || 0) - (b.id || 0));
  if (!users.length) {
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No users found.</td></tr>`;
    return;
  }

  users.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.name || ""}</td>
      <td>${u.email || ""}</td>
      <td>${roleBadge(u.role || "user")}</td>
      <td>${statusBadge(Boolean(u.is_active))}</td>
      <td class="text-end d-flex gap-1 justify-content-end flex-wrap">
        ${roleSelect(u)}
        <button class="btn btn-sm btn-outline-warning" data-action="deactivate" data-id="${u.id}">Deactivate</button>
        <button class="btn btn-sm btn-outline-success" data-action="reactivate" data-id="${u.id}">Reactivate</button>
        <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${u.id}">Delete</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  tableBody.querySelectorAll("select[data-role]").forEach((sel) =>
    sel.addEventListener("change", () => updateRole(sel.dataset.id, sel.value))
  );
  tableBody.querySelectorAll("button[data-action]").forEach((btn) =>
    btn.addEventListener("click", handleAction)
  );
}

const roleSelect = (u) => {
  const roles = ["user", "organizer", "admin"];
  const opts = roles
    .map((r) => `<option value="${r}" ${r === (u.role || "user") ? "selected" : ""}>${r}</option>`)
    .join("");
  return `<select class="form-select form-select-sm w-auto" data-role data-id="${u.id}">${opts}</select>`;
};

async function updateRole(userId, role) {
  const token = ensureToken();
  if (!token) return;
  try {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) throw new Error(`Failed (${res.status})`);
    setMsg(`Role updated to ${role}`, "success");
    fetchUsers();
  } catch (err) {
    console.error("Update role error:", err);
    setMsg("Could not update role.", "danger");
  }
}

async function handleAction(e) {
  const btn = e.currentTarget;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const token = ensureToken();
  if (!token) return;

  let url = "";
  let method = "PATCH";

  if (action === "deactivate") url = `/api/admin/users/${id}/deactivate`;
  if (action === "reactivate") url = `/api/admin/users/${id}/reactivate`;
  if (action === "delete") {
    const confirmed = window.confirm("Hard delete this user? This cannot be undone.");
    if (!confirmed) return;
    url = `/api/admin/users/${id}`;
    method = "DELETE";
  }

  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed (${res.status})`);
    setMsg(`Action '${action}' completed.`, "success");
    fetchUsers();
  } catch (err) {
    console.error("User action error:", err);
    setMsg("Could not process action.", "danger");
  }
}

document.addEventListener("DOMContentLoaded", fetchUsers);
