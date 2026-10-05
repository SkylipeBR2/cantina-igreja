import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/request-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { rejectRateLimitedRequest } from "@/lib/server/request-security";

export async function GET(request: NextRequest) {
  const rateLimitError = rejectRateLimitedRequest(request, "admin-orders", 120, 60_000);
  if (rateLimitError) return rateLimitError;
  const staff = await requireStaff(request);
  if (!staff || !["admin", "manager"].includes(staff.role)) return NextResponse.json({ erro: "Acesso não autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("from");
  const dateTo = searchParams.get("to");
  const paymentMethod = searchParams.get("paymentMethod");
  let query = supabaseAdmin
    .from("orders")
    .select("id, order_number, customer_name, created_at, payment_method, status, status_pagamento, total_amount, order_items(quantity, items(name))")
    .order("created_at", { ascending: false });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  query = query.gte("created_at", dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : today.toISOString());
  if (dateTo) query = query.lte("created_at", new Date(`${dateTo}T23:59:59`).toISOString());
  if (["dinheiro", "pix", "cartao"].includes(paymentMethod ?? "")) query = query.eq("payment_method", paymentMethod);
  const { data, error } = await query;
  if (error) return NextResponse.json({ erro: "Não foi possível carregar as vendas" }, { status: 500 });
  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "no-store" } });
}
