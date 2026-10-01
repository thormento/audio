// Cloud Functions do Altar.
//
// Fase 2: notifyNewPost (push ao publicar comunicado).
// Fase 3: notifyNewEvent (push ao marcar evento).
// Fase 4: createGiftPix, mpWebhook (Pix do dízimo via Mercado Pago sandbox).
// Fase 9: createSubscriptionCheckout, mpWebhook, expireTrials (mensalidade).
// Fase 10: deleteUserData (exclusão de conta em até 15 dias).
//
// Segredos: MP_ACCESS_TOKEN (Mercado Pago) via
//   firebase functions:secrets:set MP_ACCESS_TOKEN

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const mp = require("./mercadopago");

admin.initializeApp();
setGlobalOptions({ region: "southamerica-east1", maxInstances: 10 });

const db = admin.firestore();
const MP_ACCESS_TOKEN = defineSecret("MP_ACCESS_TOKEN");

const PLANS = {
  trial: { memberLimit: 30, postsPerMonth: 20, online: true, priceCents: 0 },
  essencial: { memberLimit: 150, postsPerMonth: 40, online: false, priceCents: 4900 },
  comunhao: { memberLimit: 500, postsPerMonth: 120, online: true, priceCents: 9900 },
  missao: { memberLimit: 2000, postsPerMonth: null, online: true, priceCents: 19900 },
};
const GRACE_DAYS = 7;

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

// ---------------------------------------------------------------------------
// Fase 2: push ao publicar comunicado. Envia para o tópico da igreja; o app
// só assina o tópico quando o fiel ligou consentPush.
// ---------------------------------------------------------------------------
exports.notifyNewPost = onDocumentCreated(
  "churches/{churchId}/posts/{postId}",
  async (event) => {
    const data = event.data?.data();
    if (!data || data.type !== "aviso") return;
    const { churchId } = event.params;

    // Contador de comunicados do mês, usado pelo limite do plano.
    await db
      .collection("churches")
      .doc(churchId)
      .set({ usage: { [monthKey()]: admin.firestore.FieldValue.increment(1) } }, { merge: true });

    const church = (await db.collection("churches").doc(churchId).get()).data();
    await admin.messaging().send({
      topic: `church_${churchId}`,
      notification: {
        title: church?.name ? `${church.name}: ${data.title}` : data.title,
        body: String(data.body).slice(0, 180),
      },
      data: { type: "post", churchId, postId: event.params.postId },
    });
  },
);

// ---------------------------------------------------------------------------
// Fase 3: push ao marcar evento.
// ---------------------------------------------------------------------------
exports.notifyNewEvent = onDocumentCreated(
  "churches/{churchId}/events/{eventId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const { churchId } = event.params;
    const church = (await db.collection("churches").doc(churchId).get()).data();
    const when = data.startsAt?.toDate?.();
    const whenText = when
      ? when.toLocaleString("pt-BR", { timeZone: "America/Recife", dateStyle: "short", timeStyle: "short" })
      : "";
    await admin.messaging().send({
      topic: `church_${churchId}`,
      notification: {
        title: church?.name ? `${church.name}: ${data.title}` : data.title,
        body: whenText ? `Marcado para ${whenText}` : "Novo evento na agenda",
      },
      data: { type: "event", churchId, eventId: event.params.eventId },
    });
  },
);

// ---------------------------------------------------------------------------
// Fase 4: Pix do dízimo via Mercado Pago (sandbox).
//
// Limitação documentada: a API de pagamentos do Mercado Pago credita o Pix
// na conta dona do access token (a plataforma), não numa chave Pix externa.
// O sandbox não permite destino direto. Por isso o lançamento recebe
// `settlement: 'repasse_manual'` e a igreja recebe por repasse. Não há split
// nem taxa inventada: o valor integral é devido à igreja.
// ---------------------------------------------------------------------------
exports.createGiftPix = onCall({ secrets: [MP_ACCESS_TOKEN] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre para contribuir.");
  const { churchId, amountCents, kind } = request.data ?? {};
  if (!churchId || !Number.isInteger(amountCents) || amountCents < 100) {
    throw new HttpsError("invalid-argument", "Valor mínimo de R$ 1,00.");
  }
  const member = await db.collection("churches").doc(churchId).collection("members").doc(uid).get();
  if (!member.exists) throw new HttpsError("permission-denied", "Você não é membro desta igreja.");
  const church = (await db.collection("churches").doc(churchId).get()).data();
  if (!church?.pixKey) throw new HttpsError("failed-precondition", "A igreja ainda não cadastrou a chave Pix.");

  const giftRef = db.collection("churches").doc(churchId).collection("gifts").doc();
  const payer = (await admin.auth().getUser(uid)).email || `${uid}@altar.app`;

  const payment = await mp.createPixPayment({
    accessToken: MP_ACCESS_TOKEN.value(),
    amountCents,
    description: `${kind === "oferta" ? "Oferta" : "Dízimo"} - ${church.name}`,
    payerEmail: payer,
    externalReference: `${churchId}:${giftRef.id}`,
  });

  await giftRef.set({
    churchId,
    uid,
    kind: kind === "oferta" ? "oferta" : "dizimo",
    amountCents,
    method: "pix",
    status: "pendente",
    settlement: "repasse_manual",
    externalId: String(payment.id),
    pixCopiaECola: payment.pixCopiaECola,
    qrCodeBase64: payment.qrCodeBase64,
    expiresAt: payment.expiresAt ? admin.firestore.Timestamp.fromDate(new Date(payment.expiresAt)) : null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { giftId: giftRef.id, pixCopiaECola: payment.pixCopiaECola, qrCodeBase64: payment.qrCodeBase64 };
});

// Webhook do Mercado Pago: pagamentos (dízimo) e assinaturas (mensalidade).
exports.mpWebhook = onRequest({ secrets: [MP_ACCESS_TOKEN] }, async (req, res) => {
  try {
    const type = req.body?.type ?? req.query?.type;
    const id = req.body?.data?.id ?? req.query?.["data.id"] ?? req.query?.id;
    if (!id) {
      res.status(200).send("ignored");
      return;
    }
    const token = MP_ACCESS_TOKEN.value();
    if (type === "payment") {
      const p = await mp.getPayment({ accessToken: token, paymentId: id });
      const [churchId, giftId] = String(p.external_reference ?? "").split(":");
      if (churchId && giftId) {
        const status = mp.mapPaymentStatus(p.status);
        await db.collection("churches").doc(churchId).collection("gifts").doc(giftId).set(
          { status, mpStatus: p.status, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
    } else if (type === "subscription_preapproval" || type === "preapproval") {
      const s = await mp.getPreapproval({ accessToken: token, preapprovalId: id });
      const churchId = s.external_reference;
      if (churchId) await applySubscription(churchId, s);
    }
    res.status(200).send("ok");
  } catch (e) {
    console.error("mpWebhook", e);
    res.status(500).send("error");
  }
});

// ---------------------------------------------------------------------------
// Fase 9: mensalidade da igreja.
// ---------------------------------------------------------------------------
exports.createSubscriptionCheckout = onCall({ secrets: [MP_ACCESS_TOKEN] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre para assinar.");
  const { churchId, plan, backUrl } = request.data ?? {};
  if (!PLANS[plan] || plan === "trial") throw new HttpsError("invalid-argument", "Plano inválido.");
  const member = await db.collection("churches").doc(churchId).collection("members").doc(uid).get();
  if (member.data()?.role !== "churchAdmin") {
    throw new HttpsError("permission-denied", "Só o administrador assina o plano.");
  }
  const payer = (await admin.auth().getUser(uid)).email;
  const sub = await mp.createPreapproval({
    accessToken: MP_ACCESS_TOKEN.value(),
    reason: `Altar - plano ${plan}`,
    amountCents: PLANS[plan].priceCents,
    payerEmail: payer,
    externalReference: churchId,
    backUrl: backUrl || "https://altar.app/assinatura",
  });
  await db.collection("billing").doc(churchId).set(
    {
      mpSubscriptionId: String(sub.id),
      plan,
      status: "pending",
      initPoint: sub.init_point,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { checkoutUrl: sub.init_point, subscriptionId: String(sub.id) };
});

async function applySubscription(churchId, s) {
  const billing = (await db.collection("billing").doc(churchId).get()).data() ?? {};
  const plan = billing.plan ?? s.reason?.split("plano ")[1] ?? "essencial";
  const status = mp.mapPreapprovalStatus(s.status);
  const periodEnd = s.next_payment_date ? new Date(s.next_payment_date) : null;
  const batch = db.batch();
  batch.set(
    db.collection("billing").doc(churchId),
    {
      mpSubscriptionId: String(s.id),
      plan,
      status,
      currentPeriodEnd: periodEnd ? admin.firestore.Timestamp.fromDate(periodEnd) : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  const planStatus = status === "active" ? "active" : status === "past_due" ? "past_due" : "canceled";
  const graceUntil = periodEnd ? new Date(periodEnd.getTime() + GRACE_DAYS * 86400000) : null;
  batch.set(
    db.collection("churches").doc(churchId),
    {
      plan: status === "canceled" ? "none" : plan,
      planStatus,
      memberLimit: PLANS[plan]?.memberLimit ?? 30,
      currentPeriodEnd: periodEnd ? admin.firestore.Timestamp.fromDate(periodEnd) : null,
      graceUntil: graceUntil ? admin.firestore.Timestamp.fromDate(graceUntil) : null,
    },
    { merge: true },
  );
  await batch.commit();
}

// Todo dia: trial vencido vira somente leitura; past_due além da tolerância
// também. O fiel continua no versículo; só o painel trava.
exports.expireTrials = onSchedule("every day 03:00", async () => {
  const now = admin.firestore.Timestamp.now();
  const trials = await db
    .collection("churches")
    .where("plan", "==", "trial")
    .where("planStatus", "==", "active")
    .where("trialEndsAt", "<", now)
    .get();
  const batch = db.batch();
  trials.forEach((d) => batch.update(d.ref, { planStatus: "expired" }));
  const late = await db
    .collection("churches")
    .where("planStatus", "==", "past_due")
    .where("graceUntil", "<", now)
    .get();
  late.forEach((d) => batch.update(d.ref, { planStatus: "expired" }));
  await batch.commit();
  console.log(`expireTrials: ${trials.size} trials, ${late.size} atrasados`);
});

// ---------------------------------------------------------------------------
// Fase 10: exclusão de conta. O app grava deletionRequests/{uid}; a função
// apaga os dados pessoais e a conta. Dízimos ficam anonimizados porque são
// registro financeiro da igreja.
// ---------------------------------------------------------------------------
exports.deleteUserData = onDocumentCreated("deletionRequests/{uid}", async (event) => {
  const { uid } = event.params;
  const userRef = db.collection("users").doc(uid);
  const user = (await userRef.get()).data();

  for (const sub of ["pointsLog", "quizResults"]) {
    const docs = await userRef.collection(sub).get();
    const batch = db.batch();
    docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  if (user?.churchId) {
    await db.collection("churches").doc(user.churchId).collection("members").doc(uid).delete().catch(() => {});
    const gifts = await db.collection("churches").doc(user.churchId).collection("gifts").where("uid", "==", uid).get();
    const batch = db.batch();
    gifts.forEach((d) => batch.update(d.ref, { uid: "anon", anonymized: true }));
    await batch.commit();
    const prayers = await db.collection("churches").doc(user.churchId).collection("posts").where("authorId", "==", uid).where("type", "==", "oracao").get();
    const b2 = db.batch();
    prayers.forEach((d) => b2.delete(d.ref));
    await b2.commit();
  }
  if (user?.referralCode) {
    await db.collection("referralCodes").doc(user.referralCode).delete().catch(() => {});
  }
  await db.collection("referrals").doc(uid).delete().catch(() => {});
  await userRef.delete();
  await admin.auth().deleteUser(uid).catch((e) => console.warn("auth delete", e.message));
  await event.data.ref.set({ status: "done", doneAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
});
