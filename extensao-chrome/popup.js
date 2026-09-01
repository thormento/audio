const botao = document.getElementById("criar");
const status = document.getElementById("status");

botao.addEventListener("click", () => {
  botao.disabled = true;
  status.textContent = "Abrindo o Facebook…";
  chrome.runtime.sendMessage({ action: "criarPagina" }, (resposta) => {
    if (chrome.runtime.lastError) {
      status.textContent = "Erro: " + chrome.runtime.lastError.message;
      botao.disabled = false;
      return;
    }
    if (resposta && resposta.ok) {
      status.textContent = "Aba aberta — criando a página…";
      // Fecha o popup logo em seguida; o trabalho continua na aba.
      setTimeout(() => window.close(), 800);
    } else {
      status.textContent = "Não foi possível iniciar.";
      botao.disabled = false;
    }
  });
});
