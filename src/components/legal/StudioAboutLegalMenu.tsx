import { useEffect, useState } from 'react';
import { useTenant } from '../../context/TenantContext';
import { listOnlinePassProducts } from '../../lib/passProducts';
import StudioPublicLegalSheet, {
  type StudioLegalSheetKind,
} from './StudioPublicLegalSheet';

type Props = {
  /** Kompakte Sidebar-Variante: ein Link „Rechtliches“ öffnet die Liste. */
  variant?: 'section' | 'sidebar';
  className?: string;
};

/**
 * Eingeloggt: Abschnitt „Über {Studio}“ mit Impressum · Datenschutz · AGB · Widerruf
 * (Sheets, max. 2 Tipps).
 */
export default function StudioAboutLegalMenu({ variant = 'section', className }: Props) {
  const { tenant } = useTenant();
  const [widerruf, setWiderruf] = useState(false);
  const [sheet, setSheet] = useState<StudioLegalSheetKind | null>(null);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void listOnlinePassProducts()
      .then((products) => {
        if (active) setWiderruf(products.length > 0);
      })
      .catch(() => {
        if (active) setWiderruf(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const studioName = tenant?.name?.trim() || 'Studio';
  const items: { kind: StudioLegalSheetKind; label: string }[] = [
    { kind: 'imprint', label: 'Impressum' },
    { kind: 'privacy', label: 'Datenschutz' },
    { kind: 'terms', label: 'AGB' },
    ...(widerruf ? [{ kind: 'widerruf' as const, label: 'Widerruf' }] : []),
  ];

  if (variant === 'sidebar') {
    return (
      <div className={className}>
        <button
          type="button"
          data-testid="sidebar-rechtliches"
          onClick={() => setListOpen((v) => !v)}
          className="flex w-full items-center px-4 py-2 text-[13px] text-textMuted active:bg-surfaceSunken rounded-sm"
        >
          Rechtliches
        </button>
        {listOpen ? (
          <ul className="mb-2 space-y-0.5 pl-4" data-testid="studio-about-legal">
            {items.map((item) => (
              <li key={item.kind}>
                <button
                  type="button"
                  onClick={() => {
                    setSheet(item.kind);
                    setListOpen(false);
                  }}
                  className="flex min-h-11 w-full items-center px-2 text-[13px] text-textMuted active:bg-surfaceSunken rounded-sm"
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <StudioPublicLegalSheet kind={sheet} onClose={() => setSheet(null)} />
      </div>
    );
  }

  return (
    <section className={className} data-testid="studio-about-legal">
      <h2 className="text-[15px] font-medium text-text">Über {studioName}</h2>
      <ul className="mt-2 overflow-hidden rounded-md border border-border bg-surface">
        {items.map((item) => (
          <li key={item.kind} className="border-b border-border last:border-b-0">
            <button
              type="button"
              onClick={() => setSheet(item.kind)}
              className="flex min-h-14 w-full items-center px-3.5 text-left text-[15px] text-text active:bg-surfaceSunken"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      <StudioPublicLegalSheet kind={sheet} onClose={() => setSheet(null)} />
    </section>
  );
}
