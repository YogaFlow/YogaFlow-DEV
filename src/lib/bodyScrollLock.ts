/**
 * Sperrt Seiten-Scroll (Modal/Sheet). Rückgabe stellt den vorherigen overflow wieder her.
 * Pure Hilfsfunktion — testbar ohne React.
 */
export function lockBodyScroll(body: { style: { overflow: string } }): () => void {
  const previous = body.style.overflow;
  body.style.overflow = 'hidden';
  return () => {
    body.style.overflow = previous;
  };
}

/** Ob nach unlock kein hängendes Overlay-Scroll-Lock mehr aktiv ist. */
export function isBodyScrollLocked(body: { style: { overflow: string } }): boolean {
  return body.style.overflow === 'hidden';
}
