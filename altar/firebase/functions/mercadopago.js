// Cliente mínimo do Mercado Pago. Sem SDK para manter a dependência pequena.
// Nunca recebe nem guarda dado de cartão: Pix e assinatura via checkout do MP.

const BASE = "https://api.mercadopago.com";

async function call({ accessToken, method, path, body, idempotencyKey }) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Mercado Pago ${res.status}: ${json.message ?? JSON.stringify(json)}`);
  }
  return json;
}

async function createPixPayment({ accessToken, amountCents, description, payerEmail, externalReference }) {
  const p = await call({
    accessToken,
    method: "POST",
    path: "/v1/payments",
    idempotencyKey: externalReference,
    body: {
      transaction_amount: Number((amountCents / 100).toFixed(2)),
      description,
      payment_method_id: "pix",
      external_reference: externalReference,
      payer: { email: payerEmail },
    },
  });
  const tx = p.point_of_interaction?.transaction_data ?? {};
  return {
    id: p.id,
    status: p.status,
    pixCopiaECola: tx.qr_code ?? null,
    qrCodeBase64: tx.qr_code_base64 ?? null,
    expiresAt: p.date_of_expiration ?? null,
  };
}

async function getPayment({ accessToken, paymentId }) {
  return call({ accessToken, method: "GET", path: `/v1/payments/${paymentId}` });
}

function mapPaymentStatus(mpStatus) {
  switch (mpStatus) {
    case "approved":
      return "pago";
    case "cancelled":
    case "expired":
    case "rejected":
      return "expirado";
    default:
      return "pendente";
  }
}

async function createPreapproval({ accessToken, reason, amountCents, payerEmail, externalReference, backUrl }) {
  return call({
    accessToken,
    method: "POST",
    path: "/preapproval",
    body: {
      reason,
      external_reference: externalReference,
      payer_email: payerEmail,
      back_url: backUrl,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: Number((amountCents / 100).toFixed(2)),
        currency_id: "BRL",
      },
      status: "pending",
    },
  });
}

async function getPreapproval({ accessToken, preapprovalId }) {
  return call({ accessToken, method: "GET", path: `/preapproval/${preapprovalId}` });
}

function mapPreapprovalStatus(mpStatus) {
  switch (mpStatus) {
    case "authorized":
      return "active";
    case "paused":
      return "past_due";
    case "cancelled":
      return "canceled";
    default:
      return "pending";
  }
}

module.exports = {
  createPixPayment,
  getPayment,
  mapPaymentStatus,
  createPreapproval,
  getPreapproval,
  mapPreapprovalStatus,
};
