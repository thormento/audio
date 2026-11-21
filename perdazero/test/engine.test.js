import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, summarize, parseReceiptText, insightFor, solutionFor, toMonthly } from '../engine.js';

const today = new Date('2026-11-21T12:00:00');
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const inDays = (n) => daysAgo(-n);

test('assinatura parada há 47 dias = perda total', () => {
  const [f] = analyze({ category: 'assinatura', name: 'Netflix', amount: 55.9, frequency: 'mensal', lastUsedAt: daysAgo(47) }, today);
  assert.equal(f.kind, 'unused');
  assert.equal(f.monthlyLoss, 55.9);
  assert.equal(f.annualLoss, 670.8);
  assert.match(f.reason, /47 dias/);
  assert.equal(f.concrete, true);
});

test('assinatura usada recentemente não gera perda', () => {
  assert.deepEqual(analyze({ category: 'assinatura', amount: 40, lastUsedAt: daysAgo(3) }, today), []);
});

test('conta de energia acima da média', () => {
  const [f] = analyze({ category: 'conta', subtype: 'energia', amount: 300, people: 2 }, today);
  assert.equal(f.kind, 'overspend');
  assert.equal(f.monthlyLoss, 180); // ref = max(90, 60*2) = 120
  assert.equal(f.severity, 'red');
});

test('reajuste de conta detectado', () => {
  const fs = analyze({ category: 'conta', subtype: 'internet', amount: 130, previousAmount: 99.9 }, today);
  assert.ok(fs.find((f) => f.key === 'increase'));
});

test('pontos vencendo em 18 dias', () => {
  const fs = analyze({ category: 'cartao', points: 4600, pointsExpiry: inDays(18) }, today);
  const p = fs.find((f) => f.key === 'points');
  assert.equal(p.oneTimeLoss, 92);
  assert.equal(p.status, 'vencem em 18 dias');
  assert.equal(p.monthlyLoss, 0);
});

test('anuidade anual vira custo mensal', () => {
  const [f] = analyze({ category: 'cartao', annualFee: 480, feeFrequency: 'anual' }, today);
  assert.equal(f.monthlyLoss, 40);
});

test('benefício não ativado', () => {
  const [f] = analyze({ category: 'beneficio', subtype: 'beneficio', amount: 150, frequency: 'mensal', activated: false }, today);
  assert.equal(f.reason, 'Benefício disponível e não ativado');
});

test('plano individual com reajuste acima do teto', () => {
  const [f] = analyze({ category: 'saude', subtype: 'individual', amount: 600, previousAmount: 500 }, today);
  assert.equal(f.key, 'increase');
  assert.ok(f.monthlyLoss > 60 && f.monthlyLoss < 70);
});

test('summarize separa blocos, ignora resolvidos e soma em risco', () => {
  const items = [
    { id: 'a', category: 'assinatura', amount: 50, lastUsedAt: daysAgo(60) },
    { id: 'b', category: 'banco', amount: 30, frequency: 'mensal' },
    { id: 'c', category: 'cartao', points: 5000, pointsExpiry: inDays(10) },
    { id: 'd', category: 'banco', amount: 20, frequency: 'mensal', dismissed: { fee: { status: 'resolved' } } },
  ];
  const s = summarize(items, today);
  assert.equal(s.monthly, 80);
  assert.equal(s.atRisk, 100);
  assert.equal(s.unused.length, 2);
  assert.equal(s.overspend.length, 1);
});

test('toda perda tem passo a passo', () => {
  const samples = [
    { category: 'assinatura', name: 'Netflix', amount: 50, lastUsedAt: daysAgo(60) },
    { category: 'conta', subtype: 'energia', amount: 400 },
    { category: 'conta', subtype: 'agua', amount: 400 },
    { category: 'conta', subtype: 'telefone', amount: 400, people: 1 },
    { category: 'cartao', annualFee: 400, points: 1000, pointsExpiry: inDays(5) },
    { category: 'banco', amount: 30 },
    { category: 'saude', amount: 900, previousAmount: 500, usedLast12: false },
    { category: 'beneficio', subtype: 'fgts', amount: 800, activated: false },
    { category: 'beneficio', subtype: 'svr', amount: 80, activated: false },
    { category: 'beneficio', subtype: 'beneficio', amount: 100, activated: false },
    { category: 'outro', amount: 30, usage: 'nunca' },
  ];
  for (const it of samples) {
    const fs = analyze(it, today);
    assert.ok(fs.length, `sem achado: ${JSON.stringify(it)}`);
    for (const f of fs) {
      const s = solutionFor(it, f);
      assert.ok(s.steps.length >= 3 && s.steps.length <= 5, `${it.category}:${f.key}`);
    }
  }
  assert.match(solutionFor(samples[0], analyze(samples[0], today)[0]).links[0].url, /netflix/);
});

test('insight sempre existe', () => {
  for (const c of ['assinatura', 'conta', 'cartao', 'banco', 'saude', 'beneficio', 'outro']) {
    assert.ok(insightFor({ category: c, amount: 0 }).length > 10);
  }
});

test('parse de texto de fatura', () => {
  const d = parseReceiptText('ENEL DISTRIBUIÇÃO SP\nConsumo 320 kWh\nTOTAL A PAGAR R$ 287,45\nVencimento 10/12/2026');
  assert.equal(d.category, 'conta');
  assert.equal(d.subtype, 'energia');
  assert.equal(d.amount, 287.45);
  const p = parseReceiptText('Livelo\nSaldo: 12.500 pontos\nExpiram em 15/12/2026');
  assert.equal(p.points, 12500);
  assert.equal(p.pointsExpiry, '2026-12-15');
  assert.equal(toMonthly(120, 'anual'), 10);
});
