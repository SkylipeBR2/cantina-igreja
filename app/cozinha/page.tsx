"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChefHat,
  Clock3,
  Loader2,
  Send,
  UtensilsCrossed,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type OrderStatus = "paid" | "preparando" | "pronto";
type QueueFilter = "todos" | "pendentes" | "parciais";

type OrderItem = {
  id: string;
  quantity: number;
  items: { name: string } | { name: string }[] | null;
};

type KitchenOrder = {
  id: string;
  order_number: number;
  customer_name: string | null;
  created_at: string;
  notes: string | null;
  payment_status: string;
  status: OrderStatus;
  status_entrega?: Record<string, number> | string | null;
  order_items: OrderItem[];
};

function deliveryProgress(order: KitchenOrder) {
  const deliveries =
    typeof order.status_entrega === "string"
      ? (() => {
          try {
            return JSON.parse(order.status_entrega) as Record<string, number>;
          } catch {
            return {};
          }
        })()
      : order.status_entrega ?? {};

  const delivered = order.order_items.reduce(
    (total, item) => total + Math.min(Number(deliveries[item.id] ?? 0), item.quantity),
    0,
  );
  const quantity = order.order_items.reduce((total, item) => total + item.quantity, 0);

  return { deliveries, delivered, quantity };
}

function itemName(item: OrderItem) {
  const linkedItem = Array.isArray(item.items) ? item.items[0] : item.items;
  return linkedItem?.name ?? "Item removido";
}

export default function CozinhaPage() {
  const reduceMotion = useReducedMotion();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [filter, setFilter] = useState<QueueFilter>("todos");
  const [loading, setLoading] = useState(true);
  const [pendingDelivery, setPendingDelivery] = useState<{ orderId: string; itemId?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [deliveryTrackingAvailable, setDeliveryTrackingAvailable] = useState(true);

  const fetchKitchenOrders = async () => {
    const response = await fetch("/api/cozinha/pedidos", { cache: "no-store" });
    const data = await response.json().catch(() => []);
    if (!response.ok || !Array.isArray(data)) {
      setError("Não foi possível carregar os pedidos da cozinha.");
      return;
    }

    setDeliveryTrackingAvailable(data.every((order) => "status_entrega" in order));
    setOrders(data as KitchenOrder[]);
    setError(null);
  };

  useEffect(() => {
    const initialize = async () => {
      await fetchKitchenOrders();
      setLoading(false);
    };

    void initialize();

    const refresh = window.setInterval(() => void fetchKitchenOrders(), 15_000);
    return () => window.clearInterval(refresh);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const deliver = async (orderId: string, orderItemId?: string) => {
    setPendingDelivery({ orderId, itemId: orderItemId });
    setError(null);

    try {
      const response = await fetch("/api/pedidos/entrega", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderItemId ? { orderId, orderItemId } : { orderId, all: true }),
      });
      const payload = (await response.json()) as { error?: string; erro?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? payload.erro ?? "Não foi possível registrar a entrega.");
      }

      await fetchKitchenOrders();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível registrar a entrega.");
    } finally {
      setPendingDelivery(null);
    }
  };

  const visibleOrders = useMemo(() => {
    if (filter === "pendentes") return orders.filter((order) => deliveryProgress(order).delivered === 0);
    if (filter === "parciais") return orders.filter((order) => deliveryProgress(order).delivered > 0);
    return orders;
  }, [filter, orders]);

  const partialOrders = orders.filter((order) => deliveryProgress(order).delivered > 0).length;
  const pendingOrders = orders.length - partialOrders;
  const filters: Array<{ id: QueueFilter; label: string; count: number }> = [
    { id: "todos", label: "Todos", count: orders.length },
    { id: "pendentes", label: "A entregar", count: pendingOrders },
    { id: "parciais", label: "Parciais", count: partialOrders },
  ];

  if (loading) {
    return (
      <main className="grid min-h-[calc(100vh-64px)] place-items-center bg-white">
        <Loader2 className="h-7 w-7 animate-spin text-blue-600" aria-label="Carregando pedidos" />
      </main>
    );
  }

  return (
    <motion.main
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
      className="min-h-[calc(100vh-64px)] bg-white px-4 py-7 text-slate-900 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-blue-600">
              <ChefHat className="h-5 w-5" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-[0.18em]">Operação</span>
            </div>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.045em] text-slate-950">
              Cozinha
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {orders.length} {orders.length === 1 ? "pedido na fila" : "pedidos na fila"}
            </p>
          </div>

          <nav
            aria-label="Filtro de pedidos da cozinha"
            className="inline-flex w-full rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto"
          >
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`relative flex-1 rounded-lg px-4 py-2 text-sm font-bold transition-colors sm:flex-none ${
                  filter === item.id ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {filter === item.id && !reduceMotion && (
                  <motion.span
                    layoutId="kitchen-filter"
                    className="absolute inset-0 -z-10 rounded-lg bg-slate-900"
                    transition={{ type: "spring", bounce: 0.16, duration: 0.35 }}
                  />
                )}
                {item.label}
                {item.count > 0 && (
                  <span className={`ml-2 text-xs ${filter === item.id ? "text-blue-200" : "text-slate-400"}`}>{item.count}</span>
                )}
              </button>
            ))}
          </nav>
        </header>

        <section className="pt-7" aria-labelledby="current-orders-heading">
          <div className="mb-5 flex items-center gap-3">
            <Clock3 className="h-5 w-5 text-blue-600" aria-hidden="true" />
            <h2 id="current-orders-heading" className="text-lg font-extrabold tracking-tight text-slate-950">
              {filter === "pendentes" ? "A entregar" : filter === "parciais" ? "Entregas parciais" : "Pedidos para entrega"}
            </h2>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-extrabold text-blue-700">{visibleOrders.length}</span>
          </div>

          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {visibleOrders.length === 0 ? (
            <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <div>
                <UtensilsCrossed className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
                <p className="mt-3 font-bold text-slate-700">Nenhum pedido nesta fila.</p>
                <p className="mt-1 text-sm text-slate-500">Os próximos pedidos aprovados aparecerão aqui automaticamente.</p>
              </div>
            </div>
          ) : (
            <motion.div layout className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence initial={false}>
                {visibleOrders.map((order) => {
                  const { deliveries, delivered, quantity } = deliveryProgress(order);
                  const orderBusy = pendingDelivery?.orderId === order.id;
                  const elapsedMinutes = Math.max(0, Math.floor((currentTime - new Date(order.created_at).getTime()) / 60000));

                  return (
                    <motion.article
                      layout
                      key={order.id}
                      initial={reduceMotion ? false : { opacity: 0, scale: 0.98, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.24, ease: "easeOut" }}
                      className="flex min-h-[332px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.08)]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-4xl font-black tracking-[-0.06em] text-slate-950">#{order.order_number}</p>
                          <p className="mt-1 truncate text-sm font-medium text-slate-500">{order.customer_name || "Cliente balcão"}</p>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                          {elapsedMinutes}m
                        </span>
                      </div>

                      {order.notes && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{order.notes}</p>}

                      <div className="mt-5 flex items-center justify-between">
                        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-400">Itens</p>
                        {deliveryTrackingAvailable && (
                          <span className="text-xs font-bold text-blue-700">
                            Entregue: {delivered}/{quantity}
                          </span>
                        )}
                      </div>

                      <ul className="mt-3 space-y-2">
                        {order.order_items.map((item) => {
                          const deliveredItem = Math.min(Number(deliveries[item.id] ?? 0), item.quantity);
                          const canDeliver = deliveredItem < item.quantity;

                          return (
                            <li key={item.id} className="rounded-xl border border-slate-100 bg-white p-3">
                              <div className="flex items-center gap-2">
                                <span className="rounded-md bg-slate-100 px-2 py-1 text-sm font-extrabold text-slate-700">{item.quantity}x</span>
                                <span className="min-w-0 flex-1 truncate font-bold text-slate-900">{itemName(item)}</span>
                                {deliveredItem === item.quantity && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Item entregue" />}
                              </div>

                              {deliveryTrackingAvailable && (
                                <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                                  <span className="text-xs font-bold text-slate-500">
                                    Entregue: {deliveredItem}/{item.quantity}
                                  </span>
                                  {canDeliver && (
                                    <button
                                      type="button"
                                      onClick={() => void deliver(order.id, item.id)}
                                      disabled={orderBusy}
                                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-extrabold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {orderBusy && pendingDelivery?.itemId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                      Entregar 1
                                    </button>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>

                      <div className="mt-auto pt-5">
                        {deliveryTrackingAvailable ? (
                          <button
                            type="button"
                            onClick={() => void deliver(order.id)}
                            disabled={orderBusy}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {orderBusy && !pendingDelivery?.itemId ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                            Tudo entregue
                          </button>
                        ) : (
                          <div className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-center text-sm font-semibold text-amber-800">
                            Controle de entrega indisponível. Atualize o banco para registrar a entrega.
                          </div>
                        )}
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </section>
      </div>
    </motion.main>
  );
}
