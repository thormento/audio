// Regras do lado da igreja: comunicados, oração, agenda, dízimo, plano.

import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';

const PASTOR = 'pastor-uid';
const TESOUREIRO = 'tesoureiro-uid';
const FIEL_A = 'fiel-a-uid';
const FIEL_B = 'fiel-b-uid';
const IG = 'igreja-1';
const IG_EXP = 'igreja-expirada';

let env;
const inDays = (d) => Timestamp.fromDate(new Date(Date.now() + d * 86400000));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-altar',
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});
after(async () => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    for (const uid of [PASTOR, TESOUREIRO, FIEL_A, FIEL_B]) {
      await setDoc(doc(d, 'users', uid), { name: uid, consentAccount: true, churchId: IG });
    }
    await setDoc(doc(d, 'churches', IG), {
      name: 'Igreja Um', city: 'Recife', plan: 'trial', planStatus: 'active',
      trialEndsAt: inDays(10), memberLimit: 30, memberCount: 4, inviteCode: 'ABC234',
      createdBy: PASTOR, pixKey: 'igreja@pix.com', pixKeyType: 'email',
    });
    await setDoc(doc(d, 'churches', IG, 'members', PASTOR), { role: 'churchAdmin' });
    await setDoc(doc(d, 'churches', IG, 'members', TESOUREIRO), { role: 'treasurer' });
    await setDoc(doc(d, 'churches', IG, 'members', FIEL_A), { role: 'member' });
    await setDoc(doc(d, 'churches', IG, 'members', FIEL_B), { role: 'member' });

    await setDoc(doc(d, 'churches', IG_EXP), {
      name: 'Expirada', city: 'Recife', plan: 'trial', planStatus: 'expired',
      trialEndsAt: inDays(-3), memberLimit: 30, memberCount: 1, inviteCode: 'EXP234',
      createdBy: PASTOR, pixKey: 'x@pix.com',
    });
    await setDoc(doc(d, 'churches', IG_EXP, 'members', PASTOR), { role: 'churchAdmin' });
  });
});

const db = (uid) => env.authenticatedContext(uid).firestore();
const aviso = (uid, extra = {}) => ({
  churchId: IG, authorId: uid, authorName: uid, type: 'aviso',
  title: 'Culto', body: 'Domingo às 18h', ...extra,
});
const oracao = (uid) => ({
  churchId: IG, authorId: uid, authorName: uid, type: 'oracao', title: '', body: 'Pela minha família',
});

// ---- Fase 2 -------------------------------------------------------------
test('pastor publica aviso; fiel não publica', async () => {
  await assertSucceeds(addDoc(collection(db(PASTOR), 'churches', IG, 'posts'), aviso(PASTOR)));
  await assertFails(addDoc(collection(db(FIEL_A), 'churches', IG, 'posts'), aviso(FIEL_A)));
});

test('fiel lê o feed de avisos da própria igreja', async () => {
  await addDoc(collection(db(PASTOR), 'churches', IG, 'posts'), aviso(PASTOR));
  const q = query(collection(db(FIEL_A), 'churches', IG, 'posts'), where('type', '==', 'aviso'));
  const r = await assertSucceeds(getDocs(q));
  assert.equal(r.size, 1);
});

test('fiel pede oração; não lê a oração de outro fiel; pastor lê e marca', async () => {
  const ref = await assertSucceeds(addDoc(collection(db(FIEL_A), 'churches', IG, 'posts'), oracao(FIEL_A)));
  await assertFails(getDoc(doc(db(FIEL_B), 'churches', IG, 'posts', ref.id)));
  await assertFails(
    getDocs(query(collection(db(FIEL_B), 'churches', IG, 'posts'), where('type', '==', 'oracao'))),
  );
  await assertSucceeds(
    getDocs(query(collection(db(FIEL_A), 'churches', IG, 'posts'), where('type', '==', 'oracao'), where('authorId', '==', FIEL_A))),
  );
  await assertSucceeds(getDoc(doc(db(PASTOR), 'churches', IG, 'posts', ref.id)));
  await assertSucceeds(updateDoc(doc(db(PASTOR), 'churches', IG, 'posts', ref.id), { prayedAt: new Date(), prayedBy: PASTOR }));
  await assertFails(updateDoc(doc(db(FIEL_A), 'churches', IG, 'posts', ref.id), { prayedAt: new Date(), prayedBy: FIEL_A }));
});

test('oração não vira aviso por edição', async () => {
  const ref = await addDoc(collection(db(FIEL_A), 'churches', IG, 'posts'), oracao(FIEL_A));
  await assertFails(updateDoc(doc(db(PASTOR), 'churches', IG, 'posts', ref.id), { type: 'aviso' }));
});

// ---- Fase 3 -------------------------------------------------------------
const culto = { churchId: IG, title: 'Culto', startsAt: inDays(2), type: 'culto', place: 'Templo', reminderMinutes: 60 };

test('pastor cria culto e online no trial; fiel não cria', async () => {
  await assertSucceeds(addDoc(collection(db(PASTOR), 'churches', IG, 'events'), culto));
  await assertSucceeds(
    addDoc(collection(db(PASTOR), 'churches', IG, 'events'), { ...culto, type: 'online', onlineUrl: 'https://meet.google.com/abc' }),
  );
  await assertFails(addDoc(collection(db(PASTOR), 'churches', IG, 'events'), { ...culto, type: 'online', onlineUrl: '' }));
  await assertFails(addDoc(collection(db(FIEL_A), 'churches', IG, 'events'), culto));
});

test('plano Essencial não cria encontro online', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'churches', IG), { plan: 'essencial', planStatus: 'active' });
  });
  await assertSucceeds(addDoc(collection(db(PASTOR), 'churches', IG, 'events'), culto));
  await assertFails(
    addDoc(collection(db(PASTOR), 'churches', IG, 'events'), { ...culto, type: 'online', onlineUrl: 'https://zoom.us/j/1' }),
  );
});

test('RSVP: um por usuário, só o próprio', async () => {
  const ev = await addDoc(collection(db(PASTOR), 'churches', IG, 'events'), culto);
  await assertSucceeds(setDoc(doc(db(FIEL_A), 'churches', IG, 'events', ev.id, 'rsvp', FIEL_A), { going: true, at: new Date() }));
  await assertFails(setDoc(doc(db(FIEL_A), 'churches', IG, 'events', ev.id, 'rsvp', FIEL_B), { going: true, at: new Date() }));
  await assertSucceeds(getDocs(collection(db(FIEL_B), 'churches', IG, 'events', ev.id, 'rsvp')));
});

// ---- Fase 4 -------------------------------------------------------------
const gift = (uid) => ({
  churchId: IG, uid, kind: 'dizimo', amountCents: 5000, method: 'pix_direto', status: 'pendente', pixCopiaECola: '000201',
});

test('fiel A não vê o dízimo do fiel B; tesoureiro vê o período', async () => {
  const a = await assertSucceeds(addDoc(collection(db(FIEL_A), 'churches', IG, 'gifts'), gift(FIEL_A)));
  await assertSucceeds(getDoc(doc(db(FIEL_A), 'churches', IG, 'gifts', a.id)));
  await assertFails(getDoc(doc(db(FIEL_B), 'churches', IG, 'gifts', a.id)));
  await assertFails(getDocs(collection(db(FIEL_B), 'churches', IG, 'gifts')));
  await assertSucceeds(getDocs(query(collection(db(FIEL_B), 'churches', IG, 'gifts'), where('uid', '==', FIEL_B))));
  await assertSucceeds(getDocs(collection(db(TESOUREIRO), 'churches', IG, 'gifts')));
  await assertSucceeds(getDocs(collection(db(PASTOR), 'churches', IG, 'gifts')));
});

test('fiel só informa; tesoureiro confirma; ninguém cria pago nem por outro', async () => {
  const a = await addDoc(collection(db(FIEL_A), 'churches', IG, 'gifts'), gift(FIEL_A));
  await assertFails(updateDoc(doc(db(FIEL_A), 'churches', IG, 'gifts', a.id), { status: 'pago' }));
  await assertSucceeds(updateDoc(doc(db(FIEL_A), 'churches', IG, 'gifts', a.id), { status: 'informado', informedAt: new Date() }));
  await assertSucceeds(updateDoc(doc(db(TESOUREIRO), 'churches', IG, 'gifts', a.id), { status: 'pago', reviewedBy: TESOUREIRO, reviewedAt: new Date() }));
  await assertFails(addDoc(collection(db(FIEL_A), 'churches', IG, 'gifts'), { ...gift(FIEL_A), status: 'pago' }));
  await assertFails(addDoc(collection(db(FIEL_A), 'churches', IG, 'gifts'), gift(FIEL_B)));
  await assertFails(addDoc(collection(db(FIEL_A), 'churches', IG, 'gifts'), { ...gift(FIEL_A), method: 'pix_mp' }));
});

test('chave Pix: pastor cadastra, fiel não; trilha de acesso só da tesouraria', async () => {
  await assertSucceeds(updateDoc(doc(db(PASTOR), 'churches', IG), { pixKey: '12345678000199', pixKeyType: 'cnpj' }));
  await assertFails(updateDoc(doc(db(FIEL_A), 'churches', IG), { pixKey: 'hack' }));
  await assertSucceeds(addDoc(collection(db(TESOUREIRO), 'churches', IG, 'giftsAudit'), { uid: TESOUREIRO, period: '2026-10', action: 'view' }));
  await assertFails(addDoc(collection(db(FIEL_A), 'churches', IG, 'giftsAudit'), { uid: FIEL_A, period: '2026-10', action: 'view' }));
});

// ---- Fase 9 -------------------------------------------------------------
test('igreja expirada: painel somente leitura, oração do fiel continua', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'churches', IG_EXP, 'members', FIEL_A), { role: 'member' });
    await addDoc(collection(ctx.firestore(), 'churches', IG_EXP, 'gifts'), { ...gift(FIEL_B), churchId: IG_EXP });
  });
  await assertFails(addDoc(collection(db(PASTOR), 'churches', IG_EXP, 'posts'), { ...aviso(PASTOR), churchId: IG_EXP }));
  await assertFails(addDoc(collection(db(PASTOR), 'churches', IG_EXP, 'events'), { ...culto, churchId: IG_EXP }));
  await assertFails(getDocs(collection(db(PASTOR), 'churches', IG_EXP, 'gifts')));
  await assertSucceeds(getDocs(query(collection(db(PASTOR), 'churches', IG_EXP, 'posts'), where('type', '==', 'aviso'))));
  await assertSucceeds(addDoc(collection(db(FIEL_A), 'churches', IG_EXP, 'posts'), { ...oracao(FIEL_A), churchId: IG_EXP }));
});

test('ninguém muda plano, status ou contador pelo app', async () => {
  await assertFails(updateDoc(doc(db(PASTOR), 'churches', IG), { plan: 'missao' }));
  await assertFails(updateDoc(doc(db(PASTOR), 'churches', IG), { planStatus: 'active', trialEndsAt: inDays(999) }));
  await assertFails(updateDoc(doc(db(PASTOR), 'churches', IG), { memberCount: 0 }));
  await assertFails(getDoc(doc(db(FIEL_A), 'billing', IG)));
  await assertFails(setDoc(doc(db(PASTOR), 'billing', IG), { status: 'active' }));
});

test('limite de membros do plano bloqueia entrada', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'churches', IG), { memberCount: 30 });
    await setDoc(doc(ctx.firestore(), 'users', 'novo'), { name: 'Novo', consentAccount: true });
  });
  await assertFails(
    setDoc(doc(db('novo'), 'churches', IG, 'members', 'novo'), { role: 'member', inviteCode: 'ABC234', statusOptIn: false }),
  );
});

// ---- Fase 10 ------------------------------------------------------------
test('pedido de exclusão só do próprio usuário', async () => {
  await assertSucceeds(setDoc(doc(db(FIEL_A), 'deletionRequests', FIEL_A), { uid: FIEL_A, status: 'pending' }));
  await assertFails(setDoc(doc(db(FIEL_A), 'deletionRequests', FIEL_B), { uid: FIEL_B, status: 'pending' }));
  await assertFails(deleteDoc(doc(db(FIEL_A), 'deletionRequests', FIEL_A)));
});
