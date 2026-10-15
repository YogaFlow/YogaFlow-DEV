import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listOnlinePassProducts } from '../../lib/passProducts';

type Props = {
  showWiderruf?: boolean;
  className?: string;
};

/**
 * Öffentliche Seiten ohne Login: eine ruhige Textzeile (nicht Fußleiste).
 */
export default function StudioPublicLegalLine({ showWiderruf, className }: Props) {
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
    <p
      className={`text-center text-[13px] leading-5 text-textSubtle ${className ?? ''}`}
      data-testid="studio-public-legal-line"
    >
      {links.map((link, i) => (
        <span key={link.to}>
          {i > 0 ? ' · ' : null}
          <Link to={link.to} className="text-textSubtle underline-offset-2 hover:underline">
            {link.label}
          </Link>
        </span>
      ))}
    </p>
  );
}
