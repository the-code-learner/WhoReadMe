const apiOriginInput = document.querySelector("#apiOriginInput");
const statusText = document.querySelector("#statusText");
const loginButton = document.querySelector("#loginButton");
const pairButton = document.querySelector("#pairButton");
const pairingOutput = document.querySelector("#pairingOutput");
const summaryForm = document.querySelector("#summaryForm");
const messageIdInput = document.querySelector("#messageIdInput");
const summaryOutput = document.querySelector("#summaryOutput");

const storedApiOrigin = localStorage.getItem("wrm.apiOrigin");
if (storedApiOrigin) apiOriginInput.value = storedApiOrigin;

apiOriginInput.addEventListener("change", () => {
  localStorage.setItem("wrm.apiOrigin", apiOriginInput.value);
});

loginButton.addEventListener("click", () => {
  location.href = `${apiOrigin()}/auth/google/start?next=${encodeURIComponent(location.href)}`;
});

pairButton.addEventListener("click", async () => {
  const response = await fetch(`${apiOrigin()}/api/extension/pair`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label: "Chrome Extension" })
  });
  pairingOutput.textContent = JSON.stringify(await response.json(), null, 2);
});

summaryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const messageId = messageIdInput.value.trim();
  if (!messageId) return;
  const response = await fetch(`${apiOrigin()}/api/messages/${messageId}/summary`, { credentials: "include" });
  const summary = await response.json();
  renderSummary(summary);
});

checkSession();

async function checkSession() {
  try {
    const response = await fetch(`${apiOrigin()}/api/me`, { credentials: "include" });
    if (!response.ok) {
      statusText.textContent = "Not signed in.";
      return;
    }
    const data = await response.json();
    statusText.textContent = `Signed in as ${data.user.email}.`;
  } catch (error) {
    statusText.textContent = "API is not reachable.";
  }
}

function renderSummary(summary) {
  if (summary.error) {
    summaryOutput.textContent = summary.error;
    return;
  }
  summaryOutput.innerHTML = "";
  for (const recipient of summary.recipients ?? []) {
    const card = document.createElement("article");
    card.className = "summaryCard";
    card.innerHTML = `
      <strong>${escapeHtml(recipient.email)}</strong>
      <p>${Number(recipient.openCount)} opens, ${Number(recipient.clickCount)} clicks</p>
      <p>${recipient.lastOpenedAt ? `Last opened ${escapeHtml(recipient.lastOpenedAt)}` : "No open events yet"}</p>
    `;
    summaryOutput.append(card);
  }
}

function apiOrigin() {
  return apiOriginInput.value.replace(/\/$/, "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

