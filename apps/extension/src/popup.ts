const apiOrigin = document.querySelector<HTMLInputElement>("#apiOrigin");
const extensionToken = document.querySelector<HTMLTextAreaElement>("#extensionToken");
const saveButton = document.querySelector<HTMLButtonElement>("#saveButton");
const statusText = document.querySelector<HTMLParagraphElement>("#statusText");

void chrome.storage.sync.get(["apiOrigin", "extensionToken"]).then((settings) => {
  if (apiOrigin) apiOrigin.value = settings.apiOrigin ?? "http://localhost:8787";
  if (extensionToken) extensionToken.value = settings.extensionToken ?? "";
});

saveButton?.addEventListener("click", () => {
  void chrome.storage.sync.set({
    apiOrigin: apiOrigin?.value.trim() || "http://localhost:8787",
    extensionToken: extensionToken?.value.trim() || ""
  }).then(() => {
    if (statusText) statusText.textContent = "Saved.";
  });
});

