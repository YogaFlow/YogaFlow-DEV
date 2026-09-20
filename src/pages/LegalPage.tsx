import React from 'react';
import { Heart } from 'lucide-react';

const PLATFORM_LEGAL_LINKS = [
  { href: 'https://omlify.de/legal/impressum', label: 'Impressum' },
  { href: 'https://omlify.de/legal/datenschutz', label: 'Datenschutzerklärung' },
  { href: 'https://omlify.de/legal/agb', label: 'AGB' },
  { href: 'https://omlify.de/legal/auftragsverarbeitung', label: 'Auftragsverarbeitung' },
] as const;

const LegalPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-sand">
      <header className="bg-surface border-b border-border px-6 py-4">
        <a href="/" className="flex items-center gap-2 w-fit">
          <div className="w-8 h-8 bg-brand rounded-full flex items-center justify-center">
            <Heart className="w-4 h-4 text-onBrand" />
          </div>
          <span className="font-bold text-text">Omlify</span>
        </a>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-text mb-8">Rechtliche Angaben</h1>

        <div className="space-y-4 text-text text-sm leading-[1.45]">
          <p>Diese Anwendung wird von Omlify betrieben.</p>
          <p>
            Rechtliche Angaben zur Plattform findest du auf omlify.de:
          </p>
          <ul className="space-y-1">
            {PLATFORM_LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="inline-flex min-h-11 items-center text-brand underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <p>Für Angaben zum Studio selbst gelten dessen eigene Angaben.</p>
        </div>
      </main>
    </div>
  );
};

export default LegalPage;
