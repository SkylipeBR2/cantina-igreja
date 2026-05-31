"use client";

import React, { useEffect } from "react";

export type ModalType = "success" | "error" | "warning" | "info" | "confirm";

export interface ModalOptions {
  type: ModalType;
  title: string;
  message: string;
  /** Label do botão principal (padrão: OK) */
  confirmLabel?: string;
  /** Label do botão de cancelar — só aparece no tipo "confirm" */
  cancelLabel?: string;
  /** Callback chamado quando o usuário confirma */
  onConfirm?: () => void;
  /** Callback chamado quando o usuário cancela ou fecha */
  onCancel?: () => void;
}

const ICONS: Record<ModalType, React.ReactNode> = {
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  confirm: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const STYLES: Record<ModalType, { bar: string; iconBg: string; iconColor: string; btnFrom: string; btnTo: string; btnShadow: string }> = {
  success: {
    bar: "from-emerald-400 to-green-600",
    iconBg: "from-emerald-50 to-green-100",
    iconColor: "text-emerald-600",
    btnFrom: "#10b981",
    btnTo: "#16a34a",
    btnShadow: "rgba(34,197,94,0.35)",
  },
  error: {
    bar: "from-red-400 to-rose-600",
    iconBg: "from-red-50 to-rose-100",
    iconColor: "text-rose-600",
    btnFrom: "#ef4444",
    btnTo: "#e11d48",
    btnShadow: "rgba(239,68,68,0.35)",
  },
  warning: {
    bar: "from-amber-400 to-orange-500",
    iconBg: "from-amber-50 to-orange-100",
    iconColor: "text-amber-600",
    btnFrom: "#f59e0b",
    btnTo: "#f97316",
    btnShadow: "rgba(245,158,11,0.35)",
  },
  info: {
    bar: "from-blue-400 to-indigo-600",
    iconBg: "from-blue-50 to-indigo-100",
    iconColor: "text-blue-600",
    btnFrom: "#3b82f6",
    btnTo: "#4f46e5",
    btnShadow: "rgba(59,130,246,0.35)",
  },
  confirm: {
    bar: "from-slate-500 to-slate-700",
    iconBg: "from-slate-100 to-slate-200",
    iconColor: "text-slate-700",
    btnFrom: "#334155",
    btnTo: "#0f172a",
    btnShadow: "rgba(51,65,85,0.35)",
  },
};

interface ModalProps {
  options: ModalOptions | null;
  onClose: () => void;
}

export default function Modal({ options, onClose }: ModalProps) {
  // Fechar com Esc
  useEffect(() => {
    if (!options) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        options.onCancel?.();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [options, onClose]);

  if (!options) return null;

  const s = STYLES[options.type];
  const isConfirm = options.type === "confirm";

  function handleConfirm() {
    options!.onConfirm?.();
    onClose();
  }

  function handleCancel() {
    options!.onCancel?.();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
      onClick={isConfirm ? undefined : handleCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "modalIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both" }}
      >
        {/* Barra colorida */}
        <div className={`h-1.5 w-full bg-gradient-to-r ${s.bar}`} />

        <div className="p-7 text-center">
          {/* Ícone */}
          <div
            className={`mx-auto mb-4 flex items-center justify-center rounded-full w-16 h-16 bg-gradient-to-br ${s.iconBg} ${s.iconColor}`}
          >
            {ICONS[options.type]}
          </div>

          <h2 className="text-xl font-bold text-slate-800 mb-2">{options.title}</h2>
          <p className="text-slate-500 text-sm leading-relaxed whitespace-pre-line">{options.message}</p>
        </div>

        <div className={`px-7 pb-6 flex gap-3 ${isConfirm ? "flex-row" : "flex-col"}`}>
          {isConfirm && (
            <button
              onClick={handleCancel}
              className="flex-1 py-2.5 rounded-xl font-semibold border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all active:scale-95"
            >
              {options.cancelLabel ?? "Cancelar"}
            </button>
          )}
          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 rounded-xl font-semibold text-white transition-all duration-150 active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${s.btnFrom}, ${s.btnTo})`,
              boxShadow: `0 4px 14px ${s.btnShadow}`,
            }}
          >
            {options.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.82) translateY(20px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
