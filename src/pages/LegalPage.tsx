import React from 'react';
import { Heart } from 'lucide-react';

interface LegalPageProps {
  type: 'agb' | 'datenschutz' | 'impressum';
}

const TITLES: Record<LegalPageProps['type'], string> = {
  agb: 'Allgemeine Geschäftsbedingungen',
  datenschutz: 'Datenschutzerklärung',
  impressum: 'Impressum',
};

const LEGAL_FOOTER_LINKS = [
  { href: '/legal/impressum', label: 'Impressum' },
  { href: '/legal/agb', label: 'AGB' },
  { href: '/legal/datenschutz', label: 'Datenschutz' },
] as const;

const LegalPage: React.FC<LegalPageProps> = ({ type }) => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <a href="/" className="flex items-center gap-2 w-fit">
          <div className="w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center">
            <Heart className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900">Omlify</span>
        </a>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">{TITLES[type]}</h1>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800 text-sm">
          <p className="font-semibold mb-1">Platzhalter</p>
          <p>
            Die rechtlichen Texte befinden sich in Vorbereitung. Bitte nehme vor dem
            Produktivbetrieb Kontakt mit einem Rechtsanwalt auf.
          </p>
        </div>

        {type === 'impressum' && (
          <dl className="mt-8 space-y-5 text-gray-700">
            <div>
              <dt className="text-sm font-semibold text-gray-900">Angaben gemäß § 5 TMG</dt>
              <dd className="mt-1 text-sm">[Name / Firma – Platzhalter]</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-gray-900">Anschrift</dt>
              <dd className="mt-1 text-sm">[Straße, PLZ Ort – Platzhalter]</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-gray-900">Kontakt</dt>
              <dd className="mt-1 text-sm">[E-Mail / Telefon – Platzhalter]</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-gray-900">Vertreten durch</dt>
              <dd className="mt-1 text-sm">[Geschäftsführung – Platzhalter]</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-gray-900">Registereintrag</dt>
              <dd className="mt-1 text-sm">[Registergericht und Nummer – Platzhalter]</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-gray-900">Umsatzsteuer-ID</dt>
              <dd className="mt-1 text-sm">[USt-IdNr. gemäß § 27a UStG – Platzhalter]</dd>
            </div>
          </dl>
        )}
      </main>

      <footer className="border-t border-gray-200 py-8 text-center text-sm text-gray-500">
        <nav className="flex items-center justify-center gap-6" aria-label="Rechtliche Seiten">
          {LEGAL_FOOTER_LINKS.map(({ href, label }) => (
            <a key={href} href={href} className="hover:text-gray-700">
              {label}
            </a>
          ))}
        </nav>
      </footer>
    </div>
  );
};

export default LegalPage;
