import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  asCivilIsoDate,
  berlinIsoDate,
  clampCivilIsoDate,
} from '../../lib/courseDateTime';
import { formatNumericDate } from '../../lib/format';
import CivilDatePicker from '../DateTimePicker/CivilDatePicker';
import { preOmlifyErrorMessage } from '../../lib/courseCheckout';

type PreviewOk = {
  success: true;
  count: number;
  course_count: number;
  first_course_date: string | null;
  last_course_date: string | null;
  limit: number;
};

type PreviewErr = {
  success: false;
  error: string;
  count?: number;
};

type PreviewBody = PreviewOk | PreviewErr | null;

export type PreOmlifyWaiveSectionProps = {
  onChanged: () => void;
  onWaived: (batchId: string, count: number) => void;
};

const DEBOUNCE_MS = 350;

/**
 * F4: Standardmäßig eine Zeile unter der Überfällig-Liste.
 * Aufgeklappt wie bisher. Parent zeigt die Komponente nur bei offenen Anmeldungen vor gestern.
 */
const PreOmlifyWaiveSection: React.FC<PreOmlifyWaiveSectionProps> = ({
  onChanged,
  onWaived,
}) => {
  const today = berlinIsoDate(0);
  const [expanded, setExpanded] = useState(false);
  const [beforeDate, setBeforeDate] = useState(today);
  const [preview, setPreview] = useState<PreviewBody>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  const loadPreview = useCallback(async (civil: string) => {
    const id = ++requestId.current;
    setPreviewLoading(true);
    setErrorText('');
    const { data, error } = await supabase.rpc('preview_pre_omlify_waive', {
      p_before: civil,
    });
    if (id !== requestId.current) return;
    setPreviewLoading(false);
    if (error) {
      setPreview(null);
      setErrorText(preOmlifyErrorMessage(undefined));
      return;
    }
    const body = data as PreviewBody;
    setPreview(body);
    if (body && body.success === false) {
      setErrorText(preOmlifyErrorMessage(body.error));
    }
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const civil = clampCivilIsoDate(asCivilIsoDate(beforeDate), null, berlinIsoDate(0));
    if (!civil) return;
    const timer = window.setTimeout(() => {
      void loadPreview(civil);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [beforeDate, loadPreview, expanded]);

  const count = preview && preview.success ? preview.count : 0;
  const canSubmit = !previewLoading && !busy && preview?.success === true && count > 0;

  const submit = async () => {
    if (!canSubmit || !preview || !preview.success) return;
    setBusy(true);
    setErrorText('');
    const civil = clampCivilIsoDate(asCivilIsoDate(beforeDate), null, berlinIsoDate(0));
    const { data, error } = await supabase.rpc('waive_pre_omlify_before', {
      p_before: civil,
      p_expected_count: preview.count,
    });
    setBusy(false);
    if (error) {
      setErrorText(preOmlifyErrorMessage(undefined));
      return;
    }
    const body = data as {
      success?: boolean;
      error?: string;
      count?: number;
      waived?: number;
      batch_id?: string;
    } | null;
    if (!body?.success) {
      const code = body?.error;
      setErrorText(preOmlifyErrorMessage(code));
      if (code === 'COUNT_CHANGED') {
        void loadPreview(civil);
      }
      return;
    }
    if (!body.batch_id || body.waived == null) {
      setErrorText(preOmlifyErrorMessage(undefined));
      return;
    }
    onWaived(body.batch_id, body.waived);
    onChanged();
    if (civil) void loadPreview(civil);
  };

  const first = preview && preview.success ? preview.first_course_date : null;
  const last = preview && preview.success ? preview.last_course_date : null;
  const nothingOpen =
    (preview && preview.success && count === 0) ||
    (preview && !preview.success && preview.error === 'NOTHING_TO_WAIVE');

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        data-testid="pre-omlify-waive-expand"
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-1 py-2 text-left text-[15px] text-brand active:bg-surfaceSunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span>Ältere Kurse auf einmal als erledigt markieren</span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-textSubtle" aria-hidden />
      </button>
    );
  }

  return (
    <section
      className="rounded-md border border-border bg-surface p-4 sm:p-5"
      data-testid="pre-omlify-waive-panel"
    >
      <h2 className="text-[17px] font-medium text-text">Alte Kurse abhaken</h2>
      <p className="mt-2 max-w-prose text-[15px] leading-6 text-textMuted">
        Omlify weiß nicht, wer vor dem Start mit Omlify bezahlt hat. Deshalb stehen deine
        bisherigen Kurse als „offen“. Hast du das früher schon selbst geregelt, kannst du hier
        alles auf einmal abhaken. Betrifft nur Anmeldungen vor dem gewählten Datum.
      </p>

      <label className="mt-5 block text-[13px] font-medium text-textMuted" htmlFor="pre-omlify-before">
        Alles vor dem
      </label>
      <div className="mt-1.5 max-w-xs">
        <CivilDatePicker
          id="pre-omlify-before"
          value={beforeDate}
          max={today}
          onChange={(value) =>
            setBeforeDate(
              clampCivilIsoDate(asCivilIsoDate(value), null, berlinIsoDate(0)) || berlinIsoDate(0),
            )
          }
        />
      </div>

      <div className="mt-5 space-y-3 text-[15px] leading-6 text-text">
        {previewLoading ? (
          <p className="text-textMuted">Vorschau wird geladen …</p>
        ) : nothingOpen ? (
          <p className="text-textMuted">Vor diesem Datum ist nichts mehr offen.</p>
        ) : preview?.success && count > 0 && first && last ? (
          <p>
            Das betrifft {count} Anmeldungen aus deinen Kursen vom {formatNumericDate(first)} bis{' '}
            {formatNumericDate(last)}.
          </p>
        ) : null}

        <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-6 text-textMuted">
          <li>
            Die Anmeldungen stehen nicht mehr als offen, sondern als „vor Omlify erledigt“.
          </li>
          <li>Deine Teilnehmenden merken davon nichts, es geht keine Nachricht raus.</li>
          <li>Es wird kein Geld verbucht.</li>
          <li>Du kannst es jederzeit rückgängig machen.</li>
        </ul>
      </div>

      {errorText ? (
        <p role="alert" className="mt-3 text-[15px] text-text">
          {errorText}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
        >
          {busy
            ? '…'
            : count > 0
              ? `${count} Anmeldungen abhaken`
              : 'Anmeldungen abhaken'}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="inline-flex min-h-11 items-center px-2 text-[15px] text-textMuted active:text-text"
        >
          Zuklappen
        </button>
      </div>
    </section>
  );
};

export default PreOmlifyWaiveSection;
