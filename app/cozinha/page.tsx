"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { CheckCircle2, Clock, Bookmark, Plus, X, Loader2, Pencil, Trash2, Check } from "lucide-react";

export default function CozinhaPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [addNewItemId, setAddNewItemId] = useState("");
  const [addNewItemQty, setAddNewItemQty] = useState(1);
  const [editingOrderNote, setEditingOrderNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [viewFilter, setViewFilter] = useState("todos");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) window.location.href = "/login";
    });

    fetchItems();
    fetchPendingOrders();
    
    const subscription = supabase
      .channel('novos_pedidos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => { fetchPendingOrders(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => { fetchPendingOrders(); })
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, []);

  async function fetchItems() {
    const { data } = await supabase.from("items").select("*").order("name");
    if (data) setItems(data);
  }

  async function fetchPendingOrders() {
    const { data } = await supabase
      .from("orders")
      .select(`*, order_items ( id, item_id, quantity, price_at_time, items ( name, price ) )`)
      .in("status", ["pendente", "reserva"])
      .order("created_at", { ascending: true });
    if (data) setOrders(data);
  }

  async function markAsReady(orderId: string) {
    const { error } = await supabase.from("orders").update({ status: "pronto" }).eq("id", orderId);
    if (!error) setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }

  async function markItemPartiallyReady(order: any, orderItemId: string) {
    const currentPreparo = order.status_preparo ? JSON.parse(order.status_preparo) : {};
    const currentDelivered = currentPreparo[orderItemId] || 0;
    const oi = order.order_items.find((o: any) => o.id === orderItemId);
    
    if (!oi || currentDelivered >= oi.quantity) return;

    const newPreparo = { ...currentPreparo, [orderItemId]: currentDelivered + 1 };
    
    setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status_preparo: JSON.stringify(newPreparo) } : o));

    await supabase.from("orders").update({ status_preparo: JSON.stringify(newPreparo) }).eq("id", order.id);

    let allDelivered = true;
    for (const item of order.order_items) {
      if ((newPreparo[item.id] || 0) < item.quantity) {
        allDelivered = false;
        break;
      }
    }

    if (allDelivered) {
      markAsReady(order.id);
    }
  }

  async function handleSaveOrderEdit() {
    if (!editingOrder) return;
    setIsLoading(true);

    try {
      const { data: originalItems, error: fetchErr } = await supabase
        .from("order_items")
        .select("id, item_id, quantity")
        .eq("order_id", editingOrder.id);
      if (fetchErr) throw new Error(fetchErr.message);

      const origMap: Record<string, { id: string; quantity: number }> = {};
      for (const oi of (originalItems || [])) {
        origMap[oi.item_id] = { id: oi.id, quantity: oi.quantity };
      }

      const newMap: Record<string, { orderItemId?: string; quantity: number; price: number }> = {};
      for (const oi of editingOrder.order_items) {
        newMap[oi.item_id] = { orderItemId: origMap[oi.item_id]?.id, quantity: oi.quantity, price: oi.price_at_time };
      }

      for (const [itemId, orig] of Object.entries(origMap)) {
        const newEntry = newMap[itemId];
        const diff = (newEntry?.quantity ?? 0) - orig.quantity;
        if (diff !== 0) {
          const { data: stockData } = await supabase.from("items").select("stock_quantity").eq("id", itemId).single();
          await supabase.from("items").update({ stock_quantity: (stockData?.stock_quantity || 0) - diff }).eq("id", itemId);
        }
        if (!newEntry || newEntry.quantity <= 0) {
          await supabase.from("order_items").delete().eq("id", orig.id);
        } else if (diff !== 0) {
          await supabase.from("order_items").update({ quantity: newEntry.quantity }).eq("id", orig.id);
        }
      }

      for (const [itemId, entry] of Object.entries(newMap)) {
        if (!origMap[itemId]) {
          const { data: stockData } = await supabase.from("items").select("stock_quantity").eq("id", itemId).single();
          await supabase.from("items").update({ stock_quantity: (stockData?.stock_quantity || 0) - entry.quantity }).eq("id", itemId);
          await supabase.from("order_items").insert({ order_id: editingOrder.id, item_id: itemId, quantity: entry.quantity, price_at_time: entry.price });
        }
      }

      const newTotal = editingOrder.order_items.reduce((acc: number, oi: any) => acc + Number(oi.price_at_time ?? oi.items?.price ?? 0) * oi.quantity, 0);
      
      let updatedNotes = editingOrder.notes || "";
      if (editingOrderNote.trim() !== "") {
        const appended = `[Editado na Cozinha]: ${editingOrderNote.trim()}`;
        updatedNotes = updatedNotes ? `${updatedNotes}\n${appended}` : appended;
      }

      await supabase.from("orders").update({ total_amount: newTotal, notes: updatedNotes }).eq("id", editingOrder.id);

      setEditingOrder(null);
      setEditingOrderNote("");

      setTimeout(() => {
        fetchPendingOrders();
        fetchItems();
      }, 300);

    } catch (err) {
      alert("Erro ao salvar pedido: " + err);
    } finally {
      setIsLoading(false);
    }
  }

  function getMinutesAgo(dateString: string) {
    const diff = new Date().getTime() - new Date(dateString).getTime();
    return Math.floor(diff / 60000);
  }

  const pedidosAgora = orders.filter(o => o.status !== "reserva");
  const pedidosReserva = orders.filter(o => o.status === "reserva");

  const renderOrder = (order: any) => {
    const isReserva = order.status === "reserva";
    const minutes = getMinutesAgo(order.created_at);
    const isLate = minutes > 10;
    const barColor = isReserva ? "bg-violet-500" : isLate ? "bg-red-500" : "bg-blue-500";
    const preparoMap = order.status_preparo ? JSON.parse(order.status_preparo) : {};

    return (
      <div
        key={order.id}
        className={`bg-white rounded-2xl p-6 border-2 shadow-sm flex flex-col relative overflow-hidden transition-all ${
          isReserva ? "border-violet-200" : "border-slate-200"
        }`}
      >
        <div className={`absolute top-0 left-0 w-full h-1.5 ${barColor}`} />

        <div className="flex justify-between items-start mb-4 mt-2 gap-2">
          <div className="min-w-0">
            <h2 className="text-4xl font-black text-slate-800 tracking-tighter truncate">#{order.order_number}</h2>
            <p className="text-slate-500 font-medium mt-1 truncate">{order.customer_name || "Sem nome"}</p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {isReserva && (
              <span className="inline-flex items-center gap-1 bg-violet-100 text-violet-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                <Bookmark size={10} /> Reserva
              </span>
            )}
            <div className={`flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${isLate ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
              <Clock size={14} className="mr-1" /> {minutes}m
            </div>
          </div>
        </div>

        <div className="flex-1">
          <div className="flex justify-between items-end mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Itens</span>
            <button
              onClick={() => {
                setEditingOrder(order);
                setEditingOrderNote("");
              }}
              className="text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
            >
              <Pencil size={14} strokeWidth={3} /> Editar
            </button>
          </div>
          <ul className="space-y-2.5 mb-4">
            {order.order_items.map((oi: any) => {
              const delivered = preparoMap[oi.id] || 0;
              const isFullyDelivered = delivered >= oi.quantity;
              
              return (
                <li key={oi.id} className="flex flex-col bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center text-sm">
                      <span className="bg-slate-200 text-slate-800 font-black px-2 py-0.5 rounded-md mr-2">
                        {oi.quantity}x
                      </span>
                      <span className={`font-black text-lg ${isFullyDelivered ? 'text-slate-400 line-through' : 'text-slate-800'} leading-tight`}>
                        {oi.items?.name}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs font-bold text-slate-400">
                      Entregue: {delivered}/{oi.quantity}
                    </span>
                    {!isFullyDelivered && (
                      <button
                        onClick={() => markItemPartiallyReady(order, oi.id)}
                        className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                      >
                        <Plus size={12} strokeWidth={3} /> Entregar 1
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {order.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">📝 Observação</p>
              <p className="text-amber-900 font-semibold text-sm">{order.notes}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 mt-auto">
          <button
            onClick={() => markAsReady(order.id)}
            className={`w-full text-white font-bold py-3.5 rounded-xl flex justify-center items-center gap-2 transition-all shadow-sm active:scale-[0.98] ${
              isReserva
                ? "bg-violet-500 hover:bg-violet-600 shadow-violet-200"
                : "bg-green-500 hover:bg-green-600 shadow-green-200"
            }`}
          >
            <CheckCircle2 size={20} />
            {isReserva ? "Reserva Entregue" : "Tudo Entregue"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-8 min-h-[calc(100vh-64px)] bg-slate-50 relative">
      
      {/* Modal Editar Pedido */}
      {editingOrder && (() => {
        const getPrice = (oi: any) => Number(oi.price_at_time ?? oi.items?.price ?? 0);
        const alreadyInOrder = new Set(editingOrder.order_items.map((oi: any) => oi.item_id));
        const availableToAdd = items.filter((it) => !alreadyInOrder.has(it.id) && it.stock_quantity > 0);
        
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setEditingOrder(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
              style={{ maxHeight: "90vh", animation: "modalIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 to-violet-600 flex-shrink-0" />
              <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <Pencil size={18} className="text-indigo-500" />
                    Editar Pedido #{editingOrder.order_number}
                  </h2>
                  <p className="text-sm text-slate-500 font-medium mt-0.5">{editingOrder.customer_name || "Sem nome"}</p>
                </div>
                <button onClick={() => setEditingOrder(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 p-5 space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Itens do pedido</p>
                {editingOrder.order_items.map((oi: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="flex-1 font-semibold text-slate-800 text-sm">{oi.items?.name}</p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          const newItems = editingOrder.order_items.map((o: any, i: number) =>
                            i === idx ? { ...o, quantity: Math.max(0, o.quantity - 1) } : o
                          ).filter((o: any) => o.quantity > 0);
                          setEditingOrder({ ...editingOrder, order_items: newItems });
                        }}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:border-rose-300 hover:text-rose-500 flex items-center justify-center font-black text-slate-600 transition-colors"
                      >−</button>
                      <span className="w-8 text-center font-black text-slate-800 text-sm">{oi.quantity}</span>
                      <button
                        onClick={() => {
                          const newItems = editingOrder.order_items.map((o: any, i: number) =>
                            i === idx ? { ...o, quantity: o.quantity + 1 } : o
                          );
                          setEditingOrder({ ...editingOrder, order_items: newItems });
                        }}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-500 flex items-center justify-center font-black text-slate-600 transition-colors"
                      >+</button>
                    </div>
                    <button
                      onClick={() => {
                        const newItems = editingOrder.order_items.filter((_: any, i: number) => i !== idx);
                        setEditingOrder({ ...editingOrder, order_items: newItems });
                      }}
                      className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}

                {availableToAdd.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Adicionar produto</p>
                    <div className="flex gap-2 items-end">
                      <select
                        value={addNewItemId}
                        onChange={(e) => setAddNewItemId(e.target.value)}
                        className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 focus:border-indigo-500 focus:outline-none bg-white"
                      >
                        <option value="">Escolha...</option>
                        {availableToAdd.map((it) => (
                          <option key={it.id} value={it.id}>{it.name} (est. {it.stock_quantity})</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={addNewItemQty}
                        onChange={(e) => setAddNewItemQty(Math.max(1, Number(e.target.value)))}
                        className="w-16 border-2 border-slate-200 rounded-xl px-2 py-2.5 text-sm font-bold text-center text-slate-700 focus:border-indigo-500 focus:outline-none"
                      />
                      <button
                        onClick={() => {
                          if (!addNewItemId) return;
                          const itemToAdd = items.find((it) => it.id === addNewItemId);
                          if (!itemToAdd) return;
                          if (addNewItemQty > itemToAdd.stock_quantity) return;
                          setEditingOrder({
                            ...editingOrder,
                            order_items: [
                              ...editingOrder.order_items,
                              { item_id: itemToAdd.id, items: { name: itemToAdd.name }, quantity: addNewItemQty, price_at_time: itemToAdd.price }
                            ]
                          });
                          setAddNewItemId("");
                          setAddNewItemQty(1);
                        }}
                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors flex items-center gap-1"
                      >
                        <Plus size={16} /> Add
                      </button>
                    </div>
                  </div>
                )}
                
                <div className="pt-4">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Adicionar Observação à Comanda</label>
                  <input 
                    type="text"
                    value={editingOrderNote}
                    onChange={(e) => setEditingOrderNote(e.target.value)}
                    placeholder="Ex: Cliente pediu pra viagem..."
                    className="w-full border-2 border-slate-200 p-3 rounded-xl focus:border-indigo-500 focus:outline-none text-slate-700"
                  />
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 bg-slate-50 flex-shrink-0">
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditingOrder(null)}
                    className="flex-1 border-2 border-slate-200 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-100 transition-colors"
                  >Cancelar</button>
                  <button
                    onClick={handleSaveOrderEdit}
                    disabled={isLoading}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    {isLoading ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18} /> Salvar Alterações</>}
                  </button>
                </div>
              </div>
              <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.88) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
            </div>
          </div>
        );
      })()}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Cozinha</h1>
          <p className="text-slate-500 font-medium mt-1">{orders.length} pedidos na fila</p>
        </div>
        <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1">
          <button 
            onClick={() => setViewFilter("todos")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${viewFilter === "todos" ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-800"}`}
          >
            Todos
          </button>
          <button 
            onClick={() => setViewFilter("atuais")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${viewFilter === "atuais" ? "bg-blue-600 text-white" : "text-slate-500 hover:text-blue-600"}`}
          >
            Atuais
          </button>
          <button 
            onClick={() => setViewFilter("reservas")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${viewFilter === "reservas" ? "bg-violet-600 text-white" : "text-slate-500 hover:text-violet-600"}`}
          >
            Reservas
          </button>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="py-20 text-center">
           <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full text-green-500 mb-4">
              <CheckCircle2 size={40} />
           </div>
           <h2 className="text-xl font-bold text-slate-700">Tudo limpo por aqui!</h2>
           <p className="text-slate-500">Aguardando novos pedidos...</p>
        </div>
      ) : (
        <div className="space-y-12">
          {pedidosAgora.length > 0 && (viewFilter === "todos" || viewFilter === "atuais") && (
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-5 flex items-center gap-2 border-b-2 border-slate-200 pb-2 inline-flex">
                <Clock size={20} className="text-blue-500" /> 
                Pedidos Atuais
                <span className="bg-blue-100 text-blue-700 text-sm py-0.5 px-2.5 rounded-full ml-2">{pedidosAgora.length}</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
                {pedidosAgora.map(renderOrder)}
              </div>
            </div>
          )}

          {pedidosReserva.length > 0 && (viewFilter === "todos" || viewFilter === "reservas") && (
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-5 flex items-center gap-2 border-b-2 border-slate-200 pb-2 inline-flex">
                <Bookmark size={20} className="text-violet-500" /> 
                Reservas
                <span className="bg-violet-100 text-violet-700 text-sm py-0.5 px-2.5 rounded-full ml-2">{pedidosReserva.length}</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
                {pedidosReserva.map(renderOrder)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}