"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Plus, Trash2, Download, Package, DollarSign, Receipt, LayoutDashboard, XCircle, CalendarDays } from "lucide-react";

export default function AdminPage() {
  const [items, setItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [totalArrecadado, setTotalArrecadado] = useState(0);
  const [filtro, setFiltro] = useState("hoje");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) window.location.href = "/login";
    });
    fetchItems();
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [filtro, dataInicio, dataFim]);

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
      .select(`*, order_items ( quantity, items ( name ) )`)
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
    if (!name || !price || !stock) return alert("Preencha todos os campos");

    const { error } = await supabase.from("items").insert([
      { name, price: parseFloat(price), stock_quantity: parseInt(stock) },
    ]);

    if (error) {
      alert("Erro ao adicionar: " + error.message);
    } else {
      setName(""); setPrice(""); setStock(""); fetchItems();
    }
  }

  // NOVA LÓGICA DE EXCLUSÃO DE ITEM
  async function handleDeleteItem(id: string) {
    if (confirm("Tem certeza que deseja excluir este item?")) {
      const { error } = await supabase.from("items").delete().eq("id", id);
      
      if (error) {
        alert("⚠️ Bloqueio de Segurança: Este item não pode ser excluído porque já existe uma venda registrada com ele. Para removê-lo da tela do Caixa, apenas atualize o Estoque dele para 0 (zero).");
      } else {
        fetchItems();
      }
    }
  }

  // CANCELAR PEDIDO: Devolve ao estoque e apaga a venda
  async function handleCancelOrder(orderId: string) {
    if (!confirm("🚨 CANCELAR PEDIDO?\n\nOs itens serão devolvidos ao estoque e a venda será removida do sistema.\n\nDeseja continuar?")) return;

    try {
      // 1. Buscar os itens do pedido para saber o que devolver ao estoque
      const { data: orderItems, error: fetchError } = await supabase
        .from("order_items")
        .select("item_id, quantity")
        .eq("order_id", orderId);

      if (fetchError) throw new Error("Erro ao buscar itens do pedido: " + fetchError.message);

      // 2. Devolver cada item ao estoque
      if (orderItems && orderItems.length > 0) {
        for (const oi of orderItems) {
          // Buscar estoque atual
          const { data: currentItem, error: itemError } = await supabase
            .from("items")
            .select("stock_quantity")
            .eq("id", oi.item_id)
            .single();

          if (itemError) {
            console.error(`Erro ao buscar item ${oi.item_id}:`, itemError);
            continue;
          }

          // Atualizar estoque somando a quantidade de volta
          const newStock = (currentItem?.stock_quantity || 0) + oi.quantity;
          await supabase
            .from("items")
            .update({ stock_quantity: newStock })
            .eq("id", oi.item_id);
        }
      }

      // 3. Apagar os order_items
      await supabase.from("order_items").delete().eq("order_id", orderId);

      // 4. Apagar a order
      const { error: deleteError } = await supabase.from("orders").delete().eq("id", orderId);

      if (deleteError) throw new Error("Erro ao excluir o pedido: " + deleteError.message);

      alert("✅ Pedido cancelado com sucesso!\nOs itens foram devolvidos ao estoque.");
      fetchOrders();
      fetchItems(); // Atualiza a lista de estoque também
    } catch (err: any) {
      alert("❌ " + err.message);
    }
  }

  function exportToCSV() {
    if (orders.length === 0) return alert("Não há vendas para exportar.");
    
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
    <div className="p-4 lg:p-8 min-h-[calc(100vh-64px)] bg-[#F8FAFC]">
      
      {/* Cabeçalho e Estatísticas */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-slate-800 p-3 rounded-2xl text-white shadow-lg">
            <LayoutDashboard size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Painel Admin</h1>
            <p className="text-slate-500 font-medium">Gerencie o estoque e acompanhe as vendas</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign size={28} />
            </div>
            <div>
              <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">Arrecadado Hoje</p>
              <p className="text-3xl font-black text-slate-900">R$ {totalArrecadado.toFixed(2)}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Receipt size={28} />
            </div>
            <div>
              <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">Vendas Hoje</p>
              <p className="text-3xl font-black text-slate-900">{orders.length} pedidos</p>
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
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h2 className="text-xl font-bold text-slate-800 mb-5">Estoque Atual</h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between items-center p-4 rounded-2xl bg-slate-50 border border-slate-100 group">
                  <div>
                    <p className="font-bold text-slate-800">{item.name}</p>
                    <div className="flex gap-3 text-sm mt-1">
                      <span className="text-slate-500 font-medium">R$ {item.price.toFixed(2)}</span>
                      <span className={`font-bold ${item.stock_quantity > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        Qtd: {item.stock_quantity}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteItem(item.id)} className="text-slate-400 hover:text-rose-500 transition-colors p-2 bg-white rounded-full shadow-sm border border-slate-100" title="Apagar item">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Coluna Direita: Log de Vendas */}
        <div className="lg:col-span-2">
          <div className="bg-white p-6 lg:p-8 rounded-3xl border border-slate-200 shadow-sm h-full">
            
            <div className="flex flex-col gap-4 mb-8">
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
            </div>

            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Receipt size={48} className="opacity-20 mb-4" />
                <p className="font-medium">Nenhuma venda registrada hoje.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
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
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-4 font-black text-slate-900">#{order.order_number}</td>
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
                          <button 
                            onClick={() => handleCancelOrder(order.id)}
                            className="inline-flex items-center gap-1.5 text-rose-500 hover:bg-rose-50 border border-rose-200 hover:border-rose-300 transition-all px-3 py-1.5 rounded-xl font-bold text-xs"
                            title="Cancelar pedido e devolver ao estoque"
                          >
                            <XCircle size={16} />
                            Cancelar
                          </button>
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
  );
}