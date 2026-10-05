import { useCallback, useState } from "react";
import type { ModalOptions, ModalType } from "../components/Modal";

export function useModal() {
  const [options, setOptions] = useState<ModalOptions | null>(null);
  const close = useCallback(() => setOptions(null), []);
  const showModal = (type: ModalType, title: string, message: string, confirmLabel?: string, onConfirm?: () => void) => setOptions({ type, title, message, confirmLabel, onConfirm });
  const showConfirm = (title: string, message: string, confirmLabel = "Confirmar", cancelLabel = "Cancelar") => new Promise<boolean>((resolve) => setOptions({ type: "confirm", title, message, confirmLabel, cancelLabel, onConfirm: () => resolve(true), onCancel: () => resolve(false) }));
  return { options, close, showModal, showConfirm };
}
