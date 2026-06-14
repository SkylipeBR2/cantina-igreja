"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Plus, Trash2, Download, Package, DollarSign, Receipt, LayoutDashboard, XCircle, CalendarDays, Bookmark, Pencil, X, Check, History } from "lucide-react";
import Modal from "../../components/Modal";
import { useModal } from "../../hooks/useModal";

export default function AdminPage() {
  const [items, setItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [totalArrecadado, setTotalArrecadado] = useState(0);
  const [filtro, setFiltro] = useState("todas");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [filtroPayment, setFiltroPayment] = useState("todos");
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [addNewItemId, setAddNewItemId] = useState("");
  const [addNewItemQty, setAddNewItemQty] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  const [auditLog, setAuditLog] = useState<any[]>([]);

  const { options, close, showModal, showConfirm } = useModal();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) window.location.href = "/login";
    });
    fetchItems();
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [filtro, dataInicio, dataFim]);

  // Pedidos filtrados pelo método de pagamento (client-side)
  const filteredOrders = filtroPayment === "todos"
    ? orders
    : orders.filter((o) => o.payment_method === filtroPayment);

  const totalFiltrado = filteredOrders.reduce((acc, o) => acc + Number(o.total_amount), 0);

  // Calcula o total de itens vendidos
  const totalItensVendidos = filteredOrders.reduce((acc, order) => {
    const itensNestePedido = order.order_items?.reduce((sum: number, oi: any) => sum + (oi.quantity || 0), 0) || 0;
    return acc + itensNestePedido;
  }, 0);

  async function fetchAuditLog() {
    const { data } = await supabase
      .from("order_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) setAuditLog(data);
  }

  async function fetchItems() {
    const { data } = await supabase.from("items").select("*").order("name");
    if (data) setItems(data);
  }

  function getDateRange(): { from: string | null; to: string | null } {
    const now = new Date();

    if (filtro === "personalizado") {
      return {
        from: dataInicio ? new Date(dataInicio + "T00:00:00").toISOString() : null,
        to: dataFim ? new Date(dataFim + "T23:59:59").toISOString() : null,
      };
    }

    const inicio = new Date(now);
    inicio.setHours(0, 0, 0, 0);

    switch (filtro) {
      case "hoje":
        break;
      case "ontem":
        inicio.setDate(inicio.getDate() - 1);
        const fimOntem = new Date(inicio);
        fimOntem.setHours(23, 59, 59, 999);
        return { from: inicio.toISOString(), to: fimOntem.toISOString() };
      case "7dias":
        inicio.setDate(inicio.getDate() - 7);
        break;
      case "30dias":
        inicio.setDate(inicio.getDate() - 30);
        break;
      case "todas":
        return { from: null, to: null };
    }

    return { from: inicio.toISOString(), to: null };
  }

  async function fetchOrders() {
    const { from, to } = getDateRange();

    let query = supabase
      .from("orders")
      .select(`*, order_items ( item_id, quantity, price_at_time, items ( name, price ) )`)
      .order("created_at", { ascending: false });

    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);

    const { data } = await query;

    if (data) {
      setOrders(data);
      const total = data.reduce((acc, order) => acc + Number(order.total_amount), 0);
      setTotalArrecadado(total);
    }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !price || !stock) {
      showModal("warning", "Campos obrigatórios", "Preencha todos os campos antes de salvar.");
      return;
    }

    const { error } = await supabase.from("items").insert([
      { name, price: parseFloat(price), stock_quantity: parseInt(stock) },
    ]);

    if (error) {
      showModal("error", "Erro ao adicionar", error.message);
    } else {
      setName(""); setPrice(""); setStock(""); fetchItems();
      showModal("success", "Produto salvo!", `"${name}" foi adicionado ao estoque com sucesso.`);
    }
  }

  async function handleDeleteItem(id: string) {
    const confirmed = await showConfirm(
      "Excluir produto",
      "Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.",
      "Sim, excluir",
      "Cancelar"
    );
    if (!confirmed) return;

    const { error } = await supabase.from("items").delete().eq("id", id);

    if (error) {
      showModal(
        "warning",
        "Bloqueio de Segurança",
        "Este item não pode ser excluído porque já existe uma venda registrada com ele.\n\nPara removê-lo da tela do Caixa, atualize o estoque para 0 (zero)."
      );
    } else {
      fetchItems();
    }
  }

  async function handleEditItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem) return;
    const { id, name: eName, price: ePrice, stock_quantity: eStock } = editingItem;
    if (!eName || ePrice === "" || eStock === "") {
      showModal("warning", "Campos obrigatórios", "Preencha todos os campos antes de salvar.");
      return;
    }
    const { error } = await supabase
      .from("items")
      .update({ name: eName, price: parseFloat(ePrice), stock_quantity: parseInt(eStock) })
      .eq("id", id);
    if (error) {
      showModal("error", "Erro ao editar", error.message);
    } else {
      setEditingItem(null);
      fetchItems();
      showModal("success", "Produto atualizado!", `"${eName}" foi atualizado com sucesso.`);
    }
  }

  async function handleCancelOrder(orderId: string) {
    const confirmed = await showConfirm(
      "Cancelar pedido?",
      "Os itens serão devolvidos ao estoque e a venda será removida do sistema.\n\nDeseja continuar?",
      "Sim, cancelar",
      "Voltar"
    );
    if (!confirmed) return;

    try {
      const { data: orderItems, error: fetchError } = await supabase
        .from("order_items")
        .select("item_id, quantity")
        .eq("order_id", orderId);

      if (fetchError) throw new Error("Erro ao buscar itens do pedido: " + fetchError.message);

      if (orderItems && orderItems.length > 0) {
        for (const oi of orderItems) {
          const { data: currentItem, error: itemError } = await supabase
            .from("items")
            .select("stock_quantity")
            .eq("id", oi.item_id)
            .single();

          if (itemError) {
            console.error(`Erro ao buscar item ${oi.item_id}:`, itemError);
            continue;
          }

          const newStock = (currentItem?.stock_quantity || 0) + oi.quantity;
          await supabase
            .from("items")
            .update({ stock_quantity: newStock })
            .eq("id", oi.item_id);
        }
      }

      await supabase.from("order_items").delete().eq("order_id", orderId);

      const { error: deleteError } = await supabase.from("orders").delete().eq("id", orderId);
      if (deleteError) throw new Error("Erro ao excluir o pedido: " + deleteError.message);

      showModal("success", "Pedido cancelado!", "Os itens foram devolvidos ao estoque com sucesso.");
      fetchOrders();
      fetchItems();
    } catch (err: any) {
      showModal("error", "Erro ao cancelar", err.message);
    }
  }

  async function handleSaveOrderEdit() {
    if (!editingOrder) return;
    try {
      // Busca os itens originais do pedido
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

      // Ajusta estoque e order_items
      for (const [itemId, orig] of Object.entries(origMap)) {
        const newEntry = newMap[itemId];
        const diff = (newEntry?.quantity ?? 0) - orig.quantity; // positivo = mais, negativo = devolveu
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

      // Adiciona itens novos (não estavam no pedido original)
      for (const [itemId, entry] of Object.entries(newMap)) {
        if (!origMap[itemId]) {
          const { data: stockData } = await supabase.from("items").select("stock_quantity").eq("id", itemId).single();
          await supabase.from("items").update({ stock_quantity: (stockData?.stock_quantity || 0) - entry.quantity }).eq("id", itemId);
          await supabase.from("order_items").insert({ order_id: editingOrder.id, item_id: itemId, quantity: entry.quantity, price_at_time: entry.price });
        }
      }

      // Recalcula total
      const newTotal = editingOrder.order_items.reduce((acc: number, oi: any) => acc + Number(oi.price_at_time ?? oi.items?.price ?? 0) * oi.quantity, 0);
      await supabase.from("orders").update({ total_amount: newTotal }).eq("id", editingOrder.id);

      // --- Grava log de auditoria ---
      const auditEntries: any[] = [];
      // Itens removidos
      for (const [itemId, orig] of Object.entries(origMap)) {
        const newEntry = newMap[itemId];
        const itemName = editingOrder.order_items.find((o: any) => o.item_id === itemId)?.items?.name
          || items.find((it) => it.id === itemId)?.name
          || itemId;
        if (!newEntry || newEntry.quantity <= 0) {
          auditEntries.push({ order_id: editingOrder.id, order_number: editingOrder.order_number, action: "removão", details: `Item "${itemName}" removido do pedido` });
        } else if (newEntry.quantity !== orig.quantity) {
          auditEntries.push({ order_id: editingOrder.id, order_number: editingOrder.order_number, action: "edição", details: `Quantidade de "${itemName}" alterada: ${orig.quantity} → ${newEntry.quantity}` });
        }
      }
      // Itens adicionados
      for (const [itemId, entry] of Object.entries(newMap)) {
        if (!origMap[itemId]) {
          const itemName = editingOrder.order_items.find((o: any) => o.item_id === itemId)?.items?.name
            || items.find((it) => it.id === itemId)?.name
            || itemId;
          auditEntries.push({ order_id: editingOrder.id, order_number: editingOrder.order_number, action: "adição", details: `Item "${itemName}" adicionado (${entry.quantity}x)` });
        }
      }
      if (auditEntries.length > 0) {
        await supabase.from("order_audit_log").insert(auditEntries);
      }
      // --- Fim do log ---

      setEditingOrder(null);
      setAddNewItemId("");
      setAddNewItemQty(1);
      fetchOrders();
      fetchItems();
      showModal("success", "Pedido atualizado!", "As alterações foram salvas e o estoque foi ajustado.");
    } catch (err: any) {
      showModal("error", "Erro ao salvar", err.message);
    }
  }

  function openEditOrder(order: any) {
    // Copia profunda dos itens para não mutar o state original
    setEditingOrder({
      ...order,
      order_items: order.order_items.map((oi: any) => ({ ...oi, item_id: oi.item_id || oi.items?.id }))
    });
    setAddNewItemId("");
    setAddNewItemQty(1);
  }

  function exportToCSV() {
    if (orders.length === 0) {
      showModal("info", "Sem dados", "Não há vendas no período selecionado para exportar.");
      return;
    }

    const headers = ["Ticket", "Cliente", "Data", "Hora", "Pagamento", "Total (R$)", "Itens", "Observação"];
    const rows = orders.map(order => {
      const data = new Date(order.created_at);
      const itensFormatados = order.order_items.map((oi: any) => `${oi.quantity}x ${oi.items?.name}`).join(" | ");
      return [
        order.order_number,
        order.customer_name || "Anônimo",
        data.toLocaleDateString(),
        data.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        order.payment_method.toUpperCase(),
        Number(order.total_amount).toFixed(2).replace(".", ","),
        `"${itensFormatados}"`,
        `"${order.notes || ''}"`
      ];
    });

    const csvContent = "\ufeff" + [headers, ...rows].map(e => e.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `relatorio_vendas_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <>
      <Modal options={options} onClose={close} />

      {/* Drawer: Histórico de Movimentações */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 flex"
          onClick={() => setShowHistory(false)}
        >
          {/* Fundo escuro com blur */}
          <div className="flex-1 bg-black/40 backdrop-blur-sm" />
          {/* Painel lateral */}
          <div
            className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl"
            style={{ animation: "slideIn 0.3s cubic-bezier(0.22,1,0.36,1) both" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 to-orange-500" />
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <History size={18} className="text-amber-500" />
                Histórico de Movimentações
              </h2>
              <button onClick={() => setShowHistory(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {auditLog.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                  <History size={40} className="opacity-20" />
                  <p className="font-medium text-sm">Nenhuma movimentação registrada ainda.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {auditLog.map((entry) => {
                    const isAdd = entry.action === "adição";
                    const isRemove = entry.action === "remoção";
                    const date = new Date(entry.created_at);
                    const dateStr = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                    const timeStr = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={entry.id} className="flex gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                          isAdd ? "bg-emerald-500" : isRemove ? "bg-rose-500" : "bg-amber-500"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-800 leading-snug">{entry.details}</span>
                            <span className="text-xs font-bold text-indigo-600 whitespace-nowrap">#{entry.order_number}</span>
                          </div>
                          <p className="text-xs text-slate-400 font-medium mt-1">{dateStr} às {timeStr}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
        </div>
      )}

      {/* Modal de Edição de Pedido */}
      {editingOrder && (() => {
        const getPrice = (oi: any) => Number(oi.price_at_time ?? oi.items?.price ?? 0);
        const editTotal = editingOrder.order_items.reduce((acc: number, oi: any) => acc + getPrice(oi) * oi.quantity, 0);
        const alreadyInOrder = new Set(editingOrder.order_items.map((oi: any) => oi.item_id));
        const availableToAdd = items.filter((it) => !alreadyInOrder.has(it.id) && it.stock_quantity > 0);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}
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
                    <p className="text-xs text-slate-500 font-medium w-20 text-right">R$ {(getPrice(oi) * oi.quantity).toFixed(2)}</p>
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

                {/* Adicionar novo produto */}
                {availableToAdd.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Adicionar produto ao pedido</p>
                    <div className="flex gap-2 items-end">
                      <select
                        value={addNewItemId}
                        onChange={(e) => setAddNewItemId(e.target.value)}
                        className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 focus:border-indigo-500 focus:outline-none bg-white"
                      >
                        <option value="">Escolha um produto...</option>
                        {availableToAdd.map((it) => (
                          <option key={it.id} value={it.id}>{it.name} — R$ {it.price.toFixed(2)} (est. {it.stock_quantity})</option>
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
                          if (addNewItemQty > itemToAdd.stock_quantity) {
                            showModal("warning", "Estoque insuficiente", `Só há ${itemToAdd.stock_quantity} unidade(s) de "${itemToAdd.name}" no estoque.`);
                            return;
                          }
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
              </div>

              {/* Rodapé com total e salvar */}
              <div className="p-5 border-t border-slate-100 bg-slate-50 flex-shrink-0">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Total atualizado</span>
                  <span className="text-2xl font-black text-slate-900">R$ {editTotal.toFixed(2)}</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditingOrder(null)}
                    className="flex-1 border-2 border-slate-200 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-100 transition-colors"
                  >Cancelar</button>
                  <button
                    onClick={handleSaveOrderEdit}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Check size={18} /> Salvar Alterações
                  </button>
                </div>
              </div>
              <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.88) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
            </div>
          </div>
        );
      })()}

      {/* Modal de Edição de Produto */}
      {editingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
          onClick={() => setEditingItem(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: "modalIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}
          >
            <div className="h-1.5 w-full bg-gradient-to-r from-blue-400 to-indigo-600" />
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Pencil size={18} className="text-blue-500" /> Editar Produto
                </h2>
                <button onClick={() => setEditingItem(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleEditItem} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Nome do Item</label>
                  <input
                    type="text"
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="w-full border-2 border-slate-200 p-3 rounded-xl focus:border-blue-500 focus:outline-none text-slate-900"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Preço (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingItem.price}
                      onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })}
                      className="w-full border-2 border-slate-200 p-3 rounded-xl focus:border-blue-500 focus:outline-none text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Estoque</label>
                    <input
                      type="number"
                      value={editingItem.stock_quantity}
                      onChange={(e) => setEditingItem({ ...editingItem, stock_quantity: e.target.value })}
                      className="w-full border-2 border-slate-200 p-3 rounded-xl focus:border-blue-500 focus:outline-none text-slate-900"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="flex-1 border-2 border-slate-200 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Check size={18} /> Salvar
                  </button>
                </div>
              </form>
            </div>
            <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.85) translateY(16px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
          </div>
        </div>
      )}

      <div className="p-4 lg:p-8 min-h-[calc(100vh-64px)] bg-[#F8FAFC]">
        
        {/* Cabeçalho e Estatísticas */}
        <div className="mb-8">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-slate-800 p-3 rounded-2xl text-white shadow-lg">
                <LayoutDashboard size={24} />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Painel Admin</h1>
                <p className="text-slate-500 font-medium">Gerencie o estoque e acompanhe as vendas</p>
              </div>
            </div>
            <button
              onClick={() => { fetchAuditLog(); setShowHistory(true); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 font-bold text-sm hover:bg-amber-100 transition-colors"
            >
              <History size={18} />
              Histórico
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign size={28} />
              </div>
              <div>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">Arrecadado</p>
                <p className="text-3xl font-black text-slate-900">R$ {totalFiltrado.toFixed(2)}</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Receipt size={28} />
              </div>
              <div>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">Pedidos</p>
                <p className="text-3xl font-black text-slate-900">{filteredOrders.length}</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center">
                <Package size={28} />
              </div>
              <div>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">Produtos Vendidos</p>
                <p className="text-3xl font-black text-slate-900">{totalItensVendidos}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Coluna Esquerda: Cadastro e Estoque */}
          <div className="lg:col-span-1 space-y-8">
            
            {/* Cadastro de Produto */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h2 className="text-xl font-bold text-slate-800 mb-5 flex items-center gap-2">
                <Package size={20} className="text-blue-500"/> Cadastrar Produto
              </h2>
              <form onSubmit={handleAddItem} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Nome do Item</label>
                  <input 
                    type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Refrigerante Lata" 
                    className="w-full border-2 border-slate-200 p-3 rounded-xl focus:border-blue-500 focus:outline-none text-slate-900 placeholder:text-slate-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Preço (R$)</label>
                    <input 
                      type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" 
                      className="w-full border-2 border-slate-200 p-3 rounded-xl focus:border-blue-500 focus:outline-none text-slate-900 placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Estoque Inicial</label>
                    <input 
                      type="number" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" 
                      className="w-full border-2 border-slate-200 p-3 rounded-xl focus:border-blue-500 focus:outline-none text-slate-900 placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <button type="submit" className="w-full bg-slate-800 text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-900 transition-colors">
                  <Plus size={20} /> Salvar Produto
                </button>
              </form>
            </div>

            {/* Lista de Estoque */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col" style={{maxHeight: '420px'}}>
              <h2 className="text-xl font-bold text-slate-800 mb-5 flex-shrink-0">Estoque Atual</h2>
              <div className="space-y-3 overflow-y-auto pr-2 flex-1 min-h-0">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between items-center p-4 rounded-2xl bg-slate-50 border border-slate-100 group">
                    <div>
                      <p className="font-bold text-slate-800">{item.name}</p>
                      <div className="flex gap-3 text-sm mt-1">
                        <span className="text-slate-500 font-medium">R$ {item.price.toFixed(2)}</span>
                        <span className={`font-bold ${item.stock_quantity > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                          Estoque: {item.stock_quantity}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingItem({ ...item })}
                        className="text-slate-400 hover:text-blue-500 transition-colors p-2 bg-white rounded-full shadow-sm border border-slate-100"
                        title="Editar item"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-slate-400 hover:text-rose-500 transition-colors p-2 bg-white rounded-full shadow-sm border border-slate-100"
                        title="Apagar item"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Coluna Direita: Log de Vendas */}
          <div className="lg:col-span-2">
            <div className="bg-white p-6 lg:p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col" style={{maxHeight: '780px'}}>
              
              <div className="flex flex-col gap-4 mb-8 flex-shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <CalendarDays size={20} className="text-blue-500" /> Log de Vendas
                  </h2>
                  <button 
                    onClick={exportToCSV}
                    className="bg-emerald-50 text-emerald-700 px-5 py-2.5 rounded-full font-bold text-sm hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2 border border-emerald-200"
                  >
                    <Download size={18} /> Exportar Excel
                  </button>
                </div>

                {/* Filtros de Data */}
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { key: "hoje", label: "Hoje" },
                    { key: "ontem", label: "Ontem" },
                    { key: "7dias", label: "7 dias" },
                    { key: "30dias", label: "30 dias" },
                    { key: "todas", label: "Todas" },
                    { key: "personalizado", label: "Personalizado" },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setFiltro(f.key)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                        filtro === f.key
                          ? "bg-slate-800 text-white border-slate-800 shadow-sm"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Campos de data personalizada */}
                {filtro === "personalizado" && (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-500">De:</label>
                      <input
                        type="date"
                        value={dataInicio}
                        onChange={(e) => setDataInicio(e.target.value)}
                        className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-500">Até:</label>
                      <input
                        type="date"
                        value={dataFim}
                        onChange={(e) => setDataFim(e.target.value)}
                        className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Filtro de Pagamento */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Pagamento:</span>
                  <select
                    value={filtroPayment}
                    onChange={(e) => setFiltroPayment(e.target.value)}
                    className="border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:border-blue-500 focus:outline-none bg-white cursor-pointer"
                  >
                    <option value="todos">Todos</option>
                    <option value="dinheiro">💵 Dinheiro</option>
                    <option value="pix">📱 PIX</option>
                    <option value="cartao">💳 Cartão</option>
                  </select>
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <Receipt size={48} className="opacity-20 mb-4" />
                  <p className="font-medium">Nenhuma venda encontrada para este filtro.</p>
                </div>
              ) : (
                <div className="overflow-auto flex-1 min-h-0">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-slate-100 text-slate-500 text-sm uppercase tracking-wider">
                        <th className="pb-4 font-bold px-4">Ticket</th>
                        <th className="pb-4 font-bold px-4">Cliente</th>
                        <th className="pb-4 font-bold px-4">Itens</th>
                        <th className="pb-4 font-bold px-4">Pagamento</th>
                        <th className="pb-4 font-bold text-right px-4">Total</th>
                        <th className="pb-4 font-bold text-center px-4">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700">
                      {filteredOrders.map((order) => (
                        <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="py-4 px-4 font-black text-slate-900">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                #{order.order_number}
                                {order.status === "reserva" && (
                                  <span className="inline-flex items-center gap-1 bg-violet-100 text-violet-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                                    <Bookmark size={10} /> Reserva
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 font-medium">
                                {new Date(order.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às {new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4 font-medium">{order.customer_name || "-"}</td>
                          <td className="py-4 px-4 text-sm">
                            <div>{order.order_items.map((oi: any) => `${oi.quantity}x ${oi.items?.name}`).join(", ")}</div>
                            {order.notes && (
                              <p className="text-xs text-amber-600 font-semibold mt-1 italic">📝 {order.notes}</p>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2.5 py-1 rounded-md uppercase">
                              {order.payment_method}
                            </span>
                          </td>
                          <td className="py-4 px-4 font-bold text-right text-slate-900">
                            R$ {Number(order.total_amount).toFixed(2)}
                          </td>
                          <td className="py-4 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => openEditOrder(order)}
                                className="inline-flex items-center gap-1.5 text-indigo-500 hover:bg-indigo-50 border border-indigo-200 hover:border-indigo-300 transition-all px-3 py-1.5 rounded-xl font-bold text-xs"
                                title="Editar pedido"
                              >
                                <Pencil size={14} />
                                Editar
                              </button>
                              <button 
                                onClick={() => handleCancelOrder(order.id)}
                                className="inline-flex items-center gap-1.5 text-rose-500 hover:bg-rose-50 border border-rose-200 hover:border-rose-300 transition-all px-3 py-1.5 rounded-xl font-bold text-xs"
                                title="Cancelar pedido e devolver ao estoque"
                              >
                                <XCircle size={16} />
                                Cancelar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}