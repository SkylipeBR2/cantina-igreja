"use client";

import { CircleAlert, PackageCheck, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

type CommerceDashboardProps = {
  revenue: number;
  orderCount: number;
  paidCount: number;
  lowStockCount: number;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export function CommerceDashboard({ revenue, orderCount, paidCount, lowStockCount }: CommerceDashboardProps) {
  const shouldReduceMotion = useReducedMotion();
  const paidRate = orderCount ? Math.round((paidCount / orderCount) * 100) : 0;
  const metrics = [
    { label: "Arrecadação", value: currency.format(revenue), icon: WalletCards, iconClass: "bg-primary/10 text-primary" },
    { label: "Pedidos no período", value: String(orderCount), icon: ReceiptText, iconClass: "bg-primary/10 text-primary" },
    { label: "Pagamentos confirmados", value: `${paidRate}%`, icon: TrendingUp, iconClass: "bg-emerald-500/10 text-emerald-600" },
    { label: "Estoque em atenção", value: String(lowStockCount), icon: lowStockCount ? CircleAlert : PackageCheck, iconClass: "bg-amber-500/10 text-amber-600" },
  ];

  return (
    <section aria-label="Resumo de vendas" className="grid gap-4 lg:grid-cols-4">
      {metrics.map(({ label, value, icon: Icon, iconClass }) => (
        <motion.article key={label} initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} whileHover={shouldReduceMotion ? undefined : { y: -3 }} transition={{ type: "spring", stiffness: 360, damping: 28, delay: metrics.findIndex((metric) => metric.label === label) * 0.05 }} className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">{value}</p></div>
            <span className={`rounded-xl p-2.5 ${iconClass}`}><Icon size={20} /></span>
          </div>
        </motion.article>
      ))}
    </section>
  );
}
