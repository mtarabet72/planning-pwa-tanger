import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style le bouton de confirmation en rouge (action destructrice ou risquée). */
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
  /** Remplace window.confirm : affiche une boîte de dialogue et résout à true/false selon le choix. */
  confirmDialog: (options: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const AUTO_DISMISS_MS = 5000;

const TOAST_STYLE: Record<ToastType, string> = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

const TOAST_ICON: Record<ToastType, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((type: ToastType, message: string) => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  const toast = {
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
    info: (message: string) => push('info', message),
  };

  const confirmDialog = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  function handleConfirmChoice(value: boolean) {
    confirmState?.resolve(value);
    setConfirmState(null);
  }

  return (
    <ToastContext.Provider value={{ toast, confirmDialog }}>
      {children}

      {/* Pile de toasts — au-dessus de la barre de navigation mobile */}
      <div className="fixed bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-sm space-y-2 pointer-events-none">
        {toasts.map(t => {
          const Icon = TOAST_ICON[t.type];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-2xl border px-4 py-3 shadow-lg text-sm ${TOAST_STYLE[t.type]}`}
            >
              <Icon className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <p className="flex-1 whitespace-pre-line">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="shrink-0 opacity-60 hover:opacity-100">
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Boîte de confirmation — remplace window.confirm */}
      {confirmState && (
        <div
          className="fixed inset-0 bg-black/40 z-[110] flex items-end sm:items-center justify-center p-4"
          onClick={() => handleConfirmChoice(false)}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-2">
              <h3 className="font-semibold text-lg text-gray-900">{confirmState.title}</h3>
              {confirmState.body && (
                <p className="text-sm text-gray-500 whitespace-pre-line">{confirmState.body}</p>
              )}
            </div>
            <div className="flex gap-2 p-6 pt-0">
              <button
                onClick={() => handleConfirmChoice(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                {confirmState.cancelLabel ?? 'Annuler'}
              </button>
              <button
                onClick={() => handleConfirmChoice(true)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition ${
                  confirmState.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {confirmState.confirmLabel ?? 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé à l'intérieur de <ToastProvider>");
  return ctx;
}