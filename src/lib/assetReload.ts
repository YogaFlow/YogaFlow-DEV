/**
 * Einmal neu laden, wenn ein gehashtes Bundle fehlt (vite:preloadError oder
 * das Einstiegsmodul). Der gleiche Ablauf steht als klassisches Script in
 * index.html, weil das Einstiegsmodul sich nicht selbst fangen kann.
 */

export const ASSET_RELOAD_STORAGE_KEY = 'omlify:asset-reload-at';
export const ASSET_RELOAD_WINDOW_MS = 30_000;
export const ASSET_RELOAD_STOPPED_TEXT =
  'Die Seite konnte gerade nicht geladen werden. Bitte lade sie noch einmal.';

export type AssetReloadDecision = 'reload' | 'stop';

export function decideAssetReload(now: number, raw: string | null): AssetReloadDecision {
  if (raw == null || raw === '') return 'reload';
  const last = Number(raw);
  if (Number.isFinite(last) && now - last < ASSET_RELOAD_WINDOW_MS) return 'stop';
  return 'reload';
}

type ReloadStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** Speicherfehler → stop, damit ein blockiertes sessionStorage keine Schleife wird. */
export function assetReloadAction(storage: ReloadStorage, now: number): AssetReloadDecision {
  try {
    const decision = decideAssetReload(now, storage.getItem(ASSET_RELOAD_STORAGE_KEY));
    if (decision !== 'reload') return 'stop';
    storage.setItem(ASSET_RELOAD_STORAGE_KEY, String(now));
    return 'reload';
  } catch {
    return 'stop';
  }
}

function showStopped(target: Window): void {
  try {
    target.document.body.textContent = ASSET_RELOAD_STOPPED_TEXT;
  } catch {
    // body kann noch fehlen.
  }
}

export function installAssetReloadGuard(target: Window = window): void {
  const once = () => {
    try {
      const action = assetReloadAction(target.sessionStorage, Date.now());
      if (action === 'reload') {
        target.location.reload();
        return;
      }
      showStopped(target);
    } catch {
      // Navigation blockiert: keine Schleife.
    }
  };

  target.addEventListener('vite:preloadError', (event) => {
    try {
      event.preventDefault();
    } catch {
      // preventDefault kann fehlen.
    }
    once();
  });

  target.addEventListener(
    'error',
    (event) => {
      try {
        const element = event.target;
        if (!(element instanceof HTMLScriptElement)) return;
        if (!element.src.includes('/assets/')) return;
        once();
      } catch {
        // ignore
      }
    },
    true,
  );
}
