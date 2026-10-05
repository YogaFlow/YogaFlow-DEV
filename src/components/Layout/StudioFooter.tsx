import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { listOnlinePassProducts } from '../../lib/passProducts';

type Props = {
  /** Wenn gesetzt: Widerruf-Link steuern. Sonst: prüfen, ob Online-Karten existieren. */
  showWiderruf?: boolean;
  className?: string;
};

export default function StudioFooter({ showWiderruf, className }: Props) {
  const [widerruf, setWiderruf] = useState(showWiderruf === true);

  useEffect(() => {
    if (showWiderruf != null) {
      setWiderruf(showWiderruf);
      return;
    }
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
  }, [showWiderruf]);

  const links = [
    { to: '/impressum', label: 'Impressum' },
    { to: '/datenschutz', label: 'Datenschutz' },
    { to: '/agb', label: 'AGB' },
    ...(widerruf ? [{ to: '/widerruf', label: 'Widerruf' }] : []),
  ];

  return (
    <footer
      className={`border-t border-border bg-sand px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${className ?? ''}`}
      data-testid="studio-footer"
    >
      <nav className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] leading-5 text-textMuted">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="inline-flex min-h-11 items-center text-textMuted underline-offset-2 hover:text-text hover:underline"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
