// Service worker: recebe o pedido do popup, marca a flag e abre a aba de criação.
// A flag garante que o content script rode a automação exatamente uma vez.

const URL_CRIACAO = "https://www.facebook.com/pages/creation/";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === "criarPagina") {
    chrome.storage.local.set({ pendingCreate: true }, () => {
      chrome.tabs.create({ url: URL_CRIACAO }, () => {
        sendResponse({ ok: true });
      });
    });
    return true; // resposta assíncrona
  }
});
