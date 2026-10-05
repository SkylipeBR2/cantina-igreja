import "server-only";
import { MercadoPagoConfig, Order, Payment } from "mercadopago";

const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! });

export const mercadoPagoOrders = new Order(client);
export const mercadoPagoPayments = new Payment(client);

export function asMoney(value: number) {
  return value.toFixed(2);
}

export function localPaymentStatus(providerStatus?: string, providerDetail?: string) {
  // Payments API v1: status direto
  if (providerStatus === "approved") return "approved" as const;
  if (["rejected", "cancelled", "refunded", "charged_back"].includes(providerStatus ?? "")) return "rejected" as const;
  // Orders API v2 (legado)
  if (providerStatus === "processed" && providerDetail === "accredited") return "approved" as const;
  if (["failed", "expired", "canceled"].includes(providerStatus ?? "")) return "rejected" as const;
  return "pending" as const;
}
