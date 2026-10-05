import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { rejectRateLimitedRequest } from "@/lib/server/request-security";

export async function GET(request: NextRequest) {
  const rateLimitError = rejectRateLimitedRequest(request, "catalog", 120, 60_000);
  if (rateLimitError) return rateLimitError;

  const { data, error } = await supabaseAdmin
    .from("items")
    .select("id, name, price, stock_quantity")
    .gt("stock_quantity", 0)
    .order("name");

  if (error) return NextResponse.json({ erro: "Não foi possível carregar o cardápio" }, { status: 500 });
  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "no-store" } });
}
