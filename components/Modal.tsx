"use client";

import { useEffect, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

export type ModalType = "success" | "error" | "warning" | "info" | "confirm";

export type ModalOptions = {
  type: ModalType;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
};

const tones: Record<ModalType, { icon: ReactNode; color: string; button: string }> = {
  success: { color: "bg-emerald-100 text-emerald-600", button: "bg-emerald-600 hover:bg-emerald-700", icon: "✓" },
  error: { color: "bg-rose-100 text-rose-600", button: "bg-rose-600 hover:bg-rose-700", icon: "×" },
  warning: { color: "bg-amber-100 text-amber-600", button: "bg-amber-600 hover:bg-amber-700", icon: "!" },
  info: { color: "bg-blue-100 text-blue-600", button: "bg-blue-600 hover:bg-blue-700", icon: "i" },
  confirm: { color: "bg-slate-100 text-slate-700", button: "bg-slate-800 hover:bg-slate-900", icon: "?" },
};

export default function Modal({ options, onClose }: { options: ModalOptions | null; onClose: () => void }) {
  const shouldReduceMotion = useReducedMotion();
  useEffect(() => {
    if (!options) return;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        options.onCancel?.();
        onClose();
      }
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose, options]);

  if (!options) return null;
  const tone = tones[options.type];
  const isConfirmation = options.type === "confirm";
  const cancel = () => { options.onCancel?.(); onClose(); };
  const confirm = () => { options.onConfirm?.(); onClose(); };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={isConfirmation ? undefined : cancel}>
      <motion.section initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.94, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 380, damping: 27 }} role="dialog" aria-modal="true" aria-labelledby="modal-title" className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className={`h-1.5 ${tone.button.split(" ")[0]}`} />
        <div className="p-7 text-center">
          <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-4xl font-black ${tone.color}`}>{tone.icon}</div>
          <h2 id="modal-title" className="text-xl font-black text-slate-800">{options.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{options.message}</p>
        </div>
        <div className="flex gap-3 px-7 pb-7">
          {isConfirmation && <button type="button" onClick={cancel} className="flex-1 rounded-xl border-2 border-slate-200 py-3 font-bold text-slate-600 hover:bg-slate-50">{options.cancelLabel ?? "Cancelar"}</button>}
          <button type="button" onClick={confirm} className={`flex-1 rounded-xl py-3 font-bold text-white transition active:scale-95 ${tone.button}`}>{options.confirmLabel ?? "OK"}</button>
        </div>
      </motion.section>
    </div>
  );
}
