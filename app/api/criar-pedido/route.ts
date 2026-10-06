import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { isUuid, readJsonBody, rejectCrossSiteRequest, rejectRateLimitedRequest } from "@/lib/server/request-security";

export async function POST(request: NextRequest) {
  const originError = rejectCrossSiteRequest(request);
  if (originError) return originError;
  const rateLimitError = rejectRateLimitedRequest(request, "create-order", 10, 60_000);
  if (rateLimitError) return rateLimitError;

  try {
    const { itens, nomeCliente, paymentMethod = "pix", observacao } = await readJsonBody<{
      itens?: Array<{ id?: unknown; quantity?: unknown }>;
      nomeCliente?: unknown;
      paymentMethod?: unknown;
      observacao?: unknown;
    }>(request);
    if (
      !Array.isArray(itens)
      || itens.length === 0
      || itens.length > 25
      || paymentMethod !== "pix"
      || itens.some((item) => !isUuid(item.id) || !Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 50)
      || (nomeCliente != null && (typeof nomeCliente !== "string" || nomeCliente.length > 120))
      || (observacao != null && (typeof observacao !== "string" || observacao.length > 500))
    ) return NextResponse.json({ erro: "Dados do pedido inválidos" }, { status: 400 });

    const { data, error } = await supabaseAdmin.rpc("create_pending_order", {
      p_items: itens.map((item) => ({ item_id: item.id, quantity: item.quantity })),
      p_customer_name: typeof nomeCliente === "string" ? nomeCliente.trim() : "",
      p_payment_method: paymentMethod,
      p_notes: typeof observacao === "string" ? observacao.trim() : "",
    });
    if (error || !data?.[0]) throw error ?? new Error("Pedido nao criado");
    const { data: tracking, error: trackingError } = await supabaseAdmin.from("orders").select("tracking_token, payment_expires_at").eq("id", data[0].id).single();
    if (trackingError || !tracking?.tracking_token) throw trackingError ?? new Error("Token de acompanhamento nao criado");
    return NextResponse.json({ ...data[0], trackingToken: tracking.tracking_token, paymentExpiresAt: tracking.payment_expires_at });
  } catch (error) {
    console.error("Erro ao criar pedido:", error);
    return NextResponse.json({ erro: "Nao foi possivel criar o pedido" }, { status: 400 });
  }
}
