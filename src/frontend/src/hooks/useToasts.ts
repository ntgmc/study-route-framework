import { useCallback, useRef, useState } from "react";
import type { ToastKind, ToastMessage } from "../domain/uiState";

interface ConfirmationOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  kind?: ToastKind;
  confirmVariant?: "primary" | "danger" | "plain";
}

interface ToastActionOption {
  label: string;
  value: string;
  variant?: "primary" | "danger" | "plain";
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(1);

  const showToast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = toastIdRef.current;
    toastIdRef.current += 1;
    setToasts((items) => [...items.slice(-3), { id, message, kind }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4200);
  }, []);

  const requestConfirmation = useCallback(
    (message: string, options: ConfirmationOptions = {}) =>
      new Promise<boolean>((resolve) => {
        const id = toastIdRef.current;
        toastIdRef.current += 1;
        let settled = false;
        const settle = (value: boolean) => {
          if (settled) return;
          settled = true;
          resolve(value);
          setToasts((items) => items.filter((item) => item.id !== id));
        };
        setToasts((items) => [
          ...items.slice(-3),
          {
            id,
            message,
            kind: options.kind ?? "info",
            persistent: true,
            onDismiss: () => settle(false),
            actions: [
              {
                label: options.cancelLabel ?? "取消",
                testId: "toast-cancel",
                onClick: () => settle(false)
              },
              {
                label: options.confirmLabel ?? "确认",
                variant: options.confirmVariant ?? "primary",
                testId: "toast-confirm",
                onClick: () => settle(true)
              }
            ]
          }
        ]);
      }),
    []
  );

  const requestToastAction = useCallback(
    (message: string, actions: ToastActionOption[], kind: ToastKind = "info") =>
      new Promise<string | undefined>((resolve) => {
        const id = toastIdRef.current;
        toastIdRef.current += 1;
        let settled = false;
        const settle = (value: string | undefined) => {
          if (settled) return;
          settled = true;
          resolve(value);
          setToasts((items) => items.filter((item) => item.id !== id));
        };
        setToasts((items) => [
          ...items.slice(-3),
          {
            id,
            message,
            kind,
            persistent: true,
            onDismiss: () => settle(undefined),
            actions: actions.map((action) => ({
              label: action.label,
              variant: action.variant,
              testId: `toast-action-${action.value}`,
              onClick: () => settle(action.value)
            }))
          }
        ]);
      }),
    []
  );

  const dismissToast = useCallback((toast: ToastMessage) => {
    toast.onDismiss?.();
    setToasts((items) => items.filter((item) => item.id !== toast.id));
  }, []);

  return { toasts, showToast, requestConfirmation, requestToastAction, dismissToast };
}
