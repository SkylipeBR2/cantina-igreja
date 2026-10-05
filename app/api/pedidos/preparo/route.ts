import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/request-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { isUuid, readJsonBody, rejectCrossSiteRequest, rejectRateLimitedRequest } from "@/lib/server/request-security";

export async function POST(request: NextRequest) {
  const originError = rejectCrossSiteRequest(request);
  if (originError) return originError;
  const rateLimitError = rejectRateLimitedRequest(request, "order-preparation", 120, 60_000);
  if (rateLimitError) return rateLimitError;
  const staff = await requireStaff(request);
  if (!staff || !["admin", "manager", "kitchen"].includes(staff.role)) return NextResponse.json({ erro: "Acesso não autorizado" }, { status: 401 });
  try {
    const { orderId, orderItemId } = await readJsonBody<{ orderId?: unknown; orderItemId?: unknown }>(request);
    if (!isUuid(orderId) || !isUuid(orderItemId)) return NextResponse.json({ erro: "Dados do pedido inválidos" }, { status: 400 });
    const { data: order, error } = await supabaseAdmin.from("orders").select("status,payment_status,status_preparo,order_items(id,quantity)").eq("id", orderId).single();
    if (error || !order || order.payment_status !== "approved" || !["paid", "preparando"].includes(order.status)) return NextResponse.json({ erro: "Pedido não está liberado para preparo" }, { status: 409 });
    const items = order.order_items as Array<{ id: string; quantity: number }>;
    const item = items.find((entry) => entry.id === orderItemId);
    if (!item) return NextResponse.json({ erro: "Item não pertence ao pedido" }, { status: 400 });
    const current = typeof order.status_preparo === "string" ? JSON.parse(order.status_preparo) : {};
    const completed = Number(current[orderItemId] ?? 0);
    if (completed >= item.quantity) return NextResponse.json({ sucesso: true, completo: false });
    const next = { ...current, [orderItemId]: completed + 1 };
    if (order.status === "paid") await supabaseAdmin.rpc("transition_order_status", { p_order_id: orderId, p_next_status: "preparando", p_actor_id: staff.id });
    await supabaseAdmin.from("orders").update({ status_preparo: JSON.stringify(next) }).eq("id", orderId);
    const allDone = items.every((entry) => Number(next[entry.id] ?? 0) >= entry.quantity);
    if (allDone) await supabaseAdmin.rpc("transition_order_status", { p_order_id: orderId, p_next_status: "pronto", p_actor_id: staff.id });
    return NextResponse.json({ sucesso: true, completo: allDone, preparo: next });
  } catch { return NextResponse.json({ erro: "Não foi possível registrar o preparo" }, { status: 400 }); }
}
