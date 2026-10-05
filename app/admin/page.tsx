"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Download, Package, Receipt, LayoutDashboard, Search, XCircle } from "lucide-react";
import { CommerceDashboard } from "@/components/ui/commerce-dashboard";
import { motion, useReducedMotion } from "motion/react";

export default function AdminPage() {
  const shouldReduceMotion = useReducedMotion();
  const [items, setItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [totalArrecadado, setTotalArrecadado] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [searchTerm, setSearchTerm] = useState("");
  const [period, setPeriod] = useState("hoje");

  useEffect(() => {
    fetchItems();
    fetchOrders();
  }, []);

  useEffect(() => { fetchOrders(); }, [dateFrom, dateTo, paymentFilter]);

  function choosePeriod(nextPeriod: string) {
    setPeriod(nextPeriod);
    const now = new Date();
    const format = (date: Date) => date.toISOString().slice(0, 10);
    if (nextPeriod === "todas") { setDateFrom(""); setDateTo(""); return; }
    const start = new Date(now);
    if (nextPeriod === "ontem") { start.setDate(now.getDate() - 1); setDateFrom(format(start)); setDateTo(format(start)); return; }
    if (nextPeriod === "7dias") start.setDate(now.getDate() - 6);
    if (nextPeriod === "30dias") start.setDate(now.getDate() - 29);
    setDateFrom(format(start)); setDateTo(format(now));
  }

  async function fetchItems() {
    const response = await fetch("/api/admin/itens");
    const data = await response.json().catch(() => []);
    if (response.ok && Array.isArray(data)) setItems(data);
  }

  async function fetchOrders() {
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (paymentFilter !== "todos") params.set("paymentMethod", paymentFilter);
    const response = await fetch(`/api/admin/pedidos?${params.toString()}`);
    const data = await response.json().catch(() => []);

    if (response.ok && Array.isArray(data)) {
      setOrders(data);
      const total = data
        .filter((o: any) => o.status !== 'cancelado')
        .reduce((acc: number, order: any) => acc + Number(order.total_amount), 0);
      setTotalArrecadado(total);
    }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !price || !stock) return alert("Preencha todos os campos");

    const response = await fetch("/api/admin/itens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, price: parseFloat(price), stockQuantity: parseInt(stock) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert("Erro ao adicionar: " + (data.erro ?? "Tente novamente"));
    } else {
      setName(""); setPrice(""); setStock(""); fetchItems();
    }
  }

  // NOVA LÓGICA DE EXCLUSÃO DE ITEM
  async function handleDeleteItem(id: string) {
    if (confirm("Tem certeza que deseja excluir este item?")) {
      const response = await fetch(`/api/admin/itens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) {
        alert("⚠️ Bloqueio de Segurança: Este item não pode ser excluído porque já existe uma venda registrada com ele. Para removê-lo da tela do Caixa, apenas atualize o Estoque dele para 0 (zero).");
      } else {
        fetchItems();
      }
    }
  }

  // CANCELAR PEDIDO — devolve estoque via API
  async function handleCancelOrder(id: string) {
    if (!confirm("🚨 Tem certeza que deseja CANCELAR este pedido? O estoque será devolvido.")) return;
    
    try {
      const res = await fetch('/api/cancelar-pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id }),
      }).then(r => r.json());

      if (res.erro) throw new Error(res.erro);

      alert('✅ Pedido cancelado e estoque devolvido!');
      fetchOrders();
      fetchItems();
    } catch (e: any) {
      alert('Erro: ' + (e.message || 'Falha ao cancelar'));
    }
  }

  function exportToCSV() {
    if (orders.length === 0) return alert("Não há vendas para exportar.");
    
    const headers = ["Ticket", "Cliente", "Data", "Hora", "Pagamento", "Total (R$)", "Itens"];
    const rows = filteredOrders.map(order => {
      const data = new Date(order.created_at);
      const itensFormatados = order.order_items.map((oi: any) => `${oi.quantity}x ${oi.items?.name}`).join(" | ");
      return [
        order.order_number,
        order.customer_name || "Anônimo",
        data.toLocaleDateString(),
        data.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        order.payment_method.toUpperCase(),
        Number(order.total_amount).toFixed(2).replace(".", ","),
        `"${itensFormatados}"`
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

  const filteredOrders = orders.filter((order) => {
    const searchable = `${order.order_number} ${order.customer_name || ""} ${order.order_items?.map((item: any) => item.items?.name || "").join(" ")}`.toLowerCase();
    const normalizedStatus = order.status === "cancelado" ? "cancelado" : order.status_pagamento === "pago" ? "pago" : "aguardando";
    return searchable.includes(searchTerm.trim().toLowerCase()) && (statusFilter === "todos" || normalizedStatus === statusFilter);
  });
  const paidCount = orders.filter((order) => order.status !== "cancelado" && order.status_pagamento === "pago").length;
  const lowStockCount = items.filter((item) => item.stock_quantity > 0 && item.stock_quantity <= 5).length;

  return (
    <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }} className="min-h-[calc(100vh-64px)] bg-white p-4 lg:p-8">
      
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

        <CommerceDashboard revenue={totalArrecadado} orderCount={orders.length} paidCount={paidCount} lowStockCount={lowStockCount} />
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
          <div className="h-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <h2 className="text-xl font-bold text-slate-800">Log de Vendas {dateFrom || dateTo ? "do período" : "(Hoje)"}</h2>
              <button 
                onClick={exportToCSV}
                className="bg-emerald-50 text-emerald-700 px-5 py-2.5 rounded-full font-bold text-sm hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2 border border-emerald-200"
              >
                <Download size={18} /> Exportar Excel
              </button>
            </div>

            <section aria-label="Filtros de vendas" className="mb-7 border-y border-slate-100 py-5">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Período rápido">
                    {[['hoje','Hoje'],['ontem','Ontem'],['7dias','7 dias'],['30dias','30 dias'],['todas','Todas']].map(([value,label]) => (
                      <button key={value} type="button" onClick={() => choosePeriod(value)} className={`rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors ${period === value ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-800"}`}>{label}</button>
                    ))}
                  </div>
                  {(dateFrom || dateTo || paymentFilter !== "todos" || statusFilter !== "todos" || searchTerm) && (
                    <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); setPaymentFilter("todos"); setStatusFilter("todos"); setSearchTerm(""); setPeriod("hoje"); }} className="text-sm font-bold text-blue-700 underline-offset-4 hover:underline">Limpar filtros</button>
                  )}
                </div>
                <div className="relative max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar ticket, cliente ou item" aria-label="Buscar vendas" className="h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-medium text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="text-sm font-semibold text-slate-700">De<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1.5 block h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                  <label className="text-sm font-semibold text-slate-700">Até<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="mt-1.5 block h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                  <label className="text-sm font-semibold text-slate-700">Pagamento<select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="mt-1.5 block h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="todos">Todos</option><option value="dinheiro">Dinheiro</option><option value="pix">Pix</option><option value="cartao">Cartão</option></select></label>
                  <label className="text-sm font-semibold text-slate-700">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1.5 block h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="todos">Todos</option><option value="pago">Pago</option><option value="aguardando">Aguardando</option><option value="cancelado">Cancelado</option></select></label>
                </div>
              </div>
            </section>

            {filteredOrders.length === 0 ? (
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
                      <th className="pb-4 font-bold px-4">Status</th>
                      <th className="pb-4 font-bold text-right px-4">Total</th>
                      <th className="pb-4 font-bold text-center px-4">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${order.status === 'cancelado' ? 'opacity-50' : ''}`}>
                        <td className="py-4 px-4 font-black text-slate-900">#{order.order_number}</td>
                        <td className="py-4 px-4 font-medium">{order.customer_name || "-"}</td>
                        <td className="py-4 px-4 text-sm">
                          {order.order_items.map((oi: any) => `${oi.quantity}x ${oi.items?.name}`).join(", ")}
                        </td>
                        <td className="py-4 px-4">
                          <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2.5 py-1 rounded-md uppercase">
                            {order.payment_method}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          {order.status === 'cancelado' ? (
                            <span className="bg-rose-50 text-rose-600 text-xs font-bold px-2.5 py-1 rounded-md">CANCELADO</span>
                          ) : (
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${order.status_pagamento === 'pago' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                              {order.status_pagamento === 'pago' ? 'PAGO' : 'AGUARDANDO'}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 font-bold text-right text-slate-900">
                          R$ {Number(order.total_amount).toFixed(2)}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {order.status !== 'cancelado' && (
                              <button 
                                onClick={() => handleCancelOrder(order.id)}
                                className="text-slate-400 hover:text-amber-500 transition-colors p-2 bg-white rounded-full shadow-sm border border-slate-100"
                                title="Cancelar pedido e devolver estoque"
                              >
                                <XCircle size={18} />
                              </button>
                            )}
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
    </motion.div>
  );
}
