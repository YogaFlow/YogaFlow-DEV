import { useEffect, useState } from 'react';

const CHECK_MS = 10 * 60 * 1000;

function bundleBuildId(): string {
  const id = import.meta.env.VITE_BUILD_SHA;
  return typeof id === 'string' ? id : '';
}

function shouldCheck(buildId: string): boolean {
  return buildId !== '' && buildId !== 'unknown' && buildId !== 'dev';
}

/**
 * Dezenter Hinweis, wenn version.json eine andere Build-ID hat.
 * Kein Zwangs-Reload, damit offene Formulare erhalten bleiben.
 */
export function VersionBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const buildId = bundleBuildId();
    if (!shouldCheck(buildId)) return;

    let cancelled = false;
    const check = () => {
      void (async () => {
        try {
          const response = await fetch('/version.json', { cache: 'no-store' });
          if (!response.ok) return;
          const body = await response.json() as { build?: unknown };
          const remote = typeof body.build === 'string' ? body.build : '';
          if (!cancelled && remote && remote !== buildId) setUpdateAvailable(true);
        } catch {
          // Netzwerk ist kein Versionshinweis.
        }
      })();
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(check, CHECK_MS);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      role="status"
    >
      <p className="text-sm text-text">Neue Version verfügbar</p>
      <button
        type="button"
        className="min-h-11 rounded-full bg-brand px-4 text-sm font-medium text-onBrand"
        onClick={() => window.location.reload()}
      >
        Neu laden
      </button>
    </div>
  );
}
