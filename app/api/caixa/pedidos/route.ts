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
  if (!staff || !["admin", "manager", "cashier"].includes(staff.role)) {
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

    const ids = items.map((item) => item.id);
    const { data: catalog, error: catalogError } = await supabaseAdmin.from("items").select("id, price, stock_quantity").in("id", ids);
    if (catalogError || !catalog || catalog.length !== items.length) throw new Error("Item indisponível");
    const catalogById = new Map(catalog.map((item) => [item.id, item]));
    const orderItems = items.map((item) => {
      const catalogItem = catalogById.get(item.id as string);
      if (!catalogItem || catalogItem.stock_quantity < Number(item.quantity)) throw new Error("Estoque insuficiente");
      return { item_id: catalogItem.id, quantity: Number(item.quantity), price: Number(catalogItem.price) };
    });
    const total = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const { data, error } = await supabaseAdmin.rpc("process_order", {
      p_items: orderItems,
      p_customer_name: customerName.trim(),
      p_payment_method: paymentMethod,
      p_total_amount: total,
    });
    if (error || !data?.order_id) throw error ?? new Error("Pedido não criado");
    if (typeof notes === "string" && notes.trim()) await supabaseAdmin.from("orders").update({ notes: notes.trim() }).eq("id", data.order_id);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ erro: error instanceof Error ? error.message : "Não foi possível finalizar o pedido" }, { status: 400 });
  }
}
