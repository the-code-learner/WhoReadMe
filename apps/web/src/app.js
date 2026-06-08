const apiOriginInput = document.querySelector("#apiOriginInput");
const statusText = document.querySelector("#statusText");
const gmailLinkButton = document.querySelector("#gmailLinkButton");
const accessForm = document.querySelector("#accessForm");
const codeForm = document.querySelector("#codeForm");
const authEmailInput = document.querySelector("#authEmailInput");
const authCodeInput = document.querySelector("#authCodeInput");
const requestAccessButton = document.querySelector("#requestAccessButton");
const verifyAccessButton = document.querySelector("#verifyAccessButton");
const pairButton = document.querySelector("#pairButton");
const refreshButton = document.querySelector("#refreshButton");
const exportButton = document.querySelector("#exportButton");
const pairingOutput = document.querySelector("#pairingOutput");
const pairingsOutput = document.querySelector("#pairingsOutput");
const metricsGrid = document.querySelector("#metricsGrid");
const messagesOutput = document.querySelector("#messagesOutput");
const summaryForm = document.querySelector("#summaryForm");
const messageIdInput = document.querySelector("#messageIdInput");
const summaryOutput = document.querySelector("#summaryOutput");
const eventsOutput = document.querySelector("#eventsOutput");
const searchInput = document.querySelector("#searchInput");
const settingsForm = document.querySelector("#settingsForm");
const retentionDaysInput = document.querySelector("#retentionDaysInput");
const dedupeWindowInput = document.querySelector("#dedupeWindowInput");
const trackerWarningsInput = document.querySelector("#trackerWarningsInput");

let csrfToken = "";
let allMessages = [];

const configuredApiOrigin = window.WRM_CONFIG?.apiOrigin ?? "http://localhost:8787";
apiOriginInput.value = configuredApiOrigin;
const storedApiOrigin = localStorage.getItem("wrm.apiOrigin");
if (storedApiOrigin) apiOriginInput.value = storedApiOrigin;

apiOriginInput.addEventListener("change", () => {
  localStorage.setItem("wrm.apiOrigin", apiOriginInput.value);
  void checkSession();
});

gmailLinkButton.addEventListener("click", () => {
  location.href = `${apiOrigin()}/auth/google/start?next=${encodeURIComponent(location.href)}`;
});

accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = authEmailInput.value.trim();
  if (!email) return;
  requestAccessButton.disabled = true;
  statusText.textContent = "Sending access email...";
  try {
    const response = await fetch(`${apiOrigin()}/auth/email/start`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, next: location.href })
    });
    const data = await response.json();
    if (!response.ok) {
      statusText.textContent = data.error ?? "Access email could not be sent.";
      return;
    }
    statusText.textContent = data.debugLink ? `Development access link: ${data.debugLink}` : "Access email sent.";
  } catch {
    statusText.textContent = "API is not reachable.";
  } finally {
    requestAccessButton.disabled = false;
  }
});

codeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = authEmailInput.value.trim();
  const code = authCodeInput.value.trim();
  if (!email || !code) return;
  verifyAccessButton.disabled = true;
  statusText.textContent = "Verifying code...";
  try {
    const response = await fetch(`${apiOrigin()}/auth/email/verify`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code })
    });
    const data = await response.json();
    if (!response.ok) {
      statusText.textContent = data.error ?? "Code could not be verified.";
      return;
    }
    csrfToken = data.csrfToken ?? "";
    statusText.textContent = `Signed in as ${data.user.email}.`;
    gmailLinkButton.disabled = false;
    void loadDashboard();
  } catch {
    statusText.textContent = "API is not reachable.";
  } finally {
    verifyAccessButton.disabled = false;
  }
});

pairButton.addEventListener("click", async () => {
  const response = await fetch(`${apiOrigin()}/api/extension/pair`, {
    method: "POST",
    credentials: "include",
    headers: mutationHeaders(),
    body: JSON.stringify({ label: "Chrome Extension" })
  });
  pairingOutput.textContent = JSON.stringify(await response.json(), null, 2);
  await loadPairings();
});

refreshButton.addEventListener("click", () => {
  void loadDashboard();
});

exportButton.addEventListener("click", () => {
  location.href = `${apiOrigin()}/api/export/events.csv`;
});

searchInput.addEventListener("input", () => {
  renderMessages(filterMessages());
});

summaryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const messageId = messageIdInput.value.trim();
  if (!messageId) return;
  const response = await fetch(`${apiOrigin()}/api/messages/${messageId}/summary`, { credentials: "include" });
  renderSummary(await response.json());
  await loadEvents(messageId);
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const response = await fetch(`${apiOrigin()}/api/settings`, {
    method: "POST",
    credentials: "include",
    headers: mutationHeaders(),
    body: JSON.stringify({
      retentionDays: Number(retentionDaysInput.value),
      dedupeWindowMinutes: Number(dedupeWindowInput.value),
      trackerWarningsEnabled: trackerWarningsInput.checked
    })
  });
  renderSettings(await response.json());
});

void checkSession();

async function checkSession() {
  try {
    const response = await fetch(`${apiOrigin()}/api/me`, { credentials: "include" });
    if (!response.ok) {
      statusText.textContent = "Not signed in.";
      gmailLinkButton.disabled = true;
      return;
    }
    const data = await response.json();
    csrfToken = data.csrfToken ?? "";
    statusText.textContent = `Signed in as ${data.user.email}. ${data.gmailLinked ? "Gmail linked." : "Gmail not linked."}`;
    gmailLinkButton.disabled = false;
    gmailLinkButton.textContent = data.gmailLinked ? "Relink Gmail" : "Link Gmail";
    void loadDashboard();
  } catch {
    statusText.textContent = "API is not reachable.";
    gmailLinkButton.disabled = true;
  }
}

async function loadDashboard() {
  await Promise.all([loadStats(), loadMessages(), loadPairings(), loadSettings()]);
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
    // The session check reports API connectivity.
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
    allMessages = data.messages ?? [];
    renderMessages(filterMessages());
  } catch {
    messagesOutput.textContent = "Messages are not available.";
  }
}

async function loadPairings() {
  try {
    const response = await fetch(`${apiOrigin()}/api/extension/pairings`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    renderPairings(data.pairings ?? []);
  } catch {
    pairingsOutput.textContent = "Pairings are not available.";
  }
}

async function loadSettings() {
  try {
    const response = await fetch(`${apiOrigin()}/api/settings`, { credentials: "include" });
    if (!response.ok) return;
    renderSettings(await response.json());
  } catch {
    // Settings are optional during first setup.
  }
}

async function loadEvents(messageId) {
  try {
    const response = await fetch(`${apiOrigin()}/api/events?messageId=${encodeURIComponent(messageId)}&limit=50`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    renderEvents(data.events ?? []);
  } catch {
    eventsOutput.textContent = "Events are not available.";
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

function renderEvents(events) {
  eventsOutput.innerHTML = "";
  if (!events.length) {
    eventsOutput.textContent = "No events for this message yet.";
    return;
  }
  for (const event of events) {
    const row = document.createElement("article");
    row.className = "eventRow";
    row.innerHTML = `
      <strong>${escapeHtml(event.eventType)}</strong>
      <span>${escapeHtml(event.createdAt)} - ${event.isBot ? "automated" : "likely human"} - ${escapeHtml(event.confidence)}</span>
      <small>${escapeHtml(event.country || "unknown country")} - ${escapeHtml(event.userAgent || "no user agent")}</small>
    `;
    eventsOutput.append(row);
  }
}

function renderPairings(pairings) {
  pairingsOutput.innerHTML = "";
  if (!pairings.length) {
    pairingsOutput.textContent = "No extension tokens created yet.";
    return;
  }
  for (const pairing of pairings) {
    const row = document.createElement("article");
    row.className = "tokenRow";
    row.innerHTML = `
      <span>
        <strong>${escapeHtml(pairing.label)}</strong>
        <small>${escapeHtml(pairing.createdAt)}${pairing.revokedAt ? ` - revoked ${escapeHtml(pairing.revokedAt)}` : ""}</small>
      </span>
      <button type="button" ${pairing.revokedAt ? "disabled" : ""}>Revoke</button>
    `;
    row.querySelector("button").addEventListener("click", async () => {
      await fetch(`${apiOrigin()}/api/extension/pairings/${encodeURIComponent(pairing.id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: mutationHeaders()
      });
      await loadPairings();
    });
    pairingsOutput.append(row);
  }
}

function renderSettings(settings) {
  retentionDaysInput.value = String(settings.retentionDays ?? 365);
  dedupeWindowInput.value = String(settings.dedupeWindowMinutes ?? 15);
  trackerWarningsInput.checked = Boolean(settings.trackerWarningsEnabled ?? true);
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
        <small>${escapeHtml(message.id)} - ${Number(message.recipientCount)} recipients - ${escapeHtml(message.status)}</small>
      </span>
      <span>${Number(message.totalOpens)} opens - ${Number(message.totalClicks)} clicks</span>
    `;
    item.addEventListener("click", () => {
      messageIdInput.value = message.id;
      summaryForm.requestSubmit();
    });
    messagesOutput.append(item);
  }
}

function filterMessages() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return allMessages;
  return allMessages.filter((message) => [message.id, message.subject, message.senderEmail, message.status].some((value) => String(value ?? "").toLowerCase().includes(query)));
}

function apiOrigin() {
  return apiOriginInput.value.replace(/\/$/, "");
}

function mutationHeaders() {
  return {
    "content-type": "application/json",
    "x-wrm-csrf": csrfToken
  };
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
