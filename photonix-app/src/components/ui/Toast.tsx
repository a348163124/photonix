import { useEffect, useState } from "react";
import { create } from "zustand";

// ─── Toast Store ─────────────────────────────────────────────────────────────

interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  duration?: number;
}

interface ToastStore {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, "id">) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { ...toast, id: crypto.randomUUID() },
      ],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

// Convenience functions
export function toast(message: string, type: ToastItem["type"] = "info", duration = 4000) {
  useToastStore.getState().addToast({ message, type, duration });
}

// ─── Toast Container Component ───────────────────────────────────────────────

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastNotification key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastNotification({ toast: t }: { toast: ToastItem }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => removeToast(t.id), 300);
    }, t.duration ?? 4000);
    return () => clearTimeout(timer);
  }, [t.id, t.duration, removeToast]);

  const colors = {
    success: "border-green-600 bg-green-950/90 text-green-200",
    error: "border-red-600 bg-red-950/90 text-red-200",
    info: "border-blue-600 bg-blue-950/90 text-blue-200",
  };

  return (
    <div
      className={`rounded-lg border px-4 py-2 text-xs shadow-lg backdrop-blur transition-all duration-300 ${
        colors[t.type]
      } ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
    >
      <div className="flex items-center gap-2">
        <span>{t.message}</span>
        <button
          onClick={() => removeToast(t.id)}
          className="ml-2 text-neutral-400 hover:text-white"
        >
          ×
        </button>
      </div>
    </div>
  );
}
