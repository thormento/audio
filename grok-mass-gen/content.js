// Grok Imagine Mass Gen, content script.
// Injeta um painel flutuante no grok.com que automatiza o envio de uma lista
// de prompts (um por linha) e o download em massa dos vídeos e imagens gerados.
// Tudo em vanilla JS, sem bibliotecas externas.

(() => {
  'use strict';

  // Proteção contra dupla injeção (por exemplo, ao recarregar a extensão).
  if (window.__gmgInjetado) return;
  window.__gmgInjetado = true;

  // ---------------------------------------------------------------------------
  // Constantes e estado
  // ---------------------------------------------------------------------------

  const CHAVE_CONFIG = 'gmg_config';
  const CHAVE_PROGRESSO = 'gmg_progresso';
  const CHAVE_POSICAO = 'gmg_posicao';
  const CHAVE_RELATORIO = 'gmg_relatorio';

  const INTERVALO_MINIMO = 3; // segundos, nunca reduzir abaixo disso
  const ESPERAS_RETRY_MS = [5000, 15000, 30000];
  const PAUSA_RATE_LIMIT_MS = 5 * 60 * 1000;
  const DELAY_ENTRE_DOWNLOADS_MS = 400;
  const EXTENSOES_VALIDAS = ['mp4', 'webm', 'mov', 'jpg', 'jpeg', 'png', 'webp', 'gif'];

  const PADROES = {
    prompts: '',
    modo: 'intervalo', // 'intervalo' ou 'deteccao'
    intervalo: 45,
    timeoutDeteccao: 120,
    delayPosDeteccao: 5,
    carenciaDeteccao: 8,
    midiaEsperada: 'video', // 'video', 'imagem' ou 'qualquer'
    prefixo: 'grok',
    incluirImagens: true,
    baixarAuto: false,
    simular: false,
    seletorCampo: '',
    seletorBotao: ''
  };

  const estado = {
    rodando: false,
    pararSolicitado: false,
    enviados: 0,
    baixados: 0,
    urlsBaixadas: new Set(),
    relatorio: [],
    minimizado: false,
    oculto: false,
    ultimoProgressoSalvo: null
  };

  const ui = {};

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  function dormir(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Espera `ms` verificando a flag de parada a cada segundo.
  // Retorna false se a parada foi solicitada durante a espera.
  async function esperarComParada(ms, textoStatus) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      if (estado.pararSolicitado) return false;
      const restante = Math.ceil((fim - Date.now()) / 1000);
      if (textoStatus) definirStatus(`${textoStatus} (${restante}s)`);
      await dormir(Math.min(1000, Math.max(0, fim - Date.now())));
    }
    return !estado.pararSolicitado;
  }

  function horaAgora() {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
  }

  function carimboArquivo() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  // Slug do prompt: primeiras 40 letras, sem acentos nem caracteres especiais.
  function slugPrompt(texto) {
    const semAcento = String(texto || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    const slug = semAcento
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '');
    return slug || 'prompt';
  }

  function limparNomeArquivo(nome) {
    return String(nome || 'arquivo').replace(/[\\/:*?"<>|]/g, '_').trim();
  }

  function estaVisivel(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.closest && el.closest('#gmg-panel')) return false;
    const estilo = window.getComputedStyle(el);
    if (estilo.display === 'none' || estilo.visibility === 'hidden' || estilo.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function estaDesabilitado(botao) {
    if (!botao) return true;
    if (botao.disabled) return true;
    if (botao.getAttribute('aria-disabled') === 'true') return true;
    return false;
  }

  function contem(texto, trecho) {
    return String(texto || '').toLowerCase().includes(trecho);
  }

  function inferirExtensao(url, tipo, mime) {
    // Primeiro tenta pelo mime (útil para blobs).
    if (mime) {
      const m = mime.toLowerCase();
      if (m.includes('mp4')) return 'mp4';
      if (m.includes('webm')) return 'webm';
      if (m.includes('quicktime')) return 'mov';
      if (m.includes('png')) return 'png';
      if (m.includes('webp')) return 'webp';
      if (m.includes('gif')) return 'gif';
      if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
    }
    // Depois pela URL.
    try {
      const u = new URL(url, location.href);
      const partes = u.pathname.split('.');
      if (partes.length > 1) {
        const ext = partes.pop().toLowerCase();
        if (EXTENSOES_VALIDAS.includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;
      }
      const extParam = u.searchParams.get('format') || u.searchParams.get('ext');
      if (extParam && EXTENSOES_VALIDAS.includes(extParam.toLowerCase())) return extParam.toLowerCase();
    } catch (e) {
      // URL inválida, segue para o fallback
    }
    return tipo === 'video' ? 'mp4' : 'jpg';
  }

  // ---------------------------------------------------------------------------
  // Armazenamento (chrome.storage.local)
  // ---------------------------------------------------------------------------

  function storageGet(chaves) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(chaves, (r) => resolve(r || {}));
      } catch (e) {
        resolve({});
      }
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(obj, () => resolve());
      } catch (e) {
        resolve();
      }
    });
  }

  function storageRemove(chave) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.remove(chave, () => resolve());
      } catch (e) {
        resolve();
      }
    });
  }

  let timerSalvar = null;
  function agendarSalvarConfig() {
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(salvarConfig, 250);
  }

  function lerConfigDaUi() {
    const intervalo = Math.max(INTERVALO_MINIMO, parseInt(ui.intervalo.value, 10) || PADROES.intervalo);
    return {
      prompts: ui.prompts.value,
      modo: ui.modoDeteccao.checked ? 'deteccao' : 'intervalo',
      intervalo,
      timeoutDeteccao: Math.max(10, parseInt(ui.timeoutDeteccao.value, 10) || PADROES.timeoutDeteccao),
      delayPosDeteccao: Math.max(0, parseInt(ui.delayPosDeteccao.value, 10) || 0),
      carenciaDeteccao: Math.max(0, parseInt(ui.carenciaDeteccao.value, 10) || 0),
      midiaEsperada: ui.midiaEsperada.value || 'video',
      prefixo: (ui.prefixo.value || '').trim() || PADROES.prefixo,
      incluirImagens: ui.incluirImagens.checked,
      baixarAuto: ui.baixarAuto.checked,
      simular: ui.simular.checked,
      seletorCampo: (ui.seletorCampo.value || '').trim(),
      seletorBotao: (ui.seletorBotao.value || '').trim()
    };
  }

  async function salvarConfig() {
    const cfg = lerConfigDaUi();
    // Garante que a UI nunca mostre um intervalo abaixo do mínimo.
    if (parseInt(ui.intervalo.value, 10) !== cfg.intervalo) ui.intervalo.value = cfg.intervalo;
    await storageSet({ [CHAVE_CONFIG]: cfg });
  }

  function aplicarConfigNaUi(cfg) {
    const c = Object.assign({}, PADROES, cfg || {});
    ui.prompts.value = c.prompts;
    ui.modoIntervalo.checked = c.modo !== 'deteccao';
    ui.modoDeteccao.checked = c.modo === 'deteccao';
    ui.intervalo.value = Math.max(INTERVALO_MINIMO, c.intervalo);
    ui.timeoutDeteccao.value = c.timeoutDeteccao;
    ui.delayPosDeteccao.value = c.delayPosDeteccao;
    ui.carenciaDeteccao.value = c.carenciaDeteccao;
    ui.midiaEsperada.value = c.midiaEsperada;
    ui.prefixo.value = c.prefixo;
    ui.incluirImagens.checked = !!c.incluirImagens;
    ui.baixarAuto.checked = !!c.baixarAuto;
    ui.simular.checked = !!c.simular;
    ui.seletorCampo.value = c.seletorCampo;
    ui.seletorBotao.value = c.seletorBotao;
    atualizarVisibilidadeModo();
  }

  // ---------------------------------------------------------------------------
  // Painel (interface)
  // ---------------------------------------------------------------------------

  function criarPainel() {
    const painel = document.createElement('div');
    painel.id = 'gmg-panel';
    painel.innerHTML = `
      <div class="gmg-header" id="gmg-header">
        <span class="gmg-title">Grok Mass Gen</span>
        <span class="gmg-counters">
          <span class="gmg-counter" id="gmg-cont-enviados" title="Prompts enviados nesta sessão">Enviados: 0</span>
          <span class="gmg-counter" id="gmg-cont-baixados" title="Arquivos baixados nesta sessão">Baixados: 0</span>
        </span>
        <button class="gmg-header-btn" id="gmg-btn-minimizar" title="Minimizar ou expandir">&#8211;</button>
        <button class="gmg-header-btn" id="gmg-btn-ocultar" title="Ocultar painel (Alt+G para mostrar)">&#215;</button>
      </div>
      <div class="gmg-body">
        <div class="gmg-resume-box" id="gmg-resume-box">
          <span id="gmg-resume-texto">Fila interrompida.</span>
          <button class="gmg-btn gmg-btn-small gmg-btn-primary" id="gmg-btn-retomar">Retomar de onde parou</button>
          <button class="gmg-btn gmg-btn-small" id="gmg-btn-descartar" title="Descartar progresso salvo">Descartar</button>
        </div>

        <div>
          <label class="gmg-label" for="gmg-prompts">Prompts, um por linha</label>
          <textarea id="gmg-prompts" placeholder="Um prompt por linha. Linhas vazias são ignoradas."></textarea>
          <div class="gmg-buttons" style="margin-top:6px">
            <button class="gmg-btn gmg-btn-small" id="gmg-btn-importar">Importar TXT/CSV</button>
            <button class="gmg-btn gmg-btn-small" id="gmg-btn-limpar">Limpar lista</button>
            <span class="gmg-hint" id="gmg-contagem-prompts" style="align-self:center">0 prompts</span>
          </div>
          <input type="file" id="gmg-arquivo" class="gmg-file-input" accept=".txt,.csv,text/plain,text/csv">
        </div>

        <div>
          <span class="gmg-label">Modo de espera entre prompts</span>
          <div class="gmg-radio-group">
            <label class="gmg-check"><input type="radio" name="gmg-modo" id="gmg-modo-intervalo" value="intervalo"> Intervalo fixo</label>
            <label class="gmg-check"><input type="radio" name="gmg-modo" id="gmg-modo-deteccao" value="deteccao"> Detectar conclusão</label>
          </div>
        </div>

        <div class="gmg-row" id="gmg-bloco-intervalo">
          <div>
            <label class="gmg-label" for="gmg-intervalo">Intervalo entre envios (s), mínimo 3</label>
            <input type="number" id="gmg-intervalo" min="3" step="1" value="45">
          </div>
          <div>
            <label class="gmg-label" for="gmg-prefixo">Prefixo dos arquivos</label>
            <input type="text" id="gmg-prefixo" value="grok" placeholder="grok">
          </div>
        </div>

        <div id="gmg-bloco-deteccao" style="display:none; flex-direction:column; gap:8px">
          <div class="gmg-row">
            <div>
              <label class="gmg-label" for="gmg-timeout-deteccao">Timeout máximo (s)</label>
              <input type="number" id="gmg-timeout-deteccao" min="10" step="1" value="120">
            </div>
            <div>
              <label class="gmg-label" for="gmg-delay-pos">Delay após detectar (s)</label>
              <input type="number" id="gmg-delay-pos" min="0" step="1" value="5">
            </div>
            <div>
              <label class="gmg-label" for="gmg-midia-esperada">Mídia esperada</label>
              <select id="gmg-midia-esperada">
                <option value="video">Vídeo</option>
                <option value="imagem">Imagem</option>
                <option value="qualquer">Qualquer</option>
              </select>
            </div>
          </div>
          <div class="gmg-hint">Espera um novo vídeo ou imagem aparecer na página depois do envio. Se estourar o timeout, usa o intervalo fixo como fallback.</div>
        </div>

        <label class="gmg-check"><input type="checkbox" id="gmg-incluir-imagens" checked> Incluir imagens no download (largura mínima 300px)</label>
        <label class="gmg-check"><input type="checkbox" id="gmg-baixar-auto"> Baixar automaticamente cada mídia gerada (exige modo Detectar conclusão)</label>
        <label class="gmg-check"><input type="checkbox" id="gmg-simular"> Simular (não enviar): percorre a fila sem o clique final</label>

        <div class="gmg-buttons">
          <button class="gmg-btn gmg-btn-primary" id="gmg-btn-iniciar">Iniciar fila</button>
          <button class="gmg-btn gmg-btn-danger" id="gmg-btn-parar" disabled>Parar</button>
          <button class="gmg-btn" id="gmg-btn-baixar-tudo">Baixar tudo da página</button>
          <button class="gmg-btn" id="gmg-btn-relatorio" disabled>Exportar relatório</button>
        </div>

        <div class="gmg-progress"><div class="gmg-progress-bar" id="gmg-progress-bar"></div></div>
        <div class="gmg-status" id="gmg-status">Pronto.</div>

        <div class="gmg-log" id="gmg-log"></div>

        <details class="gmg-advanced">
          <summary>Avançado</summary>
          <div class="gmg-advanced-content">
            <div>
              <label class="gmg-label" for="gmg-seletor-campo">Seletor CSS do campo de prompt (opcional)</label>
              <input type="text" id="gmg-seletor-campo" placeholder='ex: textarea[placeholder*="imagin"]'>
            </div>
            <div>
              <label class="gmg-label" for="gmg-seletor-botao">Seletor CSS do botão de enviar (opcional)</label>
              <input type="text" id="gmg-seletor-botao" placeholder='ex: button[aria-label="Submit"]'>
            </div>
            <div>
              <label class="gmg-label" for="gmg-carencia">Carência da detecção (s): mídias que aparecem antes disso são ignoradas</label>
              <input type="number" id="gmg-carencia" min="0" step="1" value="8">
            </div>
            <div class="gmg-buttons">
              <button class="gmg-btn gmg-btn-small" id="gmg-btn-testar-seletores">Testar seletores</button>
              <button class="gmg-btn gmg-btn-small" id="gmg-btn-limpar-log">Limpar log</button>
            </div>
            <div class="gmg-hint">Se vazios, o painel localiza o campo e o botão por heurística (placeholder contendo "imagin", botão com aria-label ou texto de envio). Atalho: Alt+G mostra ou esconde o painel.</div>
          </div>
        </details>
      </div>
    `;

    document.documentElement.appendChild(painel);

    // Referências dos elementos
    ui.painel = painel;
    ui.header = painel.querySelector('#gmg-header');
    ui.contEnviados = painel.querySelector('#gmg-cont-enviados');
    ui.contBaixados = painel.querySelector('#gmg-cont-baixados');
    ui.btnMinimizar = painel.querySelector('#gmg-btn-minimizar');
    ui.btnOcultar = painel.querySelector('#gmg-btn-ocultar');
    ui.resumeBox = painel.querySelector('#gmg-resume-box');
    ui.resumeTexto = painel.querySelector('#gmg-resume-texto');
    ui.btnRetomar = painel.querySelector('#gmg-btn-retomar');
    ui.btnDescartar = painel.querySelector('#gmg-btn-descartar');
    ui.prompts = painel.querySelector('#gmg-prompts');
    ui.btnImportar = painel.querySelector('#gmg-btn-importar');
    ui.btnLimpar = painel.querySelector('#gmg-btn-limpar');
    ui.contagemPrompts = painel.querySelector('#gmg-contagem-prompts');
    ui.arquivo = painel.querySelector('#gmg-arquivo');
    ui.modoIntervalo = painel.querySelector('#gmg-modo-intervalo');
    ui.modoDeteccao = painel.querySelector('#gmg-modo-deteccao');
    ui.blocoIntervalo = painel.querySelector('#gmg-bloco-intervalo');
    ui.blocoDeteccao = painel.querySelector('#gmg-bloco-deteccao');
    ui.intervalo = painel.querySelector('#gmg-intervalo');
    ui.prefixo = painel.querySelector('#gmg-prefixo');
    ui.timeoutDeteccao = painel.querySelector('#gmg-timeout-deteccao');
    ui.delayPosDeteccao = painel.querySelector('#gmg-delay-pos');
    ui.midiaEsperada = painel.querySelector('#gmg-midia-esperada');
    ui.carenciaDeteccao = painel.querySelector('#gmg-carencia');
    ui.incluirImagens = painel.querySelector('#gmg-incluir-imagens');
    ui.baixarAuto = painel.querySelector('#gmg-baixar-auto');
    ui.simular = painel.querySelector('#gmg-simular');
    ui.btnIniciar = painel.querySelector('#gmg-btn-iniciar');
    ui.btnParar = painel.querySelector('#gmg-btn-parar');
    ui.btnBaixarTudo = painel.querySelector('#gmg-btn-baixar-tudo');
    ui.btnRelatorio = painel.querySelector('#gmg-btn-relatorio');
    ui.progressBar = painel.querySelector('#gmg-progress-bar');
    ui.status = painel.querySelector('#gmg-status');
    ui.log = painel.querySelector('#gmg-log');
    ui.seletorCampo = painel.querySelector('#gmg-seletor-campo');
    ui.seletorBotao = painel.querySelector('#gmg-seletor-botao');
    ui.btnTestarSeletores = painel.querySelector('#gmg-btn-testar-seletores');
    ui.btnLimparLog = painel.querySelector('#gmg-btn-limpar-log');

    ligarEventos();
    tornarArrastavel();
  }

  function ligarEventos() {
    // Persistência de todos os campos
    const camposPersistidos = [
      ui.prompts, ui.modoIntervalo, ui.modoDeteccao, ui.intervalo, ui.prefixo,
      ui.timeoutDeteccao, ui.delayPosDeteccao, ui.midiaEsperada, ui.carenciaDeteccao,
      ui.incluirImagens, ui.baixarAuto, ui.simular, ui.seletorCampo, ui.seletorBotao
    ];
    camposPersistidos.forEach((el) => {
      el.addEventListener('input', agendarSalvarConfig);
      el.addEventListener('change', agendarSalvarConfig);
    });

    ui.prompts.addEventListener('input', atualizarContagemPrompts);
    ui.modoIntervalo.addEventListener('change', atualizarVisibilidadeModo);
    ui.modoDeteccao.addEventListener('change', atualizarVisibilidadeModo);

    ui.intervalo.addEventListener('change', () => {
      const v = parseInt(ui.intervalo.value, 10);
      if (!v || v < INTERVALO_MINIMO) {
        ui.intervalo.value = INTERVALO_MINIMO;
        registrarLog(`Intervalo mínimo é ${INTERVALO_MINIMO}s, valor ajustado.`, 'warn');
      }
    });

    ui.btnMinimizar.addEventListener('click', () => {
      estado.minimizado = !estado.minimizado;
      ui.painel.classList.toggle('gmg-minimized', estado.minimizado);
      ui.btnMinimizar.innerHTML = estado.minimizado ? '&#43;' : '&#8211;';
    });

    ui.btnOcultar.addEventListener('click', () => alternarPainel(true));

    ui.btnImportar.addEventListener('click', () => ui.arquivo.click());
    ui.arquivo.addEventListener('change', importarArquivo);
    ui.btnLimpar.addEventListener('click', () => {
      if (estado.rodando) return;
      ui.prompts.value = '';
      atualizarContagemPrompts();
      agendarSalvarConfig();
    });

    ui.btnIniciar.addEventListener('click', () => iniciarFila(0));
    ui.btnParar.addEventListener('click', pararFila);
    ui.btnBaixarTudo.addEventListener('click', baixarTudoDaPagina);
    ui.btnRelatorio.addEventListener('click', exportarRelatorio);
    ui.btnRetomar.addEventListener('click', retomarFila);
    ui.btnDescartar.addEventListener('click', async () => {
      await storageRemove(CHAVE_PROGRESSO);
      estado.ultimoProgressoSalvo = null;
      atualizarCaixaRetomar();
      registrarLog('Progresso salvo descartado.', 'info');
    });
    ui.btnTestarSeletores.addEventListener('click', testarSeletores);
    ui.btnLimparLog.addEventListener('click', () => { ui.log.innerHTML = ''; });

    // Atalho Alt+G para mostrar ou esconder o painel
    document.addEventListener('keydown', (ev) => {
      if (ev.altKey && !ev.ctrlKey && !ev.metaKey && (ev.key === 'g' || ev.key === 'G' || ev.code === 'KeyG')) {
        ev.preventDefault();
        alternarPainel();
      }
    }, true);

    // Evita que teclas digitadas no painel cheguem aos atalhos do site
    ui.painel.addEventListener('keydown', (ev) => {
      if (!(ev.altKey && (ev.key === 'g' || ev.key === 'G'))) ev.stopPropagation();
    });
  }

  function alternarPainel(forcarOcultar) {
    estado.oculto = forcarOcultar === true ? true : !estado.oculto;
    ui.painel.classList.toggle('gmg-hidden', estado.oculto);
  }

  function atualizarVisibilidadeModo() {
    const deteccao = ui.modoDeteccao.checked;
    ui.blocoDeteccao.style.display = deteccao ? 'flex' : 'none';
  }

  function atualizarContagemPrompts() {
    const n = obterPrompts().length;
    ui.contagemPrompts.textContent = `${n} prompt${n === 1 ? '' : 's'}`;
  }

  function atualizarContadores() {
    ui.contEnviados.textContent = `Enviados: ${estado.enviados}`;
    ui.contBaixados.textContent = `Baixados: ${estado.baixados}`;
  }

  function definirStatus(texto) {
    ui.status.textContent = texto;
  }

  function definirProgresso(atual, total) {
    const pct = total > 0 ? Math.round((atual / total) * 100) : 0;
    ui.progressBar.style.width = `${Math.min(100, pct)}%`;
  }

  // Log com timestamp, cores por tipo e auto-scroll.
  function registrarLog(mensagem, tipo) {
    const linha = document.createElement('div');
    linha.className = 'gmg-log-line' + (tipo === 'ok' ? ' gmg-log-ok' : tipo === 'err' ? ' gmg-log-err' : tipo === 'warn' ? ' gmg-log-warn' : '');
    const hora = document.createElement('span');
    hora.className = 'gmg-log-time';
    hora.textContent = horaAgora();
    linha.appendChild(hora);
    linha.appendChild(document.createTextNode(mensagem));
    ui.log.appendChild(linha);
    while (ui.log.children.length > 400) ui.log.removeChild(ui.log.firstChild);
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function definirRodando(rodando) {
    estado.rodando = rodando;
    ui.btnIniciar.disabled = rodando;
    ui.btnRetomar.disabled = rodando;
    ui.btnParar.disabled = !rodando;
    ui.btnLimpar.disabled = rodando;
    ui.btnImportar.disabled = rodando;
    ui.prompts.readOnly = rodando;
  }

  // Arrastar o painel pelo cabeçalho, com persistência da posição.
  function tornarArrastavel() {
    let arrastando = false;
    let offsetX = 0;
    let offsetY = 0;

    ui.header.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('button')) return;
      arrastando = true;
      const r = ui.painel.getBoundingClientRect();
      offsetX = ev.clientX - r.left;
      offsetY = ev.clientY - r.top;
      ui.header.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });

    ui.header.addEventListener('pointermove', (ev) => {
      if (!arrastando) return;
      const largura = ui.painel.offsetWidth;
      const altura = ui.painel.offsetHeight;
      const x = Math.min(Math.max(0, ev.clientX - offsetX), window.innerWidth - Math.min(largura, 120));
      const y = Math.min(Math.max(0, ev.clientY - offsetY), window.innerHeight - Math.min(altura, 40));
      ui.painel.style.left = `${x}px`;
      ui.painel.style.top = `${y}px`;
      ui.painel.style.right = 'auto';
      ajustarAlturaMaxima();
    });

    const soltar = () => {
      if (!arrastando) return;
      arrastando = false;
      storageSet({ [CHAVE_POSICAO]: { left: ui.painel.style.left, top: ui.painel.style.top } });
    };
    ui.header.addEventListener('pointerup', soltar);
    ui.header.addEventListener('pointercancel', soltar);
  }

  // Garante que o painel nunca ultrapasse a parte inferior da janela.
  function ajustarAlturaMaxima() {
    const top = ui.painel.getBoundingClientRect().top;
    const disponivel = Math.max(220, window.innerHeight - top - 16);
    ui.painel.style.maxHeight = `${disponivel}px`;
  }

  async function restaurarPosicao() {
    const r = await storageGet(CHAVE_POSICAO);
    const pos = r[CHAVE_POSICAO];
    if (pos && pos.left && pos.top) {
      const left = parseInt(pos.left, 10);
      const top = parseInt(pos.top, 10);
      if (!isNaN(left) && !isNaN(top) && left < window.innerWidth - 60 && top < window.innerHeight - 40) {
        ui.painel.style.left = `${Math.max(0, left)}px`;
        ui.painel.style.top = `${Math.max(0, top)}px`;
        ui.painel.style.right = 'auto';
      }
    }
    ajustarAlturaMaxima();
    window.addEventListener('resize', ajustarAlturaMaxima);
  }

  // ---------------------------------------------------------------------------
  // Importar prompts e exportar relatório
  // ---------------------------------------------------------------------------

  function obterPrompts() {
    return ui.prompts.value
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  // Lê um .txt (um prompt por linha) ou .csv (primeira coluna).
  function importarArquivo() {
    const arquivo = ui.arquivo.files && ui.arquivo.files[0];
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      const texto = String(leitor.result || '');
      const ehCsv = /\.csv$/i.test(arquivo.name);
      const linhas = texto.split(/\r?\n/);
      const prompts = [];
      for (let i = 0; i < linhas.length; i++) {
        let linha = linhas[i];
        if (!linha.trim()) continue;
        if (ehCsv) {
          linha = primeiraColunaCsv(linha);
          // Ignora um cabeçalho comum na primeira linha
          if (i === 0 && /^(prompt|prompts|texto|text)$/i.test(linha.trim())) continue;
        }
        if (linha.trim()) prompts.push(linha.trim());
      }
      const atual = ui.prompts.value.trim();
      ui.prompts.value = (atual ? atual + '\n' : '') + prompts.join('\n');
      atualizarContagemPrompts();
      agendarSalvarConfig();
      registrarLog(`Importados ${prompts.length} prompts de ${arquivo.name}.`, 'ok');
    };
    leitor.onerror = () => registrarLog(`Falha ao ler o arquivo ${arquivo.name}.`, 'err');
    leitor.readAsText(arquivo, 'utf-8');
    ui.arquivo.value = '';
  }

  // Extrai a primeira coluna de uma linha CSV respeitando aspas.
  function primeiraColunaCsv(linha) {
    let resultado = '';
    let dentroAspas = false;
    for (let i = 0; i < linha.length; i++) {
      const c = linha[i];
      if (c === '"') {
        if (dentroAspas && linha[i + 1] === '"') {
          resultado += '"';
          i++;
        } else {
          dentroAspas = !dentroAspas;
        }
      } else if ((c === ',' || c === ';') && !dentroAspas) {
        break;
      } else {
        resultado += c;
      }
    }
    return resultado;
  }

  function escaparCsv(valor) {
    const s = String(valor == null ? '' : valor);
    if (/[",;\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  async function exportarRelatorio() {
    if (!estado.relatorio.length) {
      registrarLog('Nenhum registro para exportar.', 'warn');
      return;
    }
    const linhas = ['prompt,status,horario,arquivo'];
    estado.relatorio.forEach((r) => {
      linhas.push([r.prompt, r.status, r.horario, r.arquivo || ''].map(escaparCsv).join(','));
    });
    const csv = '﻿' + linhas.join('\n');
    const nome = `${limparNomeArquivo(lerConfigDaUi().prefixo)}_relatorio_${carimboArquivo()}.csv`;
    const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    const resp = await enviarParaBackground({ tipo: 'gmg-download', url: dataUrl, nome });
    if (resp && resp.ok) {
      registrarLog(`Relatório exportado: ${nome}`, 'ok');
    } else {
      // Fallback: anchor com download
      baixarViaAnchor(dataUrl, nome);
      registrarLog(`Relatório exportado (via navegador): ${nome}`, 'ok');
    }
  }

  // O relatório também é salvo no storage para sobreviver a um reload no meio da fila.
  function adicionarRelatorio(prompt, status, arquivo) {
    estado.relatorio.push({ prompt, status, horario: new Date().toLocaleString('pt-BR'), arquivo: arquivo || '' });
    ui.btnRelatorio.disabled = false;
    storageSet({ [CHAVE_RELATORIO]: estado.relatorio.slice(-2000) });
  }

  // ---------------------------------------------------------------------------
  // Localização do campo e do botão de enviar
  // ---------------------------------------------------------------------------

  function consultarSeletor(seletor) {
    if (!seletor) return null;
    try {
      const lista = document.querySelectorAll(seletor);
      for (const el of lista) if (estaVisivel(el)) return el;
      return lista[0] || null;
    } catch (e) {
      registrarLog(`Seletor inválido: ${seletor}`, 'err');
      return null;
    }
  }

  // Heurística em cascata para achar o campo de prompt.
  function localizarCampo(cfg) {
    if (cfg.seletorCampo) {
      const el = consultarSeletor(cfg.seletorCampo);
      if (el) return el;
    }
    // textarea ou input com placeholder contendo "imagin"
    for (const el of document.querySelectorAll('textarea, input[type="text"], input:not([type])')) {
      if (contem(el.getAttribute('placeholder'), 'imagin') && estaVisivel(el)) return el;
    }
    // contenteditable com data-placeholder ou aria-label contendo "imagin"
    for (const el of document.querySelectorAll('[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]')) {
      const dp = el.getAttribute('data-placeholder') || el.getAttribute('aria-placeholder') || el.getAttribute('placeholder');
      const al = el.getAttribute('aria-label');
      if ((contem(dp, 'imagin') || contem(al, 'imagin')) && estaVisivel(el)) return el;
    }
    // primeiro textarea visível
    for (const el of document.querySelectorAll('textarea')) {
      if (estaVisivel(el)) return el;
    }
    return null;
  }

  function botaoPareceEnvio(botao) {
    const rotulo = [
      botao.getAttribute('aria-label'),
      botao.getAttribute('title'),
      botao.getAttribute('data-testid'),
      botao.textContent
    ].join(' ').toLowerCase();
    return /submit|send|enviar|generate|gerar/.test(rotulo);
  }

  // Heurística em cascata para achar o botão de enviar.
  function localizarBotao(cfg, campo) {
    if (cfg.seletorBotao) {
      const el = consultarSeletor(cfg.seletorBotao);
      if (el) return el;
    }
    if (!campo) return null;

    // Sobe até 6 níveis procurando um botão de envio
    let container = campo.parentElement;
    let ultimoContainer = null;
    for (let nivel = 0; nivel < 6 && container; nivel++) {
      ultimoContainer = container;
      const botoes = Array.from(container.querySelectorAll('button')).filter(estaVisivel);
      const envio = botoes.find(botaoPareceEnvio);
      if (envio) return envio;
      container = container.parentElement;
    }

    // type=submit dentro do form ou container
    const form = campo.closest('form') || ultimoContainer;
    if (form) {
      const submit = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]')).find(estaVisivel);
      if (submit) return submit;
    }

    // último botão visível do container
    if (ultimoContainer) {
      const botoes = Array.from(ultimoContainer.querySelectorAll('button')).filter(estaVisivel);
      if (botoes.length) return botoes[botoes.length - 1];
    }
    return null;
  }

  // Preenche o campo de forma compatível com React (native setter + evento input).
  function preencherCampo(campo, texto) {
    campo.focus();
    if (campo.isContentEditable) {
      // contenteditable: seleciona tudo e insere o texto
      const selecao = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(campo);
      selecao.removeAllRanges();
      selecao.addRange(range);
      let inserido = false;
      try {
        inserido = document.execCommand('insertText', false, texto);
      } catch (e) {
        inserido = false;
      }
      if (!inserido || campo.textContent.trim() !== texto.trim()) {
        campo.textContent = texto;
        campo.dispatchEvent(new InputEvent('input', { bubbles: true, data: texto, inputType: 'insertText' }));
      }
      return true;
    }

    const prototipo = campo instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descritor = Object.getOwnPropertyDescriptor(prototipo, 'value');
    if (descritor && descritor.set) {
      descritor.set.call(campo, texto);
    } else {
      campo.value = texto;
    }
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function simularEnter(campo) {
    const opcoes = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    campo.dispatchEvent(new KeyboardEvent('keydown', opcoes));
    campo.dispatchEvent(new KeyboardEvent('keypress', opcoes));
    campo.dispatchEvent(new KeyboardEvent('keyup', opcoes));
  }

  function testarSeletores() {
    const cfg = lerConfigDaUi();
    const campo = localizarCampo(cfg);
    if (!campo) {
      registrarLog('Teste: campo de prompt não encontrado.', 'err');
      return;
    }
    registrarLog(`Teste: campo encontrado (${campo.tagName.toLowerCase()}${campo.id ? '#' + campo.id : ''}).`, 'ok');
    const botao = localizarBotao(cfg, campo);
    if (!botao) {
      registrarLog('Teste: botão de enviar não encontrado, será usado Enter como fallback.', 'warn');
      return;
    }
    const rotulo = botao.getAttribute('aria-label') || botao.textContent.trim() || '(sem rótulo)';
    registrarLog(`Teste: botão encontrado, rótulo "${rotulo.slice(0, 40)}"${estaDesabilitado(botao) ? ', atualmente desabilitado' : ''}.`, 'ok');
    campo.style.outline = '2px solid #7c8cff';
    botao.style.outline = '2px solid #6ee7a0';
    setTimeout(() => {
      campo.style.outline = '';
      botao.style.outline = '';
    }, 2500);
  }

  // Tentativa única de envio. Lança erro descritivo em caso de falha.
  async function tentarEnviar(prompt, cfg) {
    const campo = localizarCampo(cfg);
    if (!campo) throw new Error('campo de prompt não encontrado');

    preencherCampo(campo, prompt);
    await dormir(600);

    let botao = localizarBotao(cfg, campo);
    // Se o botão existe mas está desabilitado, espera um pouco pelo React reagir ao texto
    if (botao && estaDesabilitado(botao)) {
      for (let i = 0; i < 6 && estaDesabilitado(botao); i++) {
        await dormir(400);
        botao = localizarBotao(cfg, campo) || botao;
      }
    }

    if (cfg.simular) {
      return { metodo: botao ? 'botão (simulado)' : 'Enter (simulado)' };
    }

    if (botao && !estaDesabilitado(botao)) {
      botao.click();
      return { metodo: 'botão' };
    }
    if (botao && estaDesabilitado(botao)) {
      throw new Error('botão de enviar continua desabilitado');
    }
    // Fallback: simular Enter no campo
    simularEnter(campo);
    return { metodo: 'Enter' };
  }

  // Envio com retry e backoff (5s, 15s, 30s).
  async function enviarComRetry(prompt, cfg, indice) {
    let erroFinal = null;
    for (let tentativa = 0; tentativa <= ESPERAS_RETRY_MS.length; tentativa++) {
      if (estado.pararSolicitado) return null;
      try {
        const r = await tentarEnviar(prompt, cfg);
        return r;
      } catch (erro) {
        erroFinal = erro;
        const msg = erro && erro.message ? erro.message : String(erro);
        if (tentativa < ESPERAS_RETRY_MS.length) {
          const espera = ESPERAS_RETRY_MS[tentativa];
          registrarLog(`Prompt ${indice + 1}: falha (${msg}), nova tentativa em ${espera / 1000}s.`, 'warn');
          const ok = await esperarComParada(espera, `Aguardando para tentar de novo o prompt ${indice + 1}`);
          if (!ok) return null;
        }
      }
    }
    registrarLog(`Prompt ${indice + 1}: pulado após ${ESPERAS_RETRY_MS.length + 1} tentativas (${erroFinal && erroFinal.message}).`, 'err');
    return { pulado: true };
  }

  // ---------------------------------------------------------------------------
  // Detecção de rate limit
  // ---------------------------------------------------------------------------

  const REGEX_RATE_LIMIT = /\b(rate limit|rate-limit|limite|limit|try again|tente novamente)\b/i;

  function textoIndicaRateLimit(texto) {
    return REGEX_RATE_LIMIT.test(String(texto || ''));
  }

  function verificarToastsExistentes() {
    const seletores = '[role="alert"], [role="status"], [data-sonner-toast], [class*="toast" i], [class*="Toast"]';
    for (const el of document.querySelectorAll(seletores)) {
      if (el.closest('#gmg-panel')) continue;
      if (!estaVisivel(el)) continue;
      const t = el.textContent || '';
      if (t.length < 400 && textoIndicaRateLimit(t)) return t.trim().slice(0, 120);
    }
    return null;
  }

  // Sentinela de rate limit: começa a observar ANTES do clique de envio, porque
  // o toast de erro pode aparecer no mesmo instante. Enquanto aguarda, também
  // verifica toasts já existentes a cada 500ms.
  function criarSentinelaRateLimit() {
    let achado = null;
    const testarNo = (no) => {
      const el = no instanceof Element ? no : (no && no.parentElement);
      if (!el || !(el instanceof Element)) return;
      if (el.closest('#gmg-panel')) return;
      const t = el.textContent || '';
      if (t.length > 0 && t.length < 400 && textoIndicaRateLimit(t) && estaVisivel(el)) {
        achado = t.trim().slice(0, 120);
      }
    };
    const observador = new MutationObserver((mutacoes) => {
      if (achado) return;
      for (const m of mutacoes) {
        if (m.type === 'characterData') testarNo(m.target);
        for (const no of m.addedNodes) testarNo(no);
        if (achado) return;
      }
    });
    try {
      observador.observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) {
      // body indisponível, segue só com a verificação periódica
    }
    return {
      // Espera até `ms` por um sinal de limite, retorna o texto encontrado ou null.
      async aguardar(ms) {
        const fim = Date.now() + ms;
        while (Date.now() < fim && !achado && !estado.pararSolicitado) {
          const t = verificarToastsExistentes();
          if (t) achado = t;
          if (!achado) await dormir(500);
        }
        observador.disconnect();
        return achado;
      },
      parar() {
        observador.disconnect();
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Coleta e detecção de mídia
  // ---------------------------------------------------------------------------

  function urlsDoVideo(video) {
    const urls = [];
    if (video.currentSrc) urls.push(video.currentSrc);
    if (video.src) urls.push(video.src);
    const srcAttr = video.getAttribute('src');
    if (srcAttr) urls.push(srcAttr);
    video.querySelectorAll('source').forEach((s) => {
      if (s.src) urls.push(s.src);
      const a = s.getAttribute('src');
      if (a) urls.push(a);
    });
    return urls.map(normalizarUrl).filter(Boolean);
  }

  function normalizarUrl(url) {
    if (!url) return null;
    const s = String(url).trim();
    if (!s || s.startsWith('data:')) return null;
    if (s.startsWith('blob:')) return s;
    try {
      return new URL(s, location.href).href;
    } catch (e) {
      return null;
    }
  }

  function melhorUrlVideo(video) {
    const urls = urlsDoVideo(video);
    return urls.length ? urls[0] : null;
  }

  function imagemGrande(img) {
    if (img.naturalWidth >= 300) return true;
    // Se ainda não carregou, aceita pelo tamanho renderizado
    if (img.naturalWidth === 0 && img.getBoundingClientRect().width >= 300) return true;
    return false;
  }

  // Coleta todos os vídeos, links .mp4 e (opcionalmente) imagens grandes da página.
  function coletarMidias(incluirImagens) {
    const vistos = new Set();
    const itens = [];
    const adicionar = (url, tipo) => {
      const u = normalizarUrl(url);
      if (!u || vistos.has(u)) return;
      vistos.add(u);
      itens.push({ url: u, tipo });
    };

    document.querySelectorAll('video').forEach((v) => {
      if (v.closest('#gmg-panel')) return;
      urlsDoVideo(v).forEach((u) => adicionar(u, 'video'));
    });
    document.querySelectorAll('a[href*=".mp4"]').forEach((a) => adicionar(a.href, 'video'));

    if (incluirImagens) {
      document.querySelectorAll('img').forEach((img) => {
        if (img.closest('#gmg-panel')) return;
        if (!imagemGrande(img)) return;
        adicionar(img.currentSrc || img.src, 'imagem');
      });
    }
    return itens;
  }

  function conjuntoMidiasAtuais() {
    const urls = new Set();
    const elementos = new Set();
    document.querySelectorAll('video, img').forEach((el) => {
      elementos.add(el);
      if (el.tagName === 'VIDEO') urlsDoVideo(el).forEach((u) => urls.add(u));
      else {
        const u = normalizarUrl(el.currentSrc || el.src);
        if (u) urls.add(u);
      }
    });
    return { urls, elementos };
  }

  function aguardarImagemCarregar(img, timeoutMs) {
    return new Promise((resolve) => {
      if (img.complete && img.naturalWidth > 0) return resolve(true);
      const timer = setTimeout(() => resolve(img.naturalWidth > 0), timeoutMs);
      img.addEventListener('load', () => { clearTimeout(timer); resolve(true); }, { once: true });
      img.addEventListener('error', () => { clearTimeout(timer); resolve(false); }, { once: true });
    });
  }

  // Espera o src do elemento parar de mudar (placeholders borrados trocam para a imagem final).
  async function aguardarEstabilizar(el, maxMs) {
    const lerUrl = () => (el.tagName === 'VIDEO' ? melhorUrlVideo(el) : normalizarUrl(el.currentSrc || el.src));
    let anterior = lerUrl();
    let estavelDesde = Date.now();
    const fim = Date.now() + maxMs;
    while (Date.now() < fim && !estado.pararSolicitado) {
      await dormir(500);
      const atual = lerUrl();
      if (atual !== anterior) {
        anterior = atual;
        estavelDesde = Date.now();
      } else if (Date.now() - estavelDesde >= 1500) {
        break;
      }
    }
    return anterior;
  }

  // Lista todas as mídias que não existiam no snapshot (para prompts que geram várias imagens).
  function midiasNovasDesde(snapshot, cfg) {
    const tipoAceito = (tipo) => cfg.midiaEsperada === 'qualquer' || (cfg.midiaEsperada === 'video' && tipo === 'video') || (cfg.midiaEsperada === 'imagem' && tipo === 'imagem');
    const vistos = new Set();
    const lista = [];
    document.querySelectorAll('video, img').forEach((el) => {
      if (el.closest('#gmg-panel')) return;
      const tipo = el.tagName === 'VIDEO' ? 'video' : 'imagem';
      if (!tipoAceito(tipo)) return;
      const url = tipo === 'video' ? melhorUrlVideo(el) : normalizarUrl(el.currentSrc || el.src);
      if (!url || snapshot.urls.has(url) || vistos.has(url)) return;
      if (tipo === 'imagem' && !imagemGrande(el)) return;
      vistos.add(url);
      lista.push({ el, url, tipo });
    });
    return lista;
  }

  // Aguarda uma nova mídia (vídeo ou imagem) aparecer no DOM usando MutationObserver.
  // Mídias que aparecem durante a carência são consideradas "já existentes".
  function aguardarNovaMidia(snapshot, cfg) {
    const timeoutMs = cfg.timeoutDeteccao * 1000;
    const carenciaMs = cfg.carenciaDeteccao * 1000;
    const inicio = Date.now();
    const conhecidas = new Set(snapshot.urls);

    const tipoAceito = (tipo) => cfg.midiaEsperada === 'qualquer' || (cfg.midiaEsperada === 'video' && tipo === 'video') || (cfg.midiaEsperada === 'imagem' && tipo === 'imagem');

    return new Promise((resolve) => {
      let encerrado = false;
      let verificando = false;
      let pendente = false;

      const finalizar = (valor) => {
        if (encerrado) return;
        encerrado = true;
        observador.disconnect();
        clearInterval(timerPolling);
        clearInterval(timerParada);
        clearTimeout(timerTimeout);
        resolve(valor);
      };

      const candidatos = () => {
        const lista = [];
        document.querySelectorAll('video, img').forEach((el) => {
          if (el.closest('#gmg-panel')) return;
          if (el.tagName === 'VIDEO') {
            const u = melhorUrlVideo(el);
            if (u && !conhecidas.has(u)) lista.push({ el, url: u, tipo: 'video' });
          } else {
            const u = normalizarUrl(el.currentSrc || el.src);
            if (u && !conhecidas.has(u)) lista.push({ el, url: u, tipo: 'imagem' });
          }
        });
        return lista;
      };

      const verificar = async () => {
        if (encerrado) return;
        if (verificando) { pendente = true; return; }
        verificando = true;
        try {
          const lista = candidatos();
          const emCarencia = Date.now() - inicio < carenciaMs;
          for (const c of lista) {
            if (encerrado) return;
            if (emCarencia) {
              // Durante a carência, apenas registra como conhecida
              conhecidas.add(c.url);
              continue;
            }
            if (!tipoAceito(c.tipo)) {
              conhecidas.add(c.url);
              continue;
            }
            if (c.tipo === 'imagem') {
              const carregou = await aguardarImagemCarregar(c.el, 15000);
              if (encerrado) return;
              if (!carregou || !imagemGrande(c.el)) {
                conhecidas.add(c.url);
                continue;
              }
              // Usa a URL final após o carregamento
              const urlFinal = normalizarUrl(c.el.currentSrc || c.el.src) || c.url;
              if (conhecidas.has(urlFinal) && urlFinal !== c.url) { conhecidas.add(c.url); continue; }
              finalizar({ el: c.el, url: urlFinal, tipo: 'imagem' });
              return;
            }
            finalizar(c);
            return;
          }
        } finally {
          verificando = false;
          if (pendente && !encerrado) {
            pendente = false;
            verificar();
          }
        }
      };

      const observador = new MutationObserver(() => { verificar(); });
      observador.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'poster'] });

      // Polling leve como segurança (currentSrc pode mudar sem mutação de atributo)
      const timerPolling = setInterval(verificar, 2000);
      const timerParada = setInterval(() => { if (estado.pararSolicitado) finalizar(null); }, 500);
      const timerTimeout = setTimeout(() => finalizar(null), timeoutMs);
      verificar();
    });
  }

  // ---------------------------------------------------------------------------
  // Download
  // ---------------------------------------------------------------------------

  function enviarParaBackground(mensagem) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(mensagem, (resposta) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, erro: chrome.runtime.lastError.message });
          } else {
            resolve(resposta || { ok: false, erro: 'sem resposta do service worker' });
          }
        });
      } catch (e) {
        resolve({ ok: false, erro: String(e && e.message ? e.message : e) });
      }
    });
  }

  function baixarViaAnchor(url, nome) {
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
  }

  // Baixa uma URL (http, https ou blob). Retorna o nome do arquivo salvo ou null.
  async function baixarUrl(url, tipo, nomeBase) {
    if (url.startsWith('blob:')) {
      // blob: precisa ser lido no contexto da página, depois disparado via anchor
      try {
        const resposta = await fetch(url);
        const blob = await resposta.blob();
        const ext = inferirExtensao(url, tipo, blob.type);
        const nome = limparNomeArquivo(`${nomeBase}.${ext}`);
        const objectUrl = URL.createObjectURL(blob);
        baixarViaAnchor(objectUrl, nome);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        return nome;
      } catch (erro) {
        registrarLog(`Falha ao ler blob: ${erro && erro.message ? erro.message : erro}`, 'err');
        return null;
      }
    }

    if (!/^https?:/i.test(url)) return null;
    const ext = inferirExtensao(url, tipo);
    const nome = limparNomeArquivo(`${nomeBase}.${ext}`);
    const resp = await enviarParaBackground({ tipo: 'gmg-download', url, nome });
    if (resp && resp.ok) return nome;
    registrarLog(`Falha no download (${resp && resp.erro ? resp.erro : 'erro desconhecido'}), tentando via navegador.`, 'warn');
    try {
      baixarViaAnchor(url, nome);
      return nome;
    } catch (e) {
      return null;
    }
  }

  async function baixarTudoDaPagina() {
    const cfg = lerConfigDaUi();
    const itens = coletarMidias(cfg.incluirImagens).filter((i) => !estado.urlsBaixadas.has(i.url));
    if (!itens.length) {
      registrarLog('Nenhuma mídia nova encontrada na página.', 'warn');
      definirStatus('Nada novo para baixar.');
      return;
    }
    ui.btnBaixarTudo.disabled = true;
    registrarLog(`Baixando ${itens.length} arquivo(s) da página...`, 'info');
    const carimbo = carimboArquivo();
    let n = 0;
    let ok = 0;
    for (const item of itens) {
      n++;
      definirStatus(`Baixando ${n} de ${itens.length}...`);
      const nome = await baixarUrl(item.url, item.tipo, `${cfg.prefixo}_${carimbo}_${String(n).padStart(3, '0')}`);
      if (nome) {
        ok++;
        estado.baixados++;
        estado.urlsBaixadas.add(item.url);
        atualizarContadores();
        registrarLog(`Baixado: ${nome}`, 'ok');
      } else {
        registrarLog(`Falhou: ${item.url.slice(0, 80)}`, 'err');
      }
      await dormir(DELAY_ENTRE_DOWNLOADS_MS);
    }
    definirStatus(`Download concluído: ${ok} de ${itens.length}.`);
    registrarLog(`Download em massa concluído: ${ok} de ${itens.length}.`, ok === itens.length ? 'ok' : 'warn');
    ui.btnBaixarTudo.disabled = false;
  }

  // ---------------------------------------------------------------------------
  // Fila de geração
  // ---------------------------------------------------------------------------

  async function salvarProgresso(indiceUltimoEnviado, total) {
    const dados = { ultimoEnviado: indiceUltimoEnviado, total, atualizadoEm: Date.now() };
    estado.ultimoProgressoSalvo = dados;
    await storageSet({ [CHAVE_PROGRESSO]: dados });
  }

  async function limparProgresso() {
    estado.ultimoProgressoSalvo = null;
    await storageRemove(CHAVE_PROGRESSO);
    atualizarCaixaRetomar();
  }

  function atualizarCaixaRetomar() {
    const p = estado.ultimoProgressoSalvo;
    const total = obterPrompts().length;
    if (p && typeof p.ultimoEnviado === 'number' && p.ultimoEnviado + 1 < total && !estado.rodando) {
      ui.resumeTexto.textContent = `Fila interrompida no prompt ${p.ultimoEnviado + 1} de ${p.total || total}.`;
      ui.resumeBox.classList.add('gmg-visible');
    } else {
      ui.resumeBox.classList.remove('gmg-visible');
    }
  }

  function retomarFila() {
    const p = estado.ultimoProgressoSalvo;
    if (!p) return;
    iniciarFila(p.ultimoEnviado + 1);
  }

  function pararFila() {
    if (!estado.rodando) return;
    estado.pararSolicitado = true;
    ui.btnParar.disabled = true;
    definirStatus('Parando...');
    registrarLog('Parada solicitada, encerrando a fila.', 'warn');
  }

  async function iniciarFila(indiceInicial) {
    if (estado.rodando) return;
    const cfg = lerConfigDaUi();
    await salvarConfig();
    const prompts = obterPrompts();
    if (!prompts.length) {
      registrarLog('Nenhum prompt na lista.', 'err');
      return;
    }
    if (indiceInicial >= prompts.length) {
      registrarLog('Índice de retomada além do fim da lista, iniciando do começo.', 'warn');
      indiceInicial = 0;
    }

    estado.pararSolicitado = false;
    definirRodando(true);
    atualizarCaixaRetomar();

    if (indiceInicial === 0) {
      estado.relatorio = [];
      ui.btnRelatorio.disabled = true;
      await storageRemove(CHAVE_RELATORIO);
    }

    registrarLog(`Fila iniciada: ${prompts.length} prompts, modo ${cfg.modo === 'deteccao' ? 'detectar conclusão' : 'intervalo fixo de ' + cfg.intervalo + 's'}${cfg.simular ? ', SIMULAÇÃO' : ''}.`, 'info');
    if (cfg.baixarAuto && cfg.modo !== 'deteccao') {
      registrarLog('Download automático exige o modo Detectar conclusão, será ignorado.', 'warn');
    }

    let concluiuTudo = true;
    let i = indiceInicial;
    for (; i < prompts.length; i++) {
      if (estado.pararSolicitado) { concluiuTudo = false; break; }
      const prompt = prompts[i];
      definirProgresso(i, prompts.length);
      definirStatus(`Enviando ${i + 1} de ${prompts.length}...`);

      // Snapshot das mídias atuais antes do envio (usado pela detecção)
      const snapshot = cfg.modo === 'deteccao' ? conjuntoMidiasAtuais() : null;

      // Começa a vigiar mensagens de limite antes do clique
      const sentinela = criarSentinelaRateLimit();
      const resultado = await enviarComRetry(prompt, cfg, i);
      if (resultado === null) { sentinela.parar(); concluiuTudo = false; break; }
      if (resultado.pulado) {
        sentinela.parar();
        adicionarRelatorio(prompt, 'pulado', '');
        await salvarProgresso(i, prompts.length);
        continue;
      }

      estado.enviados++;
      atualizarContadores();
      registrarLog(`Prompt ${i + 1}/${prompts.length} ${cfg.simular ? 'simulado' : 'enviado'} via ${resultado.metodo}: "${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}"`, 'ok');
      await salvarProgresso(i, prompts.length);

      if (cfg.simular) {
        sentinela.parar();
        adicionarRelatorio(prompt, 'simulado', '');
        // Na simulação mantém uma espera curta só para acompanhar o fluxo
        const ok = await esperarComParada(Math.min(cfg.intervalo, 3) * 1000, `Simulação, próximo prompt em`);
        if (!ok) { concluiuTudo = false; break; }
        continue;
      }

      // Verifica rate limit por alguns segundos após o envio
      const textoLimite = await sentinela.aguardar(4000);
      if (estado.pararSolicitado) { concluiuTudo = false; break; }
      if (textoLimite) {
        registrarLog(`Possível limite detectado ("${textoLimite}"), pausando por 5 minutos.`, 'err');
        adicionarRelatorio(prompt, 'falhou', '');
        const ok = await esperarComParada(PAUSA_RATE_LIMIT_MS, 'Pausa por limite, retomando em');
        if (!ok) { concluiuTudo = false; break; }
        registrarLog('Pausa encerrada, retomando a fila e reenviando o prompt.', 'info');
        i--; // reenvia o mesmo prompt
        continue;
      }

      let arquivoBaixado = '';
      let statusPrompt = 'enviado';

      if (cfg.modo === 'deteccao') {
        definirStatus(`Aguardando geração do prompt ${i + 1} (até ${cfg.timeoutDeteccao}s)...`);
        const midia = await aguardarNovaMidia(snapshot, cfg);
        if (estado.pararSolicitado) { adicionarRelatorio(prompt, statusPrompt, ''); concluiuTudo = false; break; }
        if (midia) {
          registrarLog(`Geração detectada para o prompt ${i + 1} (${midia.tipo}).`, 'ok');
          // Espera o delay configurado para as demais mídias do mesmo prompt aparecerem
          // e para os placeholders borrados trocarem pela mídia final.
          const okDelay = await esperarComParada(cfg.delayPosDeteccao * 1000, 'Aguardando a mídia estabilizar');
          if (!okDelay) { adicionarRelatorio(prompt, statusPrompt, ''); concluiuTudo = false; break; }
          if (cfg.baixarAuto) {
            await aguardarEstabilizar(midia.el, 6000);
            const novas = midiasNovasDesde(snapshot, cfg).filter((m) => !estado.urlsBaixadas.has(m.url));
            if (!novas.length) {
              registrarLog('Nenhuma mídia nova para baixar (ou já baixada nesta sessão).', 'warn');
            }
            const nomes = [];
            for (let k = 0; k < novas.length; k++) {
              if (estado.pararSolicitado) break;
              const m = novas[k];
              const sufixo = novas.length > 1 ? `_${k + 1}` : '';
              const nome = await baixarUrl(m.url, m.tipo, `${cfg.prefixo}_${String(i + 1).padStart(3, '0')}_${slugPrompt(prompt)}${sufixo}`);
              if (nome) {
                estado.baixados++;
                estado.urlsBaixadas.add(m.url);
                atualizarContadores();
                nomes.push(nome);
                registrarLog(`Baixado automaticamente: ${nome}`, 'ok');
              } else {
                registrarLog(`Falha no download automático do prompt ${i + 1}.`, 'err');
              }
              await dormir(DELAY_ENTRE_DOWNLOADS_MS);
            }
            arquivoBaixado = nomes.join(' | ');
          }
          adicionarRelatorio(prompt, statusPrompt, arquivoBaixado);
        } else {
          statusPrompt = 'falhou';
          registrarLog(`Timeout de ${cfg.timeoutDeteccao}s sem detectar nova mídia para o prompt ${i + 1}, usando intervalo fixo como fallback.`, 'warn');
          adicionarRelatorio(prompt, statusPrompt, '');
          if (i + 1 < prompts.length) {
            const ok = await esperarComParada(cfg.intervalo * 1000, 'Próximo prompt em');
            if (!ok) { concluiuTudo = false; break; }
          }
        }
      } else {
        adicionarRelatorio(prompt, statusPrompt, '');
        if (i + 1 < prompts.length) {
          const ok = await esperarComParada(cfg.intervalo * 1000, 'Próximo prompt em');
          if (!ok) { concluiuTudo = false; break; }
        }
      }
    }

    definirRodando(false);
    if (concluiuTudo) {
      definirProgresso(prompts.length, prompts.length);
      definirStatus(`Fila concluída: ${prompts.length} prompts.`);
      registrarLog('Fila concluída. Use "Exportar relatório CSV" para salvar o resumo.', 'ok');
      await limparProgresso();
    } else {
      definirStatus(`Fila parada no prompt ${Math.min(i + 1, prompts.length)} de ${prompts.length}.`);
      registrarLog('Fila interrompida. Você pode retomar de onde parou.', 'warn');
      atualizarCaixaRetomar();
    }
    estado.pararSolicitado = false;
  }

  // ---------------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------------

  async function inicializar() {
    criarPainel();
    const dados = await storageGet([CHAVE_CONFIG, CHAVE_PROGRESSO, CHAVE_RELATORIO]);
    if (Array.isArray(dados[CHAVE_RELATORIO]) && dados[CHAVE_RELATORIO].length) {
      estado.relatorio = dados[CHAVE_RELATORIO];
      ui.btnRelatorio.disabled = false;
    }
    aplicarConfigNaUi(dados[CHAVE_CONFIG]);
    atualizarContagemPrompts();
    await restaurarPosicao();

    estado.ultimoProgressoSalvo = dados[CHAVE_PROGRESSO] || null;
    atualizarCaixaRetomar();
    if (estado.ultimoProgressoSalvo && ui.resumeBox.classList.contains('gmg-visible')) {
      registrarLog('Encontrada fila interrompida. Clique em "Retomar de onde parou" para continuar.', 'warn');
    }

    atualizarContadores();
    registrarLog('Painel carregado. Alt+G mostra ou esconde.', 'info');

    // O site é uma SPA, garante que o painel continue no DOM se o body for trocado
    setInterval(() => {
      if (ui.painel && !document.documentElement.contains(ui.painel)) {
        document.documentElement.appendChild(ui.painel);
      }
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar, { once: true });
  } else {
    inicializar();
  }
})();
