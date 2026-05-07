import { detectTrackers, type MessageListItem, type MessageReadSummary, type SendTrackedEmailResponse } from "@who-read-me/shared";

const marker = "data-wrm-instrumented";
const composeIdAttribute = "data-wrm-compose-id";

setInterval(scanGmail, 1500);
setInterval(refreshPanel, 10000);
void refreshPanel();
new MutationObserver(() => scanGmail()).observe(document.documentElement, { childList: true, subtree: true });

function scanGmail() {
  scanComposeWindows();
  scanReceivedMessages();
  scanSentMessages();
}

function scanComposeWindows() {
  const composeBodies = document.querySelectorAll<HTMLElement>('div[role="textbox"][aria-label][contenteditable="true"]:not([data-wrm-instrumented])');
  for (const body of composeBodies) {
    body.setAttribute(marker, "true");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wrm-compose-button";
    button.textContent = "Send tracked copies";
    button.addEventListener("click", () => void sendTrackedCopies(body, button));
    body.parentElement?.append(button);
    addComposeNotice(body);
  }
}

async function sendTrackedCopies(body: HTMLElement, button: HTMLButtonElement) {
  button.disabled = true;
  button.textContent = "Sending tracked copies...";
  try {
    const composeRoot = findComposeRoot(body);
    const recipients = collectRecipients(composeRoot);
    if (!recipients.length) {
      button.textContent = "Add at least one recipient";
      button.disabled = false;
      return;
    }
    const senderEmail = await getSenderEmail();
    const clientComposeId = getComposeId(body);
    const response = await api<SendTrackedEmailResponse>("/api/gmail/send-tracked", {
      method: "POST",
      body: JSON.stringify({
        clientComposeId,
        subject: composeRoot?.querySelector<HTMLInputElement>('input[name="subjectbox"]')?.value ?? document.querySelector<HTMLInputElement>('input[name="subjectbox"]')?.value ?? undefined,
        senderEmail,
        html: body.innerHTML,
        text: body.innerText,
        recipients
      })
    });
    if ("error" in response) {
      button.textContent = String((response as { error: string }).error);
      button.disabled = false;
      return;
    }
    button.textContent = `Sent ${response.sent.length} tracked copies`;
    button.dataset.messageId = response.sent[0]?.messageId;
    await chrome.storage.local.set({ wrmLastSent: response.sent });
    void refreshPanel();
  } catch (error) {
    button.textContent = "Who Read Me send failed";
    button.disabled = false;
  }
}

function scanReceivedMessages() {
  const messageBodies = document.querySelectorAll<HTMLElement>('div[role="listitem"] div.a3s:not([data-wrm-detected])');
  for (const body of messageBodies) {
    body.setAttribute("data-wrm-detected", "true");
    void chrome.storage.sync.get(["trackerWarningsEnabled"]).then((settings) => {
      if (settings.trackerWarningsEnabled === false) return;
      const result = detectTrackers(body.innerHTML);
      if (result.riskLevel === "none") return;
      const badge = document.createElement("div");
      badge.className = `wrm-tracker-warning wrm-risk-${result.riskLevel}`;
      badge.textContent = `Who Read Me: ${result.findings.length} possible trackers detected`;
      body.prepend(badge);
    });
  }
}

function scanSentMessages() {
  const trackedButtons = document.querySelectorAll<HTMLButtonElement>(".wrm-compose-button[data-message-id]:not([data-wrm-summary-loaded])");
  for (const button of trackedButtons) {
    button.setAttribute("data-wrm-summary-loaded", "true");
    const messageId = button.dataset.messageId;
    if (messageId) void renderSummaryNear(button, messageId);
  }
}

async function renderSummaryNear(anchor: HTMLElement, messageId: string) {
  const summary = await api<MessageReadSummary>(`/api/messages/${messageId}/summary`);
  const badge = document.createElement("div");
  badge.className = "wrm-read-summary";
  const readers = summary.recipients.filter((recipient) => Number(recipient.openCount) > 0);
  badge.textContent = `Who Read Me: ${summary.totalOpens} opens from ${readers.map((reader) => reader.email).join(", ") || "no recipients yet"}`;
  anchor.after(badge);
}

async function refreshPanel() {
  if (!location.hostname.includes("mail.google.com")) return;
  let panel = document.querySelector<HTMLElement>("#wrm-panel");
  if (!panel) {
    panel = document.createElement("aside");
    panel.id = "wrm-panel";
    panel.innerHTML = '<button class="wrm-panel-title" type="button">Who Read Me</button><div class="wrm-panel-body">Loading...</div>';
    document.body.append(panel);
    panel.querySelector("button")?.addEventListener("click", () => {
      panel?.classList.toggle("wrm-panel-collapsed");
    });
  }
  const body = panel.querySelector<HTMLElement>(".wrm-panel-body");
  if (!body) return;
  try {
    const response = await api<{ messages: MessageListItem[] }>("/api/messages");
    const messages = response.messages ?? [];
    if (!messages.length) {
      body.textContent = "No tracked messages yet.";
      return;
    }
    const summaries = await Promise.all(messages.slice(0, 5).map((message) => api<MessageReadSummary>(`/api/messages/${message.id}/summary`)));
    body.innerHTML = "";
    for (const [index, message] of messages.slice(0, 5).entries()) {
      const summary = summaries[index];
      const readers = summary.recipients.filter((recipient) => Number(recipient.openCount) > 0);
      const item = document.createElement("article");
      item.className = "wrm-panel-item";
      item.innerHTML = `
        <strong>${escapeHtml(message.subject || "No subject")}</strong>
        <span>${Number(message.totalOpens)} opens, ${Number(message.totalClicks)} clicks</span>
        <small>${readers.length ? escapeHtml(readers.map((reader) => `${reader.email} (${reader.openCount})`).join(", ")) : "No recipient opens yet"}</small>
      `;
      body.append(item);
    }
  } catch {
    body.textContent = "Pair the extension from the dashboard.";
  }
}

function collectRecipients(root: HTMLElement | null): Array<{ email: string; displayName?: string }> {
  const scope = root ?? document;
  const chips = Array.from(scope.querySelectorAll<HTMLElement>("[email], [data-hovercard-id]"));
  const emails = new Set<string>();
  for (const chip of chips) {
    const value = chip.getAttribute("email") ?? chip.getAttribute("data-hovercard-id");
    if (value && value.includes("@")) emails.add(value);
  }
  return Array.from(emails).map((email) => ({ email }));
}

function addComposeNotice(body: HTMLElement) {
  const root = findComposeRoot(body);
  if (!root || root.querySelector(".wrm-compose-notice")) return;
  const notice = document.createElement("div");
  notice.className = "wrm-compose-notice";
  notice.textContent = "Use Send tracked copies for tracked mail. Gmail's native Send button will send an untracked message.";
  body.parentElement?.append(notice);
}

function getComposeId(body: HTMLElement): string {
  const root = findComposeRoot(body) ?? body;
  const existing = root.getAttribute(composeIdAttribute);
  if (existing) return existing;
  const next = crypto.randomUUID();
  root.setAttribute(composeIdAttribute, next);
  return next;
}

function api<T>(path: string, init?: RequestInit): Promise<T> {
  return chrome.runtime.sendMessage({ type: "WRM_API", path, init });
}

function findComposeRoot(body: HTMLElement): HTMLElement | null {
  return body.closest<HTMLElement>('div[role="dialog"], div[aria-label*="Message Body"]') ?? body.parentElement;
}

async function getSenderEmail(): Promise<string> {
  const settings = await chrome.storage.sync.get(["senderEmail"]);
  if (settings.senderEmail) return String(settings.senderEmail);
  const account = document.querySelector<HTMLElement>("[email], [data-email]");
  const found = account?.getAttribute("email") ?? account?.getAttribute("data-email");
  return found && found.includes("@") ? found : "me";
}

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char] ?? char);
}

const style = document.createElement("style");
style.textContent = `
  .wrm-compose-button {
    margin: 8px 0;
    border: 0;
    border-radius: 6px;
    background: #0f766e;
    color: white;
    cursor: pointer;
    font: 600 12px Arial, sans-serif;
    padding: 7px 10px;
  }
  .wrm-tracker-warning,
  .wrm-read-summary,
  .wrm-compose-notice {
    border: 1px solid #d9e0e8;
    border-radius: 6px;
    background: #f6f8fb;
    color: #16202a;
    font: 600 12px Arial, sans-serif;
    margin: 8px 0;
    padding: 8px;
  }
  .wrm-risk-medium,
  .wrm-risk-high {
    border-color: #f59e0b;
    background: #fff7ed;
  }
  #wrm-panel {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 999999;
    width: 320px;
    max-height: 46vh;
    overflow: auto;
    border: 1px solid #d9e0e8;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 12px 36px rgba(15, 23, 42, 0.18);
    color: #16202a;
    font: 12px Arial, sans-serif;
  }
  .wrm-panel-title {
    width: 100%;
    border: 0;
    border-bottom: 1px solid #d9e0e8;
    border-radius: 8px 8px 0 0;
    background: #ffffff;
    color: #16202a;
    cursor: pointer;
    font-weight: 700;
    padding: 10px 12px;
    text-align: left;
  }
  .wrm-panel-collapsed .wrm-panel-body {
    display: none;
  }
  .wrm-panel-body {
    display: grid;
    gap: 8px;
    padding: 10px;
  }
  .wrm-panel-item {
    display: grid;
    gap: 4px;
    border: 1px solid #edf1f5;
    border-radius: 6px;
    padding: 8px;
  }
  .wrm-panel-item span,
  .wrm-panel-item small {
    color: #5f6b7a;
  }
`;
document.documentElement.append(style);
