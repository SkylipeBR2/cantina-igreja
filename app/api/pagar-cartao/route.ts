import { NextRequest, NextResponse } from "next/server";
import { asMoney, mercadoPagoOrders } from "@/lib/server/mercado-pago";
import { synchronizeMercadoPagoOrder } from "@/lib/server/payment-sync";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { requireTotem } from "@/lib/server/request-auth";
import { isUuid, readJsonBody, rejectCrossSiteRequest, rejectRateLimitedRequest } from "@/lib/server/request-security";

export async function POST(req: NextRequest) {
  const originError = rejectCrossSiteRequest(req);
  if (originError) return originError;
  const rateLimitError = rejectRateLimitedRequest(req, "pay-card", 5, 10 * 60_000);
  if (rateLimitError) return rateLimitError;
  if (!await requireTotem(req)) return NextResponse.json({ erro: "Acesso não autorizado" }, { status: 401 });
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()) {
    console.error("MERCADOPAGO_ACCESS_TOKEN ausente no servidor");
    return NextResponse.json({ erro: "Pagamento indisponível no momento. Avise a equipe." }, { status: 503 });
  }

  try {
    const { token, payment_method_id, issuer_id, installments, payer, id_pedido, trackingToken } = await readJsonBody<Record<string, unknown>>(req);
    const payerData = payer && typeof payer === "object" ? payer as Record<string, unknown> : {};
    const identification = payerData.identification && typeof payerData.identification === "object" ? payerData.identification as Record<string, unknown> : {};
    const email = payerData.email;
    const documentType = identification.type;
    const sanitizedDocument = typeof identification.number === "string" ? identification.number.replace(/\D/g, "") : "";
    if (!isUuid(id_pedido) || !isUuid(trackingToken) || typeof token !== "string" || token.length < 16 || token.length > 512 || typeof payment_method_id !== "string" || !/^[a-z0-9_-]{1,40}$/i.test(payment_method_id) || (issuer_id !== undefined && issuer_id !== null && (typeof issuer_id !== "string" || issuer_id.length > 40)) || !Number.isInteger(installments) || Number(installments) < 1 || Number(installments) > 12 || typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || documentType !== "CPF" || sanitizedDocument.length !== 11) return NextResponse.json({ erro: "Dados do cartão inválidos" }, { status: 400 });
    const { data: order, error: orderError } = await supabaseAdmin.from("orders").select("total_amount, status, payment_status, payment_method").eq("id", id_pedido).eq("tracking_token", trackingToken).single();
    if (orderError || !order || order.status !== "pending_payment" || order.payment_status !== "pending" || order.payment_method !== "cartao") throw new Error("Pedido indisponível para pagamento");
    const { data: expired, error: expirationError } = await supabaseAdmin.rpc("expire_order_if_due", { p_order_id: id_pedido });
    if (expirationError) throw expirationError;
    if (expired) return NextResponse.json({ erro: "O prazo de pagamento expirou. Faca um novo pedido." }, { status: 409 });
    const { data: attempts, error: attemptError } = await supabaseAdmin.rpc("begin_payment_attempt", {
      p_order_id: id_pedido, p_tracking_token: trackingToken, p_payment_method: "cartao",
    });
    const attempt = Array.isArray(attempts) ? attempts[0] : null;
    if (attemptError || !attempt?.idempotency_key) throw attemptError ?? new Error("Nao foi possivel iniciar pagamento");
    const idempotencyKey = String(attempt.idempotency_key);
    const response = await mercadoPagoOrders.create({
      body: { type: "online", processing_mode: "automatic", external_reference: id_pedido, total_amount: asMoney(Number(attempt.amount)), transactions: { payments: [{ amount: asMoney(Number(attempt.amount)), payment_method: { id: payment_method_id, type: "credit_card", token, installments: Number(installments), ...(typeof issuer_id === "string" ? { issuer_id } : {}) } }] }, payer: { email, identification: { type: "CPF", number: sanitizedDocument } } },
      requestOptions: { idempotencyKey },
    });
    if (!response.id) throw new Error("Mercado Pago não retornou a order");
    const { error: paymentError } = await supabaseAdmin.from("payments").update({ provider_order_id: response.id, provider_payment_id: response.transactions?.payments?.[0]?.id ?? null }).eq("idempotency_key", idempotencyKey);
    if (paymentError) throw paymentError;
    // This is a server-to-server verification of the provider response. The UI
    // still relies on the persisted state, which is also reconciled by webhook.
    const result = await synchronizeMercadoPagoOrder(response.id, `server:${response.id}`);
    if (result.status === "rejected") return NextResponse.json({ erro: "Pagamento recusado. Tente outro cartão." }, { status: 422 });
    return NextResponse.json({ sucesso: true, status: result.status });
  } catch (error) {
    console.error("Erro ao pagar com cartão:", error);
    return NextResponse.json({ erro: "Falha ao processar pagamento" }, { status: 500 });
  }
}
