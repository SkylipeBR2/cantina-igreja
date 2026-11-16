import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/request-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { isUuid, readJsonBody, rejectCrossSiteRequest, rejectRateLimitedRequest } from "@/lib/server/request-security";

export async function POST(request: NextRequest) {
  const originError = rejectCrossSiteRequest(request);
  if (originError) return originError;
  const rateLimitError = rejectRateLimitedRequest(request, "cashier-checkout", 30, 60_000);
  if (rateLimitError) return rateLimitError;
  const staff = await requireStaff(request);
  if (!staff || !["admin", "manager", "cashier", "cantina"].includes(staff.role)) {
    return NextResponse.json({ erro: "Acesso não autorizado" }, { status: 401 });
  }

  try {
    const { items, customerName, paymentMethod, notes } = await readJsonBody<{
      items?: Array<{ id?: unknown; quantity?: unknown }>;
      customerName?: unknown;
      paymentMethod?: unknown;
      notes?: unknown;
    }>(request);
    if (!Array.isArray(items) || items.length === 0 || items.length > 25 || items.some((item) => !isUuid(item.id) || !Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 50) || typeof customerName !== "string" || !customerName.trim() || customerName.length > 120 || !["dinheiro", "pix", "cartao"].includes(String(paymentMethod)) || (notes !== undefined && (typeof notes !== "string" || notes.length > 500))) {
      return NextResponse.json({ erro: "Dados do pedido inválidos" }, { status: 400 });
    }

    // The database validates prices/stock and records the external payment and
    // notes in one transaction, before the order becomes visible to the kitchen.
    const { data, error } = await supabaseAdmin.rpc("create_cashier_order", {
      p_items: items.map((item) => ({ item_id: item.id, quantity: item.quantity })),
      p_customer_name: customerName.trim(),
      p_payment_method: paymentMethod,
      p_notes: typeof notes === "string" ? notes.trim() : null,
    });
    if (error || !data?.order_id) throw error ?? new Error("Pedido não criado");
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ erro: error instanceof Error ? error.message : "Não foi possível finalizar o pedido" }, { status: 400 });
  }
}
