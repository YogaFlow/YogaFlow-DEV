import { useEffect, useState } from 'react';
import { asCivilIsoDate, berlinIsoDate } from '../../lib/courseDateTime';
import {
  LEDGER_EXPORT_FOOTNOTE,
  downloadLedgerCsv,
  fetchLedgerExport,
  monthBounds,
} from '../../lib/ledgerExport';
import {
  type TaxSettingRow,
  choiceFromSetting,
  loadTaxSettings,
  taxHistoryLine,
  taxStatusSentence,
} from '../../lib/taxStatus';
import LedgerWaitingNotice from '../tax/LedgerWaitingNotice';
import TaxStatusDialog from './TaxStatusDialog';

type PeriodMode = 'month' | 'range';

function splitSettings(rows: TaxSettingRow[], today: string) {
  const applicable = rows.filter((row) => asCivilIsoDate(row.valid_from) <= today);
  const upcoming = rows.filter((row) => asCivilIsoDate(row.valid_from) > today);
  return {
    current: applicable[0] ?? null,
    history: applicable.slice(1),
    upcoming,
  };
}

export default function TaxSettingsSection({ isOwner }: { isOwner: boolean }) {
  const [rows, setRows] = useState<TaxSettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [savedNote, setSavedNote] = useState('');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [month, setMonth] = useState(() => berlinIsoDate(0).slice(0, 7));
  const [fromDate, setFromDate] = useState(() => `${berlinIsoDate(0).slice(0, 7)}-01`);
  const [toDate, setToDate] = useState(() => berlinIsoDate(0));
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);

  const reload = async () => {
    setLoadError('');
    const next = await loadTaxSettings();
    setRows(next);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await loadTaxSettings();
        if (!active) return;
        setRows(next);
      } catch {
        if (active) setLoadError('Der Steuerstatus konnte nicht geladen werden.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (window.location.hash !== '#steuern') return;
    document.getElementById('steuern')?.scrollIntoView({ block: 'start' });
  }, [loading]);

  const today = berlinIsoDate(0);
  const { current, history, upcoming } = splitSettings(rows, today);
  const hasSetting = rows.length > 0;

  const download = async () => {
    if (exporting) return;
    setExportError('');
    const bounds =
      periodMode === 'month'
        ? monthBounds(month)
        : { from: asCivilIsoDate(fromDate), to: asCivilIsoDate(toDate) };
    if (!bounds || !bounds.from || !bounds.to) {
      setExportError('Bitte wähle einen gültigen Zeitraum.');
      return;
    }
    setExporting(true);
    try {
      const result = await fetchLedgerExport(bounds.from, bounds.to);
      if (!result.ok) {
        setExportError(result.message);
        return;
      }
      const stem =
        periodMode === 'month'
          ? `omlify-hauptbuch-${month}`
          : `omlify-hauptbuch-${bounds.from}_${bounds.to}`;
      downloadLedgerCsv(stem, result.rows);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section id="steuern" className="scroll-mt-24 rounded-md border border-border bg-surface p-3.5">
      <h2 className="text-[19px] font-medium leading-snug text-text">Steuern</h2>

      {loading ? <p className="mt-3 text-[15px] text-textMuted">Wird geladen…</p> : null}
      {loadError ? (
        <p role="alert" className="mt-3 text-[15px] text-text">
          {loadError}
        </p>
      ) : null}

      {!loading && !loadError && !hasSetting ? (
        <div className="mt-3">
          <LedgerWaitingNotice
            variant={isOwner ? 'settings-owner' : 'settings-admin'}
            onSpecify={() => {
              setSavedNote('');
              setDialogOpen(true);
            }}
          />
        </div>
      ) : null}

      {!loading && !loadError && hasSetting ? (
        <div className="mt-3 space-y-3">
          {current ? <p className="text-[17px] text-text">{taxStatusSentence(current)}</p> : null}
          {upcoming.map((row) => (
            <p key={row.id} className="text-[15px] tabular-nums text-text">
              {taxHistoryLine(row)}
            </p>
          ))}
          {history.length > 0 ? (
            <div>
              <h3 className="text-[15px] font-medium text-text">Frühere Angaben</h3>
              <ul className="mt-1 space-y-1">
                {history.map((row) => (
                  <li key={row.id} className="text-[15px] tabular-nums text-textMuted">
                    {taxHistoryLine(row)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {isOwner ? (
            <button
              type="button"
              onClick={() => {
                setSavedNote('');
                setDialogOpen(true);
              }}
              className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-[15px] font-medium text-text active:bg-surfaceSunken"
            >
              Ändern
            </button>
          ) : null}
        </div>
      ) : null}

      {savedNote ? <p className="mt-3 text-[15px] text-text">{savedNote}</p> : null}

      <div className="mt-6 border-t border-border pt-4">
        <h3 className="text-[17px] font-medium leading-snug text-text">Export</h3>
        <div className="mt-3 inline-flex rounded-sm bg-surfaceSunken p-1">
          <button
            type="button"
            onClick={() => setPeriodMode('month')}
            className={`inline-flex min-h-11 items-center rounded-sm px-4 text-[15px] font-medium ${
              periodMode === 'month' ? 'bg-surface text-text' : 'text-textMuted'
            }`}
          >
            Monat
          </button>
          <button
            type="button"
            onClick={() => setPeriodMode('range')}
            className={`inline-flex min-h-11 items-center rounded-sm px-4 text-[15px] font-medium ${
              periodMode === 'range' ? 'bg-surface text-text' : 'text-textMuted'
            }`}
          >
            Von–Bis
          </button>
        </div>

        {periodMode === 'month' ? (
          <label className="mt-3 block max-w-xs text-[13px] text-textMuted">
            Monat
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="mt-1 w-full min-h-11 rounded-sm border border-border px-3 text-[15px] text-text focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
        ) : (
          <div className="mt-3 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-[13px] text-textMuted">
              Von
              <input
                type="date"
                value={fromDate}
              onChange={(event) => setFromDate(asCivilIsoDate(event.target.value))}
              className="mt-1 w-full min-h-11 rounded-sm border border-border px-3 text-[15px] text-text focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </label>
            <label className="text-[13px] text-textMuted">
              Bis
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(asCivilIsoDate(event.target.value))}
                className="mt-1 w-full min-h-11 rounded-sm border border-border px-3 text-[15px] text-text focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </label>
          </div>
        )}

        <button
          type="button"
          onClick={() => void download()}
          disabled={exporting}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
        >
          {exporting ? 'Wird erstellt…' : 'CSV herunterladen'}
        </button>
        {exportError ? (
          <p role="alert" className="mt-3 text-[15px] text-text">
            {exportError}
          </p>
        ) : null}
        <p className="mt-3 text-[13px] leading-5 text-textMuted">{LEDGER_EXPORT_FOOTNOTE}</p>
      </div>

      <TaxStatusDialog
        open={dialogOpen && isOwner}
        hasSetting={hasSetting}
        initialChoice={choiceFromSetting(current ?? upcoming[0] ?? null)}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          setSavedNote('Gespeichert.');
          void reload().catch(() => setLoadError('Der Steuerstatus konnte nicht geladen werden.'));
        }}
      />
    </section>
  );
}
