import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/request-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { isUuid, readJsonBody, rejectCrossSiteRequest, rejectRateLimitedRequest } from "@/lib/server/request-security";

async function requireAdmin(request: NextRequest) {
  const staff = await requireStaff(request);
  return staff && ["admin", "manager"].includes(staff.role) ? staff : null;
}

export async function GET(request: NextRequest) {
  const staff = await requireAdmin(request);
  if (!staff) return NextResponse.json({ erro: "Acesso não autorizado" }, { status: 401 });
  const { data, error } = await supabaseAdmin.from("items").select("id, name, price, stock_quantity").order("name");
  if (error) return NextResponse.json({ erro: "Não foi possível carregar os itens" }, { status: 500 });
  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const originError = rejectCrossSiteRequest(request);
  if (originError) return originError;
  const rateLimitError = rejectRateLimitedRequest(request, "admin-items", 60, 60_000);
  if (rateLimitError) return rateLimitError;
  const staff = await requireAdmin(request);
  if (!staff) return NextResponse.json({ erro: "Acesso não autorizado" }, { status: 401 });
  try {
    const { name, price, stockQuantity } = await readJsonBody<{ name?: unknown; price?: unknown; stockQuantity?: unknown }>(request);
    if (typeof name !== "string" || !name.trim() || name.length > 120 || !Number.isFinite(price) || Number(price) <= 0 || Number(price) > 100_000 || !Number.isInteger(stockQuantity) || Number(stockQuantity) < 0 || Number(stockQuantity) > 100_000) {
      return NextResponse.json({ erro: "Dados do item inválidos" }, { status: 400 });
    }
    const { error } = await supabaseAdmin.from("items").insert({ name: name.trim(), price, stock_quantity: stockQuantity });
    if (error) return NextResponse.json({ erro: "Não foi possível cadastrar o item" }, { status: 409 });
    return NextResponse.json({ sucesso: true }, { status: 201 });
  } catch {
    return NextResponse.json({ erro: "Dados do item inválidos" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const originError = rejectCrossSiteRequest(request);
  if (originError) return originError;
  const rateLimitError = rejectRateLimitedRequest(request, "admin-items", 60, 60_000);
  if (rateLimitError) return rateLimitError;
  const staff = await requireAdmin(request);
  if (!staff) return NextResponse.json({ erro: "Acesso não autorizado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ erro: "Item inválido" }, { status: 400 });
  const { error } = await supabaseAdmin.from("items").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: "Não foi possível excluir o item com vendas registradas" }, { status: 409 });
  return NextResponse.json({ sucesso: true });
}

export async function PATCH(request: NextRequest) {
  const originError = rejectCrossSiteRequest(request);
  if (originError) return originError;
  const rateLimitError = rejectRateLimitedRequest(request, "admin-items", 60, 60_000);
  if (rateLimitError) return rateLimitError;
  const staff = await requireAdmin(request);
  if (!staff) return NextResponse.json({ erro: "Acesso não autorizado" }, { status: 401 });
  try {
    const { id, name, price, stockQuantity } = await readJsonBody<{ id?: unknown; name?: unknown; price?: unknown; stockQuantity?: unknown }>(request);
    if (!isUuid(id) || typeof name !== "string" || !name.trim() || name.length > 120 || !Number.isFinite(price) || Number(price) <= 0 || Number(price) > 100_000 || !Number.isInteger(stockQuantity) || Number(stockQuantity) < 0 || Number(stockQuantity) > 100_000) {
      return NextResponse.json({ erro: "Dados do item inválidos" }, { status: 400 });
    }
    const { error } = await supabaseAdmin.from("items").update({ name: name.trim(), price, stock_quantity: stockQuantity }).eq("id", id);
    if (error) return NextResponse.json({ erro: "Não foi possível atualizar o item" }, { status: 409 });
    return NextResponse.json({ sucesso: true });
  } catch { return NextResponse.json({ erro: "Dados do item inválidos" }, { status: 400 }); }
}
