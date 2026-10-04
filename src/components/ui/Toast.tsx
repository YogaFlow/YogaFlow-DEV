import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import {
  TOAST_ENTER_MS,
  toastRole,
  type ToastTone,
} from '../../lib/toastModel';

export type ToastItem = {
  id: string;
  text: string;
  type: ToastTone;
  undoLabel?: string;
  onUndo?: () => void | Promise<void>;
  /** Auto-dismiss duration; null = stay (errors). */
  durationMs: number | null;
  createdAt: number;
};

type ToastViewportProps = {
  items: ToastItem[];
  onDismiss: (id: string) => void;
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

type ToastCardProps = {
  item: ToastItem;
  onDismiss: (id: string) => void;
  reducedMotion: boolean;
};

const ToastCard: React.FC<ToastCardProps> = ({ item, onDismiss, reducedMotion }) => {
  const isError = item.type === 'error';
  const hasUndo = Boolean(item.onUndo && item.undoLabel);
  const showProgress = hasUndo && item.durationMs != null;
  const [entered, setEntered] = useState(reducedMotion);
  const [dragY, setDragY] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(showProgress ? 100 : 0);
  const touchStartY = useRef<number | null>(null);
  /** Cumulative ms spent paused (for progress + dismiss). */
  const pausedMs = useRef(0);
  const pauseStartedAt = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      setEntered(true);
      return;
    }
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [reducedMotion]);

  useEffect(() => {
    if (item.durationMs == null) return;
    if (paused) return;
    const elapsed = Date.now() - item.createdAt - pausedMs.current;
    const left = Math.max(0, item.durationMs - elapsed);
    const handle = window.setTimeout(() => {
      if (exiting) return;
      if (reducedMotion) {
        onDismiss(item.id);
        return;
      }
      setExiting(true);
      window.setTimeout(() => onDismiss(item.id), TOAST_ENTER_MS);
    }, left);
    return () => window.clearTimeout(handle);
  }, [paused, item.durationMs, item.createdAt, item.id, onDismiss, reducedMotion, exiting]);

  useEffect(() => {
    const total = item.durationMs;
    if (!showProgress || total == null) return;
    let raf = 0;
    const tick = () => {
      const pauseExtra =
        paused && pauseStartedAt.current != null
          ? Date.now() - pauseStartedAt.current
          : 0;
      const elapsed = Date.now() - item.createdAt - pausedMs.current - pauseExtra;
      const left = Math.max(0, 100 * (1 - elapsed / total));
      setProgress(left);
      if (left > 0) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [showProgress, item.createdAt, item.durationMs, paused]);

  const setPause = (next: boolean) => {
    if (next === paused) return;
    if (next) {
      pauseStartedAt.current = Date.now();
      setPaused(true);
      return;
    }
    if (pauseStartedAt.current != null) {
      pausedMs.current += Date.now() - pauseStartedAt.current;
      pauseStartedAt.current = null;
    }
    setPaused(false);
  };

  const dismiss = () => {
    if (exiting) return;
    if (reducedMotion) {
      onDismiss(item.id);
      return;
    }
    setExiting(true);
    window.setTimeout(() => onDismiss(item.id), TOAST_ENTER_MS);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const y = e.touches[0]?.clientY ?? touchStartY.current;
    const delta = Math.max(0, y - touchStartY.current);
    setDragY(delta);
  };
  const onTouchEnd = () => {
    if (dragY > 48) dismiss();
    else setDragY(0);
    touchStartY.current = null;
  };

  const translate =
    exiting || (!entered && !reducedMotion)
      ? 'translateY(110%)'
      : dragY > 0
        ? `translateY(${dragY}px)`
        : 'translateY(0)';

  const iconBg = isError ? 'bg-danger' : 'bg-brand';
  const Icon = isError ? AlertTriangle : Check;

  return (
    <div
      role={toastRole(item.type)}
      data-testid={isError ? 'toast-error' : 'toast-success'}
      data-paused={paused ? '1' : '0'}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseEnter={() => setPause(true)}
      onMouseLeave={() => setPause(false)}
      onFocusCapture={() => setPause(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPause(false);
        }
      }}
      className="pointer-events-auto relative w-full max-w-[420px] overflow-hidden rounded-[14px] bg-text text-onBrand shadow-[0_8px_28px_rgba(31,27,22,0.28)]"
      style={{
        transform: translate,
        opacity: exiting ? 0 : 1,
        transition: reducedMotion
          ? 'opacity 120ms ease'
          : `transform ${TOAST_ENTER_MS}ms ease, opacity ${TOAST_ENTER_MS}ms ease`,
      }}
    >
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconBg} text-onBrand`}
          aria-hidden
        >
          <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" strokeWidth={2.5} />
        </span>
        <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{item.text}</p>
        {hasUndo ? (
          <button
            type="button"
            onClick={() => void item.onUndo?.()}
            className="inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[15px] font-semibold text-brandSoft active:text-onBrand"
            data-testid="toast-undo"
          >
            {item.undoLabel}
          </button>
        ) : null}
        {isError ? (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Schließen"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-onBrand/80 active:bg-white/10"
            data-testid="toast-dismiss"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        ) : null}
      </div>
      {showProgress ? (
        <div
          className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20"
          aria-hidden
          data-testid="toast-progress"
        >
          <div
            className="h-full bg-onBrand"
            data-testid="toast-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
    </div>
  );
};

/**
 * Toast unten (mobil über der Navigation), dunkle Pille (UX-4 A2 / N2).
 * Erfolg: role=status. Fehler: role=alert, Schließen.
 */
const ToastViewport: React.FC<ToastViewportProps> = ({ items, onDismiss }) => {
  const reducedMotion = usePrefersReducedMotion();
  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-3 pb-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.75rem))] lg:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      data-testid="toast-viewport"
    >
      {items.map((item) => (
        <ToastCard
          key={item.id}
          item={item}
          onDismiss={onDismiss}
          reducedMotion={reducedMotion}
        />
      ))}
    </div>
  );
};

export default ToastViewport;
