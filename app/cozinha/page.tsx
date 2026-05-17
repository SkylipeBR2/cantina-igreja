"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { CheckCircle2, Clock } from "lucide-react";

export default function CozinhaPage() {
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) window.location.href = "/login";
    });

    fetchPendingOrders();
    const subscription = supabase
      .channel('novos_pedidos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => { fetchPendingOrders(); })
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, []);

  async function fetchPendingOrders() {
    const { data } = await supabase.from("orders").select(`*, order_items ( quantity, items ( name ) )`).eq("status", "pendente").order("created_at", { ascending: true });
    if (data) setOrders(data);
  }

  async function markAsReady(orderId: string) {
    const { error } = await supabase.from("orders").update({ status: "pronto" }).eq("id", orderId);
    if (!error) setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }

  function getMinutesAgo(dateString: string) {
    const diff = new Date().getTime() - new Date(dateString).getTime();
    return Math.floor(diff / 60000);
  }

  return (
    <div className="p-4 lg:p-8 min-h-[calc(100vh-64px)] bg-slate-50">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Cozinha</h1>
          <p className="text-slate-500 font-medium mt-1">{orders.length} pedidos na fila</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
        {orders.length === 0 && (
          <div className="col-span-full py-20 text-center">
             <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full text-green-500 mb-4">
                <CheckCircle2 size={40} />
             </div>
             <h2 className="text-xl font-bold text-slate-700">Tudo limpo por aqui!</h2>
             <p className="text-slate-500">Aguardando novos pedidos...</p>
          </div>
        )}

        {orders.map((order) => {
          const minutes = getMinutesAgo(order.created_at);
          const isLate = minutes > 10; // Fica vermelho se passar de 10 minutos

          return (
            <div key={order.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col relative overflow-hidden">
              {/* Faixa de cor no topo para chamar atencao se atrasar */}
              <div className={`absolute top-0 left-0 w-full h-1.5 ${isLate ? 'bg-red-500' : 'bg-blue-500'}`}></div>
              
              <div className="flex justify-between items-start mb-6 mt-2">
                <div>
                  <h2 className="text-4xl font-black text-slate-800 tracking-tighter">#{order.order_number}</h2>
                  <p className="text-slate-500 font-medium mt-1">{order.customer_name || "Sem nome"}</p>
                </div>
                <div className={`flex items-center px-3 py-1.5 rounded-full text-sm font-bold ${isLate ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                  <Clock size={16} className="mr-1.5" /> {minutes}m
                </div>
              </div>

              <div className="flex-1">
                <ul className="space-y-3 mb-4">
                  {order.order_items.map((oi: any, index: number) => (
                    <li key={index} className="flex items-start text-lg">
                      <span className="bg-slate-100 text-slate-700 font-black px-2.5 py-0.5 rounded-md mr-3 border border-slate-200">
                        {oi.quantity}x
                      </span>
                      <span className="font-semibold text-slate-700 leading-snug">{oi.items?.name}</span>
                    </li>
                  ))}
                </ul>

                {order.notes && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
                    <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">📝 Observação</p>
                    <p className="text-amber-900 font-semibold text-sm">{order.notes}</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => markAsReady(order.id)}
                className="w-full bg-green-500 hover:bg-green-600 active:scale-[0.98] text-white font-bold py-4 rounded-xl flex justify-center items-center gap-2 transition-all shadow-sm shadow-green-200"
              >
                <CheckCircle2 size={24} />
                Pronto para Entrega
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}