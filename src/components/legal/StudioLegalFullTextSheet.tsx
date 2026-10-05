import { useEffect, useId, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import ModalBackdrop from '../ui/ModalBackdrop';
import { studioLegalMarkdownToHtml } from '../../lib/studioLegal';

type Section = { title: string; html: string };

function splitMarkdownSections(md: string): Section[] {
  const html = studioLegalMarkdownToHtml(md);
  const parts = html.split(/(?=<h2>)/);
  const sections: Section[] = [];
  for (const part of parts) {
    const m = part.match(/^<h2>(.*?)<\/h2>([\s\S]*)$/);
    if (m) {
      sections.push({ title: m[1].replace(/<[^>]+>/g, ''), html: m[2].trim() });
    } else if (part.trim()) {
      sections.push({ title: 'Einleitung', html: part.trim() });
    }
  }
  return sections.length > 0 ? sections : [{ title: 'Text', html }];
}

type Props = {
  open: boolean;
  title: string;
  bodyMd: string;
  onClose: () => void;
};

/** Vollbild-Sheet: Abschnitte als Aufklapp-Liste. */
export default function StudioLegalFullTextSheet({ open, title, bodyMd, onClose }: Props) {
  const titleId = useId();
  const sections = useMemo(() => (bodyMd ? splitMarkdownSections(bodyMd) : []), [bodyMd]);
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (open) setOpenIds(new Set());
  }, [open, bodyMd]);

  const allOpen = sections.length > 0 && openIds.size === sections.length;

  return (
    <ModalBackdrop
      open={open}
      visible
      canDismiss
      onDismiss={onClose}
      variant="sheet"
      panelClassName="max-w-xl sm:max-w-[720px]"
      labelledBy={titleId}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pb-3 pt-5">
        <h3 id={titleId} className="text-[17px] font-medium text-text">
          {title}
        </h3>
        <div className="flex items-center gap-1">
          {sections.length > 1 ? (
            <button
              type="button"
              onClick={() =>
                setOpenIds(allOpen ? new Set() : new Set(sections.map((_, i) => i)))
              }
              className="inline-flex min-h-11 items-center px-2 text-[13px] font-medium text-brand"
            >
              {allOpen ? 'Alle zuklappen' : 'Alle aufklappen'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-textMuted active:bg-surfaceSunken"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <ul className="divide-y divide-border">
          {sections.map((sec, i) => {
            const isOpen = openIds.has(i);
            return (
              <li key={`${sec.title}-${i}`}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-[15px] font-medium text-text">{sec.title}</span>
                  <span className="text-[13px] text-textMuted">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen ? (
                  <div
                    className="legal-sheet-body pb-4 text-[15px] leading-6 text-text [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:font-medium [&_strong]:text-brand"
                    dangerouslySetInnerHTML={{ __html: sec.html }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </ModalBackdrop>
  );
}
