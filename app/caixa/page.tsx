"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { ShoppingBag, Check, Trash2, User, CreditCard, Plus, MessageSquare } from "lucide-react";

export default function CaixaPage() {
  const [items, setItems] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("dinheiro");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) window.location.href = "/login";
    });
    fetchItems();
  }, []);

  async function fetchItems() {
    const { data } = await supabase.from("items").select("*").order("name");
    if (data) setItems(data);
  }

  function addToCart(item: any) {
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
    if (cart.length === 0) return alert("Carrinho vazio!");
    setIsLoading(true);

    const cartItemsDb = cart.map((item) => ({ item_id: item.id, quantity: item.quantity, price: item.price }));

    const { data, error } = await supabase.rpc("process_order", {
      p_items: cartItemsDb, 
      p_customer_name: customerName || "Anônimo", 
      p_payment_method: paymentMethod, 
      p_total_amount: total,
    });

    setIsLoading(false);

    if (error) {
      alert("Erro: " + error.message);
    } else {
      // Salvar observação separadamente (a function não aceita esse campo)
      if (notes.trim()) {
        await supabase.from("orders").update({ notes: notes.trim() }).eq("id", data.order_id);
      }
      alert(`✅ Sucesso! Ticket: #${data.order_number}`);
      setCart([]); setCustomerName(""); setNotes(""); fetchItems();
    }
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-64px)] bg-[#F8FAFC]">
      
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
                  : "bg-slate-100 border-transparent opacity-70"
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
                className="mt-auto w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold transition-all disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white"
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
          <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-full">
            {cart.reduce((a, b) => a + b.quantity, 0)} itens
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4 py-12">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                <ShoppingBag size={32} className="opacity-20" />
              </div>
              <p className="font-medium text-sm">O carrinho está vazio</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="flex justify-between items-center p-4 rounded-2xl bg-slate-50 border border-slate-100 group">
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
        <div className="p-6 bg-slate-50/80 border-t border-slate-200 space-y-6">
          <div className="space-y-4">
            <div className="relative group">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome do cliente"
                className="w-full bg-white border-2 border-slate-200 pl-11 pr-4 py-3.5 rounded-2xl focus:border-blue-500 focus:ring-0 outline-none transition-all text-slate-900 placeholder:text-slate-400 font-medium"
              />
            </div>

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
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações (ex: sem cebola, bem passado...)"
                rows={2}
                className="w-full bg-white border-2 border-slate-200 pl-11 pr-4 py-3 rounded-2xl focus:border-blue-500 focus:ring-0 outline-none transition-all text-slate-900 placeholder:text-slate-400 font-medium resize-none text-sm"
              />
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
    </div>
  );
}