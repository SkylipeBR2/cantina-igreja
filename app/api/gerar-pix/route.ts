import { NextRequest, NextResponse } from "next/server";
import { mercadoPagoPayments } from "@/lib/server/mercado-pago";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { isUuid, readJsonBody, rejectCrossSiteRequest, rejectRateLimitedRequest } from "@/lib/server/request-security";

export async function POST(req: NextRequest) {
  const originError = rejectCrossSiteRequest(req);
  if (originError) return originError;
  const rateLimitError = rejectRateLimitedRequest(req, "generate-pix", 6, 60_000);
  if (rateLimitError) return rateLimitError;

  try {
    const { id_pedido, trackingToken, emailCliente } = await readJsonBody<{ id_pedido?: unknown; trackingToken?: unknown; emailCliente?: unknown }>(req);
    if (!isUuid(id_pedido) || !isUuid(trackingToken) || (emailCliente !== undefined && (typeof emailCliente !== "string" || emailCliente.length > 254))) {
      return NextResponse.json({ erro: "Dados do pagamento inválidos" }, { status: 400 });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, total_amount, status, payment_status, payment_method")
      .eq("id", id_pedido)
      .eq("tracking_token", trackingToken)
      .single();
    if (orderError || !order || order.status !== "pending_payment" || order.payment_status !== "pending") throw new Error("Pedido indisponível para pagamento");
    if (order.payment_method !== "pix") throw new Error("Pedido não usa Pix");

    // Mercado Pago only accepts a test buyer e-mail when test credentials are in use.
    // Keep this opt-in so production continues to use the customer's e-mail.
    const payerEmail = process.env.MERCADOPAGO_TEST_PIX_PAYER_EMAIL || emailCliente || "cliente@cantina.com";
    const { data: expired, error: expirationError } = await supabaseAdmin.rpc("expire_order_if_due", { p_order_id: id_pedido });
    if (expirationError) throw expirationError;
    if (expired) return NextResponse.json({ erro: "O prazo de pagamento expirou. Faca um novo pedido." }, { status: 409 });
    const { data: paymentExpiresAt, error: paymentWindowError } = await supabaseAdmin.rpc("begin_pix_payment_window", { p_order_id: id_pedido });
    if (paymentWindowError || !paymentExpiresAt) throw paymentWindowError ?? new Error("Nao foi possivel iniciar o prazo do Pix");
    const expirationDate = new Date(paymentExpiresAt);
    if (Number.isNaN(expirationDate.getTime())) throw new Error("Prazo de pagamento invalido");
    const paymentExpiration = expirationDate.toISOString();
    const { data: attempts, error: attemptError } = await supabaseAdmin.rpc("begin_payment_attempt", {
      p_order_id: id_pedido, p_tracking_token: trackingToken, p_payment_method: "pix",
    });
    const attempt = Array.isArray(attempts) ? attempts[0] : null;
    if (attemptError || !attempt?.idempotency_key) throw attemptError ?? new Error("Nao foi possivel iniciar pagamento");
    const idempotencyKey = String(attempt.idempotency_key);
    const response = await mercadoPagoPayments.create({
      body: { transaction_amount: parseFloat(Number(attempt.amount).toFixed(2)), payment_method_id: "pix", payer: { email: payerEmail }, external_reference: id_pedido, description: "Cantina PIB", date_of_expiration: paymentExpiration },
      requestOptions: { idempotencyKey },
    });
    if (!response.id) throw new Error("Mercado Pago nao retornou o pagamento");
    const { error: paymentError } = await supabaseAdmin.from("payments").update({ provider_payment_id: String(response.id) }).eq("idempotency_key", idempotencyKey);
    if (paymentError) throw paymentError;
    const qrData = response.point_of_interaction?.transaction_data;
    return NextResponse.json({ sucesso: true, copiaECola: qrData?.qr_code, qrCode: qrData?.qr_code_base64, paymentExpiresAt });
  } catch (error) {
    console.error("Erro ao gerar Pix:", error);
    return NextResponse.json({ erro: "Falha ao gerar pagamento" }, { status: 500 });
  }
}
