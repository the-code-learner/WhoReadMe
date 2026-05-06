import { detectTrackers, type MessageReadSummary, type PrepareMessageResponse } from "@who-read-me/shared";

const marker = "data-wrm-instrumented";

setInterval(scanGmail, 1500);

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
    button.textContent = "Track with Who Read Me";
    button.addEventListener("click", () => void instrumentCompose(body, button));
    body.parentElement?.append(button);
  }
}

async function instrumentCompose(body: HTMLElement, button: HTMLButtonElement) {
  button.disabled = true;
  button.textContent = "Preparing tracking...";
  const recipients = collectRecipients();
  const links = Array.from(body.querySelectorAll<HTMLAnchorElement>("a[href]")).map((link) => link.href);
  const response = await api<PrepareMessageResponse>("/api/messages/prepare", {
    method: "POST",
    body: JSON.stringify({
      subject: document.querySelector<HTMLInputElement>('input[name="subjectbox"]')?.value ?? undefined,
      senderEmail: "gmail-user",
      recipients,
      links
    })
  });

  for (const link of body.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const tracked = response.links.find((item) => item.originalUrl === link.href);
    if (tracked) link.href = tracked.trackedUrl;
  }

  for (const recipient of response.recipients) {
    const img = document.createElement("img");
    img.src = recipient.pixelUrl;
    img.width = 1;
    img.height = 1;
    img.alt = "";
    img.style.cssText = "display:none;width:1px;height:1px;";
    body.append(img);
  }

  button.textContent = `Tracking ${response.recipients.length} recipients`;
  button.dataset.messageId = response.messageId;
}

function scanReceivedMessages() {
  const messageBodies = document.querySelectorAll<HTMLElement>('div[role="listitem"] div.a3s:not([data-wrm-detected])');
  for (const body of messageBodies) {
    body.setAttribute("data-wrm-detected", "true");
    const result = detectTrackers(body.innerHTML);
    if (result.riskLevel === "none") continue;
    const badge = document.createElement("div");
    badge.className = `wrm-tracker-warning wrm-risk-${result.riskLevel}`;
    badge.textContent = `Who Read Me: ${result.findings.length} possible trackers detected`;
    body.prepend(badge);
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

function collectRecipients(): Array<{ email: string; displayName?: string }> {
  const chips = Array.from(document.querySelectorAll<HTMLElement>("[email], [data-hovercard-id]"));
  const emails = new Set<string>();
  for (const chip of chips) {
    const value = chip.getAttribute("email") ?? chip.getAttribute("data-hovercard-id");
    if (value && value.includes("@")) emails.add(value);
  }
  return Array.from(emails).map((email) => ({ email }));
}

function api<T>(path: string, init?: RequestInit): Promise<T> {
  return chrome.runtime.sendMessage({ type: "WRM_API", path, init });
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
  .wrm-read-summary {
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
`;
document.documentElement.append(style);

