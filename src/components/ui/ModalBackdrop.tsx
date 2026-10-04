import { useEffect, useId, useRef, type ReactNode } from 'react';

type ModalBackdropProps = {
  open: boolean;
  visible?: boolean;
  /** Während Zahlung o. Ä. schließt Tipp auf den Hintergrund nicht. */
  canDismiss?: boolean;
  onDismiss?: () => void;
  /** Mobil: Sheet von unten; Desktop: zentrierter Dialog. */
  variant?: 'sheet' | 'dialog';
  /** max-w-* Klassen für den Dialoginhalt. */
  panelClassName?: string;
  labelledBy?: string;
  children: ReactNode;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function prefersReducedTransparency(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
}

/**
 * Gemeinsame Abdunklung für Pop-ups, Dialoge und Sheets (UX-2 A3).
 * 40 % abdunkeln + blur(4px), 150 ms; Reduced-Motion/Transparency-Fallbacks.
 */
export default function ModalBackdrop({
  open,
  visible = true,
  canDismiss = true,
  onDismiss,
  variant = 'dialog',
  panelClassName = 'max-w-md',
  labelledBy,
  children,
}: ModalBackdropProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const reduceMotion = prefersReducedMotion();
  const reduceTransparency = prefersReducedTransparency();
  const durationClass = reduceMotion ? 'duration-0' : 'duration-150';
  const blurClass = reduceTransparency ? '' : 'backdrop-blur-[4px]';

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      previousFocus.current?.focus?.();
      previousFocus.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!canDismiss || !onDismiss) return;
      e.preventDefault();
      onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, canDismiss, onDismiss]);

  if (!open) return null;

  const align =
    variant === 'sheet'
      ? 'items-end justify-center p-0 sm:items-center sm:p-4'
      : 'items-center justify-center p-4';

  const panelShape =
    variant === 'sheet'
      ? `flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-lg border border-border bg-surface shadow-lg sm:max-h-[min(90vh,40rem)] sm:rounded-lg ${panelClassName}`
      : `flex max-h-[90vh] w-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg ${panelClassName}`;

  return (
    <div
      className={`fixed inset-0 z-50 flex ${align} transition-opacity ${durationClass} ${blurClass} ${
        visible ? 'bg-text/40 opacity-100' : 'bg-text/0 opacity-0'
      }`}
      onClick={canDismiss ? onDismiss : undefined}
      data-testid="modal-backdrop"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        className={`transition-all ${durationClass} ${panelShape} ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
