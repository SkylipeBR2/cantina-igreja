import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/request-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { rejectRateLimitedRequest } from "@/lib/server/request-security";

export async function GET(request: NextRequest) {
  const rateLimitError = rejectRateLimitedRequest(request, "cashier-catalog", 120, 60_000);
  if (rateLimitError) return rateLimitError;
  const staff = await requireStaff(request);
  if (!staff || !["admin", "manager", "cashier"].includes(staff.role)) {
    return NextResponse.json({ erro: "Acesso não autorizado" }, { status: 401 });
  }
  const { data, error } = await supabaseAdmin.from("items").select("id, name, price, stock_quantity").order("name");
  if (error) return NextResponse.json({ erro: "Não foi possível carregar os itens" }, { status: 500 });
  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "no-store" } });
}
