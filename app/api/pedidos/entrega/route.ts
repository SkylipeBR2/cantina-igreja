import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/request-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { isUuid, readJsonBody, rejectCrossSiteRequest, rejectRateLimitedRequest } from "@/lib/server/request-security";

const DELIVERY_ROLES = new Set(["admin", "manager", "kitchen", "cashier"]);

export async function POST(request: NextRequest) {
  const originError = rejectCrossSiteRequest(request);
  if (originError) return originError;
  const rateLimitError = rejectRateLimitedRequest(request, "order-delivery", 120, 60_000);
  if (rateLimitError) return rateLimitError;
  const staff = await requireStaff(request);
  if (!staff || !DELIVERY_ROLES.has(staff.role)) {
    return NextResponse.json({ erro: "Acesso não autorizado" }, { status: 401 });
  }

  try {
    const { orderId, orderItemId, all } = await readJsonBody<{ orderId?: unknown; orderItemId?: unknown; all?: unknown }>(request);
    if (!isUuid(orderId)) {
      return NextResponse.json({ erro: "Dados da entrega inválidos" }, { status: 400 });
    }

    const result = all === true && orderItemId === undefined
      ? await supabaseAdmin.rpc("complete_order_delivery", { p_order_id: orderId, p_actor_id: staff.id })
      : all === undefined && isUuid(orderItemId)
        ? await supabaseAdmin.rpc("register_order_item_delivery", { p_order_id: orderId, p_order_item_id: orderItemId, p_actor_id: staff.id })
        : null;
    if (!result) return NextResponse.json({ erro: "Dados da entrega inválidos" }, { status: 400 });

    const { data, error } = result;
    if (error) return NextResponse.json({ erro: error.message }, { status: 409 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ erro: "Não foi possível registrar a entrega" }, { status: 400 });
  }
}
