import { localPaymentStatus, mercadoPagoOrders, mercadoPagoPayments } from "@/lib/server/mercado-pago";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type MercadoPagoOrder = { id?: string; external_reference?: string; status?: string; status_detail?: string; total_amount?: string; total_paid_amount?: string; transactions?: { payments?: Array<{ id?: string; status?: string; status_detail?: string; amount?: string; paid_amount?: string }> } };

/** Sincroniza via Payments API v1 (usado pelo novo fluxo Pix) */
export async function synchronizeMercadoPagoPayment(providerPaymentId: string, eventId: string) {
  const payment = await mercadoPagoPayments.get({ id: Number(providerPaymentId) });
  const status = localPaymentStatus(payment.status ?? undefined, payment.status_detail ?? undefined);
  const externalReference = payment.external_reference;
  const amount = Number(payment.transaction_amount ?? payment.transaction_details?.net_received_amount ?? 0);
  if (!externalReference || !Number.isFinite(amount) || amount <= 0) throw new Error("Resposta inválida do Mercado Pago");
  const { data, error } = await supabaseAdmin.rpc("finalize_mercado_pago_payment", {
    p_event_id: eventId,
    p_provider_order_id: null,
    p_provider_payment_id: String(payment.id),
    p_external_reference: externalReference,
    p_status: status,
    p_status_detail: payment.status_detail ?? null,
    p_amount: amount,
  });
  if (error) throw new Error(error.message);
  return { status, result: data as string };
}

/**
 * Reconciles one pending Pix after a missed or delayed webhook. The event ID
 * includes the provider status so a later transition (for example, pending to
 * approved) is still processed while repeat checks remain idempotent.
 */
export async function reconcileMercadoPagoPayment(providerPaymentId: string) {
  const payment = await mercadoPagoPayments.get({ id: Number(providerPaymentId) });
  const status = localPaymentStatus(payment.status ?? undefined, payment.status_detail ?? undefined);
  const externalReference = payment.external_reference;
  const amount = Number(payment.transaction_amount ?? payment.transaction_details?.net_received_amount ?? 0);
  if (!externalReference || !Number.isFinite(amount) || amount <= 0) throw new Error("Resposta invÃ¡lida do Mercado Pago");

  const { data, error } = await supabaseAdmin.rpc("finalize_mercado_pago_payment", {
    p_event_id: `reconcile:${providerPaymentId}:${payment.status ?? "unknown"}:${payment.status_detail ?? ""}`,
    p_provider_order_id: null,
    p_provider_payment_id: String(payment.id),
    p_external_reference: externalReference,
    p_status: status,
    p_status_detail: payment.status_detail ?? null,
    p_amount: amount,
  });
  if (error) throw new Error(error.message);
  return { status, result: data as string };
}

/** Sincroniza via Orders API v2 (fluxo legado) */
export async function synchronizeMercadoPagoOrder(providerOrderId: string, eventId: string) {
  const providerOrder = (await mercadoPagoOrders.get({ id: providerOrderId })) as MercadoPagoOrder;
  const transaction = providerOrder.transactions?.payments?.[0];
  const status = localPaymentStatus(transaction?.status ?? providerOrder.status, transaction?.status_detail ?? providerOrder.status_detail);
  const externalReference = providerOrder.external_reference;
  const amount = Number(transaction?.amount ?? transaction?.paid_amount ?? providerOrder.total_amount ?? providerOrder.total_paid_amount);
  if (!externalReference || !Number.isFinite(amount) || amount <= 0) throw new Error("Resposta inválida do Mercado Pago");
  const { data, error } = await supabaseAdmin.rpc("finalize_mercado_pago_payment", {
    p_event_id: eventId, p_provider_order_id: providerOrder.id ?? providerOrderId,
    p_provider_payment_id: transaction?.id ?? null, p_external_reference: externalReference,
    p_status: status, p_status_detail: transaction?.status_detail ?? providerOrder.status_detail ?? null, p_amount: amount,
  });
  if (error) throw new Error(error.message);
  return { status, result: data as string };
}
