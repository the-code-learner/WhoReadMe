const apiOrigin = document.querySelector<HTMLInputElement>("#apiOrigin");
const extensionToken = document.querySelector<HTMLTextAreaElement>("#extensionToken");
const senderEmail = document.querySelector<HTMLInputElement>("#senderEmail");
const trackerWarningsEnabled = document.querySelector<HTMLInputElement>("#trackerWarningsEnabled");
const saveButton = document.querySelector<HTMLButtonElement>("#saveButton");
const statusText = document.querySelector<HTMLParagraphElement>("#statusText");

void chrome.storage.sync.get(["apiOrigin", "extensionToken", "senderEmail", "trackerWarningsEnabled"]).then((settings) => {
  if (apiOrigin) apiOrigin.value = settings.apiOrigin ?? "http://localhost:8787";
  if (extensionToken) extensionToken.value = settings.extensionToken ?? "";
  if (senderEmail) senderEmail.value = settings.senderEmail ?? "";
  if (trackerWarningsEnabled) trackerWarningsEnabled.checked = settings.trackerWarningsEnabled !== false;
});

saveButton?.addEventListener("click", () => {
  void chrome.storage.sync.set({
    apiOrigin: apiOrigin?.value.trim() || "http://localhost:8787",
    extensionToken: extensionToken?.value.trim() || "",
    senderEmail: senderEmail?.value.trim() || "",
    trackerWarningsEnabled: trackerWarningsEnabled?.checked ?? true
  }).then(() => {
    if (statusText) statusText.textContent = "Saved.";
  });
});
