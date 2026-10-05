import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/request-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { isUuid, readJsonBody, rejectCrossSiteRequest, rejectRateLimitedRequest } from "@/lib/server/request-security";

export async function POST(request: NextRequest) {
  const originError = rejectCrossSiteRequest(request);
  if (originError) return originError;
  const rateLimitError = rejectRateLimitedRequest(request, "cancel-order", 20, 60_000);
  if (rateLimitError) return rateLimitError;
  const staff = await requireStaff(request);
  if (!staff || !["admin", "manager"].includes(staff.role)) {
    return NextResponse.json({ erro: "Acesso não autorizado" }, { status: 401 });
  }

  try {
    const { orderId } = await readJsonBody<{ orderId?: unknown }>(request);
    if (!isUuid(orderId)) {
      return NextResponse.json({ erro: "ID do pedido não fornecido" }, { status: 400 });
    }
    // This RPC locks order and reservations, preventing duplicate stock releases.
    const { error } = await supabaseAdmin.rpc("cancel_unpaid_order", {
      p_order_id: orderId,
      p_actor_id: staff.id,
    });
    if (error) return NextResponse.json({ erro: error.message }, { status: 409 });
    return NextResponse.json({ sucesso: true });
  } catch {
    return NextResponse.json({ erro: "Dados de pedido inválidos" }, { status: 400 });
  }
}
