import { useState } from 'react';
import { Link } from 'react-router-dom';
import ModalBackdrop from '../ui/ModalBackdrop';
import {
  downloadLedgerCsv,
  fetchLedgerExport,
  LEDGER_EXPORT_FOOTNOTE,
  monthBounds,
} from '../../lib/ledgerExport';
import { downloadPaymentsListCsv } from '../../lib/paymentsExport';
import type { PaymentKind, PaymentOverviewStatus } from '../../lib/paymentOverview';
import { withDevTenant } from '../../context/TenantContext';
import { currentTenantSlug } from '../../lib/tenantSlug';

export type PaymentsExportFilters = {
  month: string;
  kind: PaymentKind | '';
  status: PaymentOverviewStatus | '';
  search: string;
};

type Props = {
  open: boolean;
  filters: PaymentsExportFilters;
  onClose: () => void;
};

type Mode = 'payments' | 'ledger';

export default function PaymentsExportSheet({ open, filters, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('payments');
  const [month, setMonth] = useState(filters.month);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      if (mode === 'payments') {
        const result = await downloadPaymentsListCsv({
          month,
          kind: filters.kind,
          status: filters.status,
          search: filters.search,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setNote(`${result.rows} Zeilen exportiert.`);
        return;
      }
      const bounds = monthBounds(month);
      if (!bounds) {
        setError('Bitte wähle einen gültigen Monat.');
        return;
      }
      const result = await fetchLedgerExport(bounds.from, bounds.to);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const slug = currentTenantSlug() ?? 'studio';
      downloadLedgerCsv(`omlify-${slug}-steuer-${month.slice(0, 7)}`, result.rows);
      setNote('Steuer-Export erstellt (Buchungen + Summen).');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalBackdrop
      open={open}
      visible
      canDismiss={!busy}
      onDismiss={onClose}
      variant="sheet"
      panelClassName="max-w-md"
      labelledBy="payments-export-title"
    >
      <div className="p-5 sm:p-6">
        <h3 id="payments-export-title" className="text-[17px] font-medium text-text">
          Exportieren
        </h3>
        <label className="mt-4 block text-[13px] text-textMuted">
          Zeitraum (Monat)
          <input
            type="month"
            value={month.slice(0, 7)}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-[15px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </label>

        <fieldset className="mt-4 space-y-2">
          <legend className="text-[13px] text-textMuted">Was exportieren?</legend>
          <label className="flex min-h-11 items-center gap-3 text-[15px] text-text">
            <input
              type="radio"
              name="export-mode"
              checked={mode === 'payments'}
              onChange={() => setMode('payments')}
            />
            Zahlungsliste (CSV) — aktuelle Filter inkl. Belegnummer
          </label>
          <label className="flex min-h-11 items-center gap-3 text-[15px] text-text">
            <input
              type="radio"
              name="export-mode"
              checked={mode === 'ledger'}
              onChange={() => setMode('ledger')}
            />
            Für die Steuerberatung (CSV) — Hauptbuch + Summen
          </label>
        </fieldset>

        {mode === 'ledger' ? (
          <p className="mt-3 text-[13px] leading-5 text-textMuted">{LEDGER_EXPORT_FOOTNOTE}</p>
        ) : (
          <p className="mt-3 text-[13px] leading-5 text-textMuted">
            Es gelten die Filter Art, Status und Suche von der Zahlungsliste.
          </p>
        )}

        {error ? (
          <p role="alert" className="mt-3 text-[15px] text-danger">
            {error}
          </p>
        ) : null}
        {note ? <p className="mt-3 text-[15px] text-text">{note}</p> : null}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run()}
            className="inline-flex h-11 items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
            data-testid="payments-export-run"
          >
            {busy ? 'Wird erstellt…' : 'Herunterladen'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-full border border-borderStrong text-[15px] font-medium text-text active:bg-surfaceSunken"
          >
            Schließen
          </button>
        </div>

        <p className="mt-3 text-[12px] text-textMuted">
          Steuerstatus stellst du unter{' '}
          <Link to={withDevTenant('/settings/zahlungen')} className="text-brand underline">
            Einstellungen › Zahlungen
          </Link>{' '}
          ein.
        </p>
      </div>
    </ModalBackdrop>
  );
}
