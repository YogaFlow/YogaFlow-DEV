import { useId, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import ModalBackdrop from '../ui/ModalBackdrop';
import {
  LEGAL_DOCUMENTS,
  type LegalDocumentSlug,
} from '../../generated/legalDocuments';
import { AVV_ACCEPT_LABEL, AVV_VERSION } from '../../lib/legalVersions';
import { acceptAvv } from '../../lib/legalAcceptances';
import { formatNumericDate } from '../../lib/format';

export type LegalDocumentSheetProps = {
  slug: LegalDocumentSlug | null;
  onClose: () => void;
  /** AVV: „AVV abschließen“ unten im Pop-up (nur Owner, noch nicht akzeptiert). */
  showAvvAccept?: boolean;
  onAvvAccepted?: () => void;
};

export default function LegalDocumentSheet({
  slug,
  onClose,
  showAvvAccept = false,
  onAvvAccepted,
}: LegalDocumentSheetProps) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doc = slug ? LEGAL_DOCUMENTS[slug] : null;
  const open = Boolean(doc);

  const onAccept = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await acceptAvv();
    setBusy(false);
    if (!res.ok) {
      setError('Die Zustimmung konnte nicht gespeichert werden.');
      return;
    }
    onAvvAccepted?.();
    onClose();
  };

  if (!doc) return null;

  const stand = doc.standDate ? formatNumericDate(doc.standDate) : '';
  const isAvv = doc.slug === 'auftragsverarbeitung';

  return (
    <ModalBackdrop
      open={open}
      visible
      canDismiss={!busy}
      onDismiss={onClose}
      variant="sheet"
      panelClassName="max-w-xl sm:max-w-[720px]"
      labelledBy={titleId}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pb-3 pt-5">
        <div>
          <h3 id={titleId} className="text-[17px] font-medium text-text">
            {doc.title}
          </h3>
          {stand ? (
            <p className="mt-1 text-[13px] text-textMuted tabular-nums">Stand {stand}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-textMuted active:bg-surfaceSunken disabled:opacity-50"
          aria-label="Schließen"
          data-testid="legal-sheet-close"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div
        className="legal-sheet-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 text-[15px] leading-6 text-text [&_h1]:mb-3 [&_h1]:text-[22px] [&_h1]:font-medium [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[17px] [&_h2]:font-medium [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-[15px] [&_h3]:font-medium [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1 [&_hr]:my-4 [&_hr]:border-border [&_table]:w-full [&_table]:text-[13px] [&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:text-left [&_td]:border-b [&_td]:border-border [&_td]:py-2"
        data-testid="legal-document-body"
        data-hash={doc.pageHash}
        data-version={doc.standDate ?? ''}
        dangerouslySetInnerHTML={{ __html: doc.bodyHtml }}
      />

      <div className="shrink-0 space-y-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {isAvv && showAvvAccept ? (
          <>
            {error ? (
              <p role="alert" className="text-[13px] text-danger">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAccept()}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
              data-testid="avv-accept-sheet"
            >
              {busy ? 'Wird gespeichert…' : AVV_ACCEPT_LABEL}
            </button>
            <p className="text-center text-[12px] text-textMuted">Version {AVV_VERSION}</p>
          </>
        ) : null}
        <a
          href={doc.apexUrl}
          target="_blank"
          rel="noreferrer"
          className="block text-center text-[13px] text-textMuted underline underline-offset-2"
        >
          Als eigene Seite öffnen
        </a>
      </div>
    </ModalBackdrop>
  );
}

/** Kleiner Link, der das Legal-Pop-up öffnet (statt Navigation). */
export function LegalDocLink({
  slug,
  children,
  className = 'font-medium text-brand underline underline-offset-2',
  onOpen,
}: {
  slug: LegalDocumentSlug;
  children: ReactNode;
  className?: string;
  onOpen: (slug: LegalDocumentSlug) => void;
}) {
  return (
    <button type="button" className={className} onClick={() => onOpen(slug)}>
      {children}
    </button>
  );
}
