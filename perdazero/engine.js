// Perdazero — motor de análise (sem dependências, roda no navegador e no Node).
// Todas as perdas são ESTIMATIVAS: a v1 prioriza clareza e ação sobre precisão.

export const CATEGORIES = {
  assinatura: { label: 'Assinaturas', hint: 'Streaming, academia, apps', icon: 'play' },
  conta: { label: 'Contas', hint: 'Energia, água, internet, telefone', icon: 'bolt' },
  cartao: { label: 'Cartão e pontos/milhas', hint: 'Anuidade e pontos', icon: 'card' },
  banco: { label: 'Banco e tarifas', hint: 'Pacotes e tarifas mensais', icon: 'bank' },
  saude: { label: 'Plano de saúde / odontológico', hint: 'Mensalidade e reajuste', icon: 'heart' },
  beneficio: { label: 'Benefícios do emprego e FGTS', hint: 'Benefícios, FGTS, valores a receber', icon: 'gift' },
  outro: { label: 'Outros', hint: 'Qualquer outro gasto recorrente', icon: 'dots' },
};

export const SUBTYPES = {
  conta: { energia: 'Energia', agua: 'Água', internet: 'Internet', telefone: 'Telefone / celular' },
  beneficio: { beneficio: 'Benefício do emprego', fgts: 'FGTS', svr: 'Valores a receber (Banco Central)' },
  saude: { individual: 'Individual / familiar', coletivo: 'Coletivo / empresarial' },
};

export const FREQUENCIES = {
  mensal: { label: 'Mensal', perMonth: 1 },
  trimestral: { label: 'Trimestral', perMonth: 1 / 3 },
  semestral: { label: 'Semestral', perMonth: 1 / 6 },
  anual: { label: 'Anual', perMonth: 1 / 12 },
  unica: { label: 'Única', perMonth: 0 },
};

// Referências aproximadas (R$/mês) para "acima da média". Ajustáveis.
export const REFERENCES = {
  energia: { perPerson: 60, min: 90 },
  agua: { perPerson: 35, min: 60 },
  internet: { flat: 110 },
  telefone: { perPerson: 55, min: 55 },
};
// Teto de reajuste da ANS para planos individuais — atualizar a cada ciclo anual.
export const ANS_CAP = 0.0606;
// Valor médio estimado de 1 ponto/milha em reais.
export const DEFAULT_POINT_VALUE = 0.02;

const DAY = 86400000;

export function toMonthly(amount, frequency = 'mensal') {
  const f = FREQUENCIES[frequency] ?? FREQUENCIES.mensal;
  return (Number(amount) || 0) * f.perMonth;
}

export function daysBetween(fromISO, today = new Date()) {
  if (!fromISO) return null;
  const a = startOfDay(new Date(fromISO));
  const b = startOfDay(today);
  return Math.round((b - a) / DAY);
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function pct(n) {
  return `${Math.round(n * 100)}%`;
}
const brl = (n) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);

/**
 * Analisa um item e devolve uma lista de achados (findings).
 * finding = { key, kind: 'unused'|'overspend', monthlyLoss, oneTimeLoss, severity: 'red'|'yellow',
 *             status (curto), reason (claro), concrete (gera aviso), insight }
 * Itens sem perda retornam [] e um insight genérico via insightFor().
 */
export function analyze(item, today = new Date()) {
  const out = [];
  const monthly = toMonthly(item.amount, item.frequency);

  switch (item.category) {
    case 'assinatura': {
      const days = daysBetween(item.lastUsedAt, today);
      if (days != null && days >= 30) {
        out.push({
          key: 'unused',
          kind: 'unused',
          monthlyLoss: monthly,
          severity: 'red',
          status: `não usado há ${days} dias`,
          reason: `Não utilizado nos últimos ${days} dias`,
          concrete: true,
        });
      } else if (days != null && days >= 15) {
        out.push({
          key: 'lowuse',
          kind: 'unused',
          monthlyLoss: monthly * 0.5,
          severity: 'yellow',
          status: `pouco usado (${days} dias sem uso)`,
          reason: `Uso baixo: ${days} dias desde o último uso. Metade do valor pode estar sendo desperdiçada`,
          concrete: false,
        });
      }
      break;
    }

    case 'conta': {
      const ref = referenceFor(item.subtype, item.people);
      if (ref) {
        const excess = monthly - ref;
        if (excess > 0 && excess / ref > 0.15) {
          const ratio = excess / ref;
          out.push({
            key: 'above',
            kind: 'overspend',
            monthlyLoss: excess,
            severity: ratio > 0.3 ? 'red' : 'yellow',
            status: 'acima da média',
            reason: `Valor ${pct(ratio)} acima da média estimada para ${peopleLabel(item.people)} (cerca de ${brl(ref)}/mês)`,
            concrete: ratio > 0.3,
          });
        }
      }
      const prev = Number(item.previousAmount) || 0;
      if (prev > 0 && Number(item.amount) > prev * 1.1) {
        const inc = (Number(item.amount) - prev) / prev;
        out.push({
          key: 'increase',
          kind: 'overspend',
          monthlyLoss: toMonthly(Number(item.amount) - prev, item.frequency),
          severity: inc > 0.2 ? 'red' : 'yellow',
          status: 'reajuste recente',
          reason: `Subiu ${pct(inc)} em relação ao valor anterior (${brl(prev)})`,
          concrete: inc > 0.2,
        });
      }
      break;
    }

    case 'cartao': {
      const fee = toMonthly(item.annualFee, item.feeFrequency || 'anual');
      if (fee > 0) {
        out.push({
          key: 'fee',
          kind: 'overspend',
          monthlyLoss: fee,
          severity: fee >= 30 ? 'red' : 'yellow',
          status: 'anuidade cobrada',
          reason: `Anuidade de ${brl(fee * 12)}/ano. A maioria dos bancos oferece isenção ou desconto quando o cliente pede`,
          concrete: true,
        });
      }
      const pts = Number(item.points) || 0;
      const left = item.pointsExpiry ? -daysBetween(item.pointsExpiry, today) : null;
      if (pts > 0 && left != null && left <= 90) {
        const value = pts * (Number(item.pointValue) || DEFAULT_POINT_VALUE);
        const expired = left < 0;
        out.push({
          key: 'points',
          kind: 'unused',
          monthlyLoss: 0,
          oneTimeLoss: value,
          severity: left <= 30 ? 'red' : 'yellow',
          status: expired ? 'pontos vencidos' : `vencem em ${left} dias`,
          reason: expired
            ? `${fmtInt(pts)} pontos venceram há ${-left} dias. Alguns programas permitem reativar`
            : `${fmtInt(pts)} pontos vencem em ${left} dias`,
          concrete: left <= 30,
        });
      }
      break;
    }

    case 'banco': {
      if (monthly > 0) {
        out.push({
          key: 'fee',
          kind: 'overspend',
          monthlyLoss: monthly,
          severity: monthly >= 20 ? 'red' : 'yellow',
          status: 'tarifa evitável',
          reason: 'Tarifa de pacote. Todo banco é obrigado a oferecer os serviços essenciais sem custo',
          concrete: true,
        });
      }
      break;
    }

    case 'saude': {
      const prev = Number(item.previousAmount) || 0;
      if (prev > 0 && Number(item.amount) > prev) {
        const inc = (Number(item.amount) - prev) / prev;
        const individual = item.subtype !== 'coletivo';
        const limit = individual ? ANS_CAP : 0.15;
        if (inc > limit + 0.005) {
          const fair = prev * (1 + (individual ? ANS_CAP : 0));
          out.push({
            key: 'increase',
            kind: 'overspend',
            monthlyLoss: toMonthly(Number(item.amount) - (individual ? fair : prev * 1.15), item.frequency),
            severity: 'red',
            status: 'reajuste acima do esperado',
            reason: individual
              ? `Reajuste de ${pct(inc)}, acima do teto da ANS para planos individuais (${(ANS_CAP * 100).toFixed(2).replace('.', ',')}%)`
              : `Reajuste de ${pct(inc)} em plano coletivo. Vale pedir a memória de cálculo e comparar`,
            concrete: true,
          });
        }
      }
      if (item.usedLast12 === false && monthly > 0) {
        out.push({
          key: 'nouse',
          kind: 'overspend',
          monthlyLoss: monthly * 0.3,
          severity: 'yellow',
          status: 'sem uso em 12 meses',
          reason: 'Sem uso nos últimos 12 meses. Um plano com coparticipação costuma custar cerca de 30% menos',
          concrete: false,
        });
      }
      break;
    }

    case 'beneficio': {
      if (item.subtype === 'fgts' || item.subtype === 'svr') {
        const value = Number(item.amount) || 0;
        if (value > 0 && !item.activated) {
          out.push({
            key: 'claim',
            kind: 'unused',
            monthlyLoss: 0,
            oneTimeLoss: value,
            severity: 'red',
            status: 'valor não resgatado',
            reason:
              item.subtype === 'fgts'
                ? `${brl(value)} de FGTS disponível e ainda não sacado`
                : `${brl(value)} esquecidos em bancos, disponíveis para resgate`,
            concrete: true,
          });
        }
      } else if (!item.activated && monthly > 0) {
        out.push({
          key: 'inactive',
          kind: 'unused',
          monthlyLoss: monthly,
          severity: 'red',
          status: 'benefício não ativado',
          reason: 'Benefício disponível e não ativado',
          concrete: true,
        });
      }
      break;
    }

    default: {
      if (item.usage === 'nunca' && monthly > 0) {
        out.push({
          key: 'unused',
          kind: 'unused',
          monthlyLoss: monthly,
          severity: 'red',
          status: 'sem uso',
          reason: 'Você indicou que não usa este item',
          concrete: true,
        });
      } else if (item.usage === 'raramente' && monthly > 0) {
        out.push({
          key: 'lowuse',
          kind: 'unused',
          monthlyLoss: monthly * 0.5,
          severity: 'yellow',
          status: 'pouco usado',
          reason: 'Uso raro. Metade do valor pode estar sendo desperdiçada',
          concrete: false,
        });
      }
    }
  }

  return out.map((f) => ({
    oneTimeLoss: 0,
    ...f,
    monthlyLoss: round2(Math.max(0, f.monthlyLoss)),
    annualLoss: round2(Math.max(0, f.monthlyLoss) * 12),
  }));
}

function referenceFor(subtype, people) {
  const r = REFERENCES[subtype];
  if (!r) return 0;
  if (r.flat) return r.flat;
  const n = Math.max(1, Number(people) || 2);
  return Math.max(r.min, r.perPerson * n);
}
function peopleLabel(n) {
  const p = Math.max(1, Number(n) || 2);
  return p === 1 ? '1 pessoa' : `${p} pessoas`;
}
function fmtInt(n) {
  return new Intl.NumberFormat('pt-BR').format(n);
}

/** Insight curto mostrado logo após o cadastro (sempre existe, mesmo sem perda). */
export function insightFor(item, findings = analyze(item)) {
  const top = [...findings].sort((a, b) => b.monthlyLoss + b.oneTimeLoss - (a.monthlyLoss + a.oneTimeLoss))[0];
  if (top) {
    const val = top.oneTimeLoss ? `${brl(top.oneTimeLoss)} em risco` : `${brl(top.monthlyLoss)}/mês`;
    return `${top.reason}. Estimativa: ${val}.`;
  }
  switch (item.category) {
    case 'assinatura':
      return item.lastUsedAt
        ? 'Assinatura em uso. Avisamos se ela ficar parada por mais de 30 dias.'
        : 'Diga quando usou pela última vez para sabermos se vale a pena manter.';
    case 'conta':
      return 'Conta dentro do padrão estimado. Avisamos se ela subir.';
    case 'cartao':
      return 'Sem anuidade e sem pontos perto de vencer. Cadastre a validade dos pontos para monitorar.';
    case 'banco':
      return 'Sem tarifa mensal. Ótimo.';
    case 'saude':
      return 'Informe o valor antes do último reajuste para conferirmos se ele foi justo.';
    case 'beneficio':
      return 'Benefício ativo. Nada sendo desperdiçado aqui.';
    default:
      return 'Item cadastrado. Informe a frequência de uso para analisarmos melhor.';
  }
}

/** Resumo da Home a partir dos itens e do estado de cada achado (resolvido/ignorado). */
export function summarize(items, today = new Date()) {
  const active = [];
  for (const item of items) {
    for (const f of analyze(item, today)) {
      if (isDismissed(item, f.key, today)) continue;
      active.push({ item, finding: f });
    }
  }
  const byValue = (a, b) =>
    b.finding.monthlyLoss + b.finding.oneTimeLoss - (a.finding.monthlyLoss + a.finding.oneTimeLoss);
  const unused = active.filter((x) => x.finding.kind === 'unused').sort(byValue);
  const overspend = active.filter((x) => x.finding.kind === 'overspend').sort(byValue);
  const monthly = round2(active.reduce((s, x) => s + x.finding.monthlyLoss, 0));
  const atRisk = round2(active.reduce((s, x) => s + x.finding.oneTimeLoss, 0));
  return { active, unused, overspend, monthly, atRisk };
}

export function isDismissed(item, key, today = new Date()) {
  const d = item.dismissed?.[key];
  if (!d) return false;
  if (d.status === 'resolved') return true;
  if (d.status === 'ignored') return d.until ? new Date(d.until) > today : true;
  return false;
}

export function itemSeverity(item, today = new Date()) {
  const fs = analyze(item, today).filter((f) => !isDismissed(item, f.key, today));
  if (fs.some((f) => f.severity === 'red')) return 'red';
  if (fs.length) return 'yellow';
  return 'green';
}

// ---------------------------------------------------------------------------
// Como resolver
// ---------------------------------------------------------------------------

const CANCEL_LINKS = [
  [/netflix/i, 'https://www.netflix.com/cancelplan'],
  [/spotify/i, 'https://www.spotify.com/br-pt/account/'],
  [/youtube/i, 'https://www.youtube.com/paid_memberships'],
  [/disney/i, 'https://www.disneyplus.com/account'],
  [/amazon|prime/i, 'https://www.amazon.com.br/mc'],
];

export function solutionFor(item, finding) {
  const name = item.name || 'o serviço';
  const L = (label, url) => ({ label, url });

  switch (`${item.category}:${finding.key}`) {
    case 'assinatura:unused':
    case 'assinatura:lowuse': {
      const link = CANCEL_LINKS.find(([re]) => re.test(name));
      return {
        steps: [
          `Abra ${name} (app ou site) e entre em “Conta” ou “Assinatura”.`,
          finding.key === 'lowuse'
            ? 'Veja se existe um plano mais barato (com anúncios, individual ou anual) que atenda seu uso.'
            : 'Toque em “Cancelar assinatura”. Assinaturas feitas pela loja de apps são canceladas em Ajustes → Assinaturas (iPhone) ou Play Store → Pagamentos e assinaturas (Android).',
          'Confirme o cancelamento e guarde o e-mail ou protocolo de confirmação.',
          'Volte aqui e toque em “Já resolvi”.',
        ],
        links: link ? [L(`Gerenciar assinatura ${name}`, link[1])] : [],
      };
    }
    case 'conta:above':
    case 'conta:increase':
      return contaSolution(item, finding);
    case 'cartao:fee':
      return {
        steps: [
          'Ligue para a central do cartão ou abra o chat do app e peça a isenção da anuidade.',
          'Se negarem, pergunte por desconto ou isenção por gasto mínimo e cite ofertas de cartões sem anuidade.',
          'Se não houver acordo, peça a migração para uma versão sem anuidade do mesmo banco.',
          'Anote o protocolo e marque como resolvido.',
        ],
        links: [],
      };
    case 'cartao:points':
      return {
        steps: [
          'Abra o app do cartão ou do programa de pontos e confira o saldo e a data de vencimento.',
          'O que costuma valer mais: transferir para um programa de milhas (procure promoções de bônus) ou trocar por passagens.',
          'Sem viagem à vista: troque por produtos, cashback ou desconto na fatura antes de vencer.',
          'Depois de usar, marque como resolvido.',
        ],
        links: [],
      };
    case 'banco:fee':
      return {
        steps: [
          'No app ou na agência, peça para trocar seu pacote pelos “serviços essenciais”, que são gratuitos por regra do Banco Central.',
          'Eles incluem débito, transferências entre contas do mesmo banco, extratos e saques em quantidade limitada, além de Pix ilimitado para pessoa física.',
          'Confira na próxima fatura se a tarifa sumiu. Se o banco recusar, registre reclamação no Banco Central ou no Consumidor.gov.br.',
          'Marque como resolvido.',
        ],
        links: [
          L('Registrar reclamação no Banco Central', 'https://www.bcb.gov.br/meubc/registrar_reclamacao'),
          L('Consumidor.gov.br', 'https://www.consumidor.gov.br'),
        ],
      };
    case 'saude:increase':
      return {
        steps: [
          'Peça à operadora, por escrito, a memória de cálculo do reajuste.',
          item.subtype === 'coletivo'
            ? 'Em plano coletivo o reajuste é negociado, mas tem que ser justificado. Compare com outras operadoras.'
            : 'Confira se o percentual aplicado respeita o teto da ANS para planos individuais no período.',
          'Se o reajuste estiver errado, registre reclamação na ANS (pelo site ou no 0800 701 9656).',
          'Marque como resolvido quando o valor for corrigido.',
        ],
        links: [L('ANS: reclamação e consulta', 'https://www.gov.br/ans/pt-br')],
      };
    case 'saude:nouse':
      return {
        steps: [
          'Peça à operadora as opções de plano com coparticipação ou com rede menor.',
          'Compare o custo anual: mensalidades mais o uso esperado.',
          'Atenção às carências antes de trocar de operadora. Use a portabilidade para evitá-las.',
          'Marque como resolvido.',
        ],
        links: [L('Portabilidade de carências (ANS)', 'https://www.gov.br/ans/pt-br')],
      };
    case 'beneficio:inactive':
      return {
        steps: [
          `Procure o RH ou o portal de benefícios da empresa e pergunte como ativar ${name}.`,
          'Confira prazos, documentos necessários e se o benefício tem contrapartida da empresa.',
          'Faça a ativação e confirme o primeiro crédito ou uso.',
          'Marque como resolvido.',
        ],
        links: [],
      };
    case 'beneficio:claim':
      return item.subtype === 'fgts'
        ? {
            steps: [
              'Baixe o app FGTS e entre com sua conta gov.br.',
              'Confira o saldo de contas ativas e inativas e veja as modalidades de saque disponíveis para você.',
              'Solicite o saque e informe uma conta bancária para receber.',
              'Marque como resolvido.',
            ],
            links: [L('FGTS (Caixa)', 'https://www.fgts.gov.br')],
          }
        : {
            steps: [
              'Acesse o sistema Valores a Receber do Banco Central com sua conta gov.br.',
              'Veja em quais instituições há dinheiro em seu nome.',
              'Solicite o resgate via Pix.',
              'Marque como resolvido.',
            ],
            links: [L('Valores a Receber (BCB)', 'https://valoresareceber.bcb.gov.br')],
          };
    default:
      return {
        steps: [
          `Decida se ${name} ainda faz sentido para você.`,
          'Se não fizer, cancele no site, no app ou pelo atendimento e guarde o protocolo.',
          'Se fizer, procure um plano menor ou mais barato.',
          'Marque como resolvido.',
        ],
        links: [],
      };
  }
}

function contaSolution(item, finding) {
  const L = (label, url) => ({ label, url });
  const s = item.subtype;
  if (s === 'energia')
    return {
      steps: [
        'Confira na fatura se a leitura está correta (compare com o medidor) e se houve cobrança de bandeira tarifária.',
        'Verifique se você tem direito à Tarifa Social de Energia (famílias no CadÚnico), que dá até 100% de desconto.',
        'Os maiores vilões são chuveiro, ar-condicionado, geladeira antiga e aparelhos em standby.',
        'Se a leitura estiver errada, peça revisão à distribuidora e marque como resolvido.',
      ],
      links: [L('ANEEL: tarifa social e direitos', 'https://www.gov.br/aneel/pt-br')],
    };
  if (s === 'agua')
    return {
      steps: [
        'Feche todas as torneiras e veja se o hidrômetro continua girando. Se girar, há vazamento.',
        'Confira se a leitura da fatura bate com o hidrômetro.',
        'Pergunte à companhia de saneamento sobre tarifa social e revisão de conta.',
        'Marque como resolvido.',
      ],
      links: [],
    };
  if (s === 'internet' || s === 'telefone')
    return {
      steps: [
        'Compare seu plano com as ofertas atuais da sua operadora e das concorrentes na sua região.',
        'Ligue e peça o setor de cancelamento: é nele que aparecem os melhores descontos.',
        finding.key === 'increase'
          ? 'Pergunte o motivo do aumento. Fim de promoção é o mais comum, e dá para pedir uma nova.'
          : 'Avalie se a velocidade ou a franquia contratada é maior do que você usa.',
        'Feche o novo valor com protocolo e marque como resolvido.',
      ],
      links: [L('Anatel Consumidor', 'https://www.gov.br/anatel/pt-br/consumidor')],
    };
  return solutionFor({ ...item, category: 'outro' }, finding);
}

// ---------------------------------------------------------------------------
// Extração básica de texto (OCR de fatura / print)
// ---------------------------------------------------------------------------

const KNOWN = [
  [/netflix/i, 'Netflix', 'assinatura'],
  [/spotify/i, 'Spotify', 'assinatura'],
  [/disney/i, 'Disney+', 'assinatura'],
  [/\bmax\b|hbo/i, 'Max', 'assinatura'],
  [/globoplay/i, 'Globoplay', 'assinatura'],
  [/prime video|amazon prime/i, 'Amazon Prime', 'assinatura'],
  [/youtube/i, 'YouTube Premium', 'assinatura'],
  [/apple|icloud/i, 'Apple / iCloud', 'assinatura'],
  [/smart ?fit|academia|bluefit|gympass|wellhub/i, 'Academia', 'assinatura'],
  [/enel|cemig|copel|light s|cpfl|energisa|neoenergia|coelba|celpe|equatorial|kwh|energia el/i, 'Conta de energia', 'conta', 'energia'],
  [/sabesp|cedae|copasa|sanepar|embasa|compesa|saneamento|m³|m3/i, 'Conta de água', 'conta', 'agua'],
  [/fibra|banda larga|internet/i, 'Internet', 'conta', 'internet'],
  [/\bvivo\b|\bclaro\b|\btim\b|\boi\b|telefonia|celular/i, 'Telefone', 'conta', 'telefone'],
  [/unimed|amil|bradesco sa[uú]de|sulam[eé]rica|hapvida|notredame|odontoprev|plano de sa[uú]de/i, 'Plano de saúde', 'saude', 'individual'],
  [/anuidade|fatura do cart[aã]o|cart[aã]o de cr[eé]dito/i, 'Cartão de crédito', 'cartao'],
  [/livelo|esfera|smiles|latam pass|tudoazul|pontos|milhas/i, 'Pontos do cartão', 'cartao'],
  [/tarifa|cesta de servi[cç]os|pacote de servi[cç]os/i, 'Tarifa bancária', 'banco'],
  [/fgts/i, 'FGTS', 'beneficio', 'fgts'],
];

export function parseMoney(s) {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Recebe o texto extraído por OCR e tenta montar um rascunho de item. */
export function parseReceiptText(text = '') {
  const draft = {};
  const t = text.replace(/\r/g, '');
  const hit = KNOWN.find(([re]) => re.test(t));
  if (hit) {
    draft.name = hit[1];
    draft.category = hit[2];
    if (hit[3]) draft.subtype = hit[3];
  }

  const money = [];
  const lines = t.split('\n');
  for (const line of lines) {
    for (const m of line.matchAll(/R\$\s*([\d.]{1,9},\d{2})/gi)) {
      const v = parseMoney(m[1]);
      if (v != null) money.push({ v, line });
    }
  }
  if (!money.length) {
    for (const m of t.matchAll(/(?<![\d,])(\d{1,3}(?:\.\d{3})*,\d{2})(?![\d])/g)) {
      const v = parseMoney(m[1]);
      if (v != null) money.push({ v, line: '' });
    }
  }
  if (money.length) {
    const pref = money.find((x) => /total a pagar|valor a pagar|valor total|total da fatura|total|valor/i.test(x.line));
    draft.amount = (pref ?? money.reduce((a, b) => (b.v > a.v ? b : a))).v;
  }

  if (/anual|anuidade|\/ano/i.test(t)) draft.frequency = 'anual';
  else if (draft.amount != null) draft.frequency = 'mensal';

  if (draft.category === 'cartao' && /anuidade/i.test(t)) {
    const m = t.match(/anuidade[^\n]*?R?\$?\s*([\d.]{1,9},\d{2})/i);
    if (m) {
      draft.annualFee = parseMoney(m[1]);
      draft.feeFrequency = /parcela|\d+\s*\/\s*12|mensal/i.test(m[0]) ? 'mensal' : 'anual';
    }
  }
  const pts = t.match(/(\d{1,3}(?:\.\d{3})+|\d+)\s*(pontos|pts|milhas)/i);
  if (pts) {
    draft.points = Number(pts[1].replace(/\./g, ''));
    if (!draft.category) {
      draft.category = 'cartao';
      draft.name = 'Pontos do cartão';
    }
  }
  const exp = t.match(/(?:venc\w*|expira\w*|validade)[^\n\d]{0,25}(\d{2})\/(\d{2})\/(\d{2,4})/i);
  if (exp && draft.category === 'cartao') {
    const y = exp[3].length === 2 ? `20${exp[3]}` : exp[3];
    draft.pointsExpiry = `${y}-${exp[2]}-${exp[1]}`;
  }
  return draft;
}
