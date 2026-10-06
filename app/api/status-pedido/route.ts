import { NextRequest, NextResponse } from "next/server";
import { reconcileMercadoPagoPayment } from "@/lib/server/payment-sync";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { requireTotem } from "@/lib/server/request-auth";
import { rejectRateLimitedRequest } from "@/lib/server/request-security";

const reconciliationCooldowns = new Map<string, number>();
const RECONCILIATION_INTERVAL_MS = 15_000;

function mayReconcile(providerPaymentId: string) {
  const now = Date.now();
  const nextAttemptAt = reconciliationCooldowns.get(providerPaymentId) ?? 0;
  if (nextAttemptAt > now) return false;
  reconciliationCooldowns.set(providerPaymentId, now + RECONCILIATION_INTERVAL_MS);
  return true;
}

export async function GET(request: NextRequest) {
  const rateLimitError = rejectRateLimitedRequest(request, "order-status-public", 45, 60_000);
  if (rateLimitError) return rateLimitError;
  if (!await requireTotem(request)) return NextResponse.json({ erro: "Acesso não autorizado" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const token = searchParams.get("token");
  if (!id || !token) return NextResponse.json({ erro: "Pedido invalido" }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("orders").select("status, payment_status").eq("id", id).eq("tracking_token", token).single();
  if (error || !data) return NextResponse.json({ erro: "Pedido nao encontrado" }, { status: 404 });
  if (data.status === "pending_payment" && data.payment_status === "pending") {
    const { error: expirationError } = await supabaseAdmin.rpc("expire_order_if_due", { p_order_id: id });
    if (expirationError) return NextResponse.json({ erro: "Nao foi possivel verificar o prazo do pedido" }, { status: 500 });

    const { data: claimedPaymentId, error: claimError } = await supabaseAdmin.rpc("claim_pending_payment_reconciliation", { p_order_id: id });
    let providerPaymentId = claimedPaymentId;

    if (claimError) {
      // Keep reconciliation available while a deployment is catching up with
      // the database migration. The in-memory cooldown below avoids a call to
      // Mercado Pago on every browser poll in that short window.
      console.error("Funcao de controle de reconciliacao indisponivel:", claimError);
      const { data: payment, error: paymentError } = await supabaseAdmin
        .from("payments")
        .select("provider_payment_id")
        .eq("order_id", id)
        .eq("status", "pending")
        .not("provider_payment_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (paymentError) console.error("Erro ao localizar pagamento pendente:", paymentError);
      providerPaymentId = payment?.provider_payment_id ?? null;
    }

    if (providerPaymentId && mayReconcile(providerPaymentId)) {
      try {
        await reconcileMercadoPagoPayment(providerPaymentId);
      } catch (error) {
        // The normal webhook remains the primary path. A later status poll can
        // retry reconciliation if the provider is temporarily unavailable.
        console.error("Erro ao reconciliar pagamento pendente:", error);
      }
    }
  }
  const { data: order, error: orderError } = await supabaseAdmin.from("orders").select("status, payment_status, status_preparo, order_number, payment_expires_at").eq("id", id).eq("tracking_token", token).single();
  if (orderError || !order) return NextResponse.json({ erro: "Pedido nao encontrado" }, { status: 404 });
  return NextResponse.json({ ...order, status_pagamento: order.payment_status === "approved" ? "pago" : order.payment_status === "rejected" ? "recusado" : order.payment_status === "expired" ? "expirado" : "aguardando" });
}
