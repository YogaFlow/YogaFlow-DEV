import React from 'react';
import { Heart } from 'lucide-react';

interface LegalPageProps {
  type: 'agb' | 'datenschutz';
}

const TITLES: Record<LegalPageProps['type'], string> = {
  agb: 'Allgemeine Geschäftsbedingungen',
  datenschutz: 'Datenschutzerklärung',
};

const LegalPage: React.FC<LegalPageProps> = ({ type }) => {
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
        <h1 className="text-3xl font-bold text-text mb-8">{TITLES[type]}</h1>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800 text-sm">
          <p className="font-semibold mb-1">Platzhalter</p>
          <p>
            Die rechtlichen Texte befinden sich in Vorbereitung. Bitte nehme vor dem
            Produktivbetrieb Kontakt mit einem Rechtsanwalt auf.
          </p>
        </div>
      </main>
    </div>
  );
};

export default LegalPage;
