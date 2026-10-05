import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { synchronizeMercadoPagoPayment, synchronizeMercadoPagoOrder } from "@/lib/server/payment-sync";
import { readJsonBody, rejectRateLimitedRequest } from "@/lib/server/request-security";

function signatureIsValid(xSignature: string | null, xRequestId: string | null, dataId: string | null) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret || !xSignature || !xRequestId || !dataId) return false;
  const parts = Object.fromEntries(xSignature.split(",").map((part) => part.trim().split("=")));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${parts.ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(parts.v1, "hex"), Buffer.from(expected, "hex")); } catch { return false; }
}

export async function POST(req: NextRequest) {
  const rateLimitError = rejectRateLimitedRequest(req, "mercado-pago-webhook", 180, 60_000);
  if (rateLimitError) return rateLimitError;

  try {
    const body = await readJsonBody<{ id?: unknown; action?: unknown; type?: unknown; data?: { id?: unknown } }>(req);
    const dataId = new URL(req.url).searchParams.get("data.id") ?? (typeof body.data?.id === "string" || typeof body.data?.id === "number" ? String(body.data.id) : null);
    if (!signatureIsValid(req.headers.get("x-signature"), req.headers.get("x-request-id"), dataId)) {
      return NextResponse.json({ erro: "Assinatura inválida" }, { status: 401 });
    }

    const eventId = String(body.id ?? `${body.action}:${dataId}`);

    if (body.type === "payment" && dataId) {
      // Payments API v1
      await synchronizeMercadoPagoPayment(dataId, eventId);
    } else if (body.type === "order" && dataId) {
      // Orders API v2 (legado)
      await synchronizeMercadoPagoOrder(dataId, eventId);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao processar webhook Mercado Pago:", error);
    return NextResponse.json({ erro: "Erro interno" }, { status: 500 });
  }
}
