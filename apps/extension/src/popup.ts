const apiOrigin = document.querySelector<HTMLInputElement>("#apiOrigin");
const extensionToken = document.querySelector<HTMLTextAreaElement>("#extensionToken");
const senderEmail = document.querySelector<HTMLInputElement>("#senderEmail");
const saveButton = document.querySelector<HTMLButtonElement>("#saveButton");
const statusText = document.querySelector<HTMLParagraphElement>("#statusText");

void chrome.storage.sync.get(["apiOrigin", "extensionToken", "senderEmail"]).then((settings) => {
  if (apiOrigin) apiOrigin.value = settings.apiOrigin ?? "http://localhost:8787";
  if (extensionToken) extensionToken.value = settings.extensionToken ?? "";
  if (senderEmail) senderEmail.value = settings.senderEmail ?? "";
});

saveButton?.addEventListener("click", () => {
  void chrome.storage.sync.set({
    apiOrigin: apiOrigin?.value.trim() || "http://localhost:8787",
    extensionToken: extensionToken?.value.trim() || "",
    senderEmail: senderEmail?.value.trim() || ""
  }).then(() => {
    if (statusText) statusText.textContent = "Saved.";
  });
});
