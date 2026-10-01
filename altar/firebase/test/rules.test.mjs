// Testes das regras do Firestore, Fase 1.
// Rode com: npm test (sobe o emulador do Firestore e executa).

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
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const PROJECT = 'demo-altar';
const PASTOR = 'pastor-uid';
const FIEL_A = 'fiel-a-uid';
const FIEL_B = 'fiel-b-uid';
const OUTRO_PASTOR = 'outro-pastor-uid';

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

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  // Documentos de usuário já criados no cadastro.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const uid of [PASTOR, FIEL_A, FIEL_B, OUTRO_PASTOR]) {
      await setDoc(doc(db, 'users', uid), {
        name: `Usuário ${uid}`,
        consentAccount: true,
      });
    }
  });
});

function db(uid) {
  return env.authenticatedContext(uid).firestore();
}

/** Mesma transação que o app faz em ChurchRepository.createChurch. */
async function createChurch(uid, churchId, code, name = 'Igreja Teste') {
  const d = db(uid);
  const batch = writeBatch(d);
  batch.set(doc(d, 'churches', churchId), {
    name,
    city: 'Recife',
    plan: 'trial',
    planStatus: 'active',
    memberLimit: 30,
    inviteCode: code,
    createdBy: uid,
  });
  batch.set(doc(d, 'inviteCodes', code), { churchId, name, city: 'Recife' });
  batch.set(doc(d, 'churches', churchId, 'members', uid), {
    role: 'churchAdmin',
    joinedAt: new Date(),
    statusOptIn: false,
  });
  batch.update(doc(d, 'users', uid), { churchId, role: 'churchAdmin' });
  return batch.commit();
}

/** Mesmo batch que o app faz em ChurchRepository.joinByCode. */
async function joinChurch(uid, churchId, code, role = 'member') {
  const d = db(uid);
  const batch = writeBatch(d);
  batch.set(doc(d, 'churches', churchId, 'members', uid), {
    role,
    joinedAt: new Date(),
    statusOptIn: false,
    inviteCode: code,
  });
  batch.update(doc(d, 'users', uid), { churchId, role });
  return batch.commit();
}

test('pastor cria igreja, código e vira churchAdmin', async () => {
  await assertSucceeds(createChurch(PASTOR, 'igreja1', 'ABC234'));
  await assertSucceeds(getDoc(doc(db(PASTOR), 'churches', 'igreja1')));
});

test('ninguém cria igreja em nome de outro', async () => {
  const d = db(FIEL_A);
  await assertFails(
    setDoc(doc(d, 'churches', 'igreja-x'), {
      name: 'Falsa',
      city: 'X',
      plan: 'trial',
      inviteCode: 'ZZZ999',
      createdBy: PASTOR,
    }),
  );
});

test('fiel entra com o código certo e passa a ler a igreja', async () => {
  await createChurch(PASTOR, 'igreja1', 'ABC234');
  await assertSucceeds(getDoc(doc(db(FIEL_A), 'inviteCodes', 'ABC234')));
  await assertSucceeds(joinChurch(FIEL_A, 'igreja1', 'ABC234'));
  await assertSucceeds(getDoc(doc(db(FIEL_A), 'churches', 'igreja1')));
});

test('código errado não entra', async () => {
  await createChurch(PASTOR, 'igreja1', 'ABC234');
  await assertFails(joinChurch(FIEL_A, 'igreja1', 'WRONG1'));
});

test('igreja inexistente não aceita membro', async () => {
  await assertFails(joinChurch(FIEL_A, 'nao-existe', 'ABC234'));
});

test('fiel não entra como churchAdmin nem pastor pelo código', async () => {
  await createChurch(PASTOR, 'igreja1', 'ABC234');
  await assertFails(joinChurch(FIEL_A, 'igreja1', 'ABC234', 'churchAdmin'));
  await assertFails(joinChurch(FIEL_A, 'igreja1', 'ABC234', 'pastor'));
});

test('fiel não lê outra igreja nem seus membros', async () => {
  await createChurch(PASTOR, 'igreja1', 'ABC234');
  await createChurch(OUTRO_PASTOR, 'igreja2', 'XYZ789', 'Outra Igreja');
  await joinChurch(FIEL_A, 'igreja1', 'ABC234');

  const d = db(FIEL_A);
  await assertSucceeds(getDoc(doc(d, 'churches', 'igreja1')));
  await assertSucceeds(getDocs(collection(d, 'churches', 'igreja1', 'members')));
  await assertFails(getDoc(doc(d, 'churches', 'igreja2')));
  await assertFails(getDocs(collection(d, 'churches', 'igreja2', 'members')));
  await assertFails(getDocs(collection(d, 'churches')));
});

test('não logado não lê nada', async () => {
  await createChurch(PASTOR, 'igreja1', 'ABC234');
  const d = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(d, 'churches', 'igreja1')));
  await assertFails(getDoc(doc(d, 'inviteCodes', 'ABC234')));
  await assertFails(getDoc(doc(d, 'users', PASTOR)));
});

test('códigos não podem ser listados', async () => {
  await createChurch(PASTOR, 'igreja1', 'ABC234');
  await assertFails(getDocs(collection(db(FIEL_A), 'inviteCodes')));
});

test('fiel não lê nem edita o perfil de outro fiel', async () => {
  const d = db(FIEL_A);
  await assertSucceeds(getDoc(doc(d, 'users', FIEL_A)));
  await assertFails(getDoc(doc(d, 'users', FIEL_B)));
  await assertFails(updateDoc(doc(d, 'users', FIEL_B), { name: 'Hackeado' }));
});

test('fiel não se promove sozinho', async () => {
  await createChurch(PASTOR, 'igreja1', 'ABC234');
  await joinChurch(FIEL_A, 'igreja1', 'ABC234');
  const d = db(FIEL_A);
  await assertFails(
    updateDoc(doc(d, 'churches', 'igreja1', 'members', FIEL_A), { role: 'pastor' }),
  );
  await assertFails(updateDoc(doc(d, 'users', FIEL_A), { role: 'pastor' }));
});

test('cadastro não aceita CPF', async () => {
  const d = db('novo-uid');
  await assertFails(
    setDoc(doc(d, 'users', 'novo-uid'), {
      name: 'Novo',
      consentAccount: true,
      cpf: '00000000000',
    }),
  );
  await assertFails(
    setDoc(doc(d, 'users', 'novo-uid'), { name: 'Novo', consentAccount: false }),
  );
  await assertSucceeds(
    setDoc(doc(d, 'users', 'novo-uid'), { name: 'Novo', consentAccount: true }),
  );
});

test('churchAdmin edita a igreja, fiel não', async () => {
  await createChurch(PASTOR, 'igreja1', 'ABC234');
  await joinChurch(FIEL_A, 'igreja1', 'ABC234');
  await assertSucceeds(
    updateDoc(doc(db(PASTOR), 'churches', 'igreja1'), { city: 'Olinda' }),
  );
  await assertFails(
    updateDoc(doc(db(PASTOR), 'churches', 'igreja1'), { plan: 'missao' }),
  );
  await assertFails(
    updateDoc(doc(db(FIEL_A), 'churches', 'igreja1'), { city: 'Olinda' }),
  );
});
