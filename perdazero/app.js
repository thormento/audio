import {
  CATEGORIES, SUBTYPES, FREQUENCIES, analyze, summarize, insightFor, solutionFor,
  itemSeverity, isDismissed, daysBetween, toMonthly, parseReceiptText,
} from './engine.js';

const VERSION = '1.0.0';
const KEY = 'perdazero:v1';
const $app = document.getElementById('app');
const $tab = document.getElementById('tabbar');

// ---------------------------------------------------------------------------
// Estado (somente no aparelho — sem conta, sem servidor)
// ---------------------------------------------------------------------------
let memory = null;
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return memory ?? { onboarded: false, notifications: false, items: [], alerts: {} };
}
let state = load();
state.alerts ??= {};
state.items ??= [];
function save() {
  memory = state;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const findItem = (id) => state.items.find((i) => i.id === id);

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
const brl0 = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Math.round(n || 0));
const isoDaysAgo = (d) => { const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };
const go = (h) => { location.hash = h; };

const I = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  play: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  card: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
  bank: '<path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-2-4-6-4-6-1.5S10 9 12 9zm0 0c2-4 6-4 6-1.5S14 9 12 9z"/>',
  dots: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  scan: '<path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M7 12h10"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  down: '<path d="M7 17 17 7M9 7h8v8"/>',
  up: '<path d="M7 7l10 10M17 9v8H9"/>',
  inbox: '<path d="M4 13 6 5h12l2 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[n] || ''}</svg>`;
const topbar = (title, back = 'history') =>
  `<div class="topbar"><button class="iconbtn" data-back="${esc(back)}" aria-label="Voltar">${icon('back')}</button><h2>${esc(title)}</h2></div>`;

let toastTimer;
function toast(msg, title) {
  const t = document.getElementById('toast');
  t.innerHTML = `${title ? `<b>${esc(title)}</b>` : ''}${esc(msg)}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 5200);
}

// ---------------------------------------------------------------------------
// Avisos + notificações locais
// ---------------------------------------------------------------------------
function currentAlerts() {
  const out = [];
  for (const { item, finding } of summarize(state.items).active) {
    if (!finding.concrete) continue;
    const id = `${item.id}:${finding.key}`;
    out.push({ id, item, finding, meta: state.alerts[id] });
  }
  return out;
}
function alertTitle(item, f) {
  if (f.key === 'points') return `${item.name}: ${f.status}`;
  if (f.key === 'claim') return `${item.name}: dinheiro para resgatar`;
  return `${item.name}: ${f.status}`;
}
function alertValue(f) {
  return f.oneTimeLoss ? `${brl0(f.oneTimeLoss)} em risco` : `${brl0(f.monthlyLoss)}/mês sendo perdidos`;
}
function syncAlerts() {
  const now = Date.now();
  const list = currentAlerts();
  const live = new Set(list.map((a) => a.id));
  for (const a of list) state.alerts[a.id] ??= { first: now, read: false, notified: false };
  for (const id of Object.keys(state.alerts)) if (!live.has(id)) delete state.alerts[id];
  const pending = list.filter((a) => !state.alerts[a.id].notified);
  if (state.notifications && 'Notification' in window && Notification.permission === 'granted') {
    for (const a of pending) {
      notify(alertTitle(a.item, a.finding), `${alertValue(a.finding)}. Toque para ver como resolver.`, `#/resolver/${a.item.id}/${a.finding.key}`);
      state.alerts[a.id].notified = true;
    }
  }
  save();
  const unread = list.filter((a) => !state.alerts[a.id].read).length;
  const b = document.getElementById('badge');
  b.textContent = unread;
  b.hidden = unread === 0;
}
async function notify(title, body, url) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification(title, { body, icon: 'icon.svg', badge: 'icon.svg', data: { url }, tag: url });
    new Notification(title, { body });
  } catch {}
}
async function askNotifications() {
  if (!('Notification' in window)) {
    toast('Este navegador não suporta notificações. Os avisos continuam na aba Avisos.');
    return false;
  }
  const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  state.notifications = p === 'granted';
  save();
  if (p === 'denied') toast('As notificações estão bloqueadas no navegador. Os avisos continuam na aba Avisos.');
  return state.notifications;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const routes = [
  [/^#\/onboarding\/(\d)$/, (n) => viewOnboarding(Number(n))],
  [/^#\/cadastro$/, () => viewCadastro()],
  [/^#\/cadastro\/foto$/, () => viewFoto()],
  [/^#\/cadastro\/perguntas$/, () => viewWizard()],
  [/^#\/cadastro\/manual$/, () => viewForm()],
  [/^#\/item\/([\w]+)\/editar$/, (id) => viewForm(id)],
  [/^#\/item\/([\w]+)$/, (id) => viewItem(id)],
  [/^#\/perda\/([\w]+)\/(\w+)$/, (id, k) => viewPerda(id, k)],
  [/^#\/resolver\/([\w]+)\/(\w+)$/, (id, k) => viewResolver(id, k)],
  [/^#\/avisos$/, () => viewAvisos()],
  [/^#\/perfil$/, () => viewPerfil()],
  [/^#\/?$/, () => viewHome()],
];
const TABS = { '#/': 'home', '#': 'home', '': 'home', '#/avisos': 'avisos', '#/perfil': 'perfil' };

function render() {
  let h = location.hash || '#/';
  if (!state.onboarded && !h.startsWith('#/onboarding') && !h.startsWith('#/cadastro')) {
    return go('#/onboarding/1');
  }
  syncAlerts();
  const tab = TABS[h];
  $tab.hidden = !tab;
  $tab.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  $app.classList.toggle('full', !tab);
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      fn(...m.slice(1));
      window.scrollTo(0, 0);
      return;
    }
  }
  go('#/');
}
window.addEventListener('hashchange', render);
// Outra aba alterou os dados: recarrega para não sobrescrever.
window.addEventListener('storage', (e) => { if (e.key === KEY) { state = load(); render(); } });

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-back]');
  if (!b) return;
  const target = b.dataset.back;
  if (target === 'history' && history.length > 1) history.back();
  else go(target === 'history' ? '#/' : target);
});

// ---------------------------------------------------------------------------
// 1. Onboarding
// ---------------------------------------------------------------------------
function viewOnboarding(n) {
  const dots = `<div class="dots">${[1, 2, 3, 4].map((i) => `<span class="${i === n ? 'on' : ''}"></span>`).join('')}</div>`;
  const screens = {
    1: {
      art: `<div class="ob-art"><span class="chip" style="top:22px;left:20px">Netflix · 47 dias parado</span><span class="chip" style="bottom:26px;right:18px">Energia · 38% acima</span><div class="big">R$ 214<small>perdidos por mês</small></div></div>`,
      title: 'Seu monitor de perda de dinheiro',
      sub: 'Organize o que você já paga e veja o que está sendo desperdiçado.',
      support: 'Sem planilhas. Sem controle manual. Só o que realmente importa.',
      cta: 'Começar',
    },
    2: {
      title: 'Cadastro em menos de 2 minutos',
      sub: 'Envie uma foto da fatura, um print ou responda algumas perguntas. A análise começa imediatamente.',
      extra: `<div class="steps3">
        <div><span class="ic">${icon('camera')}</span>Foto ou print da fatura</div>
        <div><span class="ic">${icon('scan')}</span>Análise automática</div>
        <div><span class="ic">${icon('spark')}</span>Resultado na hora</div></div>`,
      cta: 'Continuar',
    },
    3: {
      title: 'Clareza sobre o que está perdendo',
      sub: 'Veja o que está deixando de usar e onde está gastando além do necessário.',
      extra: `<ul class="bullets">
        <li><span class="ic">${icon('play')}</span>Assinaturas pouco ou não usadas</li>
        <li><span class="ic">${icon('bolt')}</span>Contas acima do padrão</li>
        <li><span class="ic">${icon('gift')}</span>Benefícios e direitos não ativados</li>
        <li><span class="ic">${icon('card')}</span>Pontos e milhas próximos do vencimento</li></ul>`,
      cta: 'Ver minhas perdas',
    },
    4: {
      art: `<div class="ob-art"><div class="big" style="font-size:22px;max-width:260px;text-align:left;line-height:1.3">${icon('bell')}<br>Pontos do cartão vencem em 18 dias<small style="text-align:left;margin-top:6px">R$ 92 em risco · Toque para ver como resolver</small></div></div>`,
      title: 'Avisos só quando há ação',
      sub: 'Você recebe notificação apenas quando identificamos uma perda concreta ou uma oportunidade clara.',
      support: 'Sem spam. Sem lembretes genéricos.',
    },
  };
  const s = screens[n] || screens[1];
  const buttons =
    n === 4
      ? `<div class="stack"><button class="btn" id="notif-yes">Ativar avisos</button><button class="btn ghost" id="notif-no">Agora não</button></div>`
      : `<button class="btn" id="next">${s.cta}</button>`;
  $app.innerHTML = `
    <div class="ob">
      <div class="topbar">${n > 1 ? `<button class="iconbtn" data-back="#/onboarding/${n - 1}" aria-label="Voltar">${icon('back')}</button>` : '<span class="brandmark"><i>0</i>Perdazero</span>'}</div>
      ${s.art || '<div style="height:24px"></div>'}
      ${dots}
      <h1>${s.title}</h1>
      <p class="sub">${s.sub}</p>
      ${s.support ? `<p class="support">${s.support}</p>` : ''}
      ${s.extra || ''}
      <div class="spacer" style="min-height:28px"></div>
      ${buttons}
    </div>`;
  // A tela 3 leva ao Cadastro; a tela 4 (notificações, opcional) é oferecida antes, uma vez só.
  const finish = () => { state.onboarded = true; save(); go('#/cadastro'); };
  $app.querySelector('#next')?.addEventListener('click', () => go(n === 3 ? '#/onboarding/4' : `#/onboarding/${n + 1}`));
  $app.querySelector('#notif-yes')?.addEventListener('click', async () => { await askNotifications(); finish(); });
  $app.querySelector('#notif-no')?.addEventListener('click', finish);
}

// ---------------------------------------------------------------------------
// 2. Cadastro rápido
// ---------------------------------------------------------------------------
function viewCadastro() {
  const back = state.items.length || state.onboarded ? '#/' : '#/onboarding/3';
  $app.innerHTML = `
    ${topbar('', back)}
    <h1>Adicione o que você já paga</h1>
    <p class="sub">Quanto mais você cadastrar, mais preciso fica o monitor.</p>
    <div class="stack" style="margin-top:22px">
      <a class="card choice primary" href="#/cadastro/foto"><span class="ic">${icon('camera')}</span><div><h3>Tirar foto ou enviar print</h3><p>Fatura, extrato, comprovante ou print de app</p></div><span class="chev">${icon('chev')}</span></a>
      <a class="card choice" href="#/cadastro/perguntas"><span class="ic">${icon('chat')}</span><div><h3>Responder perguntas rápidas</h3><p>4 perguntas: categoria, nome, valor e uso</p></div><span class="chev">${icon('chev')}</span></a>
      <a class="card choice" href="#/cadastro/manual"><span class="ic">${icon('edit')}</span><div><h3>Digitar manualmente</h3><p>Nome, valor, frequência e categoria</p></div><span class="chev">${icon('chev')}</span></a>
    </div>
    <div class="spacer"></div>
    <p class="muted" style="text-align:center;margin-top:24px">Sem conta e sem conexão bancária. Seus dados ficam só neste aparelho.</p>`;
}

// ---- Foto / print -----------------------------------------------------------
let ocrDraft = null;
function viewFoto() {
  $app.innerHTML = `
    ${topbar('Foto ou print', '#/cadastro')}
    <h1>Envie a fatura ou um print</h1>
    <p class="sub">Vale conta de luz, fatura do cartão, extrato, print do app da assinatura ou do programa de pontos.</p>
    <div class="stack" style="margin-top:22px">
      <label class="card choice primary" style="cursor:pointer"><span class="ic">${icon('camera')}</span><div><h3>Tirar foto</h3><p>Abre a câmera</p></div>
        <input type="file" accept="image/*" capture="environment" hidden data-file></label>
      <label class="card choice" style="cursor:pointer"><span class="ic">${icon('inbox')}</span><div><h3>Escolher da galeria</h3><p>Print ou foto já salva</p></div>
        <input type="file" accept="image/*" hidden data-file></label>
    </div>
    <p class="muted" style="margin-top:18px">A leitura acontece no seu aparelho. A imagem não é salva nem enviada para servidores do Perdazero. Para faturas em PDF, envie um print da página.</p>`;
  $app.querySelectorAll('[data-file]').forEach((inp) => inp.addEventListener('change', () => inp.files[0] && runOcr(inp.files[0])));
}

let tesseractLoading;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  tesseractLoading ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = () => res(window.Tesseract);
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return tesseractLoading;
}
async function runOcr(file) {
  const url = URL.createObjectURL(file);
  $app.innerHTML = `
    <div class="analyzing">
      <img class="preview" src="${url}" alt="Imagem enviada" />
      <div class="spinner"></div>
      <h2>Analisando…</h2>
      <p class="muted" id="ocr-step">Lendo os valores da imagem</p>
    </div>`;
  const step = $app.querySelector('#ocr-step');
  let text = '';
  try {
    const T = await withTimeout(loadTesseract(), 15000);
    const res = await withTimeout(
      T.recognize(file, 'por', {
        logger: (m) => { if (m.status === 'recognizing text' && step) step.textContent = `Lendo o texto… ${Math.round(m.progress * 100)}%`; },
      }),
      60000,
    );
    text = res?.data?.text || '';
  } catch {
    text = '';
  }
  URL.revokeObjectURL(url);
  const draft = parseReceiptText(text);
  const found = Object.keys(draft).length > 0;
  ocrDraft = { ...draft, source: 'foto', _ocr: found ? 'ok' : 'fail' };
  if (location.hash === '#/cadastro/foto') {
    history.replaceState(null, '', '#/cadastro/manual');
    render();
  }
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

// ---- Campos por categoria ---------------------------------------------------
const USAGE_OPTS = [
  ['3', 'Nesta semana'], ['20', 'Há 2–4 semanas'], ['45', 'Há 1–2 meses'], ['100', 'Há mais de 3 meses'], ['', 'Não lembro'],
];
const NAME_SUGGESTIONS = {
  assinatura: ['Netflix', 'Spotify', 'Disney+', 'Max', 'Amazon Prime', 'Globoplay', 'YouTube Premium', 'Academia'],
  conta: [['Conta de energia', 'energia'], ['Conta de água', 'agua'], ['Internet', 'internet'], ['Telefone / celular', 'telefone']],
  cartao: ['Nubank', 'Itaú', 'Bradesco', 'Santander', 'Banco do Brasil', 'Caixa', 'Inter', 'C6'],
  banco: ['Itaú', 'Bradesco', 'Santander', 'Banco do Brasil', 'Caixa'],
  saude: ['Unimed', 'Amil', 'Bradesco Saúde', 'SulAmérica', 'Hapvida', 'Odontoprev'],
  beneficio: [['Wellhub (Gympass)', 'beneficio'], ['Auxílio home office', 'beneficio'], ['Previdência com contrapartida', 'beneficio'], ['FGTS', 'fgts'], ['Valores a receber (BC)', 'svr']],
  outro: [],
};

/** Campos específicos da categoria (além de nome/categoria). */
function extraFields(it) {
  const c = it.category;
  const F = [];
  const amount = (label, help) => F.push({ name: 'amount', type: 'money', label, help });
  const freq = () => F.push({ name: 'frequency', type: 'select', label: 'Frequência', options: Object.entries(FREQUENCIES).filter(([k]) => k !== 'unica').map(([k, v]) => [k, v.label]) });
  switch (c) {
    case 'assinatura':
      amount('Valor'); freq();
      F.push({ name: 'lastUsed', type: 'seg', label: 'Quando você usou pela última vez?', options: USAGE_OPTS });
      break;
    case 'conta':
      F.push({ name: 'subtype', type: 'select', label: 'Tipo de conta', options: Object.entries(SUBTYPES.conta) });
      amount('Valor da última conta'); freq();
      F.push({ name: 'people', type: 'number', label: it.subtype === 'telefone' ? 'Quantas linhas?' : 'Quantas pessoas moram na casa?', min: 1 });
      F.push({ name: 'previousAmount', type: 'money', label: 'Valor da conta anterior (opcional)', help: 'Serve para detectar reajustes.' });
      break;
    case 'cartao':
      F.push({ name: 'annualFee', type: 'money', label: 'Anuidade (deixe 0 se não paga)' });
      F.push({ name: 'feeFrequency', type: 'select', label: 'A anuidade é cobrada', options: [['anual', 'Uma vez por ano'], ['mensal', 'Por mês (parcelada)']] });
      F.push({ name: 'points', type: 'number', label: 'Pontos ou milhas acumulados (opcional)', min: 0 });
      F.push({ name: 'pointsExpiry', type: 'date', label: 'Quando os próximos pontos vencem?' });
      break;
    case 'banco':
      amount('Tarifa mensal do pacote', 'Aparece no extrato como “Cesta”, “Pacote” ou “Tarifa”.');
      F.push({ name: 'frequency', type: 'hidden', value: 'mensal' });
      break;
    case 'saude':
      F.push({ name: 'subtype', type: 'select', label: 'Tipo de plano', options: Object.entries(SUBTYPES.saude) });
      amount('Mensalidade atual');
      F.push({ name: 'frequency', type: 'hidden', value: 'mensal' });
      F.push({ name: 'previousAmount', type: 'money', label: 'Mensalidade antes do último reajuste (opcional)' });
      F.push({ name: 'usedLast12', type: 'yesno', label: 'Usou o plano nos últimos 12 meses?' });
      break;
    case 'beneficio':
      F.push({ name: 'subtype', type: 'select', label: 'Tipo', options: Object.entries(SUBTYPES.beneficio) });
      if (it.subtype === 'fgts' || it.subtype === 'svr') {
        amount(it.subtype === 'fgts' ? 'Saldo disponível para saque' : 'Valor disponível para resgate');
        F.push({ name: 'frequency', type: 'hidden', value: 'unica' });
        F.push({ name: 'activated', type: 'yesno', label: 'Você já sacou ou resgatou?' });
      } else {
        amount('Quanto vale por mês', 'Valor aproximado do benefício.');
        F.push({ name: 'frequency', type: 'hidden', value: 'mensal' });
        F.push({ name: 'activated', type: 'yesno', label: 'Você já ativou ou usa este benefício?' });
      }
      break;
    default:
      amount('Valor'); freq();
      F.push({ name: 'usage', type: 'seg', label: 'Com que frequência você usa?', options: [['frequente', 'Sempre'], ['asvezes', 'Às vezes'], ['raramente', 'Raramente'], ['nunca', 'Nunca']] });
  }
  return F;
}

function defaults(cat, it = {}) {
  const base = { frequency: 'mensal', ...it, category: cat };
  if (cat === 'conta') { base.subtype ??= 'energia'; base.people ??= 2; }
  if (cat === 'saude') base.subtype ??= 'individual';
  if (cat === 'beneficio') base.subtype ??= 'beneficio';
  if (cat === 'cartao') base.feeFrequency ??= 'anual';
  return base;
}

function lastUsedChoice(it) {
  if (it.lastUsedAt === undefined) return undefined;
  if (!it.lastUsedAt) return '';
  const d = daysBetween(it.lastUsedAt);
  const opts = [3, 20, 45, 100];
  return String(opts.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a)));
}

function fieldHTML(f, it) {
  const v = f.name === 'lastUsed' ? lastUsedChoice(it) : it[f.name];
  const id = `f-${f.name}`;
  const help = f.help ? `<span class="help">${esc(f.help)}</span>` : '';
  switch (f.type) {
    case 'hidden':
      return `<input type="hidden" name="${f.name}" value="${esc(f.value)}">`;
    case 'money':
      return `<div class="field"><label for="${id}">${esc(f.label)}</label><div class="money-in"><span>R$</span><input class="input" id="${id}" name="${f.name}" inputmode="decimal" placeholder="0,00" value="${v != null && v !== '' ? esc(String(Number(v).toFixed(2)).replace('.', ',')) : ''}"></div>${help}</div>`;
    case 'number':
      return `<div class="field"><label for="${id}">${esc(f.label)}</label><input class="input" id="${id}" name="${f.name}" type="number" inputmode="numeric" min="${f.min ?? 0}" value="${v ?? ''}">${help}</div>`;
    case 'date':
      return `<div class="field"><label for="${id}">${esc(f.label)}</label><input class="input" id="${id}" name="${f.name}" type="date" value="${esc(v || '')}">${help}</div>`;
    case 'select':
      return `<div class="field"><label for="${id}">${esc(f.label)}</label><select class="input" id="${id}" name="${f.name}">${f.options.map(([k, l]) => `<option value="${k}" ${String(v) === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${help}</div>`;
    case 'seg':
      return `<div class="field"><span class="lbl">${esc(f.label)}</span><div class="seg" data-seg="${f.name}">${f.options.map(([k, l]) => `<button type="button" data-v="${k}" class="${v !== undefined && String(v) === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div><input type="hidden" name="${f.name}" value="${v ?? ''}" data-set="${v !== undefined ? 1 : ''}">${help}</div>`;
    case 'yesno': {
      const s = v === true ? 'sim' : v === false ? 'nao' : '';
      return `<div class="field"><span class="lbl">${esc(f.label)}</span><div class="seg" data-seg="${f.name}"><button type="button" data-v="sim" class="${s === 'sim' ? 'on' : ''}">Sim</button><button type="button" data-v="nao" class="${s === 'nao' ? 'on' : ''}">Não</button></div><input type="hidden" name="${f.name}" value="${s}" data-set="${s ? 1 : ''}"></div>`;
    }
  }
  return '';
}

function bindSegs(root) {
  root.querySelectorAll('[data-seg]').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      const hidden = seg.parentElement.querySelector(`input[name="${seg.dataset.seg}"]`);
      hidden.value = b.dataset.v;
      hidden.dataset.set = '1';
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

function readFields(root, it) {
  const out = { ...it };
  root.querySelectorAll('input[name], select[name]').forEach((el) => {
    const n = el.name;
    const v = el.value.trim();
    if (['amount', 'previousAmount', 'annualFee'].includes(n)) out[n] = v ? Number(v.replace(/\./g, '').replace(',', '.')) || 0 : n === 'amount' ? 0 : null;
    else if (['people', 'points'].includes(n)) out[n] = v ? Number(v) : null;
    else if (['usedLast12', 'activated'].includes(n)) out[n] = v === 'sim' ? true : v === 'nao' ? false : null;
    else if (n === 'lastUsed') { if (el.dataset.set) out.lastUsedAt = v ? isoDaysAgo(Number(v)) : null; }
    else out[n] = v;
  });
  return out;
}

// ---- Formulário manual / edição / confirmação do OCR ------------------------
function viewForm(editId) {
  const editing = editId ? findItem(editId) : null;
  if (editId && !editing) return go('#/');
  let it;
  let notice = '';
  if (editing) it = { ...editing };
  else if (ocrDraft) {
    it = defaults(ocrDraft.category || 'assinatura', ocrDraft);
    notice = ocrDraft._ocr === 'ok'
      ? '<div class="notice ok">Lemos a imagem e preenchemos o que encontramos. Confira e complete os dados.</div>'
      : '<div class="notice">Não conseguimos ler a imagem automaticamente. Complete os dados abaixo, leva menos de 1 minuto.</div>';
    ocrDraft = null;
  } else it = defaults('assinatura', { source: 'manual' });
  delete it._ocr;

  const draw = () => {
    $app.innerHTML = `
      ${topbar(editing ? 'Editar dados' : 'Novo item', editing ? 'history' : '#/cadastro')}
      ${editing ? '' : '<h1>Digite os dados</h1>'}
      ${notice}
      <form id="form" novalidate>
        <div class="field"><label for="f-name">Nome</label><input class="input" id="f-name" name="name" placeholder="Ex.: Netflix, Conta de luz" value="${esc(it.name || '')}" autocomplete="off"></div>
        <div class="field"><label for="f-category">Categoria</label><select class="input" id="f-category" name="category">${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}" ${it.category === k ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
        ${extraFields(it).map((f) => fieldHTML(f, it)).join('')}
        <div class="stack" style="margin-top:20px">
          <button class="btn" type="submit">${editing ? 'Salvar alterações' : 'Analisar'}</button>
          ${editing ? '<button class="btn danger" type="button" id="del">Remover item</button>' : ''}
        </div>
      </form>`;
    const form = $app.querySelector('#form');
    bindSegs(form);
    form.querySelector('[name="category"]').addEventListener('change', (e) => {
      it = defaults(e.target.value, { ...readFields(form, it), subtype: undefined });
      draw();
    });
    form.querySelector('[name="subtype"]')?.addEventListener('change', () => { it = readFields(form, it); draw(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = readFields(form, it);
      if (!data.name) data.name = SUBTYPES[data.category]?.[data.subtype] || CATEGORIES[data.category].label;
      if (editing) {
        Object.assign(editing, data, { dismissed: {} });
        save();
        toast(insightFor(editing), 'Atualizado');
        history.back();
      } else saveNew(data);
    });
    $app.querySelector('#del')?.addEventListener('click', () => removeItem(editing.id));
  };
  draw();
}

function removeItem(id) {
  const it = findItem(id);
  if (!it || !confirm(`Remover “${it.name}”?`)) return;
  state.items = state.items.filter((x) => x.id !== id);
  save();
  toast('Item removido.');
  go('#/perfil');
}

let flashId = null;
function saveNew(data) {
  const item = { ...data, id: uid(), createdAt: new Date().toISOString(), dismissed: {} };
  state.items.push(item);
  state.onboarded = true;
  save();
  $app.innerHTML = `<div class="analyzing"><div class="spinner"></div><h2>Analisando…</h2><p class="muted">Comparando com padrões de uso e de preço</p></div>`;
  $tab.hidden = true;
  setTimeout(() => {
    flashId = item.id;
    history.replaceState(null, '', '#/');
    render();
    toast(insightFor(item), 'Primeira análise');
  }, 1300);
}

// ---- Perguntas rápidas (wizard) ---------------------------------------------
function viewWizard() {
  let step = 0;
  let it = { source: 'perguntas' };
  const MONEY = ['amount', 'frequency', 'annualFee', 'feeFrequency'];
  const askedSub = (c) => c === 'conta' || c === 'beneficio';
  const restFields = () => extraFields(it).filter((f) => !MONEY.includes(f.name) && !(f.name === 'subtype' && askedSub(it.category)));
  let TOTAL = 4;

  const draw = () => {
    TOTAL = it.category && !restFields().length ? 3 : 4;
    const bar = `<div class="progress"><i style="width:${((step + 1) / TOTAL) * 100}%"></i></div>`;
    const head = topbar(`Pergunta ${step + 1} de ${TOTAL}`, step === 0 ? '#/cadastro' : '');
    let body = '';
    if (step === 0) {
      body = `<h1>O que você quer adicionar?</h1><div class="catgrid" style="margin-top:18px">${Object.entries(CATEGORIES)
        .map(([k, c]) => `<button class="card choice" data-cat="${k}"><span class="ic">${icon(c.icon)}</span><div><h3>${esc(c.label)}</h3><p>${esc(c.hint)}</p></div></button>`).join('')}</div>`;
    } else if (step === 1) {
      const sug = NAME_SUGGESTIONS[it.category] || [];
      const q = { conta: 'Qual conta?', beneficio: 'Qual benefício?', cartao: 'De qual banco é o cartão?', banco: 'Qual banco?', saude: 'Qual operadora?' }[it.category] || 'Qual o nome?';
      body = `<h1>${q}</h1>
        ${sug.length ? `<div class="seg" style="margin:18px 0">${sug.map((s) => { const [n, st] = Array.isArray(s) ? s : [s]; return `<button type="button" data-name="${esc(n)}" ${st ? `data-sub="${st}"` : ''} class="${it.name === n ? 'on' : ''}">${esc(n)}</button>`; }).join('')}</div>` : ''}
        ${it.category === 'conta' ? '' : `<div class="field" style="margin-top:12px"><label for="w-name">${sug.length ? 'Ou digite' : 'Nome'}</label><input class="input" id="w-name" value="${esc(it.name || '')}" placeholder="Digite o nome" autocomplete="off"></div>`}
        <button class="btn" id="w-next" ${it.name ? '' : 'disabled'} style="margin-top:12px">Continuar</button>`;
    } else {
      const fields = step === 2 ? extraFields(it).filter((f) => MONEY.includes(f.name)) : restFields();
      const title = step === 2 ? (it.category === 'cartao' ? 'Quanto custa o cartão?' : 'Quanto custa?') : 'Última pergunta';
      body = `<h1>${title}</h1><form id="w-form" style="margin-top:18px" novalidate>${fields.map((f) => fieldHTML(f, it)).join('')}
        <button class="btn" type="submit" style="margin-top:8px">${step === TOTAL - 1 ? 'Ver análise' : 'Continuar'}</button></form>`;
    }
    $app.innerHTML = head + bar + body;

    const backBtn = $app.querySelector('[data-back=""]');
    backBtn?.addEventListener('click', (e) => { e.stopPropagation(); step--; draw(); }, { capture: true });
    $app.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { it = defaults(b.dataset.cat, { source: 'perguntas' }); step = 1; draw(); }));
    $app.querySelectorAll('[data-name]').forEach((b) => b.addEventListener('click', () => {
      it.name = b.dataset.name;
      if (b.dataset.sub) it.subtype = b.dataset.sub;
      if (it.category === 'conta' || b.dataset.sub) { step = 2; draw(); return; }
      draw();
    }));
    const nameIn = $app.querySelector('#w-name');
    nameIn?.addEventListener('input', () => { it.name = nameIn.value.trim(); $app.querySelector('#w-next').disabled = !it.name; $app.querySelectorAll('[data-name]').forEach((x) => x.classList.toggle('on', x.dataset.name === it.name)); });
    $app.querySelector('#w-next')?.addEventListener('click', () => { if (it.name) { step = 2; draw(); } });
    const form = $app.querySelector('#w-form');
    if (form) {
      bindSegs(form);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        it = readFields(form, it);
        if (step === 2 && it.category !== 'cartao' && !it.amount) { toast('Informe um valor aproximado.'); return; }
        if (step < TOTAL - 1) { step++; draw(); } else saveNew(it);
      });
    }
  };
  draw();
}

// ---------------------------------------------------------------------------
// 3. Home
// ---------------------------------------------------------------------------
function findingRow(item, f) {
  const val = f.oneTimeLoss ? `<span class="money loss">${brl0(f.oneTimeLoss)}</span><small>em risco</small>` : `<span class="money loss">${brl0(f.monthlyLoss)}</span><small>/mês</small>`;
  return `<a class="row ${flashId === item.id ? 'flash' : ''}" href="#/perda/${item.id}/${f.key}"><span class="dot ${f.severity}"></span><div class="main"><h3>${esc(item.name)}</h3><p>${esc(f.status)}</p></div><div class="val">${val}</div></a>`;
}

function viewHome() {
  const s = summarize(state.items);
  const items = state.items;
  const statusLabel = { red: 'Atenção', yellow: 'Observar', green: 'Ok' };

  let content;
  if (!items.length) {
    content = `<div class="card empty" style="margin-top:8px"><div class="ic">${icon('plus')}</div><h2 style="margin-bottom:6px">Nada cadastrado ainda</h2><p>Adicione o primeiro item para começar a ver suas perdas.</p><a class="btn" href="#/cadastro" style="margin-top:18px">Adicionar primeiro item</a></div>`;
  } else {
    const block = (title, list, ic, empty) => `
      <div class="section"><h2>${title}</h2><span class="muted">${list.length ? brl0(list.reduce((a, x) => a + x.finding.monthlyLoss, 0)) + '/mês' : ''}</span></div>
      <div class="card list">${list.length ? list.map((x) => findingRow(x.item, x.finding)).join('') : `<div class="empty-mini">${empty}</div>`}</div>`;
    const sorted = [...items].sort((a, b) => ({ red: 0, yellow: 1, green: 2 }[itemSeverity(a)] - { red: 0, yellow: 1, green: 2 }[itemSeverity(b)]));
    content = `
      ${!s.active.length ? `<div class="card empty"><div class="ic" style="color:var(--ok)">${icon('check')}</div><h2 style="margin-bottom:6px">Tudo certo por aqui</h2><p>Nenhuma perda relevante identificada no momento.</p></div>` : ''}
      ${s.active.length ? block('Deixando de usar', s.unused, 'down', 'Nada parado ou sem uso.') + block('Gastando demais', s.overspend, 'up', 'Nenhum gasto acima do padrão.') : ''}
      <div class="section"><h2>Todos os itens</h2><span class="muted">${items.length} ${items.length === 1 ? 'item' : 'itens'}</span></div>
      <div class="card list">${sorted.map((it) => {
        const sev = itemSeverity(it);
        const m = toMonthly(it.amount ?? 0, it.frequency) + (it.category === 'cartao' ? toMonthly(it.annualFee, it.feeFrequency || 'anual') : 0);
        const sub = it.frequency === 'unica' ? `${brl(it.amount)} disponível` : m ? `${brl(m)}/mês` : CATEGORIES[it.category]?.label;
        return `<a class="row ${flashId === it.id ? 'flash' : ''}" href="#/item/${it.id}"><span class="dot ${sev}"></span><div class="main"><h3>${esc(it.name)}</h3><p>${esc(sub)}</p></div><span class="tag ${sev}">${statusLabel[sev]}</span></a>`;
      }).join('')}</div>`;
  }

  $app.innerHTML = `
    <div class="topbar"><span class="brandmark"><i>0</i>Monitor de Perda de Dinheiro</span></div>
    <div class="hero">
      <div class="label">Você está perdendo aproximadamente</div>
      <div class="value">${brl0(s.monthly)}<small>/mês</small></div>
      ${s.monthly ? `<div class="extra">Cerca de <b>${brl0(s.monthly * 12)}</b> por ano</div>` : ''}
      ${s.atRisk ? `<div class="extra">+ <b>${brl0(s.atRisk)}</b> em pontos e valores para resgatar</div>` : ''}
      <div class="note">Estimativa com base no que você cadastrou.</div>
    </div>
    ${content}
    ${items.length ? `<a class="fab" href="#/cadastro">${icon('plus')}Adicionar</a>` : ''}`;
  flashId = null;
}

// ---------------------------------------------------------------------------
// 4. Detalhe do item / da perda
// ---------------------------------------------------------------------------
function viewItem(id) {
  const it = findItem(id);
  if (!it) return go('#/');
  const fs = analyze(it).filter((f) => !isDismissed(it, f.key));
  if (fs.length === 1) { history.replaceState(null, '', `#/perda/${id}/${fs[0].key}`); return render(); }
  const sev = itemSeverity(it);
  $app.innerHTML = `
    ${topbar(it.name)}
    <div class="card detail-hero"><span class="tag ${sev}">${CATEGORIES[it.category]?.label}</span>
      <h1 style="margin-top:10px">${esc(it.name)}</h1>
      <p class="sub">${fs.length ? `${fs.length} pontos de atenção` : esc(insightFor(it, []))}</p></div>
    ${fs.length ? `<div class="card list findings">${fs.map((f) => findingRow(it, f)).join('')}</div>` : ''}
    ${usedTodayBtn(it)}
    <div class="stack"><a class="btn secondary" href="#/item/${id}/editar">${icon('edit')}Editar dados</a></div>`;
  bindUsedToday(it);
}

function usedTodayBtn(it) {
  return it.category === 'assinatura' ? `<button class="btn secondary" id="used" style="margin-bottom:10px">${icon('check')}Usei recentemente</button>` : '';
}
function bindUsedToday(it) {
  $app.querySelector('#used')?.addEventListener('click', () => {
    it.lastUsedAt = new Date().toISOString().slice(0, 10);
    it.dismissed = {};
    save();
    toast('Uso registrado. Avisamos se ficar parado por mais de 30 dias.');
    go('#/');
  });
}

function viewPerda(id, key) {
  const it = findItem(id);
  const f = it && analyze(it).find((x) => x.key === key);
  if (!f) return it ? go(`#/item/${id}`) : go('#/');
  const yellow = f.severity === 'yellow';
  const kpis = f.oneTimeLoss
    ? `<div class="card kpi"><span class="muted">Valor em risco</span><span class="money loss">${brl0(f.oneTimeLoss)}</span></div><div class="card kpi"><span class="muted">Situação</span><span class="money" style="font-size:18px">${esc(f.status)}</span></div>`
    : `<div class="card kpi"><span class="muted">Perda estimada/mês</span><span class="money loss">${brl0(f.monthlyLoss)}</span></div><div class="card kpi"><span class="muted">Em 12 meses</span><span class="money">${brl0(f.annualLoss)}</span></div>`;
  $app.innerHTML = `
    ${topbar(it.name)}
    <h1>${esc(it.name)}</h1>
    <p class="muted">${esc(CATEGORIES[it.category]?.label)} · ${f.kind === 'unused' ? 'Deixando de usar' : 'Gastando demais'}</p>
    <div class="kpis">${kpis}</div>
    <div class="card reason ${yellow ? 'yellow' : ''}"><span class="ic">${icon('alert')}</span><p>${esc(f.reason)}<small>Estimativa calculada a partir dos dados que você informou.</small></p></div>
    <div class="stack">
      <a class="btn" href="#/resolver/${id}/${key}">Como resolver</a>
      ${usedTodayBtn(it)}
      <button class="btn secondary" id="ignore">Ignorar por agora</button>
      <a class="btn ghost" href="#/item/${id}/editar">${icon('edit')}Editar dados</a>
    </div>`;
  bindUsedToday(it);
  $app.querySelector('#ignore').addEventListener('click', () => {
    const until = new Date(); until.setDate(until.getDate() + 30);
    it.dismissed = { ...it.dismissed, [key]: { status: 'ignored', until: until.toISOString() } };
    save();
    toast('Ignorado por 30 dias. Depois disso, o item volta a ser monitorado.');
    go('#/');
  });
}

// ---------------------------------------------------------------------------
// 5. Como resolver
// ---------------------------------------------------------------------------
function viewResolver(id, key) {
  const it = findItem(id);
  const f = it && analyze(it).find((x) => x.key === key);
  if (!f) return go('#/');
  const sol = solutionFor(it, f);
  const aid = `${id}:${key}`;
  if (state.alerts[aid]) { state.alerts[aid].read = true; save(); }
  $app.innerHTML = `
    ${topbar(it.name)}
    <h1>Como resolver</h1>
    <p class="sub">${esc(f.reason)}.</p>
    <ol class="howto">${sol.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    ${sol.links.map((l) => `<a class="card extlink" href="${esc(l.url)}" target="_blank" rel="noopener">${icon('ext')}<span>${esc(l.label)}</span>${icon('chev')}</a>`).join('')}
    <div class="stack" style="margin-top:18px">
      <button class="btn" id="done">${icon('check')}Já resolvi</button>
      <button class="btn ghost" data-back="history">Voltar</button>
    </div>`;
  $app.querySelector('#done').addEventListener('click', () => {
    it.dismissed = { ...it.dismissed, [key]: { status: 'resolved', at: new Date().toISOString() } };
    save();
    const saved = f.oneTimeLoss ? `${brl0(f.oneTimeLoss)} recuperados` : `${brl0(f.monthlyLoss)}/mês a menos de perda`;
    toast(saved, 'Resolvido');
    go('#/');
  });
}

// ---------------------------------------------------------------------------
// 6. Avisos
// ---------------------------------------------------------------------------
function viewAvisos() {
  const list = currentAlerts().sort((a, b) => (b.meta?.first || 0) - (a.meta?.first || 0));
  const fmtDate = (ts) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(ts));
  const unread = list.filter((a) => !a.meta?.read).length;
  $app.innerHTML = `
    <div class="topbar"><h2 style="font-size:28px;font-weight:800">Avisos</h2>${unread ? '<button class="linkbtn" id="readall">Marcar todos como lidos</button>' : ''}</div>
    <p class="muted" style="margin-bottom:16px">Só aparecem aqui perdas concretas ou oportunidades claras.</p>
    ${list.length ? `<div class="alert-list">${list.map((a) => `
      <div class="card alert ${a.meta?.read ? 'read' : ''}">
        <span class="ic">${icon(a.finding.key === 'points' || a.finding.key === 'claim' ? 'gift' : 'alert')}</span>
        <a class="main" href="#/resolver/${a.item.id}/${a.finding.key}" style="text-decoration:none;color:inherit">
          <h3>${esc(alertTitle(a.item, a.finding))}</h3>
          <p>${esc(alertValue(a.finding))}</p>
          <small>Toque para ver como resolver</small>
        </a>
        <div style="text-align:right"><span class="muted" style="font-size:12px">${a.meta ? fmtDate(a.meta.first) : ''}</span>${a.meta?.read ? '' : `<br><button class="linkbtn" data-read="${a.id}" style="font-size:13px">Lido</button>`}</div>
      </div>`).join('')}</div>`
      : `<div class="card empty"><div class="ic">${icon('bell')}</div><h2 style="margin-bottom:6px">Nenhum aviso</h2><p>Quando identificarmos uma perda concreta, ela aparece aqui.</p></div>`}`;
  $app.querySelectorAll('[data-read]').forEach((b) => b.addEventListener('click', () => { state.alerts[b.dataset.read].read = true; save(); render(); }));
  $app.querySelector('#readall')?.addEventListener('click', () => { list.forEach((a) => (state.alerts[a.id].read = true)); save(); render(); });
}

// ---------------------------------------------------------------------------
// 7. Perfil
// ---------------------------------------------------------------------------
function viewPerfil() {
  const items = state.items;
  $app.innerHTML = `
    <div class="topbar"><h2 style="font-size:28px;font-weight:800">Perfil</h2></div>
    <div class="section" style="margin-top:8px"><h2>Itens cadastrados</h2><a class="linkbtn" href="#/cadastro" style="text-decoration:none">+ Adicionar</a></div>
    <div class="card list">${items.length ? items.map((it) => `
      <div class="row"><span class="dot ${itemSeverity(it)}"></span><div class="main"><h3>${esc(it.name)}</h3><p>${esc(CATEGORIES[it.category]?.label)}</p></div>
        <a class="iconbtn" href="#/item/${it.id}/editar" aria-label="Editar ${esc(it.name)}" style="margin:0">${icon('edit')}</a>
        <button class="iconbtn" data-del="${it.id}" aria-label="Remover ${esc(it.name)}" style="margin:0;color:var(--loss)"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></div>`).join('')
      : '<div class="empty-mini">Nenhum item cadastrado.</div>'}</div>

    <div class="section"><h2>Notificações</h2></div>
    <div class="card toggle"><div class="main"><h3>Ativar avisos</h3><p class="muted">Só quando houver perda concreta ou oportunidade clara.</p></div>
      <label class="switch"><input type="checkbox" id="notif" ${state.notifications ? 'checked' : ''} aria-label="Ativar avisos"><i></i></label></div>

    <div class="section"><h2>Sobre</h2></div>
    <div class="card about">
      <p><b>Perdazero · Monitor de Perda de Dinheiro</b></p>
      <p class="muted">Versão ${VERSION}</p>
      <p class="sub">Organizamos o que você já paga ou tem direito e mostramos, de forma clara, o que está sendo desperdiçado e onde você está gastando demais.</p>
      <p class="muted">Todos os valores são estimativas. Seus dados ficam apenas neste aparelho: sem conta e sem conexão bancária.</p>
    </div>
    <button class="btn ghost" id="wipe" style="margin-top:14px;color:var(--loss)">Apagar todos os dados</button>`;
  $app.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => removeItem(b.dataset.del)));
  $app.querySelector('#notif').addEventListener('change', async (e) => {
    if (e.target.checked) e.target.checked = await askNotifications();
    else { state.notifications = false; save(); }
    if (state.notifications) { Object.values(state.alerts).forEach((a) => (a.notified = false)); syncAlerts(); }
  });
  $app.querySelector('#wipe').addEventListener('click', () => {
    if (!confirm('Apagar todos os itens e recomeçar?')) return;
    state = { onboarded: false, notifications: false, items: [], alerts: {} };
    save();
    go('#/onboarding/1');
  });
}

// ---------------------------------------------------------------------------
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
render();
