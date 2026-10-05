import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/request-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { rejectRateLimitedRequest } from "@/lib/server/request-security";

export async function GET(request: NextRequest) {
  const rateLimitError = rejectRateLimitedRequest(request, "kitchen-queue", 120, 60_000);
  if (rateLimitError) return rateLimitError;
  const staff = await requireStaff(request);
  if (!staff || !["admin", "manager", "kitchen"].includes(staff.role)) {
    return NextResponse.json({ erro: "Acesso não autorizado" }, { status: 401 });
  }

  const baseFields = "id, order_number, customer_name, created_at, notes, payment_status, status, order_items(id, quantity, items(name))";
  const loadOrders = (fields: string) => supabaseAdmin
    .from("orders")
    .select(fields)
    .in("status", ["paid", "preparando", "pronto"])
    .eq("payment_status", "approved")
    .order("created_at", { ascending: true });

  let { data, error } = await loadOrders(`${baseFields}, status_entrega`);
  if (error?.code === "42703" && error.message.includes("status_entrega")) {
    ({ data, error } = await loadOrders(baseFields));
  }
  if (error) return NextResponse.json({ erro: "Não foi possível carregar os pedidos" }, { status: 500 });
  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "no-store" } });
}
