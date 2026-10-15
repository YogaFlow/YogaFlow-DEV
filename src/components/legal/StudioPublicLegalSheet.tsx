import { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import ModalBackdrop from '../ui/ModalBackdrop';
import {
  loadPublicStudioLegal,
  studioLegalMarkdownToHtml,
} from '../../lib/studioLegal';
import type { StudioLegalKind } from '../../lib/studioLegalRender';
import { PASS_WITHDRAWAL_BELEHRUNG_BODY } from '../../lib/passOnlineTexts';

export type StudioLegalSheetKind = StudioLegalKind | 'widerruf';

const TITLE: Record<StudioLegalSheetKind, string> = {
  imprint: 'Impressum',
  terms: 'AGB',
  privacy: 'Datenschutz',
  widerruf: 'Widerruf',
};

type Props = {
  kind: StudioLegalSheetKind | null;
  onClose: () => void;
};

/** Öffentliche Studio-Rechtstexte als Sheet (Menü „Über {Studio}“). */
export default function StudioPublicLegalSheet({ kind, onClose }: Props) {
  const titleId = useId();
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!kind) return;
    let active = true;
    void (async () => {
      setLoading(true);
      setError('');
      if (kind === 'widerruf') {
        if (active) {
          setHtml(`<p>${PASS_WITHDRAWAL_BELEHRUNG_BODY}</p>`);
          setLoading(false);
        }
        return;
      }
      const doc = await loadPublicStudioLegal(kind);
      if (!active) return;
      if (!doc) {
        setError('Der Text konnte nicht geladen werden.');
        setHtml('');
      } else if (doc.minimal) {
        setHtml(
          `<p>${doc.studio_name ?? ''}</p>${
            doc.contact_email ? `<p>${doc.contact_email}</p>` : ''
          }`,
        );
      } else if (doc.body_md) {
        setHtml(studioLegalMarkdownToHtml(doc.body_md));
      } else {
        setHtml('<p class="text-textMuted">Dieser Text ist noch nicht freigegeben.</p>');
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [kind]);

  if (!kind) return null;

  return (
    <ModalBackdrop
      open
      visible
      canDismiss
      onDismiss={onClose}
      variant="sheet"
      panelClassName="max-w-xl sm:max-w-[720px]"
      labelledBy={titleId}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pb-3 pt-5">
        <h3 id={titleId} className="text-[17px] font-medium text-text">
          {TITLE[kind]}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-textMuted active:bg-surfaceSunken"
          aria-label="Schließen"
          data-testid="studio-legal-sheet-close"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {loading ? <p className="text-[15px] text-textMuted">Wird geladen…</p> : null}
        {error ? (
          <p role="alert" className="text-[15px] text-danger">
            {error}
          </p>
        ) : null}
        {!loading && !error && html ? (
          <div
            className="legal-sheet-body text-[15px] leading-6 text-text [&_h1]:mb-3 [&_h1]:text-[20px] [&_h1]:font-medium [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[16px] [&_h2]:font-medium [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
            data-testid="studio-legal-sheet-body"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : null}
      </div>
    </ModalBackdrop>
  );
}
