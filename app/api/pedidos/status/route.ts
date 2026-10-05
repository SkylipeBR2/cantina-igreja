import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/request-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { isUuid, readJsonBody, rejectCrossSiteRequest, rejectRateLimitedRequest } from "@/lib/server/request-security";

const ALLOWED_BY_ROLE: Record<string, Set<string>> = {
  admin: new Set(["preparando", "pronto", "entregue", "cancelado"]),
  manager: new Set(["preparando", "pronto", "entregue", "cancelado"]),
  kitchen: new Set(["preparando", "pronto"]),
  cashier: new Set(["entregue"]),
};

export async function POST(request: NextRequest) {
  const originError = rejectCrossSiteRequest(request);
  if (originError) return originError;
  const rateLimitError = rejectRateLimitedRequest(request, "order-status", 60, 60_000);
  if (rateLimitError) return rateLimitError;
  const staff = await requireStaff(request);
  if (!staff) return NextResponse.json({ erro: "Acesso não autorizado" }, { status: 401 });
  try {
    const { orderId, status } = await readJsonBody<{ orderId?: unknown; status?: unknown }>(request);
    if (!isUuid(orderId) || typeof status !== "string" || !ALLOWED_BY_ROLE[staff.role]?.has(status)) {
      return NextResponse.json({ erro: "Transição não permitida" }, { status: 403 });
    }
    const { data, error } = await supabaseAdmin.rpc("transition_order_status", {
      p_order_id: orderId, p_next_status: status, p_actor_id: staff.id,
    });
    if (error) return NextResponse.json({ erro: error.message }, { status: 409 });
    return NextResponse.json({ status: data });
  } catch {
    return NextResponse.json({ erro: "Dados de pedido inválidos" }, { status: 400 });
  }
}
