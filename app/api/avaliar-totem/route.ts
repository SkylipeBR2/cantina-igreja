import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { isUuid, readJsonBody, rejectCrossSiteRequest, rejectRateLimitedRequest } from "@/lib/server/request-security";

export async function POST(request: NextRequest) {
  const originError = rejectCrossSiteRequest(request);
  if (originError) return originError;
  const rateLimitError = rejectRateLimitedRequest(request, "rate-totem", 60, 60_000);
  if (rateLimitError) return rateLimitError;

  let body: { id_pedido?: unknown; trackingToken?: unknown; nota?: unknown };
  try {
    const parsed = await readJsonBody<unknown>(request);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Corpo inválido");
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ erro: "Avaliação inválida." }, { status: 400 });
  }

  const { id_pedido, trackingToken, nota } = body;
  if (!isUuid(id_pedido) || !isUuid(trackingToken) || !Number.isInteger(nota) || Number(nota) < 1 || Number(nota) > 5) {
    return NextResponse.json({ erro: "Escolha uma nota de 1 a 5." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("orders")
    .update({ totem_rating: nota as number, totem_rated_at: new Date().toISOString() })
    .eq("id", id_pedido)
    .eq("tracking_token", trackingToken)
    .eq("payment_status", "approved")
    .is("totem_rating", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Falha ao salvar avaliação do totem:", error);
    return NextResponse.json({ erro: "Não foi possível salvar sua avaliação. Tente novamente." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ erro: "Esta avaliação já foi registrada ou o pedido ainda não foi confirmado." }, { status: 409 });
  }

  return NextResponse.json({ sucesso: true });
}
