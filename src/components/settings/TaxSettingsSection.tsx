import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { asCivilIsoDate, berlinIsoDate } from '../../lib/courseDateTime';
import {
  type TaxSettingRow,
  choiceFromSetting,
  loadTaxSettings,
  taxHistoryLine,
  taxStatusSentence,
} from '../../lib/taxStatus';
import { withDevTenant } from '../../context/TenantContext';
import LedgerWaitingNotice from '../tax/LedgerWaitingNotice';
import TaxStatusDialog from './TaxStatusDialog';

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

      <p className="mt-6 border-t border-border pt-4 text-[15px] leading-6 text-textMuted">
        Exporte findest du unter{' '}
        <Link
          to={withDevTenant('/payments?tab=alle')}
          className="font-medium text-brand underline underline-offset-2"
        >
          Zahlungen
        </Link>
        .
      </p>

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
