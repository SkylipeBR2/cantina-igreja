"use client";

import { useState, useEffect } from "react";
import { ShoppingBag, Check, Trash2, User, CreditCard, Plus, MessageSquare } from "lucide-react";
import Modal from "../../components/Modal";
import { useModal } from "../../hooks/useModal";
import { motion, useReducedMotion } from "motion/react";

type MenuItem = {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
};

type CartItem = Pick<MenuItem, "id" | "name" | "price"> & {
  quantity: number;
};

export default function CaixaPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("dinheiro");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { options, close, showModal } = useModal();
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    const response = await fetch("/api/caixa/itens");
    const data = await response.json().catch(() => []);
    if (response.ok && Array.isArray(data)) setItems(data as MenuItem[]);
  }

  function addToCart(item: MenuItem) {
    const quantityInCart = cart.find((cartItem) => cartItem.id === item.id)?.quantity ?? 0;
    if (quantityInCart >= item.stock_quantity) {
      showModal("warning", "Estoque insuficiente", `Só há ${item.stock_quantity} unidade(s) disponíveis de “${item.name}”.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  }

  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }

  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  async function handleCheckout() {
    if (cart.length === 0) return showModal("warning", "Carrinho vazio", "Adicione pelo menos um item antes de finalizar.");
    if (!customerName.trim()) return showModal("warning", "Nome obrigatório", "Informe o nome do cliente para finalizar o pedido.");
    setIsLoading(true);

    try {
      const response = await fetch("/api/caixa/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.map((item) => ({ id: item.id, quantity: item.quantity })), customerName: customerName.trim(), paymentMethod, notes: notes.trim() || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.erro ?? "Não foi possível finalizar");
      showModal("success", "Pedido finalizado!", `Ticket #${data.order_number} registrado com sucesso.`, "Novo pedido", () => {
        setCart([]); setCustomerName(""); setNotes(""); fetchItems();
      });
    } catch (error) {
      showModal("error", "Não foi possível finalizar", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <Modal options={options} onClose={close} />
      <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }} className="flex min-h-[calc(100vh-64px)] flex-col bg-white lg:flex-row">
      
      {/* Lado Esquerdo: Cardápio */}
      <div className="flex-1 p-4 lg:p-8">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Cardápio</h1>
          <p className="text-slate-500 mt-1">Selecione os itens para o novo pedido</p>
        </header>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className={`group relative flex flex-col items-start p-5 rounded-3xl border-2 transition-all duration-200 ${
                item.stock_quantity > 0
                  ? "bg-white border-transparent shadow-sm hover:border-blue-200 hover:shadow-xl hover:shadow-blue-50"
                  : "border-slate-200 bg-white opacity-70"
              }`}
            >
              <span className="text-lg font-bold text-slate-800 leading-tight mb-2">
                {item.name}
              </span>
              <span className="text-2xl font-black text-slate-900">
                R$ {item.price.toFixed(2)}
              </span>
              
              <div className={`mt-3 mb-5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                item.stock_quantity > 5 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}>
                Estoque: {item.stock_quantity}
              </div>

              {/* Novo Botão de Adicionar */}
              <button
                onClick={() => addToCart(item)}
                disabled={item.stock_quantity <= 0}
                className="mt-auto w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 text-primary font-bold transition-all hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                {item.stock_quantity > 0 ? (
                  <>
                    <Plus size={18} strokeWidth={3} />
                    Adicionar
                  </>
                ) : (
                  "Esgotado"
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Lado Direito: Carrinho de Compras */}
      <aside className="w-full lg:w-[450px] bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col shadow-2xl">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2.5 rounded-2xl shadow-lg shadow-blue-200 text-white">
              <ShoppingBag size={22} />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Pedido Atual</h2>
          </div>
          <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-full">
            {cart.reduce((a, b) => a + b.quantity, 0)} itens
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4 py-12">
              <div className="w-20 h-20 rounded-full border border-slate-100 bg-white flex items-center justify-center">
                <ShoppingBag size={32} className="opacity-20" />
              </div>
              <p className="font-medium text-sm">O carrinho está vazio</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="flex justify-between items-center p-4 rounded-2xl bg-white border border-slate-200 group">
                <div className="flex items-center gap-4">
                  <span className="flex items-center justify-center w-8 h-8 bg-white text-blue-600 font-bold rounded-xl shadow-sm border border-slate-200 text-sm">
                    {item.quantity}
                  </span>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                    <p className="text-xs font-semibold text-slate-500">R$ {(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                </div>
                <button 
                  onClick={() => removeFromCart(item.id)} 
                  className="text-slate-400 hover:text-rose-500 p-2 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Finalização */}
        <div className="p-6 bg-white border-t border-slate-200 space-y-6">
          <div className="space-y-4">
            <div className="relative group">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input
                id="customer-name"
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome do cliente"
                aria-describedby="customer-name-help"
                className={`w-full bg-white border-2 pl-11 pr-10 py-3.5 rounded-2xl focus:ring-0 outline-none transition-all text-slate-900 placeholder:text-slate-400 font-medium ${customerName.trim() ? "border-slate-200 focus:border-blue-500" : "border-rose-300 focus:border-rose-500"}`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lg font-black text-rose-500" aria-hidden="true">*</span>
            </div>
            <p id="customer-name-help" className="sr-only">Nome obrigatório para finalizar o pedido.</p>

            <div className="relative group">
              <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-white border-2 border-slate-200 pl-11 pr-4 py-3.5 rounded-2xl focus:border-blue-500 focus:ring-0 outline-none transition-all text-slate-900 font-bold appearance-none cursor-pointer"
              >
                <option value="dinheiro">Dinheiro (Espécie)</option>
                <option value="pix">PIX</option>
                <option value="cartao">Cartão Débito/Crédito</option>
              </select>
            </div>

            <div className="relative group">
              <MessageSquare className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
              <label htmlFor="order-notes" className="sr-only">Observações do pedido</label>
              <textarea id="order-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observações (ex.: sem cebola)" rows={2} className="w-full resize-none rounded-2xl border-2 border-slate-200 bg-white py-3 pr-4 pl-11 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-500" />
            </div>
          </div>

          <div className="flex justify-between items-end">
            <span className="text-slate-500 font-bold text-sm uppercase tracking-widest">Total</span>
            <span className="text-4xl font-black text-slate-900 tracking-tighter">R$ {total.toFixed(2)}</span>
          </div>

          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || isLoading}
            className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xl flex justify-center items-center gap-3 hover:bg-blue-700 active:scale-[0.97] transition-all disabled:opacity-50 shadow-xl shadow-blue-200"
          >
            {isLoading ? "Processando..." : <><Check size={24} strokeWidth={3} /> Finalizar</>}
          </button>
        </div>
      </aside>
      </motion.div>
    </>
  );
}
