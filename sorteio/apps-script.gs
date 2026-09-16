/**
 * Backend do sorteio em Google Apps Script.
 *
 * Como usar:
 * 1. Crie uma planilha no Google Sheets e abra Extensões > Apps Script.
 * 2. Cole este código, troque SENHA_PAINEL e salve.
 * 3. Implantar > Nova implantação > App da Web
 *    (Executar como: Eu, Quem pode acessar: Qualquer pessoa).
 * 4. Copie a URL /exec e cole em CONFIG.API_URL no sorteio.html.
 *
 * Sempre que editar este arquivo, crie uma nova versão em
 * "Gerenciar implantações", senão a URL continua rodando o código antigo.
 */

const SENHA_PAINEL = 'troque-esta-senha';
const NOME_ABA = 'Participantes';
const INSCRICOES_ABERTAS = true;

/* ---------- Utilidades ---------- */

function responder(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

function obterAba() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  let aba = planilha.getSheetByName(NOME_ABA);
  if (!aba) {
    aba = planilha.insertSheet(NOME_ABA);
    aba.appendRow(['Data', 'Nome', 'Instagram']);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, 3).setFontWeight('bold');
    aba.setColumnWidth(1, 170);
    aba.setColumnWidth(2, 260);
    aba.setColumnWidth(3, 200);
  }
  return aba;
}

// Evita que um valor seja interpretado como fórmula pelo Sheets.
function protegerCelula(valor) {
  const texto = String(valor === null || valor === undefined ? '' : valor);
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

// Remove o apóstrofo de proteção ao devolver o valor.
function limparCelula(valor) {
  return String(valor === null || valor === undefined ? '' : valor).replace(/^'/, '');
}

function normalizarNome(valor) {
  return String(valor || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function normalizarInstagram(valor) {
  return String(valor || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .slice(0, 30);
}

function instagramValido(ig) {
  return /^[a-z0-9._]{1,30}$/.test(ig);
}

/* ---------- Cadastro (POST) ---------- */

function doPost(e) {
  if (!INSCRICOES_ABERTAS) {
    return responder({ ok: false, erro: 'fechado' });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (erroLock) {
    return responder({ ok: false, erro: 'servidor' });
  }

  try {
    let dados = {};
    try {
      dados = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (erroJson) {
      dados = {};
    }

    const nome = normalizarNome(dados.nome);
    const partes = nome.split(' ').filter(function (p) { return p.length > 0; });
    if (nome.length < 3 || partes.length < 2) {
      return responder({ ok: false, erro: 'nome' });
    }

    const instagram = normalizarInstagram(dados.instagram);
    if (instagram && !instagramValido(instagram)) {
      return responder({ ok: false, erro: 'instagram' });
    }

    const aba = obterAba();
    const ultimaLinha = aba.getLastRow();

    if (instagram && ultimaLinha > 1) {
      const coluna = aba.getRange(2, 3, ultimaLinha - 1, 1).getValues();
      for (let i = 0; i < coluna.length; i++) {
        const existente = normalizarInstagram(limparCelula(coluna[i][0]));
        if (existente === instagram) {
          return responder({ ok: false, erro: 'duplicado' });
        }
      }
    }

    aba.appendRow([
      new Date(),
      protegerCelula(nome),
      protegerCelula(instagram ? '@' + instagram : '')
    ]);

    const numero = aba.getLastRow() - 1;
    return responder({ ok: true, numero: numero });
  } catch (erro) {
    return responder({ ok: false, erro: 'servidor' });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Listagem (GET) ---------- */

function doGet(e) {
  try {
    const parametros = (e && e.parameter) || {};

    if (parametros.acao !== 'listar') {
      return responder({ ok: true, status: 'online' });
    }

    if (String(parametros.senha || '') !== SENHA_PAINEL) {
      return responder({ ok: false, erro: 'senha' });
    }

    const aba = obterAba();
    const ultimaLinha = aba.getLastRow();
    const participantes = [];

    if (ultimaLinha > 1) {
      const linhas = aba.getRange(2, 1, ultimaLinha - 1, 3).getValues();
      for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        const nome = limparCelula(linha[1]);
        if (!nome) continue;
        const data = linha[0] instanceof Date ? linha[0].toISOString() : String(linha[0] || '');
        participantes.push({
          data: data,
          nome: nome,
          instagram: limparCelula(linha[2])
        });
      }
    }

    return responder({ ok: true, participantes: participantes });
  } catch (erro) {
    return responder({ ok: false, erro: 'servidor' });
  }
}
