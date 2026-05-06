chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.sync.set({
    apiOrigin: "http://localhost:8787"
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "WRM_API") return false;
  void callApi(message.path, message.init).then(sendResponse);
  return true;
});

async function callApi(path: string, init: RequestInit = {}) {
  const { apiOrigin, extensionToken } = await chrome.storage.sync.get(["apiOrigin", "extensionToken"]);
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (extensionToken) headers.set("authorization", `Bearer ${extensionToken}`);
  const response = await fetch(`${String(apiOrigin).replace(/\/$/, "")}${path}`, {
    ...init,
    headers
  });
  return response.json();
}

