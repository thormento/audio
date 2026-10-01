// Seed de versículos e quiz no Firestore.
//
// Emulador:  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node seed.mjs
// Produção:  GOOGLE_APPLICATION_CREDENTIALS=conta.json GCLOUD_PROJECT=seu-projeto node seed.mjs
//
// Os versículos recebem `activeOn` para os próximos 7 dias (um por slot por
// dia). Depois disso o app usa o seed embutido, escolhido pelo dia do ano.

import { readFileSync } from 'node:fs';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT ?? 'demo-altar';
initializeApp(
  process.env.FIRESTORE_EMULATOR_HOST
    ? { projectId }
    : { credential: applicationDefault(), projectId },
);
const db = getFirestore();

const verses = JSON.parse(
  readFileSync(new URL('../assets/seed/verses.json', import.meta.url), 'utf8'),
).verses;
const questions = JSON.parse(
  readFileSync(new URL('../assets/seed/quizzes.json', import.meta.url), 'utf8'),
).questions;

function recifeDayKey(offsetDays) {
  const now = new Date(Date.now() - 3 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return now.toISOString().slice(0, 10);
}

const batch = db.batch();
const bySlot = {};
for (const v of verses) (bySlot[v.slot] ??= []).push(v);
for (const [slot, list] of Object.entries(bySlot)) {
  list.forEach((v, i) => {
    batch.set(db.collection('verses').doc(v.id), {
      slot,
      text: v.text,
      reference: v.reference,
      imageUrl: null,
      activeOn: i < 7 ? recifeDayKey(i) : null,
      order: i,
    });
  });
}
for (const q of questions) {
  batch.set(db.collection('quizzes').doc(q.id), {
    question: q.question,
    options: q.options,
    correctIndex: q.correctIndex,
    reference: q.reference,
  });
}
await batch.commit();
console.log(`Seed ok: ${verses.length} versículos, ${questions.length} perguntas em ${projectId}`);
