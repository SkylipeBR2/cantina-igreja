"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, Minus, ChevronRight, CheckCircle2, QrCode, Copy, Check, ShoppingCart, ArrowLeft, CreditCard } from "lucide-react";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { ShineBorder } from "@/components/ui/shine-border";
import { motion, useReducedMotion } from "motion/react";

type Item = { id: string; name: string; price: number; stock_quantity: number };
type CartItem = Item & { quantity: number };
type Step = "cardapio" | "revisao" | "cartao" | "pagamento" | "confirmacao";
type MetodoPagamento = "pix" | "cartao";
type CardBrick = { unmount?: () => void };
type CardBrickSettings = {
  initialization: { amount: number };
  callbacks: {
    onReady: () => void;
    onError: (error: unknown) => void;
    onSubmit: (cardData: Record<string, unknown>) => Promise<void>;
  };
  customization: { visual: { style: { theme: "default" } } };
};
type MercadoPagoConstructor = new (key: string, options: { locale: string }) => {
  bricks: () => {
    create: (type: "cardPayment", target: string, settings: CardBrickSettings) => Promise<CardBrick>;
  };
};

const AVATAR_COLORS = ["#3b82f6","#8b5cf6","#f59e0b","#ef4444","#10b981","#06b6d4","#f97316","#6366f1"];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function fmt(n: number) { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export default function TotemPage() {
  const shouldReduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("cardapio");
  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [nome, setNome] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [orderDetailsKey, setOrderDetailsKey] = useState<string | null>(null);
  const [orderNum, setOrderNum] = useState<number | null>(null);
  const [paymentExpiresAt, setPaymentExpiresAt] = useState<string | null>(null);
  const [paymentSecondsLeft, setPaymentSecondsLeft] = useState(0);
  const [pix, setPix] = useState<{ copiaECola: string; qrCode: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamento>("pix");
  const [cardError, setCardError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [observacao, setObservacao] = useState("");
  const cardBrickContainer = useRef<HTMLDivElement>(null);
  const checkoutInFlight = useRef(false);

  useEffect(() => {
    fetch("/api/catalogo")
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    if (step !== "confirmacao") return;
    const t = setInterval(() => {
      setCountdown(p => { if (p <= 1) { clearInterval(t); reset(); return 0; } return p - 1; });
    }, 1000);
    return () => clearInterval(t);
  }, [step]);

  useEffect(() => {
    if (step !== "pagamento" || !orderId || !trackingToken) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/status-pedido?id=${orderId}&token=${trackingToken}`).then(r => r.json()).catch(() => ({}));
      if (res.status_pagamento === "pago") { clearInterval(t); setCountdown(15); setStep("confirmacao"); }
      if (res.status_pagamento === "recusado") {
        clearInterval(t);
        setPaymentError("O pagamento foi recusado. Revise o pedido para tentar novamente.");
        setOrderId(null);
        setTrackingToken(null);
        setOrderDetailsKey(null);
      }
      if (res.status_pagamento === "expirado") {
        clearInterval(t);
        setPaymentError("O prazo de 15 minutos para pagamento expirou. Faça um novo pedido.");
        setOrderId(null);
        setTrackingToken(null);
        setOrderDetailsKey(null);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [step, orderId, trackingToken]);

  useEffect(() => {
    if (step !== "pagamento" || !paymentExpiresAt) return;
    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((new Date(paymentExpiresAt).getTime() - Date.now()) / 1000));
      setPaymentSecondsLeft(seconds);
      if (seconds === 0) {
        setPaymentError("O prazo de 15 minutos para pagamento expirou. Faça um novo pedido.");
        setOrderId(null);
        setTrackingToken(null);
        setOrderDetailsKey(null);
        setPaymentExpiresAt(null);
      }
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [step, paymentExpiresAt]);

  function reset() {
    setStep("cardapio"); setCart([]); setNome(""); setOrderId(null); setTrackingToken(null); setOrderDetailsKey(null);
    setOrderNum(null); setPaymentExpiresAt(null); setPaymentSecondsLeft(0); setPix(null); setLoading(false); setCopied(false);
    setMetodoPagamento("pix"); setCardError(null);
    setObservacao(""); setPaymentError(null);
  }

  function addItem(item: Item) {
    setCart(p => {
      const ex = p.find(i => i.id === item.id);
      if (ex) {
        if (ex.quantity >= item.stock_quantity) return p; // já no limite do estoque
        return p.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...p, { ...item, quantity: 1 }];
    });
  }

  function changeQty(id: string, delta: number) {
    setCart(p => {
      const ex = p.find(i => i.id === id)!;
      const newQty = ex.quantity + delta;
      if (newQty < 1) return p.filter(i => i.id !== id);
      if (newQty > ex.stock_quantity) return p; // não pode ultrapassar estoque
      return p.map(i => i.id === id ? { ...i, quantity: newQty } : i);
    });
  }

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

  function checkoutDetailsKey(method: MetodoPagamento) {
    return JSON.stringify({
      items: cart.map((item) => ({ id: item.id, quantity: item.quantity })),
      customerName: nome.trim(),
      notes: observacao.trim(),
      method,
    });
  }

  function canReuseOrder(method: MetodoPagamento) {
    return Boolean(
      orderId && trackingToken && paymentExpiresAt
      && orderDetailsKey === checkoutDetailsKey(method)
      && new Date(paymentExpiresAt).getTime() > Date.now()
    );
  }

  useEffect(() => {
    if (step !== "cartao") return;
    let cancelled = false;
    let brick: CardBrick | undefined;

    async function mountCardBrick() {
      try {
        const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://sdk.mercadopago.com/js/v2"]');
        const sdkWindow = window as Window & { MercadoPago?: MercadoPagoConstructor };
        if (!sdkWindow.MercadoPago) {
          await new Promise<void>((resolve, reject) => {
            const script = existingScript ?? document.createElement("script");
            script.addEventListener("load", () => resolve(), { once: true });
            script.addEventListener("error", () => reject(new Error("Não foi possível carregar o formulário de pagamento.")), { once: true });
            if (!existingScript) {
              script.src = "https://sdk.mercadopago.com/js/v2";
              script.async = true;
              document.body.appendChild(script);
            }
          });
        }
        if (cancelled || !cardBrickContainer.current) return;
        const publicKey = process.env.NEXT_PUBLIC_MERCADOPAGO_TOKEN;
        if (!publicKey) throw new Error("Pagamento com cartão indisponível no momento.");
        const MercadoPago = sdkWindow.MercadoPago;
        if (!MercadoPago) throw new Error("Não foi possível carregar o formulário de pagamento.");
        const mp = new MercadoPago(publicKey, { locale: "pt-BR" });
        brick = await mp.bricks().create("cardPayment", "cardPaymentBrick_container", {
          initialization: { amount: Number(total.toFixed(2)) },
          callbacks: {
            onReady: () => undefined,
            onError: () => { if (!cancelled) setCardError("Não foi possível carregar o formulário seguro. Tente novamente."); },
            onSubmit: async (cardData: Record<string, unknown>) => {
              setLoading(true);
              setCardError(null);
              try {
                if (!orderId || !trackingToken) throw new Error("Pedido indisponível. Volte e tente novamente.");

                const paymentResponse = await fetch("/api/pagar-cartao", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ...cardData, id_pedido: orderId, trackingToken }),
                });
                const payment = await paymentResponse.json();
                if (paymentResponse.status === 422) {
                  setPaymentError(payment.erro || "Pagamento recusado. Revise o pedido para tentar novamente.");
                  setOrderId(null);
                  setTrackingToken(null);
                  setOrderDetailsKey(null);
                  setStep("pagamento");
                  return;
                }
                if (!paymentResponse.ok || payment.erro) throw new Error(payment.erro || "Não foi possível processar o pagamento.");
                if (payment.status === "approved") { setCountdown(15); setStep("confirmacao"); }
                else setStep("pagamento");
              } catch (error) {
                const message = error instanceof Error ? error.message : "Erro ao processar o cartão.";
                setCardError(message);
                throw error;
              } finally {
                setLoading(false);
              }
            },
          },
          customization: { visual: { style: { theme: "default" } } },
        });
      } catch (error) {
        if (!cancelled) setCardError(error instanceof Error ? error.message : "Não foi possível carregar o formulário seguro.");
      }
    }

    void mountCardBrick();
    return () => {
      cancelled = true;
      brick?.unmount?.();
    };
  }, [step, total, cart, nome, observacao, orderId, trackingToken]);

  async function confirmarPedido() {
    if (checkoutInFlight.current) return;
    checkoutInFlight.current = true;
    setLoading(true);
    setPaymentError(null);
    try {
      let currentOrderId = orderId;
      let currentTrackingToken = trackingToken;
      const detailsKey = checkoutDetailsKey("pix");
      if (!canReuseOrder("pix")) {
        const orderResponse = await fetch("/api/criar-pedido", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itens: cart.map((item) => ({ id: item.id, quantity: item.quantity })), nomeCliente: nome.trim(), paymentMethod: "pix", observacao: observacao.trim() }),
        });
        const createdOrder = await orderResponse.json().catch(() => null) as {
          id?: string; trackingToken?: string; order_number?: number; paymentExpiresAt?: string; erro?: string;
        } | null;
        if (!orderResponse.ok || !createdOrder?.id || !createdOrder.trackingToken) {
          throw new Error(createdOrder?.erro || "Não foi possível criar o pedido.");
        }
        currentOrderId = createdOrder.id;
        currentTrackingToken = createdOrder.trackingToken;
        setOrderId(currentOrderId);
        setTrackingToken(currentTrackingToken);
        setOrderNum(createdOrder.order_number ?? null);
        setPaymentExpiresAt(createdOrder.paymentExpiresAt ?? null);
        setOrderDetailsKey(detailsKey);
      }

      const pixResponse = await fetch("/api/gerar-pix", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_pedido: currentOrderId, trackingToken: currentTrackingToken, emailCliente: "cliente@cantina.com" }),
      });
      const pixPayment = await pixResponse.json().catch(() => null) as {
        erro?: string; paymentExpiresAt?: string; copiaECola?: string; qrCode?: string;
      } | null;
      if (!pixResponse.ok || !pixPayment?.copiaECola || !pixPayment.qrCode) {
        throw new Error(pixPayment?.erro || "Não foi possível gerar o Pix.");
      }
      setPaymentExpiresAt(pixPayment.paymentExpiresAt ?? null);
      setPix({ copiaECola: pixPayment.copiaECola, qrCode: pixPayment.qrCode });
      setStep("pagamento");
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Não foi possível gerar o Pix.");
    } finally {
      checkoutInFlight.current = false;
      setLoading(false);
    }
  }

  async function continuarParaCartao() {
    if (checkoutInFlight.current) return;
    setCardError(null);
    const detailsKey = checkoutDetailsKey("cartao");
    if (canReuseOrder("cartao")) {
      setStep("cartao");
      return;
    }
    checkoutInFlight.current = true;
    setLoading(true);
    try {
      const response = await fetch("/api/criar-pedido", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: cart.map((item) => ({ id: item.id, quantity: item.quantity })), nomeCliente: nome.trim(), paymentMethod: "cartao", observacao: observacao.trim() }),
      });
      const order = await response.json().catch(() => null) as {
        id?: string; trackingToken?: string; order_number?: number; paymentExpiresAt?: string; erro?: string;
      } | null;
      if (!response.ok || !order?.id || !order.trackingToken) {
        throw new Error(order?.erro || "Não foi possível criar o pedido.");
      }
      setOrderId(order.id);
      setTrackingToken(order.trackingToken);
      setOrderNum(order.order_number ?? null);
      setPaymentExpiresAt(order.paymentExpiresAt ?? null);
      setOrderDetailsKey(detailsKey);
      setStep("cartao");
    } catch (error) {
      setCardError(error instanceof Error ? error.message : "Não foi possível iniciar o pagamento.");
    } finally {
      checkoutInFlight.current = false;
      setLoading(false);
    }
  }

  async function copyPix() {
    if (!pix) return;
    await navigator.clipboard.writeText(pix.copiaECola);
    setCopied(true); setTimeout(() => setCopied(false), 3000);
  }

  return (
    <motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.32 }} className="totem-shell" style={{ minHeight: "100vh", background: "linear-gradient(135deg, var(--totem-canvas) 0%, var(--totem-surface) 52%, var(--totem-canvas) 100%)", fontFamily: "var(--font-sans), sans-serif", color: "var(--totem-foreground)" }}>

      {/* Header */}
      <header className="totem-header" style={{ padding: "18px 32px", borderBottom: "1px solid rgba(255,255,255,0.09)", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(12px)", background: "rgba(7,17,31,0.72)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#3b82f6,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🍽️</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.5px" }}>Cantina PIB</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Autoatendimento</div>
          </div>
        </div>
        {/* Steps */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(["cardapio","revisao","pagamento","confirmacao"] as Step[]).map((s, i) => {
            const labels = ["Cardápio","Revisão","Pagamento","Confirmação"];
            const current = ["cardapio","revisao","pagamento","confirmacao"].indexOf(step);
            const done = i < current; const active = i === current;
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <motion.div layout transition={{ type: "spring", stiffness: 420, damping: 28 }} style={{ width: 28, height: 28, borderRadius: "50%", background: done ? "#22c55e" : active ? "#3b82f6" : "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
                    {done ? "✓" : i + 1}
                  </motion.div>
                  <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#fff" : "rgba(255,255,255,0.4)", display: "none" }} className="step-label">{labels[i]}</span>
                </div>
                {i < 3 && <div style={{ width: 24, height: 1, background: done ? "#22c55e" : "rgba(255,255,255,0.15)" }} />}
              </div>
            );
          })}
        </div>
      </header>

      {/* STEP 1 — CARDÁPIO */}
      {step === "cardapio" && (
        <main className="totem-order-layout" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", minHeight: "calc(100vh - 81px)" }}>
          {/* Items grid */}
          <section style={{ padding: "clamp(24px, 4vw, 48px)", overflowY: "auto" }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6, letterSpacing: "-0.5px" }}>O que vai ser hoje?</h1>
            <p style={{ color: "rgba(255,255,255,0.58)", marginBottom: 24, fontSize: 16 }}>Escolha seus itens. Você revisa tudo antes de pagar.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
              {items.map((item, index) => {
                const inCart = cart.find(i => i.id === item.id);
                return (
                  <motion.button key={item.id} aria-label={`Adicionar ${item.name} ao pedido`} className={`menu-item ${inCart ? "menu-item-selected" : ""}`} onClick={() => addItem(item)} initial={shouldReduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} whileHover={shouldReduceMotion ? undefined : { y: -4 }} whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }} transition={{ type: "spring", stiffness: 340, damping: 25, delay: Math.min(index * 0.045, 0.27) }} style={{ background: inCart ? "rgba(37,99,235,0.16)" : "rgba(255,255,255,0.045)", border: inCart ? "2px solid #60a5fa" : "2px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: 20, cursor: "pointer", position: "relative", userSelect: "none", color: "#fff", textAlign: "left" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(59,130,246,0.1)")}
                    onMouseLeave={e => (e.currentTarget.style.background = inCart ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.05)")}>
                    <div style={{ width: 64, height: 64, borderRadius: 16, background: avatarColor(item.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900, marginBottom: 14, color: "#fff" }}>
                      {item.name[0].toUpperCase()}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, lineHeight: 1.3 }}>{item.name}</div>
                    <div style={{ color: "#60a5fa", fontWeight: 800, fontSize: 18 }}>{fmt(item.price)}</div>
                    {inCart && (
                      <div style={{ position: "absolute", top: 12, right: 12, background: "#3b82f6", borderRadius: "50%", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>
                        {inCart.quantity}
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </section>

          {/* Cart sidebar */}
          <aside className="totem-cart" style={{ background: "rgba(2,10,24,0.48)", borderLeft: "1px solid rgba(255,255,255,0.09)", display: "flex", flexDirection: "column", padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <ShoppingCart size={22} color="#3b82f6" />
              <span style={{ fontWeight: 700, fontSize: 18 }}>Carrinho</span>
              {totalItems > 0 && <span style={{ marginLeft: "auto", background: "#3b82f6", borderRadius: 20, padding: "2px 10px", fontSize: 13, fontWeight: 700 }}>{totalItems}</span>}
            </div>

            {cart.length === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", gap: 12 }}>
                <ShoppingCart size={48} strokeWidth={1} />
                <span style={{ fontSize: 14 }}>Seu carrinho está vazio</span>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
                {cart.map(item => (
                  <motion.div key={item.id} layout initial={shouldReduceMotion ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 380, damping: 28 }} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: "12px 14px" }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{item.name}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button onClick={(e) => { e.stopPropagation(); changeQty(item.id, -1); }} style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Minus size={14} /></button>
                        <span style={{ fontWeight: 700, fontSize: 16, minWidth: 20, textAlign: "center" }}>{item.quantity}</span>
                        <button onClick={(e) => { e.stopPropagation(); changeQty(item.id, 1); }} style={{ width: 30, height: 30, borderRadius: 8, background: "#3b82f6", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={14} /></button>
                      </div>
                      <span style={{ fontWeight: 700, color: "#60a5fa" }}>{fmt(item.price * item.quantity)}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 18, fontWeight: 800 }}>
                <span>Total</span>
                <span style={{ color: "#60a5fa" }}>{fmt(total)}</span>
              </div>
              <button className="primary-action" disabled={cart.length === 0} onClick={() => setStep("revisao")} style={{ width: "100%", padding: "17px", borderRadius: 14, background: cart.length > 0 ? "#2563eb" : "rgba(255,255,255,0.1)", border: "none", color: "#fff", fontWeight: 800, fontSize: 16, cursor: cart.length > 0 ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
                Revisar Pedido <ChevronRight size={20} />
              </button>
            </div>
          </aside>
        </main>
      )}

      {/* STEP 2 — REVISÃO */}
      {step === "revisao" && (
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 24px" }}>
          <button onClick={() => setStep("cardapio")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 28, fontSize: 14 }}>
            <ArrowLeft size={16} /> Voltar ao cardápio
          </button>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 6 }}>Revise seu pedido</h1>
          <p style={{ color: "rgba(255,255,255,0.4)", marginBottom: 32 }}>Confirme os itens antes de pagar</p>

          <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 20, padding: 24, marginBottom: 24, border: "1px solid rgba(255,255,255,0.08)" }}>
            {cart.map((item, i) => (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: i < cart.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                  <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 8, fontSize: 14 }}>× {item.quantity}</span>
                </div>
                <span style={{ fontWeight: 700, color: "#60a5fa" }}>{fmt(item.price * item.quantity)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 16, marginTop: 4, fontSize: 20, fontWeight: 800 }}>
              <span>Total</span>
              <span style={{ color: "#60a5fa" }}>{fmt(total)}</span>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="nome-cliente" style={{ display: "block", fontWeight: 600, marginBottom: 8, fontSize: 15 }}>Seu nome <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>(opcional)</span></label>
            <input id="nome-cliente" maxLength={120} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Maria" style={{ width: "100%", padding: "14px 16px", borderRadius: 12, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 16, outline: "none", boxSizing: "border-box" }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="observacao-pedido" style={{ display: "block", fontWeight: 600, marginBottom: 8, fontSize: 15 }}>Observação <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>(opcional)</span></label>
            <textarea id="observacao-pedido" maxLength={500} value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex: Sem cebola, sem maionese..." rows={2} style={{ width: "100%", padding: "14px 16px", borderRadius: 12, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 16, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 12, fontSize: 15 }}>Forma de pagamento</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              {(["pix", "cartao"] as MetodoPagamento[]).map(m => (
                <button key={m} onClick={() => setMetodoPagamento(m)} style={{ padding: "18px 12px", borderRadius: 14, border: `2px solid ${metodoPagamento === m ? "#3b82f6" : "rgba(255,255,255,0.1)"}`, background: metodoPagamento === m ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, transition: "all 0.2s" }}>
                  <span style={{ fontSize: 28 }}>{m === "pix" ? "💠" : "💳"}</span>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{m === "pix" ? "Pix" : "Cartão"}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{m === "pix" ? "Instantâneo" : "Crédito"}</span>
                </button>
              ))}
            </div>
          </div>

          {(metodoPagamento === "pix" ? paymentError : cardError) && (
            <div role="alert" style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 12, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#fca5a5", fontSize: 14 }}>
              {metodoPagamento === "pix" ? paymentError : cardError}
            </div>
          )}
          <button onClick={metodoPagamento === "pix" ? confirmarPedido : continuarParaCartao} disabled={loading} style={{ width: "100%", padding: "18px", borderRadius: 16, background: loading ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg,#3b82f6,#6366f1)", border: "none", color: "#fff", fontWeight: 800, fontSize: 18, cursor: loading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all 0.2s" }}>
            {loading ? "Aguarde..." : metodoPagamento === "pix" ? <><QrCode size={22} /> Gerar QR Code Pix</> : <><CreditCard size={22} /> Continuar para Cartão</>}
          </button>
        </div>
      )}

      {/* STEP 2b — CARTÃO */}
      {step === "cartao" && (
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "40px 24px" }}>
          <button onClick={() => setStep("revisao")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 28, fontSize: 14 }}>
            <ArrowLeft size={16} /> Voltar
          </button>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Pagamento com Cartão</h1>
          <p style={{ color: "rgba(255,255,255,0.4)", marginBottom: 28, fontSize: 15 }}>Total: <strong style={{ color: "#60a5fa" }}>{fmt(total)}</strong></p>

          {cardError && <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, color: "#fca5a5", fontSize: 14 }}>{cardError}</div>}
          <div id="cardPaymentBrick_container" ref={cardBrickContainer} aria-label="Formulário seguro de pagamento com cartão" />
        </div>
      )}

      {/* STEP 3 — PAGAMENTO */}
      {step === "pagamento" && (
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "40px 24px", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(59,130,246,0.15)", border: "2px solid rgba(59,130,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 30 }}>💸</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}><ShimmerText>{metodoPagamento === "pix" ? "Pagamento por Pix" : "Pagamento com cartão"}</ShimmerText></h1>
          {metodoPagamento === "pix" ? (
            <p role="timer" aria-live="polite" style={{ color: paymentSecondsLeft <= 60 ? "#fbbf24" : "rgba(255,255,255,0.65)", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
              {paymentSecondsLeft > 0 ? `Este Pix expira em ${Math.floor(paymentSecondsLeft / 60)}:${String(paymentSecondsLeft % 60).padStart(2, "0")}` : "Prazo de pagamento expirado"}
            </p>
          ) : <p aria-live="polite" style={{ color: "rgba(255,255,255,0.65)", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Aguardando confirmação do Mercado Pago…</p>}
          <p style={{ color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>Pedido #{orderNum} · {fmt(total)}</p>
          {metodoPagamento === "pix" && <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginBottom: 32 }}>Aponte a câmera do celular para o QR Code</p>}
          {paymentError && <div role="alert" style={{ margin: "0 0 20px", padding: 14, borderRadius: 12, background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>{paymentError}<button onClick={() => { setPaymentError(null); setStep("revisao"); }} style={{ display: "block", margin: "12px auto 0", padding: "8px 14px", borderRadius: 8, border: "1px solid #fca5a5", background: "transparent", color: "#fff", cursor: "pointer" }}>Tentar novamente</button></div>}

          {metodoPagamento === "cartao" ? (
            <div style={{ width: 252, height: 252, background: "rgba(255,255,255,0.05)", borderRadius: 20, margin: "0 auto 28px", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.55)" }}>
              <CreditCard size={64} strokeWidth={1} />
            </div>
          ) : pix?.qrCode ? (
            <ShineBorder style={{ display: "inline-block", marginBottom: 28, borderRadius: 24 }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 16, display: "inline-block" }}>
              <img src={`data:image/png;base64,${pix.qrCode}`} alt="QR Code Pix" style={{ width: 220, height: 220, display: "block" }} />
            </div>
            </ShineBorder>
          ) : (
            <div style={{ width: 252, height: 252, background: "rgba(255,255,255,0.05)", borderRadius: 20, margin: "0 auto 28px", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)" }}>
              <QrCode size={64} strokeWidth={1} />
            </div>
          )}

          {pix?.copiaECola && (
            <div style={{ marginBottom: 32 }}>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 10 }}>Ou copie o código Pix:</p>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1, background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 14px", fontSize: 12, color: "rgba(255,255,255,0.5)", wordBreak: "break-all", textAlign: "left", border: "1px solid rgba(255,255,255,0.1)" }}>
                  {pix.copiaECola.substring(0, 60)}...
                </div>
                <button onClick={copyPix} style={{ minWidth: 48, height: 48, borderRadius: 12, background: copied ? "#22c55e" : "rgba(59,130,246,0.2)", border: `1px solid ${copied ? "#22c55e" : "rgba(59,130,246,0.4)"}`, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
            </div>
          )}

          <div className="payment-waiting" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "rgba(255,255,255,0.64)", fontSize: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", animation: "pulse 1.5s infinite" }} />
            Aguardando confirmação do pagamento...
          </div>
        </div>
      )}

      {/* STEP 4 — CONFIRMAÇÃO */}
      {step === "confirmacao" && (
        <div style={{ maxWidth: 500, margin: "0 auto", padding: "60px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 80, marginBottom: 24 }}>🎉</div>
          <h1 style={{ fontSize: 36, fontWeight: 900, marginBottom: 8, letterSpacing: "-1px" }}>Pedido confirmado!</h1>
          <div style={{ fontSize: 80, fontWeight: 900, color: "#3b82f6", margin: "24px 0", letterSpacing: "-2px" }}>#{orderNum}</div>
          <p style={{ fontSize: 20, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 8 }}>Seu pedido está na fila da cozinha!</p>
          <p style={{ color: "rgba(255,255,255,0.3)", marginBottom: 48 }}>Aguarde ser chamado pelo número acima.</p>

          <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: 20, marginBottom: 32, border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
              <CheckCircle2 size={18} color="#22c55e" />
              Pagamento via Pix confirmado
            </div>
          </div>

          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, marginBottom: 16 }}>Nova tela em <span style={{ color: "#fff", fontWeight: 700 }}>{countdown}s</span></p>
          <button onClick={reset} style={{ padding: "16px 40px", borderRadius: 14, background: "linear-gradient(135deg,#3b82f6,#6366f1)", border: "none", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
            Novo Pedido
          </button>
        </div>
      )}

      <style>{`
        .totem-shell { --totem-canvas: #07111f; --totem-surface: #0c1d38; --totem-foreground: #ffffff; --totem-action: var(--primary); --totem-action-soft: #60a5fa; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes spell-shimmer { from { background-position: 130% center; } to { background-position: -30% center; } }
        @keyframes spell-border-orbit { to { transform: rotate(1turn); } }
        .spell-shimmer-text { position: relative; display: inline-block; color: #dbeafe; }
        .spell-shimmer-text::after { content: ""; position: absolute; height: 2px; border-radius: 99px; left: 0; right: 0; bottom: -5px; background: linear-gradient(100deg, transparent 25%, #60a5fa 50%, transparent 75%); background-size: 240% 100%; animation: spell-shimmer 2.8s ease-in-out infinite; }
        .spell-shine-border { position: relative; padding: 2px; overflow: hidden; background: rgba(96,165,250,.3); }
        .spell-shine-border::before { content: ""; position: absolute; width: 160%; aspect-ratio: 1; top: -30%; left: -30%; background: conic-gradient(from 0deg, transparent 0deg, transparent 292deg, #60a5fa 330deg, #dbeafe 348deg, transparent 360deg); animation: spell-border-orbit 5s linear infinite; }
        .spell-shine-border__content { position: relative; z-index: 1; }
        *::selection { background: rgba(96,165,250,.42); color: #fff; }
        .totem-shell { position: relative; isolation: isolate; }
        .totem-shell::before { content: ""; position: fixed; z-index: -1; width: 42rem; height: 42rem; right: -15rem; top: -23rem; border-radius: 999px; background: radial-gradient(circle, rgba(37,99,235,.23), transparent 68%); pointer-events: none; }
        .totem-header { position: sticky; top: 0; z-index: 10; }
        .totem-header > div:first-child > div:first-child { box-shadow: 0 12px 28px rgba(37,99,235,.28); }
        .menu-item { min-height: 168px; font-family: inherit; }
        .menu-item:hover { transform: translateY(-3px); box-shadow: 0 16px 30px rgba(0,0,0,.2); }
         .menu-item:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 3px solid var(--totem-action-soft); outline-offset: 3px; }
        .menu-item-selected { box-shadow: inset 0 0 0 1px rgba(191,219,254,.25); }
        .primary-action:not(:disabled):hover { background: #1d4ed8 !important; transform: translateY(-1px); box-shadow: 0 12px 22px rgba(37,99,235,.3); }
        .payment-waiting { padding: 12px 16px; width: fit-content; margin: 0 auto; border-radius: 999px; background: rgba(37,99,235,.1); border: 1px solid rgba(96,165,250,.18); }
        @media (min-width: 640px) { .step-label { display: inline !important; } }
        @media (max-width: 760px) {
          .totem-header { padding: 14px 18px !important; }
          .totem-header > div:last-child { display: none !important; }
          .totem-order-layout { grid-template-columns: 1fr !important; }
          .totem-cart { border-left: 0 !important; border-top: 1px solid rgba(255,255,255,.1); min-height: 330px; }
          .menu-item { min-height: 144px; }
          .spell-shimmer-text::after { animation: none; background: #60a5fa; }
        }
        @media (prefers-reduced-motion: reduce) { .spell-shimmer-text::after, .spell-shine-border::before { animation: none; } }
      `}</style>
    </motion.div>
  );
}
