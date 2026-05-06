const apiOriginInput = document.querySelector("#apiOriginInput");
const statusText = document.querySelector("#statusText");
const loginButton = document.querySelector("#loginButton");
const pairButton = document.querySelector("#pairButton");
const refreshButton = document.querySelector("#refreshButton");
const pairingOutput = document.querySelector("#pairingOutput");
const metricsGrid = document.querySelector("#metricsGrid");
const messagesOutput = document.querySelector("#messagesOutput");
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
  const data = await response.json();
  pairingOutput.textContent = JSON.stringify(data, null, 2);
});

refreshButton.addEventListener("click", () => {
  void loadDashboard();
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
void loadDashboard();

async function checkSession() {
  try {
    const response = await fetch(`${apiOrigin()}/api/me`, { credentials: "include" });
    if (!response.ok) {
      statusText.textContent = "Not signed in.";
      return;
    }
    const data = await response.json();
    statusText.textContent = `Signed in as ${data.user.email}.`;
    void loadDashboard();
  } catch (error) {
    statusText.textContent = "API is not reachable.";
  }
}

async function loadDashboard() {
  await Promise.all([loadStats(), loadMessages()]);
}

async function loadStats() {
  try {
    const response = await fetch(`${apiOrigin()}/api/dashboard/stats`, { credentials: "include" });
    if (!response.ok) return;
    const stats = await response.json();
    const values = [stats.messages, stats.recipients, stats.opens, stats.clicks, stats.detectedTrackers];
    metricsGrid.querySelectorAll("strong").forEach((node, index) => {
      node.textContent = String(values[index] ?? 0);
    });
  } catch {
    // The session check already reports API connectivity.
  }
}

async function loadMessages() {
  try {
    const response = await fetch(`${apiOrigin()}/api/messages`, { credentials: "include" });
    if (!response.ok) {
      messagesOutput.textContent = "Sign in to load tracked messages.";
      return;
    }
    const data = await response.json();
    renderMessages(data.messages ?? []);
  } catch {
    messagesOutput.textContent = "Messages are not available.";
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

function renderMessages(messages) {
  messagesOutput.innerHTML = "";
  if (!messages.length) {
    messagesOutput.textContent = "No tracked messages yet.";
    return;
  }
  for (const message of messages) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "messageRow";
    item.innerHTML = `
      <span>
        <strong>${escapeHtml(message.subject || "No subject")}</strong>
        <small>${escapeHtml(message.id)} · ${Number(message.recipientCount)} recipients · ${escapeHtml(message.status)}</small>
      </span>
      <span>${Number(message.totalOpens)} opens · ${Number(message.totalClicks)} clicks</span>
    `;
    item.addEventListener("click", () => {
      messageIdInput.value = message.id;
      summaryForm.requestSubmit();
    });
    messagesOutput.append(item);
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
