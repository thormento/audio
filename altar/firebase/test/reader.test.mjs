// Testes das regras do app do leitor: pontos, indicação, versículos, quiz.

import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
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
  writeBatch,
} from 'firebase/firestore';

const PROJECT = 'demo-altar';
const ANA = 'ana-uid';
const BETO = 'beto-uid';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
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
    for (const uid of [ANA, BETO]) {
      await setDoc(doc(d, 'users', uid), {
        name: `Usuário ${uid}`,
        consentAccount: true,
        points: 50,
        status: 'semente',
        deviceId: `device-${uid}`,
      });
    }
    await setDoc(doc(d, 'referralCodes', 'ANA123'), { uid: ANA });
    await setDoc(doc(d, 'verses', 'manha-01'), {
      slot: 'manha',
      text: 'Teste',
      reference: 'Teste 1:1',
      activeOn: '2026-10-01',
    });
    await setDoc(doc(d, 'quizzes', 'q01'), {
      question: '?',
      options: ['a', 'b'],
      correctIndex: 0,
      reference: 'Teste 1:1',
    });
  });
});

const db = (uid) => env.authenticatedContext(uid).firestore();

test('pontos só sobem e o log só acrescenta', async () => {
  const d = db(ANA);
  await assertSucceeds(updateDoc(doc(d, 'users', ANA), { points: 60, status: 'semente' }));
  await assertFails(updateDoc(doc(d, 'users', ANA), { points: 10 }));
  await assertSucceeds(
    setDoc(doc(d, 'users', ANA, 'pointsLog', 'l1'), { action: 'share', points: 10, refId: 'v' }),
  );
  await assertFails(
    setDoc(doc(d, 'users', ANA, 'pointsLog', 'l2'), { action: 'hack', points: 999, refId: 'v' }),
  );
  await assertFails(updateDoc(doc(d, 'users', ANA, 'pointsLog', 'l1'), { points: 100 }));
});

test('fiel não lê nem escreve o log de pontos de outro', async () => {
  const d = db(BETO);
  await assertFails(getDocs(collection(d, 'users', ANA, 'pointsLog')));
  await assertFails(
    setDoc(doc(d, 'users', ANA, 'pointsLog', 'x'), { action: 'open', points: 5, refId: 'd' }),
  );
});

test('quiz: resultado do dia só é criado uma vez pelo dono', async () => {
  const d = db(ANA);
  await assertSucceeds(
    setDoc(doc(d, 'users', ANA, 'quizResults', '2026-10-01'), { correct: 3, total: 5, points: 45 }),
  );
  await assertFails(
    updateDoc(doc(d, 'users', ANA, 'quizResults', '2026-10-01'), { points: 999 }),
  );
  await assertFails(
    setDoc(doc(db(BETO), 'users', ANA, 'quizResults', '2026-10-02'), { correct: 5, total: 5 }),
  );
});

test('versículos e quizzes: leitura só logado, escrita fechada', async () => {
  await assertSucceeds(getDoc(doc(db(ANA), 'verses', 'manha-01')));
  await assertSucceeds(getDocs(collection(db(ANA), 'quizzes')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'verses', 'manha-01')));
  await assertFails(
    setDoc(doc(db(ANA), 'verses', 'novo'), { slot: 'manha', text: 'x', reference: 'y' }),
  );
});

test('indicação: Beto entra com código de Ana, Ana credita, Beto não credita', async () => {
  const b = db(BETO);
  await assertSucceeds(getDoc(doc(b, 'referralCodes', 'ANA123')));
  await assertFails(getDocs(collection(b, 'referralCodes')));
  await assertSucceeds(
    setDoc(doc(b, 'referrals', BETO), {
      referrerUid: ANA,
      code: 'ANA123',
      deviceId: 'device-beto-uid',
      status: 'pending',
    }),
  );
  // Beto não pode se auto-creditar.
  await assertFails(updateDoc(doc(b, 'referrals', BETO), { status: 'credited' }));

  const a = db(ANA);
  const pending = await assertSucceeds(
    getDocs(query(collection(a, 'referrals'), where('referrerUid', '==', ANA))),
  );
  if (pending.size !== 1) throw new Error('Ana deveria ver 1 indicação pendente');
  await assertSucceeds(updateDoc(doc(a, 'referrals', BETO), { status: 'credited' }));
  // Depois de resolvida, não muda mais.
  await assertFails(updateDoc(doc(a, 'referrals', BETO), { status: 'pending' }));
});

test('ninguém cria indicação apontando para si mesmo', async () => {
  await assertFails(
    setDoc(doc(db(ANA), 'referrals', ANA), {
      referrerUid: ANA,
      code: 'ANA123',
      deviceId: 'x',
      status: 'pending',
    }),
  );
});

test('membro só mexe no próprio opt-in e espelho de pontos', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'churches', 'ig'), {
      name: 'Ig', city: 'R', plan: 'trial', inviteCode: 'ABC234', createdBy: 'p',
    });
    await setDoc(doc(d, 'churches', 'ig', 'members', ANA), { role: 'member', statusOptIn: false });
    await setDoc(doc(d, 'churches', 'ig', 'members', BETO), { role: 'member', statusOptIn: true });
  });
  const a = db(ANA);
  await assertSucceeds(
    updateDoc(doc(a, 'churches', 'ig', 'members', ANA), { statusOptIn: true, points: 60, status: 'semente', name: 'Ana' }),
  );
  await assertFails(updateDoc(doc(a, 'churches', 'ig', 'members', ANA), { role: 'pastor' }));
  await assertFails(updateDoc(doc(a, 'churches', 'ig', 'members', BETO), { statusOptIn: false }));
  // Ranking: membro lê os membros da própria igreja com opt-in.
  await assertSucceeds(
    getDocs(query(collection(a, 'churches', 'ig', 'members'), where('statusOptIn', '==', true))),
  );
});
