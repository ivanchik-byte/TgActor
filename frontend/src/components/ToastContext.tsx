import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  createdAt: number;
}

export interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  addToast: (typeOrMessage: ToastType | string, messageOrType?: string | ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  toasts: Toast[];
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const TOAST_ICONS: Record<ToastType, React.ComponentType<{ style?: React.CSSProperties }>> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const [isExiting, setIsExiting] = useState(false);
  const duration = toast.duration ?? (toast.type === 'error' ? 5000 : 4000);
  const remainingRef = useRef<number>(duration);
  const startTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTimer = useCallback(() => {
    if (duration <= 0) return;
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      setIsExiting(true);
    }, remainingRef.current);
  }, [duration]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    startTimer();
    return () => clearTimer();
  }, [startTimer, clearTimer]);

  const handleMouseEnter = () => {
    clearTimer();
    const elapsed = Date.now() - startTimeRef.current;
    remainingRef.current = Math.max(500, remainingRef.current - elapsed);
  };

  const handleMouseLeave = () => {
    startTimer();
  };

  const handleClose = () => {
    clearTimer();
    setIsExiting(true);
  };

  useEffect(() => {
    if (isExiting) {
      const exitTimer = setTimeout(() => {
        onRemove(toast.id);
      }, 220);
      return () => clearTimeout(exitTimer);
    }
  }, [isExiting, onRemove, toast.id]);

  const Icon = TOAST_ICONS[toast.type] || Info;

  const styleConfig = {
    error: {
      background: 'var(--toast-err-bg, #2d1618)',
      color: 'var(--toast-err-txt, #f87171)',
      borderColor: 'rgba(239, 68, 68, 0.35)',
      iconColor: '#f87171',
    },
    success: {
      background: 'var(--toast-succ-bg, #16291e)',
      color: 'var(--toast-succ-txt, #4ade80)',
      borderColor: 'rgba(34, 197, 94, 0.35)',
      iconColor: '#4ade80',
    },
    warning: {
      background: 'var(--toast-warn-bg, #281f0d)',
      color: 'var(--toast-warn-txt, #fbbf24)',
      borderColor: 'rgba(245, 158, 11, 0.35)',
      iconColor: '#fbbf24',
    },
    info: {
      background: 'var(--toast-info-bg, #1e2430)',
      color: 'var(--toast-info-txt, #60a5fa)',
      borderColor: 'rgba(59, 130, 246, 0.35)',
      iconColor: '#60a5fa',
    },
  }[toast.type];

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 14px',
        borderRadius: '10px',
        fontSize: '13px',
        lineHeight: '1.45',
        fontWeight: 500,
        backgroundColor: styleConfig.background,
        color: styleConfig.color,
        border: `1px solid ${styleConfig.borderColor}`,
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.25)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        transform: isExiting ? 'translateX(20px) scale(0.96)' : 'none',
        opacity: isExiting ? 0 : 1,
        transition: 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        animation: !isExiting ? 'tgactor-toast-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)' : undefined,
        wordBreak: 'break-word',
        userSelect: 'text',
      }}
    >
      <Icon
        style={{
          width: '18px',
          height: '18px',
          flexShrink: 0,
          marginTop: '1px',
          color: styleConfig.iconColor,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.message}
      </div>
      <button
        onClick={handleClose}
        aria-label="Закрыть уведомление"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'currentColor',
          cursor: 'pointer',
          opacity: 0.65,
          padding: '2px',
          margin: '-2px -2px 0 0',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'opacity 0.15s, background-color 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.65';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <X style={{ width: '14px', height: '14px' }} />
      </button>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration?: number) => {
      const id = Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      setToasts((prev) => [...prev, { id, message, type, duration, createdAt: Date.now() }]);
    },
    []
  );

  const addToast = useCallback(
    (typeOrMessage: ToastType | string, messageOrType?: string | ToastType, duration?: number) => {
      const validTypes: ToastType[] = ['success', 'error', 'info', 'warning'];

      if (validTypes.includes(typeOrMessage as ToastType) && typeof messageOrType === 'string') {
        showToast(messageOrType, typeOrMessage as ToastType, duration);
      } else if (typeof typeOrMessage === 'string') {
        const type = (validTypes.includes(messageOrType as ToastType) ? messageOrType : 'info') as ToastType;
        showToast(typeOrMessage, type, duration);
      }
    },
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, addToast, removeToast, clearToasts, toasts }}>
      {children}
      <style>{`
        @keyframes tgactor-toast-in {
          0% {
            opacity: 0;
            transform: translateY(12px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
      <div
        role="region"
        aria-label="Уведомления системы"
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          width: '100%',
          maxWidth: '380px',
          pointerEvents: 'none',
          boxSizing: 'border-box',
        }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
