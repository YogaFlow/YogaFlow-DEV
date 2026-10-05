import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import {
  loadPublicStudioLegal,
  studioLegalMarkdownToHtml,
  type PublicStudioLegal,
} from '../lib/studioLegal';
import type { StudioLegalKind } from '../lib/studioLegalRender';
import StudioPublicLegalLine from '../components/Layout/StudioPublicLegalLine';

const KIND_BY_PATH: Record<string, StudioLegalKind> = {
  '/impressum': 'imprint',
  '/agb': 'terms',
  '/datenschutz': 'privacy',
};

const TITLE: Record<StudioLegalKind, string> = {
  imprint: 'Impressum',
  terms: 'AGB',
  privacy: 'Datenschutz',
};

export default function StudioLegalPage() {
  const location = useLocation();
  const { tenant } = useTenant();
  const path = location.pathname.replace(/\/$/, '') || '/';
  const kind = KIND_BY_PATH[path];
  const [doc, setDoc] = useState<PublicStudioLegal | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!kind) {
      setLoading(false);
      setError('Seite nicht gefunden.');
      return;
    }
    let active = true;
    void (async () => {
      setLoading(true);
      const next = await loadPublicStudioLegal(kind);
      if (!active) return;
      if (!next) {
        setError('Der Text konnte nicht geladen werden.');
        setDoc(null);
      } else {
        setDoc(next);
        setError('');
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [kind]);

  if (!kind) {
    return (
      <div className="min-h-screen bg-sand px-4 py-10">
        <p className="text-[15px] text-text">Seite nicht gefunden.</p>
        <Link to="/" className="mt-4 inline-flex text-brand underline">
          Zur Startseite
        </Link>
      </div>
    );
  }

  const stand = doc?.created_at
    ? new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(doc.created_at))
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-sand">
      <header className="border-b border-border bg-surface px-4 py-4 sm:px-6">
        <Link to="/" className="text-[17px] font-medium text-text no-underline">
          {tenant?.name || doc?.studio_name || 'Studio'}
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 print:max-w-none">
        <h1 className="text-[28px] font-medium text-text">{TITLE[kind]}</h1>
        {stand ? (
          <p className="mt-2 text-[13px] text-textMuted tabular-nums">Stand {stand}</p>
        ) : null}

        {loading ? <p className="mt-6 text-[15px] text-textMuted">Wird geladen…</p> : null}
        {error ? (
          <p role="alert" className="mt-6 text-[15px] text-danger">
            {error}
          </p>
        ) : null}

        {!loading && !error && doc?.minimal ? (
          <div className="mt-6 space-y-2 text-[15px] leading-6 text-text">
            <p>{doc.studio_name}</p>
            {doc.contact_email ? <p>{doc.contact_email}</p> : null}
          </div>
        ) : null}

        {!loading && !error && !doc?.minimal && doc?.body_md ? (
          <div
            className="legal-sheet-body mt-6 text-[15px] leading-6 text-text [&_h1]:mb-3 [&_h1]:text-[22px] [&_h1]:font-medium [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[17px] [&_h2]:font-medium [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-[15px] [&_h3]:font-medium [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1"
            data-testid="studio-legal-body"
            dangerouslySetInnerHTML={{ __html: studioLegalMarkdownToHtml(doc.body_md) }}
          />
        ) : null}

        {!loading && !error && !doc?.minimal && !doc?.body_md ? (
          <p className="mt-6 text-[15px] text-textMuted">Dieser Text ist noch nicht freigegeben.</p>
        ) : null}
      </main>
      <div className="px-4 py-6 sm:px-6">
        <StudioPublicLegalLine showWiderruf={false} />
      </div>
    </div>
  );
}
