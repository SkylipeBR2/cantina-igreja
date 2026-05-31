import { useState, useCallback } from "react";
import { ModalOptions, ModalType } from "../components/Modal";

export function useModal() {
  const [options, setOptions] = useState<ModalOptions | null>(null);

  const close = useCallback(() => setOptions(null), []);

  /** Abre um modal de alerta simples (info/sucesso/erro/warning) */
  function showModal(
    type: ModalType,
    title: string,
    message: string,
    confirmLabel?: string,
    onConfirm?: () => void
  ) {
    setOptions({ type, title, message, confirmLabel, onConfirm });
  }

  /** Abre um modal de confirmação (dois botões). Retorna uma Promise<boolean>. */
  function showConfirm(title: string, message: string, confirmLabel = "Confirmar", cancelLabel = "Cancelar"): Promise<boolean> {
    return new Promise((resolve) => {
      setOptions({
        type: "confirm",
        title,
        message,
        confirmLabel,
        cancelLabel,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }

  return { options, close, showModal, showConfirm };
}
